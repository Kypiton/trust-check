import "server-only";

import { getPrismaClient } from "@/shared/server/db/prisma";

/** userId must come from the validated server session, never request parameters. */
export async function getUserCheckHistory(userId: string) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new Error("History requires an authenticated user.");
  }
  try {
    return await getPrismaClient().check.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        inputType: true,
        status: true,
        riskLevel: true,
        riskScore: true,
        confidence: true,
        createdAt: true,
      },
    });
  } catch {
    // Do not attach provider errors or private metadata to the boundary error.
    throw new Error("Unable to load check history.");
  }
}

export type CheckHistoryItem = Awaited<ReturnType<typeof getUserCheckHistory>>[number];
