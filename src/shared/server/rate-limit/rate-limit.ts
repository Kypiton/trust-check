import "server-only";
import type { AnalysisOperation, RateLimitActor, RateLimitDecision, RateLimitStore } from "./types";

export const ANALYSIS_WINDOW_MS = 10 * 60 * 1000;
export const ANALYSIS_LIMITS = {
  anonymous: { TEXT: 10, URL: 5, SCREENSHOT: 3 },
  user: { TEXT: 30, URL: 15, SCREENSHOT: 8 },
} as const;

/** Provider-independent policy; the store must consume atomically. */
export function createAnalysisLimiter(store: RateLimitStore, clock: () => Date = () => new Date()) {
  return async (actor: RateLimitActor, operation: AnalysisOperation): Promise<RateLimitDecision> => {
    const now = clock();
    const limit = ANALYSIS_LIMITS[actor.kind][operation];
    const state = await store.consume({ key: `${actor.kind}:${actor.id}:${operation.toLowerCase()}`, limit, windowMs: ANALYSIS_WINDOW_MS, now });
    return {
      allowed: state.allowed,
      limit,
      remaining: Math.max(0, limit - state.count),
      retryAfterSeconds: state.allowed ? 0 : Math.max(1, Math.ceil((state.windowStart.getTime() + ANALYSIS_WINDOW_MS - now.getTime()) / 1000)),
    };
  };
}
