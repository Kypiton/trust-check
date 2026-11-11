import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as riskEngine from "../../../entities/risk";
import * as confidenceEngine from "../../../entities/confidence";
import type { CheckResult as ResultData } from "../../../entities/check/model/types";
import { CheckResult } from "../../../widgets/check-result/CheckResult";
import * as domainFeature from "../../analyze-domain";
import * as redirectFeature from "../../analyze-redirect";
import * as reputationFeature from "../../analyze-reputation";
import { createGoogleWebRiskProvider, WEB_RISK_TIMEOUT_MS } from "../../analyze-reputation/providers/google-web-risk";
import { analyzeUrlAction } from "../actions/analyze-url-action";
import { analyzeTextAction } from "../../analyze-text/actions/analyze-text-action";
import { buildUrlCheckResult, type UrlCheckResponse } from "./build-url-check-result";
import { inspectUrl } from "./analyze-url";

const newDomain: riskEngine.DetectedSignal = {
  code: "NEW_DOMAIN", category: "DOMAIN", title: "Recently registered domain",
  description: "This domain was registered less than 30 days ago. A new domain alone does not establish fraud.",
};
function domain(days = 365): domainFeature.DomainAnalysis {
  return {
    status: "COMPLETED", registrableDomain: "example.com", registrationDate: "2025-01-01T00:00:00Z",
    domainAgeDays: days, signals: days < 30 ? [newDomain] : [],
  };
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
function resultOf(response: UrlCheckResponse): ResultData {
  if (!response.ok || !("result" in response.analysis)) throw new Error("Expected a usable result");
  return response.analysis.result;
}
function completedLookup(verdicts: reputationFeature.ReputationVerdict[]) {
  return reputationFeature.createReputationAnalyzer({ provider: async () => ({ status: "COMPLETED", verdicts }) });
}

let providerFetch: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.spyOn(redirectFeature, "analyzeRedirect").mockImplementation(async (url) => ({
    status: "COMPLETED", initialUrl: url, finalUrl: url, hops: [], signals: [],
  }));
  // All external dependencies are isolated, regardless of developer credentials.
  // Exercise the real reputation adapter via injected transport, never Google.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external request"); }));
  providerFetch = vi.fn<typeof fetch>().mockResolvedValue(json({}));
  vi.spyOn(domainFeature, "analyzeDomain").mockResolvedValue(domain());
  vi.spyOn(reputationFeature, "analyzeReputation").mockImplementation(reputationFeature.createReputationAnalyzer({
    provider: createGoogleWebRiskProvider({ fetch: providerFetch, apiKey: "PRIVATE_TEST_KEY" }),
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("real Link flow with reputation enrichment", () => {
  it("completes clean old-domain and reputation checks with no negative-risk evidence", async () => {
    const response = await analyzeUrlAction("https://example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 0, riskLevel: "LOW", confidence: "HIGH", signals: [] });
    expect(result.analysisCoverage).toEqual([
      { code: "URL_STRUCTURE", status: "COMPLETED" },
      { code: "DOMAIN_METADATA", status: "COMPLETED" },
      { code: "REDIRECT_ANALYSIS", status: "COMPLETED" },
      { code: "THREAT_REPUTATION", status: "COMPLETED" },
    ]);
    expect(result.analysisNote).toContain("Threat reputation was checked.");
    expect(result.summary).toBe("No strong suspicious URL patterns were detected.");
  });

  it.each([
    ["SOCIAL_ENGINEERING", "KNOWN_PHISHING_URL", "Known phishing URL"],
    ["MALWARE", "KNOWN_MALICIOUS_URL", "Known malicious URL"],
  ])("uses canonical risk/confidence for %s and displays the existing signal copy", async (threat, code, title) => {
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: [threat] } }));
    const result = resultOf(await analyzeUrlAction("https://example.com"));
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH", signals: [{ code, title }] });
    expect(result.summary).toBe("This link was identified by a threat reputation source and should be treated as high risk.");
    const html = renderToStaticMarkup(createElement(CheckResult, { result }));
    expect(html).toContain(title);
    expect(html).toContain("High confidence");
    expect(html).toContain("Do not open the link");
    expect(html).not.toContain("Google");
    if (code === "KNOWN_PHISHING_URL") {
      expect(result.recommendedActions.map(({ code }) => code)).toEqual(["DO_NOT_OPEN_LINK", "AVOID_SENSITIVE_INFORMATION", "USE_OFFICIAL_WEBSITE"]);
    } else {
      expect(result.recommendedActions.map(({ code }) => code)).toEqual(["DO_NOT_OPEN_LINK", "DO_NOT_DOWNLOAD_FILES", "CLOSE_PAGE"]);
    }
  });

  it("merges all three evidence sources before exactly one risk and confidence calculation", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["SOCIAL_ENGINEERING"] } }));
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    // 10 + 20 + 15 + 50 = 95: per-provider floor/subtotal addition would give 100.
    const result = resultOf(await analyzeUrlAction("http://paypal-security-check.xyz"));
    expect(risk).toHaveBeenCalledTimes(1);
    expect(confidence).toHaveBeenCalledTimes(1);
    const signals = risk.mock.calls[0][0];
    expect(signals.map(({ code }) => code)).toEqual(["NO_HTTPS", "BRAND_IMPERSONATION", "NEW_DOMAIN", "KNOWN_PHISHING_URL"]);
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH" });
    expect(confidence).toHaveBeenCalledExactlyOnceWith({ sources: result.analysisCoverage, signals });
    expect(confidence.mock.results[0].value).toMatchObject({ level: result.confidence, points: 7 });
  });

  it("caps the combined score at 100 through the engine", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"] } }));
    const result = resultOf(await analyzeUrlAction("http://paypal-security-check.xyz"));
    expect(result).toMatchObject({ riskScore: 100, riskLevel: "HIGH", confidence: "HIGH" });
    const codes = result.recommendedActions.map(({ code }) => code);
    expect(codes).toHaveLength(6);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.filter((code) => code === "DO_NOT_OPEN_LINK")).toHaveLength(1);
    expect(result.recommendedActions.find(({ code }) => code === "AVOID_SENSITIVE_INFORMATION")?.title)
      .toBe("Do not enter passwords, payment information, or verification codes");
  });

  it("retains suspicious local and domain evidence with CLEAN reputation", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    const result = resultOf(await analyzeUrlAction("https://paypal-security-check.xyz"));
    expect(result).toMatchObject({ riskScore: 35, riskLevel: "MEDIUM", confidence: "HIGH" });
    expect(result.signals.map(({ code }) => code)).toEqual(["BRAND_IMPERSONATION", "NEW_DOMAIN"]);
  });

  it("keeps unwanted software as metadata with no invented signal or weight", async () => {
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["UNWANTED_SOFTWARE"] } }));
    const result = resultOf(await analyzeUrlAction("https://example.com"));
    expect(result).toMatchObject({ riskScore: 0, signals: [], confidence: "HIGH" });
    expect(result.analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "COMPLETED" });
  });

  it("preserves COMPLETED local/RDAP analysis when credentials are missing, with honest SKIPPED coverage", async () => {
    vi.mocked(reputationFeature.analyzeReputation).mockImplementation(reputationFeature.createReputationAnalyzer({
      provider: createGoogleWebRiskProvider({ fetch: providerFetch, apiKey: "" }),
    }));
    const response = await analyzeUrlAction("https://example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 0, confidence: "MEDIUM", signals: [] });
    expect(result.analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "SKIPPED" });
    expect(result.analysisNote).toContain("Threat reputation was not checked.");
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([429, 500, 503])("returns PARTIAL and retains local/RDAP evidence for reputation HTTP %s", async (status) => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    providerFetch.mockResolvedValueOnce(json({ message: "PRIVATE_ERROR" }, status));
    const response = await analyzeUrlAction("http://example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 25, confidence: "HIGH" });
    expect(result.signals.map(({ code }) => code)).toEqual(["NO_HTTPS", "NEW_DOMAIN"]);
    expect(result.analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "FAILED" });
    expect(result.analysisNote).toContain("Threat reputation was unavailable.");
    expect(JSON.stringify(response)).not.toContain("PRIVATE_ERROR");
  });

  it("degrades on malformed reputation data without losing RDAP evidence", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["UNKNOWN"] } }));
    expect(await analyzeUrlAction("https://example.com")).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 15, signals: [{ code: "NEW_DOMAIN" }] } } });
  });

  it("uses the existing reputation timeout and returns local/RDAP evidence", async () => {
    vi.useFakeTimers();
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(5));
    providerFetch.mockImplementationOnce(() => new Promise<Response>(() => {}));
    const pending = analyzeUrlAction("http://example.com");
    await vi.advanceTimersByTimeAsync(WEB_RISK_TIMEOUT_MS);
    const response = await pending;
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    const result = resultOf(response);
    expect(result.signals.map(({ code }) => code)).toEqual(["NO_HTTPS", "NEW_DOMAIN"]);
    expect(result.analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "FAILED" });
    expect(providerFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("uses confirmed reputation even if RDAP fails", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT" });
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["MALWARE"] } }));
    const response = await analyzeUrlAction("https://example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH" });
    expect(result.analysisNote).toContain("Domain registration metadata was unavailable.");
    expect(result.analysisNote).toContain("Threat reputation was checked.");
    expect(result.analysisNote).not.toContain("URL structure only");
  });

  it("returns local evidence when both external providers fail", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT" });
    providerFetch.mockRejectedValueOnce(new Error("PRIVATE_FAILURE"));
    const response = await analyzeUrlAction("http://paypal-security-check.xyz");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 30, riskLevel: "MEDIUM", confidence: "MEDIUM" });
    expect(result.signals.map(({ code }) => code)).toEqual(["NO_HTTPS", "BRAND_IMPERSONATION"]);
    expect(result.analysisCoverage.filter(({ status }) => status === "FAILED").map(({ code }) => code)).toEqual(["DOMAIN_METADATA", "THREAT_REPUTATION"]);
  });

  it("does not treat NOT_APPLICABLE domain metadata as a failure", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "NOT_APPLICABLE" });
    const response = await analyzeUrlAction("https://127.0.0.1");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "DOMAIN_METADATA", status: "NOT_APPLICABLE" });
  });

  it.each(["", "not a URL", "javascript:alert(1)", "https://", "x".repeat(2049)])("does not invoke either external dependency for invalid input (case %#)", async (input) => {
    expect(await analyzeUrlAction(input)).toMatchObject({ ok: false });
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("passes the existing parser's normalized URL to reputation and only the hostname to RDAP", async () => {
    await analyzeUrlAction(" EXAMPLE.com:443/a%2Fb?x=1#fragment ");
    expect(reputationFeature.analyzeReputation).toHaveBeenCalledExactlyOnceWith("https://example.com/a%2Fb?x=1#fragment");
    expect(domainFeature.analyzeDomain).toHaveBeenCalledExactlyOnceWith("example.com");
    const request = new URL(String(providerFetch.mock.calls[0][0]));
    expect(request.origin).toBe("https://webrisk.googleapis.com");
    expect(request.searchParams.get("uri")).toBe("https://example.com/a%2Fb?x=1");
  });

  it("starts both independent enrichments before either one resolves", async () => {
    let resolveDomain!: (value: domainFeature.DomainAnalysis) => void;
    let resolveReputation!: (value: reputationFeature.ReputationAnalysis) => void;
    const rdap = vi.fn(() => new Promise<domainFeature.DomainAnalysis>((resolve) => { resolveDomain = resolve; }));
    const reputation = vi.fn(() => new Promise<reputationFeature.ReputationAnalysis>((resolve) => { resolveReputation = resolve; }));
    const pending = buildUrlCheckResult("https://example.com", { analyzeDomain: rdap, analyzeReputation: reputation });
    expect(rdap).toHaveBeenCalledTimes(1);
    expect(reputation).toHaveBeenCalledTimes(1);
    resolveReputation(await completedLookup(["CLEAN"])("https://example.com"));
    resolveDomain(domain());
    expect(await pending).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
  });

  it("deduplicates all providers' signals before invoking the engines", async () => {
    const local = inspectUrl("http://example.com");
    if (!local.valid) throw new Error("Expected valid fixture");
    const matched = await completedLookup(["PHISHING"])("http://example.com");
    const repeated = [...local.signals, newDomain, ...matched.signals, ...matched.signals];
    const rdapResult = { ...domain(5), signals: repeated };
    const reputationResult = { ...matched, signals: repeated };
    const before = structuredClone({ rdapResult, reputationResult });
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const result = resultOf(await buildUrlCheckResult("http://example.com", {
      analyzeDomain: async () => rdapResult, analyzeReputation: async () => reputationResult,
    }));
    expect(risk).toHaveBeenCalledTimes(1);
    expect(risk.mock.calls[0][0].map(({ code }) => code)).toEqual(["NO_HTTPS", "NEW_DOMAIN", "KNOWN_PHISHING_URL"]);
    expect(result.signals).toHaveLength(3);
    expect(result.riskScore).toBe(95);
    expect({ rdapResult, reputationResult }).toEqual(before);
  });

  it("discards reputation evidence that expires while waiting for RDAP", async () => {
    vi.useFakeTimers();
    const initial = Date.now();
    let resolveDomain!: (value: domainFeature.DomainAnalysis) => void;
    const matched = await completedLookup(["MALWARE"])("https://example.com");
    const pending = buildUrlCheckResult("https://example.com", {
      analyzeDomain: () => new Promise((resolve) => { resolveDomain = resolve; }),
      analyzeReputation: async () => ({ ...matched, expiresAt: new Date(initial + 1000).toISOString() }),
    });
    vi.setSystemTime(initial + 1000);
    resolveDomain(domain());
    const response = await pending;
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0, confidence: "MEDIUM", signals: [] } } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "FAILED" });
  });

  it("exposes only serializable display fields, without secrets or provider metadata", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    providerFetch.mockResolvedValueOnce(json({ threat: { threatTypes: ["MALWARE"], expireTime: expiresAt }, raw: "PRIVATE_RAW_RESPONSE" }));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const response = await analyzeUrlAction("https://PRIVATE_USER:PRIVATE_PASSWORD@example.com/PRIVATE_PATH?key=PRIVATE_QUERY#PRIVATE_FRAGMENT");
    const serialized = JSON.stringify(response);
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 95 } } });
    expect(JSON.parse(serialized)).toEqual(response);
    expect(serialized).not.toMatch(/PRIVATE_|example\.com|expiresAt|expireTime|threatTypes|verdicts|registrableDomain|registrationDate|domainAgeDays/);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps TEXT analysis independent of both URL enrichments", async () => {
    expect(await analyzeTextAction("Please send me your verification code immediately.")).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });
});

// Persistence is verified separately; keep provider integration tests database-free.
vi.mock("@/entities/check/server", () => ({
  persistAnalysisResponse: vi.fn(async (_inputType: string, response: unknown) => response),
}));
