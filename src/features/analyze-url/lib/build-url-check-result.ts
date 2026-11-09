import { calculateConfidence, type AnalysisSource } from "../../../entities/confidence";
import type { CheckAnalysis, CheckResult, RecommendedAction } from "../../../entities/check/model/types";
import type { DetectedSignal, RiskLevel, SignalCode } from "../../../entities/risk";
import { analyzeUrl, type UrlAnalysis } from "./analyze-url";

export type UrlCheckResponse =
  | { ok: false; error: string }
  | { ok: true; analysis: Exclude<CheckAnalysis, { status: "ANALYZING" }> };

type ValidUrlAnalysis = Extract<UrlAnalysis, { valid: true }>;

const summaries: Record<RiskLevel, string> = {
  LOW: "No strong suspicious URL patterns were detected.",
  MEDIUM: "Some suspicious characteristics were detected in this link.",
  HIGH: "This link contains several characteristics commonly associated with suspicious or deceptive URLs.",
};

const actionsBySignal: Partial<Record<SignalCode, RecommendedAction>> = {
  NO_HTTPS: { code: "AVOID_SENSITIVE_INFORMATION", title: "Avoid entering passwords, payment details, or other sensitive information on this page" },
  IP_ADDRESS_URL: { code: "VERIFY_DESTINATION", title: "Verify the destination independently before opening the link" },
  SHORTENED_URL: { code: "VERIFY_SHORTENED_DESTINATION", title: "Verify the final destination before trusting a shortened link" },
  BRAND_IMPERSONATION: { code: "USE_OFFICIAL_WEBSITE", title: "Open the organization's official website manually instead of using this link" },
  LONG_URL: { code: "CHECK_DOMAIN", title: "Check the actual domain carefully before continuing" },
};

export function buildUrlRecommendations(signals: readonly DetectedSignal[]): RecommendedAction[] {
  const actions = new Map<string, RecommendedAction>();
  for (const signal of signals) {
    const action = actionsBySignal[signal.code];
    if (action) actions.set(action.code, { ...action });
  }
  if (!actions.size) {
    actions.set("VERIFY_DESTINATION", {
      code: "VERIFY_DESTINATION",
      title: "Verify the destination independently before opening the link",
    });
  }
  return [...actions.values()];
}

export function mapUrlCheckResult(analysis: ValidUrlAnalysis): CheckResult {
  const analysisCoverage: AnalysisSource[] = [
    { code: "URL_STRUCTURE", status: "COMPLETED" },
    { code: "DOMAIN_METADATA", status: "SKIPPED" },
    { code: "REDIRECT_ANALYSIS", status: "SKIPPED" },
    { code: "THREAT_REPUTATION", status: "SKIPPED" },
  ];
  const confidence = calculateConfidence({ sources: analysisCoverage, signals: analysis.signals });
  return {
    riskLevel: analysis.risk.level,
    riskScore: analysis.risk.score,
    confidence: confidence.level,
    summary: summaries[analysis.risk.level],
    analysisNote: "Only the URL's structure was analyzed. Confidence applies to these patterns, not to verification of the website. Domain age, redirects and threat reputation were not checked.",
    signals: analysis.signals.map(({ code, title, description }) => ({ code, title, description })),
    recommendedActions: buildUrlRecommendations(analysis.signals),
    analysisCoverage,
  };
}

/** Validate locally and return display fields only, never the submitted URL. */
export function buildUrlCheckResult(value: unknown): UrlCheckResponse {
  const invalid: UrlCheckResponse = { ok: false, error: "Enter a valid HTTP or HTTPS link." };
  if (typeof value !== "string" || !value.trim()) return invalid;
  const analysis = analyzeUrl(value.trim());
  if (!analysis.valid) return invalid;
  // Local evidence is usable, but external verification is deliberately absent.
  return { ok: true, analysis: { status: "PARTIAL", result: mapUrlCheckResult(analysis) } };
}
