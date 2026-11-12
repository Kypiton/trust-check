import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adapter: vi.fn(() => "prisma-adapter"), prisma: {}, betterAuth: vi.fn((options) => ({ options })) }));
vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: mocks.adapter }));
vi.mock("@/shared/server/rate-limit/auth-prisma", () => ({ getAuthPrismaClient: () => mocks.prisma }));
import "@/auth";
it("configures the existing Prisma client with the official PostgreSQL adapter", () => {
  expect(mocks.adapter).toHaveBeenCalledWith(mocks.prisma, { provider: "postgresql" });
  expect(mocks.betterAuth.mock.calls[0][0].database).toBe("prisma-adapter");
});
it("enables email/password with a 10-character minimum and built-in hashing", () => {
  expect(mocks.betterAuth.mock.calls[0][0].emailAndPassword).toEqual({ enabled: true, minPasswordLength: 10, requireEmailVerification: false });
});

it("explicitly enables database-backed auth throttling and does not trust arbitrary proxy headers", () => {
  const config = mocks.betterAuth.mock.calls[0][0];
  expect(config.rateLimit).toMatchObject({ enabled: true, storage: "database", window: 60 });
  expect(config.rateLimit.customRules["/sign-in/email"]).toEqual({ window: 60, max: 10 });
  expect(config.rateLimit.customRules["/sign-up/email"]).toEqual({ window: 60, max: 5 });
  expect(config.advanced.ipAddress.ipAddressHeaders).toEqual([]);
});

it("has the official database rate-limit model with a unique key and bigint timestamp", async () => {
  const { readFile } = await import("node:fs/promises");
  const schema = await readFile("prisma/schema.prisma", "utf8");
  const model = schema.match(/model RateLimit \{([^}]+)\}/)?.[1];
  expect(model).toContain("@@unique([key])"); expect(model).toMatch(/lastRequest\s+BigInt/); expect(model).toMatch(/count\s+Int/);
});
