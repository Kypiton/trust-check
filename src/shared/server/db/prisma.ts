import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  trustCheckPrisma?: PrismaClient;
};
let client: PrismaClient | undefined;

/** Lazy access keeps analysis-only builds usable before a database is configured. */
export function getPrismaClient(): PrismaClient {
  client ??= process.env.NODE_ENV !== "production" ? globalForPrisma.trustCheckPrisma : undefined;
  if (client) return client;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for database access.");

  const adapter = new PrismaPg({ connectionString });
  client = new PrismaClient({ adapter, log: [] });
  if (process.env.NODE_ENV !== "production") globalForPrisma.trustCheckPrisma = client;
  return client;
}
