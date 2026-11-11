import "server-only";

import { getPrismaClient } from "@/shared/server/db/prisma";

export async function deleteUserChecks(userId: string): Promise<number> {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Authentication required.");
  const { count } = await getPrismaClient().check.deleteMany({ where: { userId } });
  return count;
}
