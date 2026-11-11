import { beforeEach, expect, it, vi } from "vitest";
import { getUserCheckById } from "./get-user-check-by-id";
const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { findFirst: mocks.findFirst } }) }));
beforeEach(() => { vi.resetAllMocks(); mocks.findFirst.mockResolvedValue(null); });
it("enforces ownership and ID together in one parameterized lookup with only result metadata", async () => {
  await getUserCheckById("user-a", "check-id");
  expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: "check-id", userId: "user-a" }, select: { id: true, inputType: true, status: true, riskLevel: true, riskScore: true, confidence: true, summary: true, signals: true, recommendedActions: true, analysisCoverage: true, analysisNotes: true, createdAt: true, completedAt: true } });
});
it.each(["missing", "owned-by-b"])("returns null for an inaccessible %s row", async id => { expect(await getUserCheckById("user-a", id)).toBeNull(); });
it.each(["", "../check", "x' OR 1=1", "x".repeat(129)])("rejects malformed IDs without querying: %s", async id => { expect(await getUserCheckById("user-a", id)).toBeNull(); expect(mocks.findFirst).not.toHaveBeenCalled(); });
it("rejects absent ownership", async () => { await expect(getUserCheckById("", "id")).rejects.toThrow(); expect(mocks.findFirst).not.toHaveBeenCalled(); });
it("sanitizes database failures without exposing the original error", async () => {
  mocks.findFirst.mockRejectedValue(new Error("PRIVATE_DB_CREDENTIALS"));
  const error = await getUserCheckById("user-a", "id").catch(error => error);
  expect(error.message).toBe("Saved result is unavailable."); expect(error.cause).toBeUndefined();
});
