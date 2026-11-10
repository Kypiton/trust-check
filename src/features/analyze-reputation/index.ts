// Server entry point. UI should consume result types, never invoke the provider.
export { analyzeReputation, createReputationAnalyzer, currentReputationAnalysis } from "./lib/analyze-reputation";
export type { ReputationAnalysis, ReputationFailureReason, ReputationLookup, ReputationProvider, ReputationVerdict } from "./model/types";
