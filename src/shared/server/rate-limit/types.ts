export type AnalysisOperation = "TEXT" | "URL" | "SCREENSHOT";
export type RateLimitActor = { kind: "user" | "anonymous"; id: string };
export type RateLimitDecision = { allowed: boolean; limit: number; remaining: number; retryAfterSeconds: number };
export type ConsumeInput = { key: string; limit: number; windowMs: number; now: Date };
export interface RateLimitStore {
  consume(input: ConsumeInput): Promise<{ allowed: boolean; count: number; windowStart: Date }>;
}
