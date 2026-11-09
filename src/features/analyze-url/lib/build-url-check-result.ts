import { calculateConfidence, type AnalysisSource } from "../../../entities/confidence";
import type { CheckAnalysis, CheckResult, RecommendedAction } from "../../../entities/check/model/types";
import { calculateRisk, type DetectedSignal, type RiskCalculation, type RiskLevel, type SignalCode } from "../../../entities/risk";
import { analyzeDomain, type DomainAnalysis } from "../../analyze-domain";
import { inspectUrl } from "./analyze-url";

export type UrlCheckResponse =
  | { ok: false; error: string }
  | { ok: true; analysis: Exclude<CheckAnalysis, { status: "ANALYZING" }> };

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
  NEW_DOMAIN: { code: "VERIFY_RECENT_DOMAIN", title: "Verify the organization independently before trusting a recently registered domain" },
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

function domainAnalysisNote(domain: DomainAnalysis): string {
  let note: string;
  switch (domain.status) {
    case "COMPLETED":
      note = "URL structure and domain registration metadata were analyzed.";
      if (domain.domainAgeDays === null) note += " The domain's registration age is unknown.";
      break;
    case "UNAVAILABLE":
      note = "Domain registration metadata was unavailable. This assessment uses URL structure only.";
      break;
    case "NOT_APPLICABLE":
      note = "URL structure was analyzed. Domain registration metadata does not apply to this host.";
      break;
  }
  return `${note} Redirects and threat reputation were not checked.`;
}

export function mapUrlCheckResult(
  analysis: { signals: readonly DetectedSignal[]; risk: RiskCalculation },
  domain: DomainAnalysis,
): CheckResult {
  const analysisCoverage: AnalysisSource[] = [
    { code: "URL_STRUCTURE", status: "COMPLETED" },
    { code: "DOMAIN_METADATA", status: domain.status === "UNAVAILABLE" ? "FAILED" : domain.status },
    { code: "REDIRECT_ANALYSIS", status: "SKIPPED" },
    { code: "THREAT_REPUTATION", status: "SKIPPED" },
  ];
  const confidence = calculateConfidence({ sources: analysisCoverage, signals: analysis.signals });
  return {
    riskLevel: analysis.risk.level,
    riskScore: analysis.risk.score,
    confidence: confidence.level,
    summary: summaries[analysis.risk.level],
    analysisNote: domainAnalysisNote(domain),
    signals: analysis.signals.map(({ code, title, description }) => ({ code, title, description })),
    recommendedActions: buildUrlRecommendations(analysis.signals),
    analysisCoverage,
  };
}

/** Combine real evidence before scoring; return display fields only. */
export async function buildUrlCheckResult(
  value: unknown,
  { analyzeDomain: domainAnalyzer = analyzeDomain }: { analyzeDomain?: typeof analyzeDomain } = {},
): Promise<UrlCheckResponse> {
  const invalid: UrlCheckResponse = { ok: false, error: "Enter a valid HTTP or HTTPS link." };
  if (typeof value !== "string" || !value.trim()) return invalid;
  const analysis = inspectUrl(value.trim());
  if (!analysis.valid) return invalid;
  // The domain feature owns applicability and registrable-domain resolution.
  // IPs and hosts without a registrable domain return without a network lookup.
  const domain = await domainAnalyzer(analysis.hostname);
  const merged = [...analysis.signals, ...(domain.status === "COMPLETED" ? domain.signals : [])];
  const unique = new Map<SignalCode, DetectedSignal>();
  for (const signal of merged) {
    if (!unique.has(signal.code)) unique.set(signal.code, signal);
  }
  const signals = [...unique.values()];
  const risk = calculateRisk(signals);
  const result = mapUrlCheckResult({ signals, risk }, domain);
  // Intentionally unimplemented sources remain SKIPPED in coverage. Only a
  // failure of an applicable, implemented detector makes this pipeline PARTIAL.
  return { ok: true, analysis: { status: domain.status === "UNAVAILABLE" ? "PARTIAL" : "COMPLETED", result } };
}
