export type AnalysisLimitFailure =
  | { ok: false; code: "RATE_LIMITED"; error: string; retryAfterSeconds: number }
  | { ok: false; code: "TEMPORARILY_UNAVAILABLE"; error: string };
