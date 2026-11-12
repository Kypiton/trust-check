import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/shared/server/db/prisma";
import type { RateLimitStore } from "./types";

export const prismaRateLimitStore: RateLimitStore = {
  async consume({ key, limit, windowMs, now }) {
    const prisma = getPrismaClient();
    // Conditional UPSERT serializes competing consumers on the unique key.
    // Prisma's ordinary upsert cannot express the reset/admit condition together.
    // All dynamic values are bound parameters; denial never increments past limit.
    const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>(Prisma.sql`
      INSERT INTO "AnalysisRateLimit" ("key", "windowStart", "count", "updatedAt")
      VALUES (${key}, ${now}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "AnalysisRateLimit"."windowStart" <= ${now}::timestamptz - (${windowMs}::bigint * INTERVAL '1 millisecond')
          THEN 1 ELSE "AnalysisRateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "AnalysisRateLimit"."windowStart" <= ${now}::timestamptz - (${windowMs}::bigint * INTERVAL '1 millisecond')
          THEN ${now} ELSE "AnalysisRateLimit"."windowStart" END,
        "updatedAt" = ${now}
      WHERE "AnalysisRateLimit"."windowStart" <= ${now}::timestamptz - (${windowMs}::bigint * INTERVAL '1 millisecond')
         OR "AnalysisRateLimit"."count" < ${limit}
      RETURNING "count", "windowStart"
    `);
    if (rows[0]) return { allowed: true, ...rows[0] };
    // Read-only denial metadata. This read cannot admit a request or lose increments.
    const row = await prisma.analysisRateLimit.findUniqueOrThrow({ where: { key }, select: { count: true, windowStart: true } });
    return { allowed: false, ...row };
  },
};
