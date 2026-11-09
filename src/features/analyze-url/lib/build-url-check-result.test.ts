import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateRisk } from "../../../entities/risk";
import { analyzeUrlAction } from "../actions/analyze-url-action";
import * as analyzer from "./analyze-url";
import { buildUrlCheckResult, buildUrlRecommendations, mapUrlCheckResult } from "./build-url-check-result";

function resultFor(input: string) {
  const response = buildUrlCheckResult(input);
  if (!response.ok || response.analysis.status !== "PARTIAL") throw new Error("Expected partial URL result");
  return response.analysis.result;
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("URL result mapping", () => {
  it("returns real 0 / LOW for an ordinary HTTPS link", () => {
    expect(resultFor("https://example.com")).toMatchObject({
      riskScore: 0, riskLevel: "LOW", confidence: "LOW", signals: [],
      summary: "No strong suspicious URL patterns were detected.",
    });
  });

  it.each([
    ["http://example.com", ["NO_HTTPS"], 10, "LOW"],
    ["http://185.23.44.11/login", ["NO_HTTPS", "IP_ADDRESS_URL"], 30, "MEDIUM"],
    ["https://paypal-security-check.xyz", ["BRAND_IMPERSONATION"], 20, "LOW"],
    ["https://paypal.com", [], 0, "LOW"],
  ] as const)("preserves the real analyzer output for %s", (input, codes, score, level) => {
    const result = resultFor(input);
    const analyzed = analyzer.analyzeUrl(input);
    if (!analyzed.valid) throw new Error("Expected valid fixture");
    expect(result.signals.map((signal) => signal.code)).toEqual(codes);
    expect(result.signals).toEqual(analyzed.signals.map(({ code, title, description }) => ({ code, title, description })));
    expect(result.riskScore).toBe(calculateRisk(analyzed.signals).score);
    expect(result).toMatchObject({ riskScore: score, riskLevel: level });
  });

  it.each([
    ["https://example.com", "LOW"],
    ["http://example.com", "MEDIUM"],
    ["http://185.23.44.11/login", "HIGH"],
  ])("uses temporary URL-local confidence for %s", (input, confidence) => {
    expect(resultFor(input).confidence).toBe(confidence);
    expect(resultFor(input).analysisNote).toContain("not to verification of the website");
  });

  it("maps a MEDIUM summary from actual evidence", () => {
    expect(resultFor("http://185.23.44.11/login").summary).toBe("Some suspicious characteristics were detected in this link.");
  });

  it("passes through upstream scores and supports HIGH without duplicating scoring", () => {
    const analysis = analyzer.analyzeUrl("http://example.com");
    if (!analysis.valid) throw new Error("Expected valid fixture");
    // HIGH is not currently reachable with only the local URL signals; exercise
    // the mapping contract with a future upstream score, not invented weighting.
    analysis.risk = { ...analysis.risk, score: 77, level: "HIGH" };
    expect(mapUrlCheckResult(analysis)).toMatchObject({
      riskScore: 77, riskLevel: "HIGH",
      summary: "This link contains several characteristics commonly associated with suspicious or deceptive URLs.",
    });
  });

  it.each([
    ["http://example.com", "Avoid entering passwords, payment details, or other sensitive information on this page"],
    ["https://185.23.44.11/login", "Verify the destination independently before opening the link"],
    ["https://bit.ly/example", "Verify the final destination before trusting a shortened link"],
    ["https://paypal-security-check.xyz", "Open the organization's official website manually instead of using this link"],
    [`https://example.com/${"a".repeat(200)}`, "Check the actual domain carefully before continuing"],
  ])("derives recommendations from %s", (input, title) => {
    expect(resultFor(input).recommendedActions.map((action) => action.title)).toEqual([title]);
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

  it("provides general guidance when no signal exists without inventing evidence", () => {
    const result = resultFor("https://example.com");
    expect(result.signals).toEqual([]);
    expect(result.recommendedActions.map((action) => action.code)).toEqual(["VERIFY_DESTINATION"]);
  });

  it("reports exactly one completed family and explicitly skips network checks", () => {
    expect(resultFor("https://example.com").analysisCoverage).toEqual([
      { code: "URL", title: "URL structure analysis", status: "COMPLETED" },
      { code: "DOMAIN_AGE", title: "Domain age", status: "SKIPPED" },
      { code: "REDIRECT", title: "Redirect analysis", status: "SKIPPED" },
      { code: "REPUTATION", title: "Threat reputation", status: "SKIPPED" },
    ]);
  });
});

describe("URL Server Action validation and privacy", () => {
  it.each([undefined, null, 7, {}, [], "", " \t\n "])("rejects empty/non-string input before invoking the analyzer (case %#)", async (input) => {
    const analyze = vi.spyOn(analyzer, "analyzeUrl");
    expect(await analyzeUrlAction(input)).toEqual({ ok: false, error: "Enter a valid HTTP or HTTPS link." });
    expect(analyze).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "data:text/html,test", "random invalid content", "https://"])("returns inline validation rather than FAILED for %s", async (input) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeUrlAction(input);
    expect(response).toEqual({ ok: false, error: "Enter a valid HTTP or HTTPS link." });
    expect(response).not.toHaveProperty("analysis");
    expect(error).not.toHaveBeenCalled();
  });

  it("trims raw input and lets the existing parser accept bare domains", async () => {
    const analyze = vi.spyOn(analyzer, "analyzeUrl");
    const response = await analyzeUrlAction(" \n example.com \t ");
    expect(analyze).toHaveBeenCalledExactlyOnceWith("example.com");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 0 } } });
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
    vi.spyOn(analyzer, "analyzeUrl").mockImplementation(() => { throw new Error(secret); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await analyzeUrlAction(secret)).toEqual({ ok: true, analysis: { status: "FAILED" } });
    expect(error).toHaveBeenCalledExactlyOnceWith("[TrustCheck] URL_ANALYSIS_FAILED");
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
  });

  it("does not fetch the submitted URL during orchestration", async () => {
    const fetch = vi.fn(() => { throw new Error("Forbidden network call"); });
    vi.stubGlobal("fetch", fetch);
    const response = await analyzeUrlAction("http://185.23.44.11/login");
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL", result: { riskScore: 30 } } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
