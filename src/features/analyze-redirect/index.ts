// Server-only: delegates all outbound access to the shared Node HTTP boundary.
export { analyzeRedirect, createRedirectAnalyzer, MAX_REDIRECT_HOPS, REDIRECT_ANALYSIS_DEADLINE_MS } from "./lib/analyze-redirect";
export type { RedirectAnalysis, RedirectHop, RedirectFailureReason, RedirectStatusCode } from "./model/types";
