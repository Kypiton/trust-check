import type { RiskLevel } from "../../risk";

export type { RiskLevel } from "../../risk";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export type Signal = {
  code: string;
  title: string;
  description: string;
};

export type RecommendedAction = {
  code: string;
  title: string;
};

export type AnalysisCheck = {
  code: string;
  title: string;
  status: "COMPLETED" | "UNAVAILABLE" | "SKIPPED" | "NOT_APPLICABLE";
};

export type CheckResult = {
  riskLevel: RiskLevel;
  riskScore: number;
  confidence: Confidence;
  summary: string;
  analysisNote?: string;
  signals: Signal[];
  recommendedActions: RecommendedAction[];
  analysisCoverage: AnalysisCheck[];
};

export type AnalysisStep = {
  code: string;
  title: string;
  status: "COMPLETED" | "CURRENT" | "PENDING";
};

export type CheckAnalysis =
  | { status: "COMPLETED" | "PARTIAL"; result: CheckResult }
  | { status: "ANALYZING"; steps: AnalysisStep[] }
  | { status: "FAILED" | "INSUFFICIENT_DATA" };
