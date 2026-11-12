import { afterEach, expect, it, vi } from "vitest";
import { anonymousIdentity } from "./identity";
import { resolveClientIp, trustedClientIpHeader } from "./client-ip";
import { protectAuthRateLimitArgs } from "./auth-prisma";
vi.mock("server-only", () => ({}));
vi.mock("@/shared/server/db/prisma", () => ({ getPrismaClient: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
const secret = "a".repeat(48);
it("derives stable secret-dependent anonymous identities without raw IP", () => {
  const id = anonymousIdentity("192.0.2.1", secret);
  expect(id).toMatch(/^[a-f0-9]{64}$/); expect(id).not.toContain("192.0.2.1");
  expect(anonymousIdentity("192.0.2.1", secret)).toBe(id);
  expect(anonymousIdentity("192.0.2.1", "b".repeat(48))).not.toBe(id);
  expect(anonymousIdentity("192.0.2.2", secret)).not.toBe(id);
});
it("rejects missing or weak secrets", () => {
  vi.stubEnv("RATE_LIMIT_SECRET", ""); expect(() => anonymousIdentity("127.0.0.1")).toThrow(); expect(() => anonymousIdentity("127.0.0.1", "weak")).toThrow();
});
it("ignores attacker-controlled forwarding headers without explicit production trust", () => {
  expect(resolveClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), { NODE_ENV: "production" })).toBeNull();
});
it("uses a shared loopback development bucket regardless of spoofed forwarding", () => {
  expect(resolveClientIp(new Headers({ "x-forwarded-for": "192.0.2.1" }), { NODE_ENV: "development" })).toBe("127.0.0.1");
});
const env = { NODE_ENV: "production", TRUST_PROXY_IP_HEADERS: "true", TRUSTED_CLIENT_IP_HEADER: "x-real-ip" } as const;
it("trusts only the explicitly selected overwrite header", () => {
  expect(resolveClientIp(new Headers({ "x-real-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }), env)).toBe("192.0.2.1");
  expect(trustedClientIpHeader({ ...env, TRUST_PROXY_IP_HEADERS: "false" })).toBeUndefined();
});
it.each(["", "192.0.2.1, 192.0.2.2", "unknown", "127.1", "192.0.2.1:8080"])("rejects ambiguous or malformed configured addresses: %s", value => {
  expect(resolveClientIp(new Headers({ "x-real-ip": value }), env)).toBeNull();
});
it("normalizes IPv6 and mapped IPv4 consistently", () => {
  expect(resolveClientIp(new Headers({ "x-real-ip": "::ffff:192.0.2.1" }), env)).toBe("192.0.2.1");
  expect(resolveClientIp(new Headers({ "x-real-ip": "2001:0db8:0:0:0:0:0:1" }), env)).toBe("2001:db8::1");
});
it("HMACs Better Auth key predicates and writes without changing counters", () => {
  vi.stubEnv("RATE_LIMIT_SECRET", secret);
  const raw = "127.0.0.1|/sign-in/email";
  const transformed = protectAuthRateLimitArgs({ where: { AND: [{ key: { equals: raw } }, { count: { lt: 10 } }] }, data: { key: raw, count: 1, lastRequest: 123 } });
  expect(JSON.stringify(transformed)).not.toContain("127.0.0.1"); expect(JSON.stringify(transformed)).not.toContain("sign-in/email");
  expect(transformed).toMatchObject({ data: { key: expect.stringMatching(/^[a-f0-9]{64}$/), count: 1, lastRequest: 123 } });
});
