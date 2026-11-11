import { calculateConfidence } from "../../../entities/confidence";
import * as confidenceEngine from "../../../entities/confidence";
import * as riskEngine from "../../../entities/risk";
import * as domainFeature from "../../analyze-domain";
import * as redirectFeature from "../../analyze-redirect";
import * as reputationFeature from "../../analyze-reputation";
import { IANA_BOOTSTRAP_URL } from "../../analyze-domain/lib/rdap-bootstrap";
import { RDAP_TIMEOUT_MS } from "../../analyze-domain/lib/rdap-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateRisk } from "../../../entities/risk";
import { analyzeUrlAction } from "../actions/analyze-url-action";
import { analyzeTextAction } from "../../analyze-text/actions/analyze-text-action";
import * as analyzer from "./analyze-url";
import { buildUrlCheckResult, buildUrlRecommendations, mapUrlCheckResult } from "./build-url-check-result";
import { MAX_URL_INPUT_LENGTH } from "./limits";

async function resultFor(input: string) {
  const response = await buildUrlCheckResult(input);
  if (!response.ok || !("result" in response.analysis)) throw new Error("Expected URL result");
  return response.analysis.result;
}

const NOW = Date.parse("2026-11-09T12:00:00Z");
const bootstrap = { services: [[["com", "org", "xyz", "ly", "uk"], ["https://rdap.registry.net/"]]] };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/rdap+json" } });
const registration = (days: number) => ({
  objectClassName: "domain",
  events: [{ eventAction: "registration", eventDate: new Date(NOW - days * 86_400_000).toISOString() }],
});
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const skippedReputation: reputationFeature.ReputationAnalysis = {
  status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [],
  source: { code: "THREAT_REPUTATION", status: "SKIPPED" },
};

beforeEach(() => {
  vi.spyOn(redirectFeature, "analyzeRedirect").mockImplementation(async (url) => ({
    status: "COMPLETED", initialUrl: url, finalUrl: url, hops: [], signals: [],
  }));
  // Exercise the real RDAP parser, signal generation and cache with an isolated
  // transport. No test makes an external request.
  fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => json(String(url) === IANA_BOOTSTRAP_URL ? bootstrap : registration(365)));
  vi.spyOn(domainFeature, "analyzeDomain").mockImplementation(domainFeature.createDomainAnalyzer({ fetch: fetcher, now: () => NOW }));
  vi.spyOn(reputationFeature, "analyzeReputation").mockResolvedValue(skippedReputation);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("URL result mapping", () => {
  it("returns real 0 / LOW for an ordinary HTTPS link", async () => {
    expect(await resultFor("https://example.com")).toMatchObject({
      riskScore: 0, riskLevel: "LOW", confidence: "MEDIUM", signals: [],
      summary: "No strong suspicious URL patterns were detected.",
    });
  });

  it.each([
    ["http://example.com", ["NO_HTTPS"], 10, "LOW"],
    ["http://185.23.44.11/login", ["NO_HTTPS", "IP_ADDRESS_URL"], 30, "MEDIUM"],
    ["https://paypal-security-check.xyz", ["BRAND_IMPERSONATION"], 20, "LOW"],
    ["https://paypal.com", [], 0, "LOW"],
  ] as const)("preserves the real analyzer output for %s", async (input, codes, score, level) => {
    const result = await resultFor(input);
    const analyzed = analyzer.analyzeUrl(input);
    if (!analyzed.valid) throw new Error("Expected valid fixture");
    expect(result.signals.map((signal) => signal.code)).toEqual(codes);
    expect(result.signals).toEqual(analyzed.signals.map(({ code, title, description }) => ({ code, title, description })));
    expect(result.riskScore).toBe(calculateRisk(analyzed.signals).score);
    expect(result).toMatchObject({ riskScore: score, riskLevel: level });
  });

  it.each([
    ["https://example.com", "MEDIUM"],
    ["http://example.com", "MEDIUM"],
    ["http://185.23.44.11/login", "MEDIUM"],
  ])("uses coverage-based confidence for %s", async (input, confidence) => {
    const result = await resultFor(input);
    const analyzed = analyzer.analyzeUrl(input);
    if (!analyzed.valid) throw new Error("Expected valid fixture");
    expect(result.confidence).toBe(confidence);
    expect(result.confidence).toBe(calculateConfidence({ sources: result.analysisCoverage, signals: analyzed.signals }).level);
    expect(result.analysisNote).toContain("Threat reputation was not checked. Redirect analysis completed successfully.");
  });

  it("keeps several suspicious local patterns at MEDIUM confidence", async () => {
    const result = await resultFor(`http://paypa1-login.example/${"a".repeat(220)}`);
    expect(result).toMatchObject({ riskScore: 35, riskLevel: "MEDIUM", confidence: "MEDIUM" });
    expect(result.analysisCoverage.filter((source) => source.status === "COMPLETED")).toHaveLength(2);
  });

  it("maps a MEDIUM summary from actual evidence", async () => {
    expect((await resultFor("http://185.23.44.11/login")).summary).toBe("Some suspicious characteristics were detected in this link.");
  });

  it("passes through upstream scores and supports HIGH without duplicating scoring", () => {
    const analysis = analyzer.analyzeUrl("http://example.com");
    if (!analysis.valid) throw new Error("Expected valid fixture");
    // HIGH is not currently reachable with only the local URL signals; exercise
    // the mapping contract with a future upstream score, not invented weighting.
    analysis.risk = { ...analysis.risk, score: 77, level: "HIGH" };
    expect(mapUrlCheckResult(analysis, { status: "NOT_APPLICABLE" }, skippedReputation, { status: "COMPLETED", initialUrl: "http://example.com/", finalUrl: "http://example.com/", hops: [], signals: [] })).toMatchObject({
      riskScore: 77, riskLevel: "HIGH", confidence: "MEDIUM",
      summary: "This link contains several characteristics commonly associated with suspicious or deceptive URLs.",
    });
  });

  it.each([
    ["http://example.com", "Avoid entering passwords, payment details, or other sensitive information on this page"],
    ["https://185.23.44.11/login", "Verify the destination independently before opening the link"],
    ["https://bit.ly/example", "Verify the final destination before trusting a shortened link"],
    ["https://paypal-security-check.xyz", "Open the organization's official website manually instead of using this link"],
    [`https://example.com/${"a".repeat(200)}`, "Check the actual domain carefully before continuing"],
  ])("derives recommendations from %s", async (input, title) => {
    expect((await resultFor(input)).recommendedActions.map((action) => action.title)).toEqual([title]);
  });

  it("deduplicates recommendations without changing their input", () => {
    const analysis = analyzer.analyzeUrl("http://185.23.44.11/login");
    if (!analysis.valid) throw new Error("Expected valid fixture");
    const signals = Object.freeze([...analysis.signals, ...analysis.signals]);
    const actions = buildUrlRecommendations(signals);
    expect(actions).toHaveLength(2);
    expect(new Set(actions.map((action) => action.code)).size).toBe(2);
    expect(signals).toHaveLength(4);
  });

  it("provides general guidance when no signal exists without inventing evidence", async () => {
    const result = await resultFor("https://example.com");
    expect(result.signals).toEqual([]);
    expect(result.recommendedActions.map((action) => action.code)).toEqual(["VERIFY_DESTINATION"]);
  });

  it("reports completed URL, domain and redirect checks with unconfigured reputation skipped", async () => {
    expect((await resultFor("https://example.com")).analysisCoverage).toEqual([
      { code: "URL_STRUCTURE", status: "COMPLETED" },
      { code: "DOMAIN_METADATA", status: "COMPLETED" },
      { code: "REDIRECT_ANALYSIS", status: "COMPLETED" },
      { code: "THREAT_REPUTATION", status: "SKIPPED" },
    ]);
  });
});

describe("URL Server Action validation and privacy", () => {
  it.each([
    `https://example.com/${"x".repeat(MAX_URL_INPUT_LENGTH)}`,
    `${" ".repeat(MAX_URL_INPUT_LENGTH)}https://example.com`,
  ])("rejects oversized raw input before parsing or enrichment (case %#)", async (input) => {
    const inspect = vi.spyOn(analyzer, "inspectUrl");
    const response = await analyzeUrlAction(input);
    expect(response).toEqual({ ok: false, error: `Keep your link to ${MAX_URL_INPUT_LENGTH} characters or fewer.` });
    expect(inspect).not.toHaveBeenCalled();
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("accepts a valid URL at exactly the length limit", async () => {
    const prefix = "https://example.com/";
    const input = prefix + "x".repeat(MAX_URL_INPUT_LENGTH - prefix.length);
    expect(await analyzeUrlAction(input)).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(domainFeature.analyzeDomain).toHaveBeenCalledExactlyOnceWith("example.com");
  });

  it.each([undefined, null, 7, {}, [], "", " \t\n "])("rejects empty/non-string input before invoking the analyzer (case %#)", async (input) => {
    const analyze = vi.spyOn(analyzer, "inspectUrl");
    expect(await analyzeUrlAction(input)).toEqual({ ok: false, error: "Enter a valid HTTP or HTTPS link." });
    expect(analyze).not.toHaveBeenCalled();
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "data:text/html,test", "random invalid content", "https://"])("returns inline validation rather than FAILED for %s", async (input) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeUrlAction(input);
    expect(response).toEqual({ ok: false, error: "Enter a valid HTTP or HTTPS link." });
    expect(response).not.toHaveProperty("analysis");
    expect(error).not.toHaveBeenCalled();
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("trims raw input and lets the existing parser accept bare domains", async () => {
    const analyze = vi.spyOn(analyzer, "inspectUrl");
    const response = await analyzeUrlAction(" \n example.com \t ");
    expect(analyze).toHaveBeenCalledExactlyOnceWith("example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 0 } } });
  });

  it("returns serializable display data without sensitive URL components or logging them", async () => {
    const input = "https://private-user:PRIVATE_PASSWORD_238@example.com/PRIVATE_PATH_491?token=PRIVATE_QUERY_817#PRIVATE_FRAGMENT_604";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeUrlAction(input);
    const serialized = JSON.stringify(response);
    expect(JSON.parse(serialized)).toEqual(response);
    for (const secret of [input, "PRIVATE_PASSWORD_238", "PRIVATE_PATH_491", "PRIVATE_QUERY_817", "PRIVATE_FRAGMENT_604", "example.com"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain('"normalizedUrl"');
    expect(serialized).not.toContain('"hostname"');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("maps unexpected exceptions to FAILED and reports only a fixed server event", async () => {
    const secret = "https://example.com/PRIVATE_ERROR_912";
    vi.spyOn(analyzer, "inspectUrl").mockImplementation(() => { throw new Error(secret); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await analyzeUrlAction(secret)).toEqual({ ok: true, analysis: { status: "FAILED" } });
    expect(error).toHaveBeenCalledExactlyOnceWith("[TrustCheck] URL_ANALYSIS_FAILED");
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
  });

  it("delegates all networking to the injected enrichments", async () => {
    const fetch = vi.fn(() => { throw new Error("Forbidden network call"); });
    vi.stubGlobal("fetch", fetch);
    const response = await analyzeUrlAction("http://185.23.44.11/login");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 30 } } });
    expect(fetch).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("integrated URL and RDAP evidence", () => {
  it("completes an old normal domain check with real coverage and MEDIUM confidence", async () => {
    expect(await analyzeUrlAction("https://example.com")).toMatchObject({
      ok: true,
      analysis: {
        status: "COMPLETED",
        result: { riskScore: 0, confidence: "MEDIUM", signals: [], analysisCoverage: [
          { code: "URL_STRUCTURE", status: "COMPLETED" },
          { code: "DOMAIN_METADATA", status: "COMPLETED" },
          { code: "REDIRECT_ANALYSIS", status: "COMPLETED" },
          { code: "THREAT_REPUTATION", status: "SKIPPED" },
        ] },
      },
    });
  });

  it.each([
    ["https://example.com", ["NEW_DOMAIN"], 15, "LOW", "MEDIUM"],
    ["https://paypal-security-check.xyz", ["BRAND_IMPERSONATION", "NEW_DOMAIN"], 35, "MEDIUM", "HIGH"],
    ["http://paypal-security-check.xyz", ["NO_HTTPS", "BRAND_IMPERSONATION", "NEW_DOMAIN"], 45, "MEDIUM", "HIGH"],
    [`http://paypal-security-check.xyz/${"a".repeat(220)}`, ["NO_HTTPS", "LONG_URL", "BRAND_IMPERSONATION", "NEW_DOMAIN"], 50, "MEDIUM", "HIGH"],
  ] as const)("merges real local and recent-domain signals for %s", async (input, codes, score, level, confidence) => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(json(registration(5)));
    const result = await resultFor(input);
    expect(result.signals.map((signal) => signal.code)).toEqual(codes);
    expect(result).toMatchObject({ riskScore: score, riskLevel: level, confidence });
    expect(result.signals.find((signal) => signal.code === "NEW_DOMAIN")).toMatchObject({
      title: "Recently registered domain",
      description: expect.stringContaining("A new domain alone does not establish fraud"),
    });
    expect(result.recommendedActions).toContainEqual({
      code: "VERIFY_RECENT_DOMAIN",
      title: "Verify the organization independently before trusting a recently registered domain",
    });
    expect(result.analysisNote).toContain("URL structure and domain registration metadata were analyzed");
  });

  it("calculates risk and confidence exactly once after all evidence has arrived", async () => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(json(registration(5)));
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    const result = await resultFor("http://paypal-security-check.xyz");
    expect(risk).toHaveBeenCalledTimes(1);
    expect(confidence).toHaveBeenCalledTimes(1);
    const signals = risk.mock.calls[0][0];
    expect(signals.map((signal) => signal.code)).toEqual(["NO_HTTPS", "BRAND_IMPERSONATION", "NEW_DOMAIN"]);
    expect(confidence).toHaveBeenCalledWith({ sources: result.analysisCoverage, signals });
    expect(result.riskScore).toBe(45);
    expect(confidence.mock.results[0].value).toMatchObject({ points: 4, level: "HIGH" });
  });

  it("deduplicates signals across detectors before scoring and recommending", async () => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(json(registration(5)));
    const domain = await domainFeature.analyzeDomain("example.com");
    const local = analyzer.inspectUrl("http://example.com");
    if (domain.status !== "COMPLETED" || !local.valid) throw new Error("Expected fixture evidence");
    const duplicates = { ...domain, signals: [...domain.signals, ...domain.signals, ...local.signals] };
    const original = structuredClone(duplicates);
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const response = await buildUrlCheckResult("http://example.com", { analyzeDomain: async () => duplicates });
    expect(risk).toHaveBeenCalledTimes(1);
    expect(risk.mock.calls[0][0].map((signal) => signal.code)).toEqual(["NO_HTTPS", "NEW_DOMAIN"]);
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 25, confidence: "HIGH" } } });
    if (!response.ok || !("result" in response.analysis)) throw new Error("Expected result");
    expect(response.analysis.result.signals).toHaveLength(2);
    expect(response.analysis.result.recommendedActions).toHaveLength(2);
    expect(duplicates).toEqual(original);
  });

  it.each(["https://login.example.com/private", "https://security.example.co.uk/private"])(
    "passes only the hostname and reuses RDAP registrable-domain resolution for %s", async (input) => {
      const expectedDomain = input.includes("co.uk") ? "example.co.uk" : "example.com";
      await resultFor(input);
      expect(domainFeature.analyzeDomain).toHaveBeenCalledExactlyOnceWith(new URL(input).hostname);
      expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
        IANA_BOOTSTRAP_URL, `https://rdap.registry.net/domain/${expectedDomain}`,
      ]);
    },
  );

  it.each(["http://185.23.44.11/login", "http://[2001:db8::1]/login", "http://127.1/login", "https://localhost"])(
    "completes %s with NOT_APPLICABLE domain metadata and no RDAP requests", async (input) => {
      const response = await analyzeUrlAction(input);
      expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { analysisCoverage: [
        { code: "URL_STRUCTURE", status: "COMPLETED" },
        { code: "DOMAIN_METADATA", status: "NOT_APPLICABLE" },
        { code: "REDIRECT_ANALYSIS", status: "COMPLETED" },
        { code: "THREAT_REPUTATION", status: "SKIPPED" },
      ] } } });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("reports a successful lookup with unknown registration age honestly", async () => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(json({ objectClassName: "domain", events: [] }));
    const result = await resultFor("https://example.com");
    expect(result).toMatchObject({ riskScore: 0, confidence: "MEDIUM", signals: [] });
    expect(result.analysisCoverage).toContainEqual({ code: "DOMAIN_METADATA", status: "COMPLETED" });
    expect(result.analysisNote).toContain("registration age is unknown");
  });

  it("strips RDAP contact details and sends no submitted URL secrets to the provider", async () => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(json({
      ...registration(5),
      entities: [{ name: "PRIVATE_PERSON", email: "PRIVATE_EMAIL", phone: "PRIVATE_PHONE", address: "PRIVATE_ADDRESS" }],
    }));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeUrlAction("https://PRIVATE_USER:PRIVATE_PASSWORD@login.example.com/PRIVATE_PATH?token=PRIVATE_TOKEN#PRIVATE_FRAGMENT");
    const serialized = JSON.stringify(response);
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 15 } } });
    expect(JSON.parse(serialized)).toEqual(response);
    expect(serialized).not.toMatch(/PRIVATE_|entities|registrationDate|domainAgeDays|registrableDomain|example\.com/);
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      IANA_BOOTSTRAP_URL, "https://rdap.registry.net/domain/example.com",
    ]);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps the TEXT action independent of domain enrichment", async () => {
    const result = await analyzeTextAction("Please send me your verification code immediately.");
    expect(result).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("RDAP degradation and async failures", () => {
  it.each([404, 429, 500])("keeps local evidence when the RDAP provider returns %s", async (status) => {
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockResolvedValueOnce(new Response(null, { status }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeUrlAction("http://paypal-security-check.xyz");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: {
      riskScore: 30, riskLevel: "MEDIUM", confidence: "MEDIUM",
      signals: [{ code: "NO_HTTPS" }, { code: "BRAND_IMPERSONATION" }],
      analysisCoverage: [
        { code: "URL_STRUCTURE", status: "COMPLETED" },
        { code: "DOMAIN_METADATA", status: "FAILED" },
        { code: "REDIRECT_ANALYSIS", status: "COMPLETED" },
        { code: "THREAT_REPUTATION", status: "SKIPPED" },
      ],
      analysisNote: expect.stringContaining("Domain registration metadata was unavailable"),
    } } });
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["bootstrap", "malformed", "connection"])("returns a usable PARTIAL result on %s failure", async (failure) => {
    if (failure === "bootstrap") fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else {
      fetcher.mockResolvedValueOnce(json(bootstrap));
      if (failure === "malformed") fetcher.mockResolvedValueOnce(json({ objectClassName: "unexpected" }));
      else fetcher.mockRejectedValueOnce(new TypeError("Sensitive provider error"));
    }
    const response = await analyzeUrlAction("https://example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0, confidence: "MEDIUM", signals: [] } } });
    expect(JSON.stringify(response)).not.toContain("Sensitive provider error");
  });

  it("times out RDAP and still returns the real local result", async () => {
    vi.useFakeTimers();
    fetcher.mockResolvedValueOnce(json(bootstrap)).mockImplementationOnce(() => new Promise<Response>(() => {}));
    const pending = analyzeUrlAction("http://example.com");
    await vi.advanceTimersByTimeAsync(RDAP_TIMEOUT_MS);
    expect(await pending).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: {
      riskScore: 10, confidence: "MEDIUM", signals: [{ code: "NO_HTTPS" }],
      analysisCoverage: expect.arrayContaining([{ code: "DOMAIN_METADATA", status: "FAILED" }]),
    } } });
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true);
  });

  it("awaits rejected enrichment so unexpected programming errors become FAILED", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockRejectedValueOnce(new Error("PRIVATE_INTERNAL_ERROR"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    expect(await analyzeUrlAction("https://example.com")).toEqual({ ok: true, analysis: { status: "FAILED" } });
    expect(error).toHaveBeenCalledExactlyOnceWith("[TrustCheck] URL_ANALYSIS_FAILED");
    expect(risk).not.toHaveBeenCalled();
  });
});

// Keep existing engine/orchestration tests independent of session/database state.
vi.mock("@/entities/check/server", () => ({
  persistAnalysisResponse: vi.fn(async (_inputType: string, response: unknown) => response),
}));
