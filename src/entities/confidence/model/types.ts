import type { DetectedSignal } from "../../risk";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type AnalysisSourceCode =
  | "TEXT_HEURISTICS"
  | "URL_STRUCTURE"
  | "DOMAIN_METADATA"
  | "REDIRECT_ANALYSIS"
  | "THREAT_REPUTATION"
  | "AI_CONTEXT"
  | "SCREENSHOT_EXTRACTION";

export type AnalysisSourceStatus = "COMPLETED" | "FAILED" | "SKIPPED" | "NOT_APPLICABLE";

export type AnalysisSource = {
  readonly code: AnalysisSourceCode;
  readonly status: AnalysisSourceStatus;
};

export type ConfidenceInput = {
  readonly sources: readonly AnalysisSource[];
  readonly signals: readonly Pick<DetectedSignal, "code">[];
};

export type ConfidenceCalculation = {
  level: Confidence;
  points: number;
  completedSources: AnalysisSourceCode[];
  unavailableSources: AnalysisSourceCode[];
};

export const ANALYSIS_SOURCE_LABELS: Readonly<Record<AnalysisSourceCode, string>> = Object.freeze({
  TEXT_HEURISTICS: "Text analysis",
  URL_STRUCTURE: "URL structure",
  DOMAIN_METADATA: "Domain analysis",
  REDIRECT_ANALYSIS: "Redirect analysis",
  THREAT_REPUTATION: "Threat reputation",
  AI_CONTEXT: "Context analysis",
  SCREENSHOT_EXTRACTION: "Screenshot extraction",
});
