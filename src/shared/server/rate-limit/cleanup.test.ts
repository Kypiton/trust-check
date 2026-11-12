import { expect, it, vi } from "vitest";
import { cleanupRateLimitBuckets } from "./cleanup";
const mocks = vi.hoisted(() => ({ analysis: vi.fn(() => ({ count: 2 })), auth: vi.fn(() => ({ count: 3 })), transaction: vi.fn(async values => values) }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ analysisRateLimit: { deleteMany: mocks.analysis }, rateLimit: { deleteMany: mocks.auth }, $transaction: mocks.transaction }) }));
it("removes only buckets older than 24 hours through an explicit maintenance call", async () => {
  const now = new Date("2026-11-12T12:00:00Z"); const cutoff = new Date("2026-11-11T12:00:00Z");
  expect(await cleanupRateLimitBuckets(now)).toEqual({ analysisDeleted: 2, authDeleted: 3 });
  expect(mocks.analysis).toHaveBeenCalledWith({ where: { updatedAt: { lt: cutoff } } });
  expect(mocks.auth).toHaveBeenCalledWith({ where: { lastRequest: { lt: BigInt(cutoff.getTime()) } } });
});
