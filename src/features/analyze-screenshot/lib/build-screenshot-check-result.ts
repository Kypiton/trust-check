import type { AnalysisLimitFailure } from "@/shared/model/analysis-limit";
import { calculateConfidence, type AnalysisSource } from "../../../entities/confidence";
import { calculateRisk, type DetectedSignal, type RiskLevel, type SignalCode } from "../../../entities/risk";
import type { CheckAnalysis, RecommendedAction } from "../../../entities/check/model/types";
import { inspectText, supportsTextScript, hasUsefulText } from "../../analyze-text";
import { buildTextRecommendations } from "../../analyze-text/lib/build-text-check-result";
import { inspectUrl } from "../../analyze-url/lib/analyze-url";
import { buildUrlRecommendations } from "../../analyze-url/lib/build-url-check-result";
import { collectUrlEvidence, refreshUrlEvidence, type UrlEvidence, type ValidUrlInspection } from "../../analyze-url/lib/collect-url-evidence";
import { prepareScreenshot } from "./prepare-screenshot";
import { extractScreenshotText } from "./extract-screenshot-text";
import { extractUrlsFromText } from "./extract-urls-from-text";
import { aggregateCoverage } from "./aggregate-coverage";
import type { ScreenshotFailureReason, ScreenshotInput, ScreenshotPreparation, ScreenshotTextExtraction } from "../model/types";

export const MAX_SCREENSHOT_ANALYZED_URLS = 3;
export type ScreenshotCheckResponse =
  | AnalysisLimitFailure
  | { ok: false; error: string; code?: undefined }
  | { ok: true; analysis: Exclude<CheckAnalysis, { status: "ANALYZING" }>; persistedCheckId?: string };

const summaries: Record<RiskLevel, string> = {
  LOW: "No strong signs of fraud were detected in the readable screenshot content.",
  MEDIUM: "Some suspicious signs were detected in this screenshot.",
  HIGH: "This screenshot contains several signs commonly associated with scams or phishing.",
};
const busyMessage = "Screenshot analysis is busy. Please try again shortly.";
const extractionCoverage = (status: "COMPLETED" | "FAILED"): AnalysisSource[] => [{ code: "SCREENSHOT_EXTRACTION", status }];

function preparationFailure(reason: ScreenshotFailureReason): ScreenshotCheckResponse {
  const errors: Partial<Record<ScreenshotFailureReason, string>> = {
    INVALID_INPUT: "Choose a screenshot to check.",
    EMPTY_FILE: "Choose a screenshot that isn't empty.",
    FILE_TOO_LARGE: "Choose an image no larger than 10 MiB.",
    UNSUPPORTED_MIME_TYPE: "Choose a PNG, JPG or WebP image.",
    UNSUPPORTED_IMAGE_FORMAT: "Choose a PNG, JPG or WebP image.",
    MIME_TYPE_MISMATCH: "The file contents don't match its image type. Export a new PNG, JPG or WebP screenshot.",
    INVALID_IMAGE: "We couldn't read this image. Try exporting the screenshot again.",
    ANIMATED_IMAGE: "Choose a single still image. Animated screenshots aren't supported.",
    PIXEL_LIMIT_EXCEEDED: "Choose an image with no more than 25 megapixels.",
    NORMALIZED_IMAGE_TOO_LARGE: "This image is too large to process. Try a smaller screenshot.",
    BUSY: busyMessage,
    TIMEOUT: "This image took too long to prepare. Try a smaller screenshot.",
  };
  const error = errors[reason];
  return error ? { ok: false, error } : { ok: true, analysis: { status: "FAILED", analysisCoverage: extractionCoverage("FAILED") } };
}

function failedUrlEvidence(inspection: ValidUrlInspection): UrlEvidence {
  // An unexpected enrichment failure does not erase the known local structure.
  return refreshUrlEvidence({
    inspection,
    domain: { status: "UNAVAILABLE", reason: "NETWORK_ERROR" },
    reputation: { status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [], source: { code: "THREAT_REPUTATION", status: "FAILED" } },
    redirect: { status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [] },
  });
}

/** Application orchestration only. All image decoding, detectors and scoring remain owned by their domains. */
export async function buildScreenshotCheckResult(input: ScreenshotInput, {
  prepare = prepareScreenshot,
  extractText = extractScreenshotText,
  collectEvidence = collectUrlEvidence,
}: {
  prepare?: typeof prepareScreenshot;
  extractText?: typeof extractScreenshotText;
  collectEvidence?: typeof collectUrlEvidence;
} = {}): Promise<ScreenshotCheckResponse> {
  let prepared: ScreenshotPreparation;
  try { prepared = await prepare(input); } catch {
    return { ok: true, analysis: { status: "FAILED", analysisCoverage: extractionCoverage("FAILED") } };
  }
  if (!prepared.ok) return preparationFailure(prepared.reason);
  let ocr: ScreenshotTextExtraction;
  try { ocr = await extractText(prepared.image); } catch {
    return { ok: true, analysis: { status: "FAILED", analysisCoverage: extractionCoverage("FAILED") } };
  }
  if (ocr.status === "FAILED") {
    if (ocr.reason === "BUSY" || ocr.reason === "CLOSED") return { ok: false, error: busyMessage };
    return { ok: true, analysis: { status: "FAILED", analysisCoverage: extractionCoverage("FAILED") } };
  }
  const extraction = extractionCoverage("COMPLETED");
  if (ocr.status === "NO_TEXT" || !ocr.text.trim()) {
    return { ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "NO_READABLE_TEXT", analysisCoverage: extraction } };
  }
  if (!supportsTextScript(ocr.text)) {
    return { ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE", analysisCoverage: extraction } };
  }
  const text = inspectText(ocr.text);
  const candidates = new Map<string, ValidUrlInspection>();
  for (const candidate of extractUrlsFromText(ocr.text)) {
    const inspection = inspectUrl(candidate);
    if (inspection.valid) candidates.set(inspection.normalizedUrl, inspection);
  }
  if (!hasUsefulText(ocr.text, text.signals.length) && candidates.size === 0) {
    return { ok: true, analysis: { status: "INSUFFICIENT_DATA", analysisCoverage: extraction } };
  }
  const selected = [...candidates.values()].slice(0, MAX_SCREENSHOT_ANALYZED_URLS);
  const settled = await Promise.allSettled(selected.map((url) => collectEvidence(url)));
  const evidence = settled.map((outcome, index) => outcome.status === "fulfilled"
    ? refreshUrlEvidence(outcome.value) : failedUrlEvidence(selected[index]));
  const unique = new Map<SignalCode, DetectedSignal>();
  for (const signal of [...text.signals, ...evidence.flatMap((url) => url.signals)]) {
    if (!unique.has(signal.code)) unique.set(signal.code, signal);
  }
  const signals = [...unique.values()];
  const coverage = aggregateCoverage([
    ...extraction, { code: "TEXT_HEURISTICS", status: "COMPLETED" },
    ...evidence.flatMap((url) => url.coverage),
  ]);
  const risk = calculateRisk(signals);
  const confidence = calculateConfidence({ sources: coverage, signals });
  const actions = new Map<string, RecommendedAction>();
  for (const action of [
    ...buildTextRecommendations(signals),
    ...(selected.length ? buildUrlRecommendations(signals) : []),
  ]) actions.set(action.code, action);

  let note = "Text was extracted from the screenshot. Text analysis currently supports English only.";
  if (candidates.size > selected.length) note += ` ${candidates.size} links were detected; the first ${selected.length} were analyzed. Additional links were not checked.`;
  else if (selected.length) note += ` ${selected.length} ${selected.length === 1 ? "link was" : "links were"} detected and analyzed.`;
  if (ocr.truncated) note += " Only the first 20,000 characters of extracted text were considered.";
  if (selected.length) note += " Domain and threat reputation checks refer to the detected links, not their redirect destinations.";
  if (coverage.some(({ code, status }) => code === "THREAT_REPUTATION" && status === "SKIPPED")) note += " Threat reputation was not checked for every detected link.";

  return { ok: true, analysis: {
    status: coverage.some(({ status }) => status === "FAILED") ? "PARTIAL" : "COMPLETED",
    result: {
      riskLevel: risk.level, riskScore: risk.score, confidence: confidence.level,
      summary: summaries[risk.level], analysisNote: note,
      signals: signals.map(({ code, title, description }) => ({ code, title, description: code === "SHORTENED_URL"
        ? "A detected link uses a configured URL shortening service. Review its destination before continuing." : description })),
      recommendedActions: [...actions.values()], analysisCoverage: coverage,
    },
  } };
}
