export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
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
  status: "COMPLETED" | "UNAVAILABLE";
};

export type CheckResult = {
  riskLevel: RiskLevel;
  riskScore: number;
  confidence: Confidence;
  summary: string;
  signals: Signal[];
  recommendedActions: RecommendedAction[];
  analysisCoverage: AnalysisCheck[];
};
