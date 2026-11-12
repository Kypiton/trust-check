import "server-only";
import { getPrismaClient } from "@/shared/server/db/prisma";
import { rateLimitDigest } from "./identity";

function protectFilter(value: unknown): unknown {
  if (typeof value === "string") return rateLimitDigest(`auth:${value}`);
  if (Array.isArray(value)) return value.map(protectFilter);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, protectFilter(item)]));
  return value;
}
/** Better Auth owns its limiter. This adapter-boundary transform only protects
 * its IP+path keys at rest, including keys in conditional updates and lookups.
 */
export function protectAuthRateLimitArgs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(protectAuthRateLimitArgs);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === "key" ? protectFilter(item) : protectAuthRateLimitArgs(item),
  ]));
}
export function getAuthPrismaClient() {
  return getPrismaClient().$extends({
    name: "private-auth-rate-limit-keys",
    query: {
      rateLimit: {
        async $allOperations({ args, query }) {
          // Do not transform select/orderBy; only query predicates and writes.
          for (const name of ["where", "data", "create", "update"] as const) {
            if (name in args) Reflect.set(args, name, protectAuthRateLimitArgs(Reflect.get(args, name)));
          }
          return query(args);
        },
      },
    },
  });
}
