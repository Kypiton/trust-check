import { beforeEach, expect, it, vi } from "vitest";
import { getUserCheckHistory } from "./get-user-check-history";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { findMany: mocks.findMany } }) }));
beforeEach(() => { vi.resetAllMocks(); mocks.findMany.mockResolvedValue([]); });
it.each(["user-a", "user-b"])("filters %s in the database with newest-first ordering and a 50 row limit", async userId => {
  await getUserCheckHistory(userId);
  expect(mocks.findMany).toHaveBeenCalledExactlyOnceWith({
    where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
    select: { id: true, inputType: true, status: true, riskLevel: true, riskScore: true, confidence: true, createdAt: true },
  });
});
it("returns selected IDs and metadata without fetching ownership, raw content or JSON payloads", async () => {
  const rows = [{ id: "check-id", inputType: "TEXT", status: "COMPLETED", riskLevel: "LOW", riskScore: 0, confidence: "LOW", createdAt: new Date() }];
  mocks.findMany.mockResolvedValue(rows);
  expect(await getUserCheckHistory("user-a")).toBe(rows);
  expect(Object.keys(mocks.findMany.mock.calls[0][0].select).sort()).toEqual(["id", "inputType", "status", "riskLevel", "riskScore", "confidence", "createdAt"].sort());
});
it.each([undefined, null, "", "   "])("refuses missing ownership instead of an unfiltered query", async userId => {
  await expect(getUserCheckHistory(userId as string)).rejects.toThrow("authenticated user"); expect(mocks.findMany).not.toHaveBeenCalled();
});
it("replaces database errors with a fixed error without private details or cause", async () => {
  mocks.findMany.mockRejectedValue(new Error("PRIVATE_DATABASE_URL_AND_USER"));
  const error = await getUserCheckHistory("user-a").catch(error => error);
  expect(error.message).toBe("Unable to load check history."); expect(error.cause).toBeUndefined();
});
