import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ adapter: vi.fn(() => "prisma-adapter"), prisma: {}, betterAuth: vi.fn((options) => ({ options })) }));
vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: mocks.adapter }));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: () => mocks.prisma }));
import "@/auth";
it("configures the existing Prisma client with the official PostgreSQL adapter", () => {
  expect(mocks.adapter).toHaveBeenCalledWith(mocks.prisma, { provider: "postgresql" });
  expect(mocks.betterAuth.mock.calls[0][0].database).toBe("prisma-adapter");
});
it("enables email/password with a 10-character minimum and built-in hashing", () => {
  expect(mocks.betterAuth.mock.calls[0][0].emailAndPassword).toEqual({ enabled: true, minPasswordLength: 10, requireEmailVerification: false });
});
