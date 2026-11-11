import { beforeEach, expect, it, vi } from "vitest";
import { deleteCheckAction, clearHistoryAction } from "./delete-check-actions";
import { deleteUserCheck } from "@/entities/check/server/delete-user-check";
import { deleteUserChecks } from "@/entities/check/server/delete-user-checks";
const mocks = vi.hoisted(() => ({ session: vi.fn(), deleteMany: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/auth/session", () => ({ getSession: mocks.session }));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => ({ check: { deleteMany: mocks.deleteMany } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
beforeEach(() => { vi.resetAllMocks(); mocks.session.mockResolvedValue({ user: { id: "user-a" } }); mocks.deleteMany.mockResolvedValue({ count: 1 }); });
it("atomically deletes only the owned ID and revalidates affected pages", async () => {
  expect(await deleteCheckAction("check-a")).toEqual({ ok: true, deletedCount: 1 });
  expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: "check-a", userId: "user-a" } });
  expect(mocks.revalidate).toHaveBeenCalledWith("/history"); expect(mocks.revalidate).toHaveBeenCalledWith("/check/check-a");
});
it("returns identical safe results for missing, already deleted and other-user checks", async () => {
  mocks.deleteMany.mockResolvedValue({ count: 0 });
  const outcomes = await Promise.all(["missing", "deleted", "check-b"].map(deleteCheckAction));
  expect(outcomes).toEqual(Array(3).fill({ ok: false, error: "This saved check is unavailable." }));
  for (const [query] of mocks.deleteMany.mock.calls) expect(query.where.userId).toBe("user-a");
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("rejects anonymous single and bulk deletion without touching the database", async () => {
  mocks.session.mockResolvedValue(null);
  expect(await deleteCheckAction("check-a")).toMatchObject({ ok: false }); expect(await clearHistoryAction()).toMatchObject({ ok: false }); expect(mocks.deleteMany).not.toHaveBeenCalled();
});
it.each([null, { checkId: "id", userId: "user-b" }, "", "../id", "a".repeat(129)])("rejects malformed input without deleting: %j", async value => {
  expect(await deleteCheckAction(value)).toMatchObject({ ok: false }); expect(mocks.deleteMany).not.toHaveBeenCalled();
});
it("clear-history deletes only the session user's rows and returns a count", async () => {
  mocks.deleteMany.mockResolvedValue({ count: 7 }); expect(await clearHistoryAction()).toEqual({ ok: true, deletedCount: 7 });
  expect(mocks.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { userId: "user-a" } }); expect(mocks.revalidate).toHaveBeenCalledWith("/check/[id]", "page");
});
it("empty history can be cleared safely", async () => {
  mocks.deleteMany.mockResolvedValue({ count: 0 }); expect(await clearHistoryAction()).toEqual({ ok: true, deletedCount: 0 });
});
it.each([deleteCheckAction, clearHistoryAction])("never exposes database/session exceptions", async action => {
  mocks.deleteMany.mockRejectedValue(new Error("PRIVATE_DB_SECRET")); expect(await action("id")).toEqual({ ok: false, error: "Unable to delete saved checks. Please try again." });
  mocks.session.mockRejectedValue(new Error("PRIVATE_SESSION")); expect(await action("id")).toEqual({ ok: false, error: "Unable to delete saved checks. Please try again." });
});
it.each([undefined, null, "", " "])("database helpers refuse absent ownership: %j", async userId => {
  await expect(deleteUserCheck(userId as string, "id")).rejects.toThrow(); await expect(deleteUserChecks(userId as string)).rejects.toThrow(); expect(mocks.deleteMany).not.toHaveBeenCalled();
});
