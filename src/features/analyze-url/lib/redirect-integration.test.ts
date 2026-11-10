import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as riskEngine from "../../../entities/risk";
import * as confidenceEngine from "../../../entities/confidence";
import * as domainFeature from "../../analyze-domain";
import * as reputationFeature from "../../analyze-reputation";
import * as redirectFeature from "../../analyze-redirect";
import { createSafeHttp, type SafeHttpResult } from "../../../shared/server/safe-http";
import { createGoogleWebRiskProvider } from "../../analyze-reputation/providers/google-web-risk";
import { CheckResult } from "../../../widgets/check-result/CheckResult";
import { analyzeUrlAction } from "../actions/analyze-url-action";
import { analyzeTextAction } from "../../analyze-text/actions/analyze-text-action";
import { buildUrlCheckResult, buildUrlRecommendations, type UrlCheckResponse } from "./build-url-check-result";
import { inspectUrl } from "./analyze-url";

const recentDomainSignal: riskEngine.DetectedSignal = {
  code: "NEW_DOMAIN", category: "DOMAIN", title: "Recently registered domain", description: "Recently registered domain evidence.",
};
function domain(recent = false): domainFeature.DomainAnalysis {
  return { status: "COMPLETED", registrableDomain: "example.com", registrationDate: "2025-01-01T00:00:00Z", domainAgeDays: recent ? 5 : 365, signals: recent ? [recentDomainSignal] : [] };
}
function metadata(statusCode = 200, location?: string): SafeHttpResult {
  return { ok: true, statusCode, location, hostname: "example.com", resolvedAddress: "93.184.216.34" };
}
function resultOf(response: UrlCheckResponse) {
  if (!response.ok || !("result" in response.analysis)) throw new Error("Expected usable analysis");
  return response.analysis.result;
}
const reputation = (verdicts: reputationFeature.ReputationVerdict[]) => reputationFeature.createReputationAnalyzer({
  provider: async () => ({ status: "COMPLETED", verdicts }),
});
let request: ReturnType<typeof vi.fn<ReturnType<typeof createSafeHttp>>>;
beforeEach(() => {
  // No production transport runs: the real redirect analyzer consumes only
  // injected metadata, and the other independent enrichments are isolated.
  request = vi.fn<ReturnType<typeof createSafeHttp>>().mockResolvedValue(metadata());
  vi.spyOn(domainFeature, "analyzeDomain").mockResolvedValue(domain());
  vi.spyOn(reputationFeature, "analyzeReputation").mockImplementation(reputation(["CLEAN"]));
  vi.spyOn(redirectFeature, "analyzeRedirect").mockImplementation(redirectFeature.createRedirectAnalyzer({ request, now: Date.now }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
function redirects(count = 2) {
  for (let i = 0; i < count; i++) request.mockResolvedValueOnce(metadata(302, `/hop${i + 1}`));
}

describe("final Link redirect integration", () => {
  it.each([0, 1, 2])("uses real redirect coverage and evidence for %i redirects", async (count) => {
    redirects(count);
    const response = await analyzeUrlAction("https://example.com/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: count < 2 ? 0 : 10, riskLevel: "LOW", confidence: "HIGH", redirectDetails: { hopCount: count } });
    expect(result.signals.map(({ code }) => code)).toEqual(count < 2 ? [] : ["MULTIPLE_REDIRECTS"]);
    expect(result.analysisCoverage).toEqual([
      { code: "URL_STRUCTURE", status: "COMPLETED" }, { code: "DOMAIN_METADATA", status: "COMPLETED" },
      { code: "REDIRECT_ANALYSIS", status: "COMPLETED" }, { code: "THREAT_REPUTATION", status: "COMPLETED" },
    ]);
    expect(result.analysisNote).toContain("Redirect analysis completed successfully.");
    expect(request).toHaveBeenCalledTimes(count + 1);
    if (count === 2) expect(result.recommendedActions).toContainEqual({ code: "VERIFY_DESTINATION", title: "Check the final destination carefully before entering sensitive information." });
  });

  it("merges local, domain and redirect evidence before exactly one canonical risk/confidence calculation", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(true));
    redirects();
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    const result = resultOf(await analyzeUrlAction("https://paypal-security-check.xyz"));
    expect(risk).toHaveBeenCalledTimes(1);
    expect(confidence).toHaveBeenCalledTimes(1);
    const signals = risk.mock.calls[0][0];
    expect(signals.map(({ code }) => code)).toEqual(["BRAND_IMPERSONATION", "NEW_DOMAIN", "MULTIPLE_REDIRECTS"]);
    expect(result).toMatchObject({ riskScore: 45, riskLevel: "MEDIUM", confidence: "HIGH" });
    expect(risk.mock.results[0].value.scoredSignals.at(-1)).toMatchObject({ code: "MULTIPLE_REDIRECTS", weight: 10 });
    expect(confidence).toHaveBeenCalledExactlyOnceWith({ sources: result.analysisCoverage, signals });
    expect(confidence.mock.results[0].value).toMatchObject({ level: result.confidence, points: 6 });
  });

  it.each(["PHISHING", "MALWARE"] as const)("preserves the canonical reputation floor with %s plus redirects", async (verdict) => {
    vi.mocked(reputationFeature.analyzeReputation).mockImplementationOnce(reputation([verdict]));
    redirects();
    const result = resultOf(await analyzeUrlAction("https://example.com/"));
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH" });
    expect(result.signals.map(({ code }) => code)).toEqual([verdict === "PHISHING" ? "KNOWN_PHISHING_URL" : "KNOWN_MALICIOUS_URL", "MULTIPLE_REDIRECTS"]);
    expect(result.recommendedActions.map(({ code }) => code)).not.toContain("VERIFY_DESTINATION");
  });

  it.each(["TIMEOUT", "NETWORK_ERROR", "DNS_FAILED", "BLOCKED_IP", "BLOCKED_HOST", "PORT_NOT_ALLOWED", "QUEUE_FULL", "DEADLINE_EXCEEDED"] as const)("returns PARTIAL while preserving all other evidence for %s", async (reason) => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce(domain(true));
    vi.mocked(reputationFeature.analyzeReputation).mockImplementationOnce(reputation(["PHISHING"]));
    vi.mocked(redirectFeature.analyzeRedirect).mockResolvedValueOnce({ status: "UNAVAILABLE", reason, signals: [] });
    const response = await analyzeUrlAction("http://paypal-security-check.xyz");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    const result = resultOf(response);
    expect(result.signals.map(({ code }) => code)).toEqual(["NO_HTTPS", "BRAND_IMPERSONATION", "NEW_DOMAIN", "KNOWN_PHISHING_URL"]);
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH" });
    expect(result.analysisCoverage).toContainEqual({ code: "REDIRECT_ANALYSIS", status: "FAILED" });
    expect(result).not.toHaveProperty("redirectDetails");
    expect(JSON.stringify(result)).not.toContain(reason);
    if (["BLOCKED_IP", "BLOCKED_HOST", "PORT_NOT_ALLOWED"].includes(reason)) {
      expect(result.analysisNote).toContain("Redirect analysis could not safely follow one of the destinations.");
    }
  });

  it.each(["loop", "hop limit"])("degrades on a real %s without fabricated extra risk", async (failure) => {
    if (failure === "loop") request.mockResolvedValueOnce(metadata(302, "/"));
    else redirects(6);
    const response = await analyzeUrlAction("https://example.com/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0, signals: [] } } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "REDIRECT_ANALYSIS", status: "FAILED" });
  });

  it("runs redirects with missing Web Risk credentials and keeps honest SKIPPED coverage", async () => {
    const providerFetch = vi.fn<typeof fetch>();
    vi.mocked(reputationFeature.analyzeReputation).mockImplementationOnce(reputationFeature.createReputationAnalyzer({
      provider: createGoogleWebRiskProvider({ apiKey: "", fetch: providerFetch }),
    }));
    redirects();
    const response = await analyzeUrlAction("https://example.com/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED", result: { riskScore: 10, confidence: "MEDIUM" } } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "SKIPPED" });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "REDIRECT_ANALYSIS", status: "COMPLETED" });
    expect(providerFetch).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each(["domain", "reputation"])("retains redirect evidence when %s fails", async (source) => {
    if (source === "domain") vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT" });
    else vi.mocked(reputationFeature.analyzeReputation).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT", signals: [], source: { code: "THREAT_REPUTATION", status: "FAILED" } });
    redirects();
    const response = await analyzeUrlAction("https://example.com/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 10, signals: [{ code: "MULTIPLE_REDIRECTS" }] } } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "REDIRECT_ANALYSIS", status: "COMPLETED" });
  });

  it("returns local evidence when all enrichments fail", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT" });
    vi.mocked(reputationFeature.analyzeReputation).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [], source: { code: "THREAT_REPUTATION", status: "FAILED" } });
    vi.mocked(redirectFeature.analyzeRedirect).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [] });
    const response = await analyzeUrlAction("http://paypal-security-check.xyz");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 30, confidence: "MEDIUM", signals: [{ code: "NO_HTTPS" }, { code: "BRAND_IMPERSONATION" }] } } });
    expect(resultOf(response).analysisCoverage.filter(({ status }) => status === "FAILED")).toHaveLength(3);
  });

  it("keeps NOT_APPLICABLE domain metadata neutral when other enrichments complete", async () => {
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValueOnce({ status: "NOT_APPLICABLE" });
    const response = await analyzeUrlAction("https://8.8.8.8/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "DOMAIN_METADATA", status: "NOT_APPLICABLE" });
  });

  it.each(["", "invalid", "javascript:alert(1)", "https://", "x".repeat(2049)])("does not run any enrichments for invalid input (case %#)", async (input) => {
    expect(await analyzeUrlAction(input)).toMatchObject({ ok: false });
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("starts all three enrichments before any finishes and does not recheck the final URL", async () => {
    let finishDomain!: (value: domainFeature.DomainAnalysis) => void;
    let finishReputation!: (value: reputationFeature.ReputationAnalysis) => void;
    let finishRedirect!: (value: redirectFeature.RedirectAnalysis) => void;
    const domainAnalyzer = vi.fn(() => new Promise<domainFeature.DomainAnalysis>((resolve) => { finishDomain = resolve; }));
    const reputationAnalyzer = vi.fn(() => new Promise<reputationFeature.ReputationAnalysis>((resolve) => { finishReputation = resolve; }));
    const redirectAnalyzer = vi.fn(() => new Promise<redirectFeature.RedirectAnalysis>((resolve) => { finishRedirect = resolve; }));
    const pending = buildUrlCheckResult(" EXAMPLE.com/path?token=original ", { analyzeDomain: domainAnalyzer, analyzeReputation: reputationAnalyzer, analyzeRedirect: redirectAnalyzer });
    expect(domainAnalyzer).toHaveBeenCalledExactlyOnceWith("example.com");
    expect(reputationAnalyzer).toHaveBeenCalledExactlyOnceWith("https://example.com/path?token=original");
    expect(redirectAnalyzer).toHaveBeenCalledExactlyOnceWith("https://example.com/path?token=original");
    finishRedirect({ status: "COMPLETED", initialUrl: "https://example.com/", finalUrl: "https://different.net/private", hops: [], signals: [] });
    finishDomain(domain());
    finishReputation(await reputation(["CLEAN"])("https://example.com/"));
    expect(await pending).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(domainAnalyzer).toHaveBeenCalledTimes(1);
    expect(reputationAnalyzer).toHaveBeenCalledTimes(1);
    expect(redirectAnalyzer).toHaveBeenCalledTimes(1);
  });

  it("deduplicates evidence from all four sources before the engines", async () => {
    const local = inspectUrl("http://example.com/");
    if (!local.valid) throw new Error("Expected valid fixture");
    redirects();
    const redirect = await redirectFeature.analyzeRedirect("http://example.com/");
    const matched = await reputation(["PHISHING"])("http://example.com/");
    const all = [...local.signals, recentDomainSignal, ...matched.signals, ...redirect.signals];
    const duplicateDomain = { ...domain(), signals: [...all, ...all] };
    const duplicateReputation = { ...matched, signals: [...all, ...all] };
    if (redirect.status !== "COMPLETED") throw new Error("Expected completed fixture");
    const duplicateRedirect = { ...redirect, signals: [...all, ...all] };
    const before = structuredClone({ duplicateDomain, duplicateReputation, duplicateRedirect });
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    const result = resultOf(await buildUrlCheckResult("http://example.com/", {
      analyzeDomain: async () => duplicateDomain, analyzeReputation: async () => duplicateReputation, analyzeRedirect: async () => duplicateRedirect,
    }));
    expect(risk).toHaveBeenCalledTimes(1);
    expect(confidence).toHaveBeenCalledTimes(1);
    expect(risk.mock.calls[0][0].map(({ code }) => code)).toEqual(["NO_HTTPS", "NEW_DOMAIN", "KNOWN_PHISHING_URL", "MULTIPLE_REDIRECTS"]);
    expect(result.signals).toHaveLength(4);
    expect(result.riskScore).toBe(95);
    expect({ duplicateDomain, duplicateReputation, duplicateRedirect }).toEqual(before);
  });

  it("uses completed redirect coverage for confidence, not a manual redirect-count rule", async () => {
    vi.mocked(reputationFeature.analyzeReputation).mockResolvedValue({ status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [], source: { code: "THREAT_REPUTATION", status: "SKIPPED" } });
    vi.mocked(domainFeature.analyzeDomain).mockResolvedValue(domain(true));
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    const result = resultOf(await analyzeUrlAction("https://paypal-security-check.xyz"));
    expect(result).toMatchObject({ riskScore: 35, confidence: "HIGH" });
    expect(confidence.mock.results[0].value).toMatchObject({ points: 4, level: "HIGH" });
    vi.mocked(redirectFeature.analyzeRedirect).mockResolvedValueOnce({ status: "UNAVAILABLE", reason: "TIMEOUT", signals: [] });
    const partial = resultOf(await analyzeUrlAction("https://paypal-security-check.xyz"));
    expect(partial).toMatchObject({ riskScore: 35, confidence: "MEDIUM" });
    expect(confidence.mock.results[1].value).toMatchObject({ points: 3, level: "MEDIUM" });
  });

  it("preserves observations as neutral technical details without final-URL signals or sensitive URLs", async () => {
    request.mockResolvedValueOnce(metadata(302, "http://8.8.8.8/PRIVATE_PATH?token=PRIVATE_QUERY#PRIVATE_FRAGMENT"));
    const response = await analyzeUrlAction("https://bit.ly/PRIVATE_INITIAL");
    const result = resultOf(response);
    expect(result).toMatchObject({ riskScore: 10, signals: [{ code: "SHORTENED_URL" }], redirectDetails: {
      hopCount: 1, crossDomain: true, protocolDowngrade: true, targetIsIp: true, shortenedLinkDestinationChange: true,
    } });
    expect(result.signals[0].description).toContain("HTTP redirect chain was checked");
    expect(result.signals[0].description).not.toContain("has not been checked");
    expect(result.analysisNote).toContain("coverage refers to the submitted URL");
    const html = renderToStaticMarkup(createElement(CheckResult, { result }));
    expect(html).toContain("Redirect destination changed to another domain.");
    expect(html).toContain("The redirect chain changed from HTTPS to HTTP.");
    expect(html).toContain("A redirect destination used a literal IP address.");
    expect(JSON.stringify(response)).not.toMatch(/PRIVATE_|8\.8\.8\.8|93\.184\.216\.34|initialUrl|finalUrl|resolvedAddress|fromHostname|toHostname/);
    expect(reputationFeature.analyzeReputation).toHaveBeenCalledExactlyOnceWith("https://bit.ly/PRIVATE_INITIAL");
    expect(domainFeature.analyzeDomain).toHaveBeenCalledExactlyOnceWith("bit.ly");
  });

  it("does not add redundant redirect recommendations for shorteners or confirmed threats", async () => {
    redirects();
    const result = resultOf(await analyzeUrlAction("https://bit.ly/a"));
    expect(result.recommendedActions.map(({ code }) => code)).toEqual(["VERIFY_SHORTENED_DESTINATION"]);
    const redirect = await redirectFeature.createRedirectAnalyzer({ request: vi.fn<ReturnType<typeof createSafeHttp>>().mockResolvedValueOnce(metadata(302, "/b")).mockResolvedValueOnce(metadata(302, "/c")).mockResolvedValue(metadata()) })("https://example.com/");
    const actions = buildUrlRecommendations([...redirect.signals, ...redirect.signals]);
    expect(actions).toHaveLength(1);
  });

  it("rechecks reputation expiration after waiting for redirects", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-10T12:00:00Z"));
    const matched = await reputation(["MALWARE"])("https://example.com/");
    if (matched.status !== "COMPLETED") throw new Error("Expected completed reputation fixture");
    vi.mocked(reputationFeature.analyzeReputation).mockResolvedValueOnce({ ...matched, expiresAt: new Date(Date.now() + 1000).toISOString() });
    let finish!: (value: redirectFeature.RedirectAnalysis) => void;
    vi.mocked(redirectFeature.analyzeRedirect).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = analyzeUrlAction("https://example.com/");
    await vi.advanceTimersByTimeAsync(1000);
    finish({ status: "COMPLETED", initialUrl: "https://example.com/", finalUrl: "https://example.com/", hops: [], signals: [] });
    const response = await pending;
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0, signals: [] } } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "FAILED" });
  });

  it("leaves TEXT independent of all Link enrichments", async () => {
    expect(await analyzeTextAction("Please send me your verification code immediately.")).toMatchObject({ ok: true, analysis: { status: "COMPLETED" } });
    expect(domainFeature.analyzeDomain).not.toHaveBeenCalled();
    expect(reputationFeature.analyzeReputation).not.toHaveBeenCalled();
    expect(redirectFeature.analyzeRedirect).not.toHaveBeenCalled();
  });
});

describe("Link pipeline through the real safe HTTP boundary", () => {
  it.each([
    ["http://169.254.169.254/latest/meta-data/", "BLOCKED_IP"],
    ["http://127.0.0.1/", "BLOCKED_IP"], ["http://localhost/", "BLOCKED_HOST"],
    ["http://[fc00::1]/", "BLOCKED_IP"], ["https://example.com:8443/", "PORT_NOT_ALLOWED"],
  ])("never requests blocked destination %s and returns a neutral PARTIAL result", async (location) => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 as const }]);
    const transports: RequestOptions[] = [];
    const transport = (options: RequestOptions, onResponse: (response: IncomingMessage) => void) => {
      transports.push(options);
      const request = Object.assign(new EventEmitter(), {
        destroy: vi.fn(), end: () => {
          onResponse(Object.assign(new EventEmitter(), { statusCode: 302, headers: { location }, destroy: vi.fn() }) as unknown as IncomingMessage);
        },
      });
      return request as unknown as ClientRequest;
    };
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    vi.mocked(redirectFeature.analyzeRedirect).mockImplementationOnce(redirectFeature.createRedirectAnalyzer({ request: createSafeHttp({ resolve: resolver, httpRequest: transport, httpsRequest: transport }) }));
    const response = await analyzeUrlAction("https://public.example/");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0, signals: [] } } });
    expect(resultOf(response).analysisNote).toContain("Redirect analysis could not safely follow one of the destinations.");
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "REDIRECT_ANALYSIS", status: "FAILED" });
    expect(transports).toHaveLength(1);
    expect(transports[0].hostname).toBe("public.example");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(response)).not.toMatch(/169\.254|127\.0|fc00|8443|93\.184|BLOCKED_|PORT_NOT_ALLOWED|latest\/meta-data/);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
});
