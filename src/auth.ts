import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getAuthPrismaClient } from "./shared/server/rate-limit/auth-prisma";
import { trustedClientIpHeader } from "./shared/server/rate-limit/client-ip";

const trustedHeader = trustedClientIpHeader();
const development = process.env.NODE_ENV === "development";

export const auth = betterAuth({
  appName: "TrustCheck",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(getAuthPrismaClient(), { provider: "postgresql" }),
  advanced: { ipAddress: { ipAddressHeaders: trustedHeader ? [trustedHeader] : [] } },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: development ? 300 : 100,
    customRules: {
      "/sign-in/email": { window: 60, max: development ? 30 : 10 },
      "/sign-up/email": { window: 60, max: development ? 20 : 5 },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: false,
  },
});
