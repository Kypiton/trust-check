import "server-only";
import { headers } from "next/headers";
import { getSession } from "@/shared/server/auth/session";
import type { AnalysisLimitFailure } from "@/shared/model/analysis-limit";
import { createAnalysisLimiter } from "./rate-limit";
import { prismaRateLimitStore } from "./prisma-store";
import { resolveClientIp } from "./client-ip";
import { anonymousIdentity } from "./identity";
import type { AnalysisOperation, RateLimitActor } from "./types";

const consume = createAnalysisLimiter(prismaRateLimitStore);

/** Fail closed in every environment. Never log IPs, keys or storage exceptions. */
export async function checkAnalysisRateLimit(operation: AnalysisOperation): Promise<AnalysisLimitFailure | null> {
  try {
    const session = await getSession();
    let actor: RateLimitActor;
    if (session) {
      actor = { kind: "user", id: session.user.id };
    } else {
      const ip = resolveClientIp(await headers());
      if (!ip) throw new Error("Client identity unavailable.");
      actor = { kind: "anonymous", id: anonymousIdentity(ip) };
    }
    const decision = await consume(actor, operation);
    return decision.allowed ? null : { ok: false, code: "RATE_LIMITED", error: "Too many checks. Try again in a few minutes.", retryAfterSeconds: decision.retryAfterSeconds };
  } catch {
    return { ok: false, code: "TEMPORARILY_UNAVAILABLE", error: "Checks are temporarily unavailable. Please try again shortly." };
  }
}
