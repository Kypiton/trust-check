import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateConfidence } from "../../../entities/confidence";
import { calculateRisk } from "../../../entities/risk";
import { createReputationAnalyzer } from "../index";
import { createGoogleWebRiskProvider, WEB_RISK_MAX_BYTES, WEB_RISK_TIMEOUT_MS } from "../providers/google-web-risk";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const URL_INPUT = "https://example.com/login?token=private#fragment";
const TEST_KEY = "test-only-provider-key";
const completed = { code: "THREAT_REPUTATION", status: "COMPLETED" };

function json(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
}
function analyzeWith(fetcher: typeof fetch, apiKey = TEST_KEY) {
  return createReputationAnalyzer({
    provider: createGoogleWebRiskProvider({ fetch: fetcher, apiKey, now: () => NOW }),
    now: () => NOW,
  });
}
function lookup(value: unknown) {
  return analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(json(value)))(URL_INPUT);
}
function expectUnavailable(result: unknown, reason: string) {
  expect(result).toEqual({ status: "UNAVAILABLE", reason, signals: [], source: { code: "THREAT_REPUTATION", status: "FAILED" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("standalone reputation analysis", () => {
  it.each([undefined, "", "   "])("skips a missing/blank environment key (case %#) without fetching", async (key) => {
    vi.stubEnv("GOOGLE_WEB_RISK_API_KEY", key);
    const fetcher = vi.fn<typeof fetch>();
    const analyze = createReputationAnalyzer({ provider: createGoogleWebRiskProvider({ fetch: fetcher }) });
    expect(await analyze(URL_INPUT)).toEqual({
      status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [], source: { code: "THREAT_REPUTATION", status: "SKIPPED" },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads the server environment key when configured", async () => {
    vi.stubEnv("GOOGLE_WEB_RISK_API_KEY", TEST_KEY);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await createGoogleWebRiskProvider({ fetch: fetcher })(URL_INPUT);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("key")).toBe(TEST_KEY);
  });

  it("maps empty JSON to CLEAN list coverage without a risk signal", async () => {
    const result = await lookup({});
    expect(result).toEqual({ status: "COMPLETED", verdicts: ["CLEAN"], signals: [], source: completed });
    expect(calculateConfidence({ sources: [result.source], signals: result.signals })).toMatchObject({ level: "MEDIUM", points: 2 });
  });

  it.each([
    ["SOCIAL_ENGINEERING", "PHISHING", "KNOWN_PHISHING_URL"],
    ["MALWARE", "MALWARE", "KNOWN_MALICIOUS_URL"],
  ])("maps %s into %s and canonical URL evidence", async (threat, verdict, code) => {
    const result = await lookup({ threat: { threatTypes: [threat] } });
    expect(result).toMatchObject({ status: "COMPLETED", verdicts: [verdict], source: completed });
    expect(result.signals).toEqual([{ code, category: "REPUTATION", title: expect.any(String), description: expect.any(String) }]);
    expect(result.signals[0].description).toContain("URL");
    expect(calculateRisk(result.signals)).toMatchObject({ score: 95, level: "HIGH", scoredSignals: [{ weight: 50 }] });
    expect(calculateConfidence({ sources: [result.source], signals: result.signals })).toMatchObject({ level: "HIGH", points: 2 });
  });

  it("retains unwanted-software metadata without inventing a weight or malware signal", async () => {
    expect(await lookup({ threat: { threatTypes: ["UNWANTED_SOFTWARE"] } })).toEqual({
      status: "COMPLETED", verdicts: ["UNWANTED_SOFTWARE"], signals: [], source: completed,
    });
  });

  it("deduplicates all matches in stable order regardless of provider order", async () => {
    const threats = ["UNWANTED_SOFTWARE", "MALWARE", "SOCIAL_ENGINEERING", "MALWARE", "SOCIAL_ENGINEERING"];
    const result = await lookup({ threat: { threatTypes: threats } });
    expect(result).toMatchObject({ verdicts: ["PHISHING", "MALWARE", "UNWANTED_SOFTWARE"] });
    expect(result.signals.map(({ code }) => code)).toEqual(["KNOWN_PHISHING_URL", "KNOWN_MALICIOUS_URL"]);
    expect(await lookup({ threat: { threatTypes: [...threats].reverse() } })).toEqual(result);
    expect(calculateRisk([...result.signals, ...result.signals])).toMatchObject({ score: 100, level: "HIGH" });
    expect(calculateRisk([...result.signals, ...result.signals]).scoredSignals).toHaveLength(2);
  });

  it.each([
    null, [], "CLEAN", 7, { error: { message: TEST_KEY } }, { threat: null }, { threat: [] }, { threat: {} },
    { threat: { threatTypes: [] } }, { threat: { threatTypes: "MALWARE" } },
    { threat: { threatTypes: ["UNKNOWN"] } }, { threat: { threatTypes: ["MALWARE", "UNKNOWN"] } },
    { threat: { threatTypes: ["THREAT_TYPE_UNSPECIFIED"] } }, { threat: { threatTypes: [null] } },
    { threat: { threatTypes: [123] } }, { threat: { threatTypes: ["constructor"] } },
  ])("rejects malformed or unknown threat data without partial signals (case %#)", async (body) => {
    expectUnavailable(await lookup(body), "INVALID_RESPONSE");
  });

  it("strips fragments, preserves path/query/credentials, and uses a fixed provider request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    const input = "https://user:pass@example.com:8443/a%2Fb?key=user-key&uri=https%3A%2F%2Fevil.test&x=1&x=2#secret";
    const result = await analyzeWith(fetcher)(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [raw, options] = fetcher.mock.calls[0];
    const endpoint = new URL(String(raw));
    expect(endpoint.origin).toBe("https://webrisk.googleapis.com");
    expect(endpoint.pathname).toBe("/v1/uris:search");
    expect(endpoint.port).toBe("");
    expect(endpoint.username).toBe("");
    expect(endpoint.password).toBe("");
    expect(endpoint.hash).toBe("");
    expect(endpoint.searchParams.getAll("threatTypes")).toEqual(["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"]);
    expect(endpoint.searchParams.getAll("uri")).toEqual([input.split("#")[0]]);
    expect(endpoint.searchParams.getAll("key")).toEqual([TEST_KEY]);
    expect(options).toMatchObject({ method: "GET", redirect: "manual", credentials: "omit", cache: "no-store", headers: { Accept: "application/json" } });
    expect(JSON.stringify(result)).not.toContain("user:pass");
  });

  it.each([
    "http://127.0.0.1/private", "https://webrisk.googleapis.com.evil.test/path", "https://webrisk.googleapis.com@evil.test/",
    "http://[::1]:8080/path", "https://evil.test/?threatTypes=EVIL&key=override", "https://evil.test/v1/uris:search",
  ])("cannot redirect the provider endpoint using submitted input: %s", async (input) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await analyzeWith(fetcher)(input);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const endpoint = new URL(String(fetcher.mock.calls[0][0]));
    expect(`${endpoint.origin}${endpoint.pathname}`).toBe("https://webrisk.googleapis.com/v1/uris:search");
    expect(endpoint.searchParams.get("uri")).toBe(input);
    expect(endpoint.searchParams.get("key")).toBe(TEST_KEY);
  });

  it.each(["", "not a URL", "/relative", "file:///etc/passwd", "javascript:alert(1)", "ftp://example.com"])("rejects invalid/non-HTTP inputs before fetching (case %#)", async (input) => {
    const fetcher = vi.fn<typeof fetch>();
    expectUnavailable(await analyzeWith(fetcher)(input), "INVALID_URL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429, 500, 503])("returns no signals for HTTP %i and does not expose the error body", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ message: `${TEST_KEY} ${URL_INPUT}` }, { status }));
    const result = await analyzeWith(fetcher)(URL_INPUT);
    expectUnavailable(result, "HTTP_ERROR");
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
    expect(JSON.stringify(result)).not.toContain(URL_INPUT);
  });

  it.each([301, 302, 307, 308])("does not follow HTTP %i redirects", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status, headers: { Location: "https://evil.test/" } }));
    expectUnavailable(await analyzeWith(fetcher)(URL_INPUT), "REDIRECT");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("also rejects an already redirected response", async () => {
    const response = json({});
    Object.defineProperty(response, "redirected", { value: true });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "REDIRECT");
  });

  it.each([undefined, "text/plain", "text/html"])("rejects a non-JSON media type (case %#)", async (type) => {
    const response = new Response("{}", { headers: type ? { "Content-Type": type } : {} });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "INVALID_RESPONSE");
  });

  it("accepts JSON charset parameters", async () => {
    const response = new Response("{}", { headers: { "Content-Type": "application/json; charset=utf-8" } });
    expect(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT)).toMatchObject({ verdicts: ["CLEAN"] });
  });

  it.each(["{malformed", "", `{"error":"${TEST_KEY}"`])("rejects malformed JSON without returning body contents (case %#)", async (body) => {
    const response = new Response(body, { headers: { "Content-Type": "application/json" } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "INVALID_RESPONSE");
  });

  it("rejects a missing response body", async () => {
    const response = new Response(null, { headers: { "Content-Type": "application/json" } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "INVALID_RESPONSE");
  });

  it("rejects invalid UTF-8", async () => {
    const response = new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "INVALID_RESPONSE");
  });

  it("rejects an oversized declared content length before reading and cancels the body", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const response = new Response(stream, { headers: { "Content-Type": "application/json", "Content-Length": String(WEB_RISK_MAX_BYTES + 1) } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "RESPONSE_TOO_LARGE");
    expect(cancel).toHaveBeenCalled();
  });

  it.each([undefined, "2"])("enforces the byte limit while streaming, even without an honest content length (case %#)", async (length) => {
    const cancel = vi.fn();
    const chunk = new TextEncoder().encode("é".repeat(32_768));
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(chunk); }, cancel });
    const response = new Response(stream, { headers: { "Content-Type": "application/json", ...(length ? { "Content-Length": length } : {}) } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "RESPONSE_TOO_LARGE");
    expect(cancel).toHaveBeenCalled();
  });

  it("allows valid JSON at the exact byte limit", async () => {
    const response = new Response("{}" + " ".repeat(WEB_RISK_MAX_BYTES - 2), { headers: { "Content-Type": "application/json" } });
    expect(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT)).toMatchObject({ verdicts: ["CLEAN"] });
  });

  it("times out stalled headers even if the fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = analyzeWith(fetcher)(URL_INPUT);
    await vi.advanceTimersByTimeAsync(WEB_RISK_TIMEOUT_MS);
    expectUnavailable(await pending, "TIMEOUT");
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled body and cancels the reader", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream, { headers: { "Content-Type": "application/json" } }));
    const pending = analyzeWith(fetcher)(URL_INPUT);
    await vi.advanceTimersByTimeAsync(WEB_RISK_TIMEOUT_MS);
    expectUnavailable(await pending, "TIMEOUT");
    expect(cancel).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an overdue response even if the timeout callback has not run", async () => {
    let time = NOW;
    const fetcher = vi.fn<typeof fetch>(async () => {
      time += WEB_RISK_TIMEOUT_MS;
      return json({ threat: { threatTypes: ["MALWARE"] } });
    });
    const analyze = createReputationAnalyzer({ provider: createGoogleWebRiskProvider({ fetch: fetcher, apiKey: TEST_KEY, now: () => time }) });
    expectUnavailable(await analyze(URL_INPUT), "TIMEOUT");
  });

  it("clears the timeout after a completed lookup", async () => {
    vi.useFakeTimers();
    await lookup({});
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sanitizes network and unexpected provider exceptions without logging private data", async () => {
    const logs = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
    const error = new Error(`${TEST_KEY} ${URL_INPUT}`);
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    expectUnavailable(await analyzeWith(fetcher)(URL_INPUT), "NETWORK_ERROR");
    expectUnavailable(await createReputationAnalyzer({ provider: async () => { throw error; } })(URL_INPUT), "NETWORK_ERROR");
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("sanitizes stream errors without exposing response content", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error(TEST_KEY)); } });
    const response = new Response(stream, { headers: { "Content-Type": "application/json" } });
    expectUnavailable(await analyzeWith(vi.fn<typeof fetch>().mockResolvedValue(response))(URL_INPUT), "INVALID_RESPONSE");
  });

  it("preserves a valid provider expiration including nanoseconds", async () => {
    const expiresAt = "2026-11-10T13:00:00.123456789Z";
    expect(await lookup({ threat: { threatTypes: ["MALWARE"], expireTime: expiresAt } })).toMatchObject({ status: "COMPLETED", expiresAt });
  });

  it.each(["2026-11-10T11:59:59Z", "2026-11-10T12:00:00Z"])("does not emit evidence that has already expired: %s", async (expireTime) => {
    expectUnavailable(await lookup({ threat: { threatTypes: ["MALWARE"], expireTime } }), "EXPIRED_RESPONSE");
  });

  it.each([null, 123, "", "invalid", "2027-02-30T00:00:00Z", "2027-01-01", "2027-01-01T24:00:00Z", "2027-01-01T00:00:00.1234567890Z"])("rejects invalid provider expiration (case %#)", async (expireTime) => {
    expectUnavailable(await lookup({ threat: { threatTypes: ["MALWARE"], expireTime } }), "INVALID_RESPONSE");
  });

  it("rechecks expiry before turning a provider verdict into signals", async () => {
    const analyze = createReputationAnalyzer({
      provider: async () => ({ status: "COMPLETED", verdicts: ["MALWARE"], expiresAt: "2026-11-10T12:00:00Z" }),
      now: () => NOW,
    });
    expectUnavailable(await analyze(URL_INPUT), "EXPIRED_RESPONSE");
  });

  it("does not cache responses or invent expiration when it is absent", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json({ threat: { threatTypes: ["MALWARE"] } }))
      .mockResolvedValueOnce(json({}));
    const analyze = analyzeWith(fetcher);
    expect(await analyze(URL_INPUT)).not.toHaveProperty("expiresAt");
    expect(await analyze(URL_INPUT)).toMatchObject({ verdicts: ["CLEAN"], signals: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
