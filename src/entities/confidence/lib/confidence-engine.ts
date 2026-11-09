import type { AnalysisSourceCode, AnalysisSourceStatus, ConfidenceCalculation, ConfidenceInput } from "../model/types";

const SOURCE_POINTS = Object.freeze({
  TEXT_HEURISTICS: 1,
  URL_STRUCTURE: 1,
  DOMAIN_METADATA: 1,
  REDIRECT_ANALYSIS: 1,
  THREAT_REPUTATION: 2,
  AI_CONTEXT: 1,
  SCREENSHOT_EXTRACTION: 1,
} satisfies Record<AnalysisSourceCode, number>);

// Repeated sources never add independence. If a caller supplies conflicting
// statuses, conservatively retain the unavailable status, regardless of order.
const statusPriority: Record<AnalysisSourceStatus, number> = {
  COMPLETED: 0,
  NOT_APPLICABLE: 1,
  SKIPPED: 2,
  FAILED: 3,
};

/** Coverage and distinct evidence only: no risk score or risk weights are read. */
export function calculateConfidence({ sources, signals }: ConfidenceInput): ConfidenceCalculation {
  const coverage = new Map<AnalysisSourceCode, AnalysisSourceStatus>();
  for (const source of sources) {
    const previous = coverage.get(source.code);
    if (previous === undefined || statusPriority[source.status] > statusPriority[previous]) {
      coverage.set(source.code, source.status);
    }
  }

  const completedSources: AnalysisSourceCode[] = [];
  const unavailableSources: AnalysisSourceCode[] = [];
  let sourcePoints = 0;
  for (const [code, status] of coverage) {
    if (status === "COMPLETED") {
      completedSources.push(code);
      sourcePoints += SOURCE_POINTS[code];
    } else if (status === "FAILED" || status === "SKIPPED") {
      unavailableSources.push(code);
    }
  }

  const codes = new Set(signals.map((signal) => signal.code));
  const corroborationPoints = codes.size >= 4 ? 2 : codes.size >= 2 ? 1 : 0;
  const points = sourcePoints + corroborationPoints;
  const confirmedMalicious = coverage.get("THREAT_REPUTATION") === "COMPLETED" &&
    (codes.has("KNOWN_MALICIOUS_DOMAIN") || codes.has("KNOWN_PHISHING_DOMAIN"));
  // Reputation confirmation overrides the level only; points remain the honest
  // sum of the configured source and corroboration contributions.
  const level = confirmedMalicious || points >= 4 ? "HIGH" : points >= 2 ? "MEDIUM" : "LOW";
  return { level, points, completedSources, unavailableSources };
}
