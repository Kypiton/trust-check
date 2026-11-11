import "server-only";

import { getPrismaClient } from "@/shared/server/db/prisma";

/** Ownership comes from the authenticated action, never from client data. */
export async function deleteUserCheck(userId: string, checkId: string): Promise<number> {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Authentication required.");
  if (typeof checkId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(checkId)) return 0;
  const { count } = await getPrismaClient().check.deleteMany({ where: { id: checkId, userId } });
  return count;
}
