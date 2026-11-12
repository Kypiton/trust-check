import { beforeEach, expect, it, vi } from "vitest";
import { ANALYSIS_LIMITS, ANALYSIS_WINDOW_MS, createAnalysisLimiter } from "./rate-limit";
import type { RateLimitActor, RateLimitStore } from "./types";
vi.mock("server-only", () => ({}));
let now: number;
let rows: Map<string, { count: number; windowStart: Date }>;
let consume: ReturnType<typeof createAnalysisLimiter>;
const anonymous: RateLimitActor = { kind: "anonymous", id: "private-hmac" };
beforeEach(() => {
  now = Date.UTC(2026, 10, 12); rows = new Map();
  // Deterministic atomic store contract. Real PostgreSQL races are smoke-tested.
  const store: RateLimitStore = { async consume({ key, limit, windowMs, now }) {
    let row = rows.get(key);
    if (!row || now.getTime() - row.windowStart.getTime() >= windowMs) { row = { count: 0, windowStart: now }; rows.set(key, row); }
    const allowed = row.count < limit;
    if (allowed) row.count++;
    return { allowed, ...row };
  } };
  consume = createAnalysisLimiter(store, () => new Date(now));
});
it("allows the first request and increments remaining quota", async () => {
  expect(await consume(anonymous, "TEXT")).toEqual({ allowed: true, limit: 10, remaining: 9, retryAfterSeconds: 0 });
  expect((await consume(anonymous, "TEXT")).remaining).toBe(8);
});
it("allows the exact limit and blocks the next request without growing the count", async () => {
  for (let i = 0; i < 10; i++) expect((await consume(anonymous, "TEXT")).allowed).toBe(true);
  expect(await consume(anonymous, "TEXT")).toEqual({ allowed: false, limit: 10, remaining: 0, retryAfterSeconds: 600 });
  expect([...rows.values()][0].count).toBe(10);
});
it("reports rounded retry time and resets exactly at the window boundary", async () => {
  for (let i = 0; i < 3; i++) await consume(anonymous, "SCREENSHOT");
  now += 1001; expect((await consume(anonymous, "SCREENSHOT")).retryAfterSeconds).toBe(599);
  now += ANALYSIS_WINDOW_MS - 1001; expect(await consume(anonymous, "SCREENSHOT")).toEqual({ allowed: true, limit: 3, remaining: 2, retryAfterSeconds: 0 });
});
it("keeps operation buckets independent", async () => {
  for (let i = 0; i < 10; i++) await consume(anonymous, "TEXT");
  expect((await consume(anonymous, "URL")).remaining).toBe(4);
  expect((await consume(anonymous, "SCREENSHOT")).remaining).toBe(2);
  expect(rows.size).toBe(3);
});
it("keeps user and anonymous actors independent", async () => {
  for (const actor of [{ kind: "user", id: "a" }, { kind: "user", id: "b" }, { kind: "anonymous", id: "hash-a" }, { kind: "anonymous", id: "hash-b" }] as const) {
    expect((await consume(actor, "URL")).remaining).toBe(actor.kind === "user" ? 14 : 4);
  }
  expect(rows.size).toBe(4);
});
it.each(["TEXT", "URL", "SCREENSHOT"] as const)("uses separate configured authenticated/anonymous %s limits", async operation => {
  expect((await consume(anonymous, operation)).limit).toBe(ANALYSIS_LIMITS.anonymous[operation]);
  expect((await consume({ kind: "user", id: "a" }, operation)).limit).toBe(ANALYSIS_LIMITS.user[operation]);
});
it("admits no more than the quota across simultaneous calls to an atomic store", async () => {
  const outcomes = await Promise.all(Array.from({ length: 40 }, () => consume(anonymous, "SCREENSHOT")));
  expect(outcomes.filter(result => result.allowed)).toHaveLength(3);
});
it("propagates storage failure for the entry point to fail closed", async () => {
  const limiter = createAnalysisLimiter({ consume: async () => { throw new Error("unavailable"); } });
  await expect(limiter(anonymous, "URL")).rejects.toThrow("unavailable");
});
