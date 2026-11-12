import "server-only";
import { getPrismaClient } from "@/shared/server/db/prisma";

/** Maintenance entry point for a future scheduler; never called per request. */
export async function cleanupRateLimitBuckets(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const prisma = getPrismaClient();
  const [analysis, auth] = await prisma.$transaction([
    prisma.analysisRateLimit.deleteMany({ where: { updatedAt: { lt: cutoff } } }),
    prisma.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(cutoff.getTime()) } } }),
  ]);
  return { analysisDeleted: analysis.count, authDeleted: auth.count };
}
