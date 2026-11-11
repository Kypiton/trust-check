import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as riskEngine from "../../../entities/risk";
import * as confidenceEngine from "../../../entities/confidence";
import type { AnalysisSourceStatus } from "../../../entities/confidence";
import { createReputationAnalyzer, type ReputationAnalysis } from "../../analyze-reputation";
import { collectUrlEvidence, type UrlEvidenceDependencies } from "../../analyze-url/lib/collect-url-evidence";
import { buildScreenshotCheckResult, type ScreenshotCheckResponse } from "./build-screenshot-check-result";
import { prepareScreenshot, MAX_SCREENSHOT_BYTES } from "./prepare-screenshot";
import { createScreenshotTextExtractor } from "./extract-screenshot-text";
import * as extraction from "./extract-screenshot-text";
import { analyzeScreenshotAction } from "../actions/analyze-screenshot-action";
import { aggregateCoverage } from "./aggregate-coverage";
import type { ScreenshotInput, ScreenshotFailureReason, ScreenshotTextExtraction } from "../model/types";

let input: ScreenshotInput;
beforeAll(async () => {
  input = { bytes: await sharp({ create: { width: 20, height: 10, channels: 3, background: "white" } }).png().toBuffer(), declaredMimeType: "image/png" };
});
afterEach(() => { vi.restoreAllMocks(); });
const skipped: ReputationAnalysis = { status: "SKIPPED", reason: "MISSING_CONFIGURATION", signals: [], source: { code: "THREAT_REPUTATION", status: "SKIPPED" } };

function setup(text = "The community library opens every weekday morning.", enrichments: UrlEvidenceDependencies = {}) {
  const prepare = vi.fn(prepareScreenshot);
  const extractText = vi.fn(async (): Promise<ScreenshotTextExtraction> => ({ status: "COMPLETED", text, ocrConfidence: 92, truncated: false }));
  const collectEvidence = vi.fn<typeof collectUrlEvidence>((inspection) => collectUrlEvidence(inspection, {
    analyzeDomain: async () => ({ status: "COMPLETED", registrableDomain: "example.com", registrationDate: null, domainAgeDays: null, signals: [] }),
    analyzeReputation: async () => skipped,
    analyzeRedirect: async (url) => ({ status: "COMPLETED", initialUrl: url, finalUrl: url, signals: [], hops: [] }),
    ...enrichments,
  }));
  return { prepare, extractText, collectEvidence };
}
function resultOf(response: ScreenshotCheckResponse) {
  if (!response.ok || !("result" in response.analysis)) throw new Error("Expected scored result");
  return response.analysis.result;
}

describe("Screenshot evidence orchestration", () => {
  it("returns LOW for useful harmless English text without launching URL work", async () => {
    const deps = setup();
    const result = resultOf(await buildScreenshotCheckResult(input, deps));
    expect(result).toMatchObject({ riskScore: 0, riskLevel: "LOW", confidence: "MEDIUM", signals: [], summary: "No strong signs of fraud were detected in the readable screenshot content." });
    expect(result.analysisCoverage).toEqual([{ code: "SCREENSHOT_EXTRACTION", status: "COMPLETED" }, { code: "TEXT_HEURISTICS", status: "COMPLETED" }]);
    expect(deps.collectEvidence).not.toHaveBeenCalled();
  });

  it("uses real Text signals and one final Risk/Confidence calculation", async () => {
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const confidence = vi.spyOn(confidenceEngine, "calculateConfidence");
    const result = resultOf(await buildScreenshotCheckResult(input, setup("URGENT! Please send your verification code immediately. http://example.com")));
    expect(result.signals.map(({ code }) => code)).toEqual(expect.arrayContaining(["ARTIFICIAL_URGENCY", "OTP_REQUEST", "NO_HTTPS"]));
    expect(result.riskScore).toBe(55);
    expect(risk).toHaveBeenCalledOnce();
    expect(confidence).toHaveBeenCalledExactlyOnceWith({ sources: result.analysisCoverage, signals: risk.mock.calls[0][0] });
    expect(result.recommendedActions).toContainEqual({ code: "PROTECT_CODES", title: "Do not share verification codes" });
  });

  it("deduplicates signals and recommendations across text and several links", async () => {
    const result = resultOf(await buildScreenshotCheckResult(input, setup("Please send your verification code. https://paypal-security-check.xyz https://paypal-login-alert.xyz")));
    expect(result.signals.map(({ code }) => code)).toEqual(["OTP_REQUEST", "BRAND_IMPERSONATION"]);
    expect(result.riskScore).toBe(55);
    expect(new Set(result.recommendedActions.map(({ code }) => code)).size).toBe(result.recommendedActions.length);
    expect(result.recommendedActions.filter(({ code }) => code === "USE_OFFICIAL_WEBSITE")).toHaveLength(1);
  });

  it("honors confirmed phishing evidence and the canonical 95-point floor", async () => {
    const result = resultOf(await buildScreenshotCheckResult(input, setup("Please review https://example.com", {
      analyzeReputation: createReputationAnalyzer({ provider: async () => ({ status: "COMPLETED", verdicts: ["PHISHING"] }) }),
    })));
    expect(result).toMatchObject({ riskScore: 95, riskLevel: "HIGH", confidence: "HIGH", summary: "This screenshot contains several signs commonly associated with scams or phishing." });
    expect(result.recommendedActions.some(({ code }) => code === "DO_NOT_OPEN_LINK")).toBe(true);
  });

  it.each([1, 3, 4, 8])("analyzes only the first three unique links among %s candidates", async (count) => {
    const urls = Array.from({ length: count }, (_, i) => `https://example${i}.com/`);
    const deps = setup([urls[0], ...urls].join(" "));
    const result = resultOf(await buildScreenshotCheckResult(input, deps));
    expect(deps.collectEvidence.mock.calls.map(([url]) => url.normalizedUrl)).toEqual(urls.slice(0, 3));
    if (count > 3) expect(result.analysisNote).toContain(`${count} links were detected; the first 3 were analyzed. Additional links were not checked.`);
    else expect(result.analysisNote).toContain(`${count} ${count === 1 ? "link was" : "links were"} detected and analyzed.`);
  });

  it("runs selected URL pipelines concurrently with a maximum fan-out of three", async () => {
    const deps = setup("https://one.example https://two.example https://three.example https://four.example");
    const real = deps.collectEvidence.getMockImplementation()!;
    const releases: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    deps.collectEvidence.mockImplementation(async (inspection) => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      const result = await real(inspection);
      active--;
      return result;
    });
    const pending = buildScreenshotCheckResult(input, deps);
    await vi.waitFor(() => expect(releases).toHaveLength(3));
    releases.forEach((release) => release());
    expect((await pending).ok).toBe(true);
    expect(peak).toBe(3);
    expect(deps.collectEvidence).toHaveBeenCalledTimes(3);
  });

  it("keeps useful evidence and conservatively aggregates failed domain coverage", async () => {
    const response = await buildScreenshotCheckResult(input, setup("Please send your verification code. https://one.example https://two.example", {
      analyzeDomain: async (host) => host === "one.example" ? { status: "UNAVAILABLE", reason: "TIMEOUT" } : { status: "COMPLETED", registrableDomain: host, registrationDate: null, domainAgeDays: null, signals: [] },
    }));
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "DOMAIN_METADATA", status: "FAILED" });
    expect(resultOf(response).riskScore).toBe(35);
  });

  it("keeps local URL evidence when an enrichment unexpectedly rejects", async () => {
    const deps = setup("See http://example.com for information.");
    deps.collectEvidence.mockRejectedValue(new Error("Private provider error"));
    const response = await buildScreenshotCheckResult(input, deps);
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    expect(resultOf(response).signals.map(({ code }) => code)).toEqual(["NO_HTTPS"]);
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "URL_STRUCTURE", status: "COMPLETED" });
  });
  it("retains confirmed phishing evidence even when another provider throws", async () => {
    const response = await buildScreenshotCheckResult(input, setup("Please review https://example.com", {
      analyzeDomain: async () => { throw new Error("Private provider failure"); },
      analyzeReputation: createReputationAnalyzer({ provider: async () => ({ status: "COMPLETED", verdicts: ["PHISHING"] }) }),
    }));
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    expect(resultOf(response)).toMatchObject({ riskScore: 95, riskLevel: "HIGH" });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "DOMAIN_METADATA", status: "FAILED" });
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "COMPLETED" });
  });

  it("refreshes reputation after all selected pipelines finish", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const deps = setup("https://one.example https://two.example", {
      analyzeReputation: createReputationAnalyzer({ provider: async () => ({ status: "COMPLETED", verdicts: ["PHISHING"], expiresAt: new Date(2_000).toISOString() }), now: () => now }),
    });
    const collect = deps.collectEvidence.getMockImplementation()!;
    let firstDone!: () => void;
    const first = new Promise<void>((resolve) => { firstDone = resolve; });
    deps.collectEvidence.mockImplementation(async (inspection) => {
      if (inspection.hostname === "two.example") await first;
      const result = await collect(inspection);
      if (inspection.hostname === "one.example") firstDone();
      else now = 3_000;
      return result;
    });
    const response = await buildScreenshotCheckResult(input, deps);
    expect(response).toMatchObject({ ok: true, analysis: { status: "PARTIAL" } });
    expect(resultOf(response).riskScore).toBe(0);
    expect(resultOf(response).analysisCoverage).toContainEqual({ code: "THREAT_REPUTATION", status: "FAILED" });
  });

  it.each(["NO_TEXT", "EMPTY", "UNSUPPORTED", "TINY"])("does not fabricate LOW risk for %s", async (kind) => {
    const deps = setup(kind === "UNSUPPORTED" ? "Ваш обліковий запис заблоковано" : kind === "TINY" ? "Hi" : " ");
    if (kind === "NO_TEXT") deps.extractText.mockResolvedValue({ status: "NO_TEXT" });
    const risk = vi.spyOn(riskEngine, "calculateRisk");
    const response = await buildScreenshotCheckResult(input, deps);
    expect(response).toMatchObject({ ok: true, analysis: { status: "INSUFFICIENT_DATA" } });
    if (kind === "UNSUPPORTED") expect(response).toMatchObject({ analysis: { reason: "UNSUPPORTED_LANGUAGE" } });
    if (kind === "NO_TEXT") expect(response).toMatchObject({ analysis: { reason: "NO_READABLE_TEXT" } });
    expect(risk).not.toHaveBeenCalled();
    expect(deps.collectEvidence).not.toHaveBeenCalled();
  });

  it("maps failed OCR to FAILED extraction without scoring", async () => {
    const deps = setup();
    deps.extractText.mockResolvedValue({ status: "FAILED", reason: "OCR_FAILED" });
    expect(await buildScreenshotCheckResult(input, deps)).toEqual({ ok: true, analysis: { status: "FAILED", analysisCoverage: [{ code: "SCREENSHOT_EXTRACTION", status: "FAILED" }] } });
  });
  it.each(["prepare", "extractText"] as const)("sanitizes unexpected %s failures and records failed extraction", async (operation) => {
    const deps = setup();
    deps[operation].mockRejectedValue(new Error("Private image details"));
    expect(await buildScreenshotCheckResult(input, deps)).toEqual({ ok: true, analysis: { status: "FAILED", analysisCoverage: [{ code: "SCREENSHOT_EXTRACTION", status: "FAILED" }] } });
  });
  it.each(["BUSY", "CLOSED"] as const)("returns a temporary error for OCR %s", async (reason) => {
    const deps = setup();
    deps.extractText.mockResolvedValue({ status: "FAILED", reason });
    expect(await buildScreenshotCheckResult(input, deps)).toMatchObject({ ok: false, error: expect.stringContaining("try again") });
  });
  it.each(["EMPTY_FILE", "FILE_TOO_LARGE", "UNSUPPORTED_MIME_TYPE", "INVALID_IMAGE", "ANIMATED_IMAGE", "PIXEL_LIMIT_EXCEEDED", "MIME_TYPE_MISMATCH", "NORMALIZED_IMAGE_TOO_LARGE", "BUSY"] as ScreenshotFailureReason[])("maps preparation %s to user validation", async (reason) => {
    const deps = setup();
    deps.prepare.mockResolvedValue({ ok: false, reason });
    expect(await buildScreenshotCheckResult(input, deps)).toMatchObject({ ok: false, error: expect.any(String) });
    expect(deps.extractText).not.toHaveBeenCalled();
  });
  it("rejects truly malformed/oversized image data with the real preparation layer", async () => {
    for (const bytes of [Buffer.from("not an image"), Buffer.alloc(MAX_SCREENSHOT_BYTES + 1)]) {
      const deps = setup();
      expect(await buildScreenshotCheckResult({ bytes, declaredMimeType: "image/png" }, deps)).toMatchObject({ ok: false });
      expect(deps.extractText).not.toHaveBeenCalled();
    }
  });
  it("omits pixels, raw text, URLs, names, OCR confidence and provider metadata from the public result", async () => {
    const privateText = "Private account number 123456789. Read https://example.com/private-secret?token=abc";
    const deps = setup(privateText);
    deps.extractText.mockResolvedValue({ status: "COMPLETED", text: privateText, ocrConfidence: 17, truncated: true });
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn")];
    const result = resultOf(await buildScreenshotCheckResult({ ...input, filename: "private-name.png" }, deps));
    expect(JSON.stringify(result)).not.toMatch(/123456789|private-secret|token=abc|private-name|ocrConfidence|registrableDomain|bytes/);
    expect(result.analysisNote).toContain("first 20,000 characters");
    logs.forEach((log) => expect(log).not.toHaveBeenCalled());
  });
});

describe("source-family aggregation", () => {
  it.each([
    [["COMPLETED", "COMPLETED"], "COMPLETED"],
    [["NOT_APPLICABLE", "COMPLETED"], "COMPLETED"],
    [["NOT_APPLICABLE", "NOT_APPLICABLE"], "NOT_APPLICABLE"],
    [["FAILED", "COMPLETED"], "FAILED"],
    [["COMPLETED", "FAILED"], "FAILED"],
    [["SKIPPED", "COMPLETED"], "SKIPPED"],
    [["SKIPPED", "NOT_APPLICABLE"], "SKIPPED"],
    [["SKIPPED", "FAILED"], "FAILED"],
  ] as [AnalysisSourceStatus[], AnalysisSourceStatus][])("aggregates %j as %s", (statuses, expected) => {
    expect(aggregateCoverage(statuses.map((status) => ({ code: "DOMAIN_METADATA", status })))).toEqual([{ code: "DOMAIN_METADATA", status: expected }]);
  });
});

it("runs real FormData action → preparation → local OCR → Text evidence → result without external requests", async () => {
  const bytes = await sharp({ text: { text: "URGENT! Send your verification code immediately.", font: "sans 36", rgba: true } })
    .flatten({ background: "white" }).extend({ top: 20, bottom: 20, left: 20, right: 20, background: "white" }).png().toBuffer();
  const extractor = createScreenshotTextExtractor();
  vi.spyOn(extraction, "extractScreenshotText").mockImplementation(extractor.extract);
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No external requests permitted"));
  try {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "screenshot.png", { type: "image/png" }));
    const result = resultOf(await analyzeScreenshotAction(form));
    expect(result.signals.map(({ code }) => code)).toContain("OTP_REQUEST");
    expect(result.riskScore).toBeGreaterThanOrEqual(35);
    expect(fetch).not.toHaveBeenCalled();
  } finally { await extractor.close(); }
}, 30_000);

// Keep existing engine/orchestration tests independent of session/database state.
vi.mock("@/entities/check/server", () => ({
  persistAnalysisResponse: vi.fn(async (_inputType: string, response: unknown) => response),
}));
