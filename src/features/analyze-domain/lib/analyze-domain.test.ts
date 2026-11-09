import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateRisk } from "../../../entities/risk";
import { createDomainAnalyzer, NEW_DOMAIN_THRESHOLD_DAYS } from "../index";
import { BOOTSTRAP_TTL_MS, IANA_BOOTSTRAP_URL } from "./rdap-bootstrap";
import { MAX_JSON_BYTES, RDAP_TIMEOUT_MS } from "./rdap-http";
import { RDAP_FAILURE_COOLDOWN_MS } from "./rdap-limits";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-11-09T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * DAY_MS).toISOString();
const registry = {
  services: [
    [["com"], ["https://rdap.registry.net/v1/"]],
    [["uk"], ["https://rdap.registry.org/"]],
    [["org", "net"], ["https://rdap.provider.net/"]],
  ],
};
const registration = (date: unknown = daysAgo(365)) => ({
  objectClassName: "domain",
  events: [{ eventAction: "registration", eventDate: date }],
});
const json = (data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/rdap+json; charset=utf-8", ...headers },
});

function setup(data: unknown = registration(), bootstrap: unknown = registry) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    return json(String(input) === IANA_BOOTSTRAP_URL ? bootstrap : data);
  });
  const now = vi.fn(() => NOW);
  return { fetcher, now, analyze: createDomainAnalyzer({ fetch: fetcher, now }) };
}

afterEach(() => vi.useRealTimers());

describe("domain registration evidence", () => {
  it.each([
    [3650, false], [5, true], [30, false], [29, true], [0, true], [29.99, true],
  ])("handles a domain registered %s days ago", async (age, isNew) => {
    const { analyze } = setup(registration(daysAgo(age)));
    const result = await analyze("login.example.com");
    expect(result).toMatchObject({
      status: "COMPLETED", registrableDomain: "example.com",
      registrationDate: daysAgo(age), domainAgeDays: Math.floor(age),
    });
    if (result.status !== "COMPLETED") throw new Error("Expected completed analysis");
    expect(result.signals.map((signal) => signal.code)).toEqual(isNew ? ["NEW_DOMAIN"] : []);
    if (isNew) {
      expect(result.signals[0]).toEqual({
        code: "NEW_DOMAIN", category: "DOMAIN", title: expect.any(String), description: expect.any(String),
      });
      expect(calculateRisk(result.signals)).toMatchObject({ score: 15, level: "LOW" });
    }
    expect(NEW_DOMAIN_THRESHOLD_DAYS).toBe(30);
  });

  it.each([
    {}, { events: [] },
    { events: [{ eventAction: "last changed", eventDate: daysAgo(1) }] },
    { events: [{ eventAction: "expiration", eventDate: daysAgo(1) }, { eventAction: "transfer", eventDate: daysAgo(1) }] },
    { entities: [registration(daysAgo(1))] },
    { events: [null, "invalid", { eventAction: "registration" }] },
  ])("keeps age unknown without a valid top-level registration event: %j", async (fields) => {
    const { analyze } = setup({ objectClassName: "domain", ...fields });
    expect(await analyze("example.com")).toEqual({
      status: "COMPLETED", registrableDomain: "example.com", registrationDate: null, domainAgeDays: null, signals: [],
    });
  });

  it.each([
    "invalid", "", 42, null, "2026-11-05", "2026-11-05T12:00:00", "2026-02-30T12:00:00Z",
    "2025-02-29T12:00:00Z", "2026-13-01T12:00:00Z", "2026-11-05T24:00:00Z", daysAgo(-1),
  ])("does not fabricate age from invalid/future date %j", async (date) => {
    expect(await setup(registration(date)).analyze("example.com")).toMatchObject({
      status: "COMPLETED", registrationDate: null, domainAgeDays: null, signals: [],
    });
  });

  it("normalizes timezone offsets and uses elapsed whole days", async () => {
    const result = await setup(registration("2026-11-04T14:00:00+02:00")).analyze("example.com");
    expect(result).toMatchObject({ registrationDate: daysAgo(5), domainAgeDays: 5 });
  });

  it("accepts valid leap days and selects the earliest valid registration", async () => {
    const data = registration("2024-02-29T12:00:00Z");
    data.events.unshift({ eventAction: "registration", eventDate: daysAgo(1) });
    const result = await setup(data).analyze("example.com");
    expect(result).toMatchObject({ status: "COMPLETED", registrationDate: "2024-02-29T12:00:00.000Z", signals: [] });
  });

  it("returns only minimal metadata, with no contacts, raw response, risk or confidence", async () => {
    const data = {
      ...registration(daysAgo(5)), ldhName: "EXAMPLE.COM.",
      entities: [{ handle: "PERSON", vcardArray: ["vcard", [["email", {}, "text", "private@example.com"]]] }],
      phone: "+12345678", address: "Private address", links: [{ href: "https://user.example.com" }],
    };
    const { analyze, fetcher } = setup(data);
    const result = await analyze("example.com");
    expect(Object.keys(result).sort()).toEqual(["domainAgeDays", "registrableDomain", "registrationDate", "signals", "status"]);
    expect(JSON.stringify(result)).not.toMatch(/private|PERSON|vcard|12345678|user\.example/i);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("registrable domains and request boundaries", () => {
  it.each([
    ["login.example.com", "example.com", "https://rdap.registry.net/v1/"],
    ["www.paypal.com", "paypal.com", "https://rdap.registry.net/v1/"],
    ["security.example.co.uk", "example.co.uk", "https://rdap.registry.org/"],
    ["accounts.google.co.uk", "google.co.uk", "https://rdap.registry.org/"],
    ["WWW.EXAMPLE.COM.", "example.com", "https://rdap.registry.net/v1/"],
    ["tenant.blogspot.com", "blogspot.com", "https://rdap.registry.net/v1/"],
    ["www.bücher.com", "xn--bcher-kva.com", "https://rdap.registry.net/v1/"],
  ])("looks up %s as %s", async (hostname, domain, provider) => {
    const { analyze, fetcher } = setup();
    expect(await analyze(hostname)).toMatchObject({ status: "COMPLETED", registrableDomain: domain });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([IANA_BOOTSTRAP_URL, `${provider}domain/${domain}`]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toEqual({
        method: "GET", credentials: "omit", redirect: "manual", cache: "no-store",
        headers: { Accept: "application/rdap+json, application/json" }, signal: expect.any(AbortSignal),
      });
    }
  });

  it.each([
    "localhost", "printer.localhost", "192.168.1.1", "127.1", "0x7f000001", "2130706433", "::1", "[::1]",
    "2001:db8::1", "[::ffff:127.0.0.1]", "com", "co.uk", "example.invalid", "router.local", "", "example..com",
    "https://example.com/private?token=secret", "example.com/path", "user@example.com", "example.com:443",
    "example.com?next=https://evil.com", "example.com#fragment", "example.com%2f..", "example.com\\evil", "exam\nple.com",
  ])("returns NOT_APPLICABLE and makes no requests for %j", async (hostname) => {
    const { analyze, fetcher } = setup();
    expect(await analyze(hostname)).toEqual({ status: "NOT_APPLICABLE" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("selects the exact TLD and prefers HTTPS even when HTTP is listed first", async () => {
    const { analyze, fetcher } = setup(registration(), { services: [
      [["om"], ["https://wrong.registry.net/"]],
      [["com"], ["http://insecure.registry.net/", "https://secure.registry.net/rdap"]],
    ] });
    expect(await analyze("example.com")).toMatchObject({ status: "COMPLETED" });
    expect(String(fetcher.mock.calls[1][0])).toBe("https://secure.registry.net/rdap/domain/example.com");
  });

  it("does not use partial TLD matches or a provider missing from the registry", async () => {
    const { analyze, fetcher } = setup(registration(), { services: [[["om"], ["https://wrong.registry.net/"]]] });
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "NO_RDAP_SERVICE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://rdap.registry.net/", "ftp://rdap.registry.net/", "https://localhost/", "https://rdap.localhost/",
    "https://127.0.0.1/", "https://10.0.0.1/", "https://192.168.0.1/", "https://169.254.169.254/",
    "https://[::1]/", "https://[fc00::1]/", "https://[fe80::1]/", "https://[::ffff:127.0.0.1]/",
    "https://2130706433/", "https://0x7f000001/", "https://rdap.internal/",
    "https://user:password@rdap.registry.net/", "https://rdap.registry.net:8443/",
    "https://rdap.registry.net/?url=", "https://rdap.registry.net/#fragment", "not a URL",
  ])("does not request unsafe/unsupported bootstrap endpoint %s", async (endpoint) => {
    const { analyze, fetcher } = setup(registration(), { services: [[["com"], [endpoint]]] });
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "NO_RDAP_SERVICE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrap caching", () => {
  it("reuses fresh data across different domains, including concurrent callers", async () => {
    const { analyze, fetcher, now } = setup();
    await Promise.all([analyze("example.com"), analyze("example.org")]);
    now.mockReturnValue(NOW + BOOTSTRAP_TTL_MS - 1);
    await analyze("example.net");
    expect(fetcher.mock.calls.filter(([url]) => String(url) === IANA_BOOTSTRAP_URL)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("refreshes at expiry and uses the newly discovered provider", async () => {
    const { analyze, fetcher, now } = setup();
    await analyze("example.com");
    now.mockReturnValue(NOW + BOOTSTRAP_TTL_MS);
    fetcher.mockResolvedValueOnce(json({ services: [[["com"], ["https://new.registry.net/"]]] }));
    await analyze("example.com");
    expect(fetcher.mock.calls.filter(([url]) => String(url) === IANA_BOOTSTRAP_URL)).toHaveLength(2);
    expect(String(fetcher.mock.calls[3][0])).toBe("https://new.registry.net/domain/example.com");
  });

  it("does not use stale discovery after a failed refresh and can recover", async () => {
    const { analyze, fetcher, now } = setup();
    await analyze("example.com");
    now.mockReturnValue(NOW + BOOTSTRAP_TTL_MS);
    fetcher.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    now.mockReturnValue(NOW + BOOTSTRAP_TTL_MS + RDAP_FAILURE_COOLDOWN_MS);
    expect(await analyze("example.com")).toMatchObject({ status: "COMPLETED" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each([null, [], {}, { services: "invalid" }, { services: [["com", ["https://registry.net/"]]] }])(
    "rejects malformed bootstrap data: %j", async (data) => {
      const { analyze, fetcher } = setup(registration(), data);
      expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("returns unavailable on an IANA failure and retries only after cooldown", async () => {
    const { analyze, fetcher, now } = setup();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
    expect(await analyze("example.org")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    now.mockReturnValue(NOW + RDAP_FAILURE_COOLDOWN_MS);
    expect(await analyze("example.com")).toMatchObject({ status: "COMPLETED" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("untrusted RDAP responses and deadlines", () => {
  it.each([404, 429, 500])("returns unavailable for RDAP HTTP %s", async (status) => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(new Response(null, { status }));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "HTTP_ERROR" });
  });

  it("returns unavailable for connection failures without exposing exception details", async () => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(json(registry)).mockRejectedValueOnce(new TypeError("sensitive response details"));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "NETWORK_ERROR" });
  });

  it.each(["https://127.0.0.1/secret", "http://169.254.169.254/", "https://other.registry.net/", "/domain/example.com"])(
    "never follows RDAP redirects to %s", async (location) => {
      const { analyze, fetcher } = setup();
      fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
      expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "REDIRECT" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );

  it("never follows a bootstrap redirect", async () => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "https://evil.com/" } }));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "BOOTSTRAP_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], {}, { objectClassName: "entity" }, { objectClassName: "domain", events: {} },
    { ...registration(), ldhName: "other.com" }])("rejects invalid/unrelated RDAP objects: %j", async (data) => {
    expect(await setup(data).analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "INVALID_RESPONSE" });
  });

  it.each(["text/html", "text/plain", "application/xml"])("rejects %s before parsing", async (contentType) => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(json(registration(), { "content-type": contentType }));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "INVALID_RESPONSE" });
  });

  it("accepts application/json responses", async () => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(json(registry, { "content-type": "application/json" }));
    expect(await analyze("example.com")).toMatchObject({ status: "COMPLETED" });
  });

  it("returns unavailable for malformed JSON", async () => {
    const { analyze, fetcher } = setup();
    fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(new Response("{broken", { headers: { "content-type": "application/json" } }));
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "INVALID_RESPONSE" });
  });

  it("rejects oversized Content-Length without reading the body", async () => {
    const { analyze, fetcher } = setup();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json", "content-length": String(MAX_JSON_BYTES + 1) },
    });
    fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(response);
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "RESPONSE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds streamed bytes even if Content-Length lies or the body is decompressed", async () => {
    const { analyze, fetcher } = setup();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_JSON_BYTES));
        controller.enqueue(new Uint8Array(1));
      }, cancel,
    }), { headers: { "content-type": "application/json", "content-length": "1" } });
    fetcher.mockResolvedValueOnce(json(registry)).mockResolvedValueOnce(response);
    expect(await analyze("example.com")).toEqual({ status: "UNAVAILABLE", reason: "RESPONSE_TOO_LARGE" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["bootstrap", "rdap", "body"])("times out a stalled %s request within 4 seconds", async (stage) => {
    vi.useFakeTimers();
    const { analyze, fetcher } = setup();
    const cancel = vi.fn();
    const stalledBody = new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } });
    if (stage !== "bootstrap") fetcher.mockResolvedValueOnce(json(registry));
    if (stage === "body") fetcher.mockResolvedValueOnce(stalledBody);
    else fetcher.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const pending = analyze("example.com");
    await vi.advanceTimersByTimeAsync(RDAP_TIMEOUT_MS);
    expect(await pending).toEqual({ status: "UNAVAILABLE", reason: stage === "bootstrap" ? "BOOTSTRAP_UNAVAILABLE" : "TIMEOUT" });
    expect(fetcher.mock.calls.at(-1)?.[1]?.signal?.aborted).toBe(true);
    if (stage === "body") expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
