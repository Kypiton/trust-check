import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDomainAnalyzer } from "./analyze-domain";
import { createRdapBootstrap, IANA_BOOTSTRAP_URL } from "./rdap-bootstrap";
import { createRdapGuard } from "./rdap-guard";
import { DOMAIN_ANALYSIS_DEADLINE_MS, MAX_PENDING_DOMAINS, MAX_RDAP_CONCURRENCY, MAX_RDAP_QUEUE_SIZE, RDAP_FAILURE_COOLDOWN_MS } from "./rdap-limits";
import { RDAP_TIMEOUT_MS } from "./rdap-http";
import { buildUrlCheckResult } from "../../analyze-url/lib/build-url-check-result";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const registry = { services: [
  [["com", "net"], ["https://rdap.registry.net/"]],
  [["org"], ["https://other.registry.net/"]],
] };
const registration = {
  objectClassName: "domain",
  events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }],
};
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/rdap+json" } });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const requests: { url: string; signal: AbortSignal; respond: (response?: Response) => void }[] = [];
  let active = 0;
  let peak = 0;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    if (String(input) === IANA_BOOTSTRAP_URL) return json(registry);
    const pending = deferred<Response>();
    const signal = init!.signal!;
    const abort = () => pending.reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    requests.push({ url: String(input), signal, respond: (response = json(registration)) => pending.resolve(response) });
    active += 1;
    peak = Math.max(peak, active);
    try { return await pending.promise; }
    finally { active -= 1; signal.removeEventListener("abort", abort); }
  });
  return {
    analyze: createDomainAnalyzer({ fetch: fetcher, now: Date.now }),
    fetcher, requests, active: () => active, peak: () => peak,
  };
}

describe("RDAP admission and in-flight sharing", () => {
  it("starts only five requests and admits the sixth after a successful response", async () => {
    const h = setup();
    const checks = Array.from({ length: 6 }, (_, index) => h.analyze(`domain${index}.com`));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(MAX_RDAP_CONCURRENCY);
    expect(h.active()).toBe(5);
    h.requests[0].respond();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(6);
    expect(h.active()).toBe(5);
    h.requests.slice(1).forEach((request) => request.respond());
    expect((await Promise.all(checks)).every((result) => result.status === "COMPLETED")).toBe(true);
    expect(h.peak()).toBe(5);
    expect(h.active()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["failure", "timeout"])("releases capacity after %s for another provider", async (outcome) => {
    const h = setup();
    const checks = Array.from({ length: 5 }, (_, index) => h.analyze(`domain${index}.com`));
    const sixth = h.analyze("example.org");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(5);
    if (outcome === "failure") h.requests[0].respond(new Response(null, { status: 500 }));
    await vi.advanceTimersByTimeAsync(outcome === "timeout" ? RDAP_TIMEOUT_MS : 0);
    expect(h.requests).toHaveLength(6);
    expect(h.requests[5].url).toBe("https://other.registry.net/domain/example.org");
    h.requests.slice(1).forEach((request) => request.respond());
    expect(await sixth).toMatchObject({ status: "COMPLETED" });
    await Promise.all(checks);
    expect(h.peak()).toBe(5);
    expect(h.active()).toBe(0);
  });

  it("rechecks provider cooldown before admitting previously queued work", async () => {
    const h = setup();
    const checks = Array.from({ length: 6 }, (_, index) => h.analyze(`domain${index}.com`));
    await vi.advanceTimersByTimeAsync(0);
    h.requests[0].respond(new Response(null, { status: 500 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await checks[5]).toEqual({ status: "UNAVAILABLE", reason: "PROVIDER_COOLDOWN" });
    expect(h.requests).toHaveLength(5);
    h.requests.slice(1).forEach((request) => request.respond());
    await Promise.all(checks);
  });

  it("shares ten normalized same-domain lookups, then removes the successful entry", async () => {
    const h = setup();
    const checks = Array.from({ length: 10 }, (_, index) => h.analyze(index % 2 ? `sub${index}.EXAMPLE.com.` : "example.com"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(1);
    h.requests[0].respond();
    const results = await Promise.all(checks);
    expect(results.every((result) => result.status === "COMPLETED" && result.registrableDomain === "example.com")).toBe(true);
    const next = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(2);
    h.requests[1].respond();
    await next;
    expect(h.fetcher.mock.calls.filter(([url]) => String(url) === IANA_BOOTSTRAP_URL)).toHaveLength(1);
  });

  it("removes failed in-flight entries and does not share different domains", async () => {
    const h = setup();
    const first = h.analyze("example.com");
    const duplicate = h.analyze("login.example.com");
    const other = h.analyze("different.com");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(2);
    h.requests[0].respond(new Response(null, { status: 404 }));
    h.requests[1].respond();
    expect(await first).toEqual({ status: "UNAVAILABLE", reason: "HTTP_ERROR" });
    expect(await duplicate).toEqual(await first);
    expect(await other).toMatchObject({ status: "COMPLETED", registrableDomain: "different.com" });
    const retry = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(3);
    h.requests[2].respond();
    expect(await retry).toMatchObject({ status: "COMPLETED", registrableDomain: "example.com" });
  });

  it("bounds pending distinct domains even while bootstrap has not resolved", async () => {
    const h = setup();
    const checks = Array.from({ length: MAX_PENDING_DOMAINS }, (_, index) => h.analyze(`domain${index}.com`));
    expect(await h.analyze("overflow.com")).toEqual({ status: "UNAVAILABLE", reason: "QUEUE_FULL" });
    await vi.advanceTimersByTimeAsync(DOMAIN_ANALYSIS_DEADLINE_MS);
    expect((await Promise.all(checks)).every((result) => result.status === "UNAVAILABLE")).toBe(true);
    expect(h.peak()).toBeLessThanOrEqual(5);
    expect(h.active()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps isolated analyzer instances independent in tests", async () => {
    const a = setup();
    const b = setup();
    const failed = a.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    a.requests[0].respond(new Response(null, { status: 500 }));
    await failed;
    const success = b.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    b.requests[0].respond();
    expect(await success).toMatchObject({ status: "COMPLETED" });
  });
});

describe("provider backoff", () => {
  it.each(["timeout", "429", "500", "malformed JSON", "malformed metadata"])("applies 30-second cooldown for %s and then recovers", async (failure) => {
    const h = setup();
    const pending = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    if (failure === "timeout") await vi.advanceTimersByTimeAsync(RDAP_TIMEOUT_MS);
    else if (failure === "malformed JSON") h.requests[0].respond(new Response("{broken", { headers: { "content-type": "application/json" } }));
    else if (failure === "malformed metadata") h.requests[0].respond(json({ unexpected: true }));
    else h.requests[0].respond(new Response(null, { status: Number(failure) }));
    const result = await pending;
    expect(result.status).toBe("UNAVAILABLE");
    expect(result).not.toHaveProperty("signals");
    const calls = h.fetcher.mock.calls.length;
    expect(await h.analyze("another.com")).toEqual({ status: "UNAVAILABLE", reason: "PROVIDER_COOLDOWN" });
    expect(h.fetcher).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(RDAP_FAILURE_COOLDOWN_MS - 1);
    expect(await h.analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "PROVIDER_COOLDOWN" });
    expect(h.fetcher).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1);
    const retry = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(2);
    h.requests[1].respond();
    expect(await retry).toMatchObject({ status: "COMPLETED" });
  });

  it("scopes cooldown to the provider and retains the successful bootstrap cache", async () => {
    const h = setup();
    const failed = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    h.requests[0].respond(new Response(null, { status: 429 }));
    await failed;
    const other = h.analyze("example.org");
    await vi.advanceTimersByTimeAsync(0);
    h.requests[1].respond();
    expect(await other).toMatchObject({ status: "COMPLETED" });
    expect(h.fetcher.mock.calls.filter(([url]) => String(url) === IANA_BOOTSTRAP_URL)).toHaveLength(1);
  });

  it("does not cool down after success, 404, or NOT_APPLICABLE input", async () => {
    const h = setup();
    expect(await h.analyze("127.0.0.1")).toEqual({ status: "NOT_APPLICABLE" });
    expect(h.fetcher).not.toHaveBeenCalled();
    for (const status of [200, 404, 200]) {
      const pending = h.analyze("example.com");
      await vi.advanceTimersByTimeAsync(0);
      h.requests.at(-1)!.respond(status === 200 ? json(registration) : new Response(null, { status }));
      expect((await pending).status).toBe(status === 200 ? "COMPLETED" : "UNAVAILABLE");
    }
    expect(h.requests).toHaveLength(3);
  });

  it("preserves local URL risk and PARTIAL status during provider cooldown", async () => {
    const h = setup();
    const initial = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(0);
    h.requests[0].respond(new Response(null, { status: 500 }));
    await initial;
    const response = await buildUrlCheckResult("http://paypal-login.com", {
      analyzeDomain: h.analyze,
      analyzeRedirect: async (url) => ({ status: "COMPLETED", initialUrl: url, finalUrl: url, hops: [], signals: [] }),
      analyzeReputation: async () => ({
        status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [],
        source: { code: "THREAT_REPUTATION", status: "SKIPPED" },
      }),
    });
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: {
      riskScore: 30, signals: [{ code: "NO_HTTPS" }, { code: "BRAND_IMPERSONATION" }],
      analysisCoverage: expect.arrayContaining([{ code: "DOMAIN_METADATA", status: "FAILED" }]),
    } } });
    expect(h.requests).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain("NEW_DOMAIN");
  });
});

describe("overall deadline", () => {
  it("covers bootstrap plus provider time and aborts provider work at five seconds", async () => {
    const h = setup();
    const bootstrap = deferred<Response>();
    h.fetcher.mockImplementationOnce(() => bootstrap.promise);
    const pending = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(3_000);
    bootstrap.resolve(json(registry));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(DOMAIN_ANALYSIS_DEADLINE_MS - 3_000);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED" });
    expect(h.requests[0].signal.aborted).toBe(true);
    expect(h.active()).toBe(0);
    expect(await h.analyze("another.com")).toEqual({ status: "UNAVAILABLE", reason: "PROVIDER_COOLDOWN" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires queued work without admitting it when another slot is released at the deadline", async () => {
    const h = setup();
    const checks = Array.from({ length: 11 }, (_, index) => h.analyze(`domain${index}.com`));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(h.requests).toHaveLength(5);
    h.requests.forEach((request) => request.respond());
    await vi.advanceTimersByTimeAsync(0);
    expect(h.requests).toHaveLength(10);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await checks[10]).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED" });
    const results = await Promise.all(checks);
    expect(results.slice(0, 5).every((result) => result.status === "COMPLETED")).toBe(true);
    expect(results.slice(5).every((result) => result.status === "UNAVAILABLE")).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.requests).toHaveLength(10);
    expect(h.active()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("late same-domain joiners cannot extend the original lookup deadline", async () => {
    const h = setup();
    const bootstrap = deferred<Response>();
    h.fetcher.mockImplementationOnce(() => bootstrap.promise);
    const first = h.analyze("example.com");
    await vi.advanceTimersByTimeAsync(3_000);
    bootstrap.resolve(json(registry));
    const second = h.analyze("login.example.com");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await first).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED" });
    expect(await second).toEqual(await first);
    expect(h.requests).toHaveLength(1);
  });

  it("bounds shared bootstrap admission and removes its expired queue entry", async () => {
    const guard = createRdapGuard(Date.now);
    const blocked = deferred<{ ok: true }>();
    const blockers = Array.from({ length: 5 }, () => guard.run(new URL("https://provider.net/"), {
      signal: new AbortController().signal, expiresAt: NOW + 20_000,
    }, () => blocked.promise));
    const fetcher = vi.fn<typeof fetch>();
    const discover = createRdapBootstrap(fetcher, Date.now, guard);
    const pending = discover("example.com");
    await vi.advanceTimersByTimeAsync(DOMAIN_ANALYSIS_DEADLINE_MS);
    expect(await pending).toEqual({ ok: false, reason: "BOOTSTRAP_UNAVAILABLE" });
    blocked.resolve({ ok: true });
    await Promise.all(blockers);
    expect(fetcher).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("guard lifecycle", () => {
  it("bounds the queue and releases slots even when an operation throws unexpectedly", async () => {
    const guard = createRdapGuard(Date.now);
    const deadline = { signal: new AbortController().signal, expiresAt: NOW + 20_000 };
    const provider = new URL("https://provider.net/");
    const blocked = deferred<{ ok: true }>();
    const active = Array.from({ length: 5 }, () => guard.run(provider, deadline, () => blocked.promise));
    const queuedOperation = vi.fn(async () => ({ ok: true as const }));
    const queued = Array.from({ length: MAX_RDAP_QUEUE_SIZE }, () => guard.run(provider, deadline, queuedOperation));
    expect(await guard.run(provider, deadline, queuedOperation)).toEqual({ ok: false, reason: "QUEUE_FULL" });
    expect(queuedOperation).not.toHaveBeenCalled();
    blocked.resolve({ ok: true });
    await Promise.all([...active, ...queued]);
    expect(queuedOperation).toHaveBeenCalledTimes(MAX_RDAP_QUEUE_SIZE);
    await expect(guard.run(provider, deadline, async () => { throw new Error("Internal bug"); })).rejects.toThrow("Internal bug");
    const completed = await Promise.all(Array.from({ length: 5 }, () => guard.run(provider, deadline, queuedOperation)));
    expect(completed.every((result) => result.ok)).toBe(true);
  });
});
