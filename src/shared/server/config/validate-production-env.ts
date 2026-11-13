import "server-only";
import { getAppUrl, parseAppOrigin } from "@/shared/config/app-url";
import { trustedClientIpHeader } from "@/shared/server/rate-limit/client-ip";

type Environment = Record<string, string | undefined>;

/** Validate configuration, not connectivity. Errors name settings, never their values. */
export function validateProductionEnv(env: Environment = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const origin = getAppUrl(env);
  const authUrl =
    env.BETTER_AUTH_URL?.trim() ||
    origin.origin;

  if (
    parseAppOrigin(authUrl, true, "BETTER_AUTH_URL").origin !==
    origin.origin
  ) {
    throw new Error("BETTER_AUTH_URL must match the application origin.");
  }
  for (const name of ["BETTER_AUTH_SECRET", "RATE_LIMIT_SECRET"] as const) {
    const secret = env[name]?.trim() ?? "";
    if (Buffer.byteLength(secret) < 32 || /^replace[-_]/i.test(secret) || /^change[-_]?me/i.test(secret)) {
      throw new Error(`${name} must contain a non-placeholder secret of at least 32 bytes in production.`);
    }
  }
  let database: URL;
  try { database = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || !database.username || database.pathname.length < 2 || database.hash) {
    throw new Error("DATABASE_URL must specify a PostgreSQL host, user and database.");
  }
  if (!trustedClientIpHeader(env)) {
    throw new Error("Production requires TRUST_PROXY_IP_HEADERS=true and a valid TRUSTED_CLIENT_IP_HEADER supplied by a trusted proxy.");
  }
  // GOOGLE_WEB_RISK_API_KEY is intentionally optional; absent credentials remain SKIPPED.
}
