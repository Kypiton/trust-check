import "server-only";

import { getPrismaClient } from "@/shared/server/db/prisma";

/** Both identifiers are parameterized; userId must come from the server session. */
export async function getUserCheckById(userId: string, checkId: string) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Authentication required.");
  // Opaque IDs: bound input without coupling the route to a particular ID generator.
  if (typeof checkId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(checkId)) return null;
  try {
    return await getPrismaClient().check.findFirst({
      where: { id: checkId, userId },
      select: {
        id: true, inputType: true, status: true,
        riskLevel: true, riskScore: true, confidence: true, summary: true,
        signals: true, recommendedActions: true, analysisCoverage: true, analysisNotes: true,
        createdAt: true, completedAt: true,
      },
    });
  } catch {
    throw new Error("Saved result is unavailable.");
  }
}
