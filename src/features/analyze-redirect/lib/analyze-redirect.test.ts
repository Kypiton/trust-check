import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateRisk } from "../../../entities/risk";
import { createSafeHttp, type SafeHttpFailureReason, type SafeHttpResult } from "../../../shared/server/safe-http";
import { createRedirectAnalyzer, MAX_REDIRECT_HOPS, REDIRECT_ANALYSIS_DEADLINE_MS, type RedirectAnalysis } from "../index";

function response(statusCode = 200, location?: string): SafeHttpResult {
  return { ok: true, statusCode, ...(location === undefined ? {} : { location }), hostname: "example.com", resolvedAddress: "93.184.216.34" };
}
function setup(...responses: SafeHttpResult[]) {
  const request = vi.fn<ReturnType<typeof createSafeHttp>>();
  for (const result of responses) request.mockResolvedValueOnce(result);
  return { request, analyze: createRedirectAnalyzer({ request, now: Date.now }) };
}
function completed(result: RedirectAnalysis) {
  if (result.status !== "COMPLETED") throw new Error("Expected completed chain");
  return result;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("standalone redirect chain", () => {
  it("returns immediate 200 with zero hops and no IP or response body metadata", async () => {
    const h = setup(response());
    expect(await h.analyze("https://example.com/start#fragment")).toEqual({
      status: "COMPLETED", initialUrl: "https://example.com/start", finalUrl: "https://example.com/start", hops: [], signals: [],
    });
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([301, 302, 303, 307, 308])("follows HTTP %i with exactly one unweighted hop", async (statusCode) => {
    const h = setup(response(statusCode, "/login"), response());
    const result = completed(await h.analyze("https://example.com/start"));
    expect(result.finalUrl).toBe("https://example.com/login");
    expect(result.signals).toEqual([]);
    expect(result.hops).toEqual([{
      from: "https://example.com/start", to: "https://example.com/login", statusCode,
      fromHostname: "example.com", toHostname: "example.com", crossDomain: false,
      protocolDowngrade: false, targetIsIp: false, shortenedLinkDestinationChange: false,
    }]);
    expect(h.request.mock.calls.map(([url]) => url)).toEqual(["https://example.com/start", "https://example.com/login"]);
  });

  it.each([200, 204, 300, 304, 305, 306, 404, 500])("terminates at HTTP %i even if Location is present", async (status) => {
    const h = setup(response(status, "/ignored"));
    expect(await h.analyze("https://example.com/")).toMatchObject({ status: "COMPLETED", hops: [], signals: [] });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/login", "https://example.com/login"],
    ["../next", "https://example.com/next"],
    ["?step=2", "https://example.com/a/start?step=2"],
    ["//other.example/path", "https://other.example/path"],
    ["next#fragment", "https://example.com/a/next"],
  ])("resolves Location %s with the standard URL API", async (location, target) => {
    const h = setup(response(302, location), response());
    expect(completed(await h.analyze("https://example.com/a/start")).finalUrl).toBe(target);
    expect(h.request.mock.calls[1][0]).toBe(target);
  });

  it.each([
    ["https://example.com/", "https://login.example.com/", false],
    ["https://example.com/", "https://another-example.net/", true],
    ["https://example.co.uk/", "https://login.example.co.uk/", false],
    ["https://example.co.uk/", "https://other.co.uk/", true],
    ["https://one.blogspot.com/", "https://two.blogspot.com/", true],
    ["https://one.blogspot.com/", "https://login.one.blogspot.com/", false],
    ["https://EXAMPLE.com./", "https://login.example.com/", false],
    ["https://8.8.8.8/a", "https://8.8.8.8/b", false],
    ["https://example.com/", "https://8.8.8.8/", true],
  ])("compares PSL domain boundaries for %s → %s", async (from, to, crossDomain) => {
    const h = setup(response(302, to), response());
    expect(completed(await h.analyze(from)).hops[0].crossDomain).toBe(crossDomain);
  });

  it("records HTTPS downgrade and public IP targets as metadata only", async () => {
    const h = setup(response(302, "http://8.8.8.8/path"), response());
    const result = completed(await h.analyze("https://example.com"));
    expect(result.hops[0]).toMatchObject({ protocolDowngrade: true, targetIsIp: true, crossDomain: true });
    expect(result.signals).toEqual([]);
    expect(h.request.mock.calls[1][0]).toBe("http://8.8.8.8/path");
  });

  it("recognizes an IPv6 literal target as metadata", async () => {
    const h = setup(response(302, "https://[2606:4700:4700::1111]/"), response());
    expect(completed(await h.analyze("https://example.com")).hops[0].targetIsIp).toBe(true);
  });

  it.each([
    ["https://bit.ly/a", "https://example.com/", true],
    ["https://www.tinyurl.com/a", "https://example.com/", true],
    ["https://bit.ly/a", "https://bit.ly/b", false],
    ["https://evil.bit.ly/a", "https://example.com/", false],
    ["https://example.com/", "https://other.com/", false],
  ])("records configured shortener destination changes for %s", async (from, to, expected) => {
    const h = setup(response(302, to), response());
    const result = completed(await h.analyze(from));
    expect(result.hops[0].shortenedLinkDestinationChange).toBe(expected);
    expect(result.signals).toEqual([]);
  });

  it.each([2, 3, 5])("emits MULTIPLE_REDIRECTS once for %i completed redirects, leaving weight to the engine", async (count) => {
    const h = setup(...Array.from({ length: count }, (_, i) => response(302, `/hop${i + 1}`)), response());
    const result = completed(await h.analyze("https://example.com/"));
    expect(result.hops).toHaveLength(count);
    expect(result.signals).toEqual([{
      code: "MULTIPLE_REDIRECTS", category: "REDIRECT", title: expect.any(String), description: expect.any(String),
    }]);
    expect(result.signals[0]).not.toHaveProperty("weight");
    expect(calculateRisk(result.signals)).toMatchObject({ score: 10, scoredSignals: [{ weight: 10 }] });
  });

  it("allows exactly five followed hops but refuses a sixth", async () => {
    const h = setup(...Array.from({ length: 6 }, (_, i) => response(302, `/hop${i + 1}`)));
    expect(await h.analyze("https://example.com/")).toEqual({ status: "UNAVAILABLE", reason: "TOO_MANY_REDIRECTS", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(MAX_REDIRECT_HOPS + 1);
    expect(h.request.mock.calls.at(-1)![0]).toBe("https://example.com/hop5");
  });

  it.each(["https://example.com/a", "/a", "#new-fragment", "https://EXAMPLE.com:443/a"])("detects normalized self-loop to %s", async (location) => {
    const h = setup(response(302, location));
    expect(await h.analyze("https://example.com/a#initial")).toEqual({ status: "UNAVAILABLE", reason: "REDIRECT_LOOP", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it("detects A → B → A without requesting A again", async () => {
    const h = setup(response(302, "/b"), response(301, "/a"));
    expect(await h.analyze("https://example.com/a")).toEqual({ status: "UNAVAILABLE", reason: "REDIRECT_LOOP", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, ""])("reports missing Location instead of inventing a final destination (case %#)", async (location) => {
    const h = setup(response(302, location));
    expect(await h.analyze("https://example.com/")).toEqual({ status: "UNAVAILABLE", reason: "MISSING_LOCATION", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it.each(["https://[broken", "\\\\localhost", "/with space", "/a\nb", "x".repeat(2049)])("rejects malformed Location without a later request (case %#)", async (location) => {
    const h = setup(response(302, location));
    expect(await h.analyze("https://example.com/")).toEqual({ status: "UNAVAILABLE", reason: "INVALID_LOCATION", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it.each(["TIMEOUT", "NETWORK_ERROR", "DNS_FAILED", "QUEUE_FULL", "BLOCKED_IP", "BLOCKED_HOST", "CREDENTIALS_NOT_ALLOWED", "PORT_NOT_ALLOWED", "UNSUPPORTED_PROTOCOL"] satisfies SafeHttpFailureReason[])("returns no fabricated evidence when a later hop fails with %s", async (reason) => {
    const h = setup(response(302, "/b"), response(302, "/c"), { ok: false, reason });
    expect(await h.analyze("https://example.com/a")).toEqual({ status: "UNAVAILABLE", reason, signals: [] });
    expect(h.request).toHaveBeenCalledTimes(3);
  });

  it("is deterministic and does not mutate supplied response fixtures", async () => {
    const fixtures = Object.freeze([Object.freeze(response(302, "/b")), Object.freeze(response(308, "/c")), Object.freeze(response())]);
    const original = structuredClone(fixtures);
    const input = "https://example.com/a";
    expect(await setup(...fixtures).analyze(input)).toEqual(await setup(...fixtures).analyze(input));
    expect(fixtures).toEqual(original);
    expect(input).toBe("https://example.com/a");
  });

  it("does not log paths, queries, fragments, Location or returned chains", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const h = setup(response(302, "/PRIVATE_TARGET?token=PRIVATE_QUERY#PRIVATE_FRAGMENT"), response());
    const result = await h.analyze("https://example.com/PRIVATE_START?key=PRIVATE_KEY#PRIVATE_INITIAL_FRAGMENT");
    expect(result.status).toBe("COMPLETED");
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_FRAGMENT|PRIVATE_INITIAL_FRAGMENT|resolvedAddress|93\.184\.216\.34/);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("overall deadline", () => {
  it("stops at six seconds even if an injected dependency ignores cancellation", async () => {
    const h = setup();
    let resolve!: (value: SafeHttpResult) => void;
    h.request.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = h.analyze("https://example.com/");
    await vi.advanceTimersByTimeAsync(REDIRECT_ANALYSIS_DEADLINE_MS);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED", signals: [] });
    expect(h.request.mock.calls[0][1]?.aborted).toBe(true);
    resolve(response(302, "/late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reset the total deadline between hops", async () => {
    const h = setup();
    h.request.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return response(302, `/hop${h.request.mock.calls.length}`);
    });
    const pending = h.analyze("https://example.com/");
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED", signals: [] });
    expect(h.request).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1500);
    expect(h.request).toHaveBeenCalledTimes(3);
  });

  it("rejects a result arriving at the absolute deadline before the timer callback runs", async () => {
    const h = setup();
    h.request.mockImplementationOnce(async () => { vi.setSystemTime(6000); return response(); });
    expect(await h.analyze("https://example.com/")).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED", signals: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up the deadline while allowing programming errors to propagate", async () => {
    const h = setup();
    h.request.mockRejectedValueOnce(new Error("Programming error"));
    await expect(h.analyze("https://example.com/")).rejects.toThrow("Programming error");
    expect(vi.getTimerCount()).toBe(0);
    expect(h.request.mock.calls[0][1]?.aborted).toBe(true);
  });
});

// The following regressions use the real safe-http validation, queue, DNS/IP
// policy and pinned lookup callback. Only DNS and Node's wire transport are fake.
function boundary() {
  const resolve = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
  const requests: { options: RequestOptions; request: EventEmitter & { destroy: ReturnType<typeof vi.fn> }; respond: (status: number, location?: string) => void }[] = [];
  const responses: { destroy: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> }[] = [];
  const transport = vi.fn((options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
    const request = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    requests.push({ options, request, respond: (statusCode, location) => {
      const data = Object.assign(new EventEmitter(), {
        statusCode, headers: location === undefined ? {} : { location }, destroy: vi.fn(), read: vi.fn(), resume: vi.fn(),
      });
      responses.push(data);
      onResponse(data as unknown as IncomingMessage);
    } });
    return request as unknown as ClientRequest;
  });
  const request = createSafeHttp({ resolve, httpRequest: transport, httpsRequest: transport, now: Date.now });
  return { analyze: createRedirectAnalyzer({ request, now: Date.now }), request, resolve, requests, responses };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

describe("safe-http per-hop security regressions", () => {
  it.each([
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_IP"],
    ["http://127.0.0.1/", "BLOCKED_IP"], ["http://10.0.0.1/", "BLOCKED_IP"],
    ["http://[fc00::1]/", "BLOCKED_IP"], ["http://[::ffff:127.0.0.1]/", "BLOCKED_IP"],
    ["http://localhost/", "BLOCKED_HOST"], ["https://user:pass@example.com/", "CREDENTIALS_NOT_ALLOWED"],
    ["https://example.com:8443/", "PORT_NOT_ALLOWED"], ["file:///etc/passwd", "UNSUPPORTED_PROTOCOL"],
  ])("never connects to rejected redirect target %s", async (target, reason) => {
    const h = boundary();
    const pending = h.analyze("https://public.example/");
    await flush();
    h.requests[0].respond(302, target);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason, signals: [] });
    expect(h.requests).toHaveLength(1);
    expect(h.requests[0].options.hostname).toBe("public.example");
    expect(h.resolve).toHaveBeenCalledTimes(1);
  });

  it("re-resolves each hop, so a hostname rebinding to private IPs stops the chain", async () => {
    const h = boundary();
    const pending = h.analyze("https://public.example/a");
    await flush();
    const callback = vi.fn();
    h.requests[0].options.lookup!("public.example", {}, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(null, "93.184.216.34", 4);
    h.resolve.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    h.requests[0].respond(302, "/b");
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "BLOCKED_IP", signals: [] });
    expect(h.resolve).toHaveBeenCalledTimes(2);
    expect(h.requests).toHaveLength(1);
  });

  it("validates and pins both ordinary hops without touching response bodies", async () => {
    const h = boundary();
    const pending = h.analyze("https://public.example/");
    await flush();
    h.requests[0].respond(302, "http://other.example/");
    await flush();
    expect(h.requests).toHaveLength(2);
    expect(h.resolve).toHaveBeenCalledTimes(2);
    h.requests[1].respond(200);
    const result = completed(await pending);
    expect(result.hops[0]).toMatchObject({ crossDomain: true, protocolDowngrade: true });
    for (const data of h.responses) {
      expect(data.destroy).toHaveBeenCalledTimes(1);
      expect(data.read).not.toHaveBeenCalled();
      expect(data.resume).not.toHaveBeenCalled();
    }
  });

  it.each(["http:example.com", "https://exam\nple.com", "https://user:pass@example.com/"])("retains strict initial safe-http validation for %s", async (input) => {
    const h = boundary();
    expect(await h.analyze(input)).toMatchObject({ status: "UNAVAILABLE", signals: [] });
    expect(h.requests).toHaveLength(0);
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it("retains safe-http's three-second per-hop timeout", async () => {
    const h = boundary();
    const pending = h.analyze("https://public.example/");
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "TIMEOUT", signals: [] });
    expect(h.requests[0].request.destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("destroys an active third-hop connection at the six-second chain deadline", async () => {
    const h = boundary();
    const pending = h.analyze("https://public.example/a");
    await vi.advanceTimersByTimeAsync(2500);
    h.requests[0].respond(302, "/b");
    await vi.advanceTimersByTimeAsync(2500);
    h.requests[1].respond(302, "/c");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED", signals: [] });
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2].request.destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a queued third hop at the overall deadline without later connecting", async () => {
    const h = boundary();
    const pending = h.analyze("https://public.example/a");
    await vi.advanceTimersByTimeAsync(2500);
    h.requests[0].respond(302, "/b");
    await vi.advanceTimersByTimeAsync(2500);
    const blockers = Array.from({ length: 5 }, (_, i) => h.request(`https://block${i}.example`));
    await flush();
    h.requests[1].respond(302, "/c");
    await flush();
    expect(h.requests).toHaveLength(7);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED", signals: [] });
    h.requests.slice(2).forEach((entry) => entry.respond(200));
    await Promise.all(blockers);
    await flush();
    expect(h.requests).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});
