import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl, parseAppOrigin } from "./app-url";
import { rootMetadata } from "./metadata";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import nextConfig from "../../../next.config";

vi.mock("server-only", () => ({}));
import { validateProductionEnv } from "@/shared/server/config/validate-production-env";

const production = {
  NODE_ENV: "production", APP_URL: "https://trustcheck.app", BETTER_AUTH_URL: "https://trustcheck.app",
  BETTER_AUTH_SECRET: "test-auth-secret-with-at-least-32-bytes", RATE_LIMIT_SECRET: "test-rate-secret-with-at-least-32-bytes",
  DATABASE_URL: "postgresql://test:test@database.internal:5432/trustcheck", TRUST_PROXY_IP_HEADERS: "true", TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
};
afterEach(() => vi.unstubAllEnvs());

describe("canonical origin", () => {
  it("normalizes an explicit origin without using request content", () => {
    expect(parseAppOrigin("  https://TrustCheck.app:443/ ", true).href).toBe("https://trustcheck.app/");
  });
  it.each([undefined, "", "http://localhost:3000", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://app.local", "https://trustcheck.example", "https://trustcheck.test", "https://example.com", "https://sub.example.com", "https://example.com/path", "https://example.com/?secret=hidden", "https://user:secret@example.com", "javascript:alert(1)"])("rejects invalid production origin %s", APP_URL => {
    expect(() => getAppUrl({ NODE_ENV: "production", APP_URL })).toThrow(/APP_URL/);
  });
  it("only falls back locally in development/test", () => {
    expect(getAppUrl({ NODE_ENV: "development" }).origin).toBe("http://localhost:3000");
    expect(() => getAppUrl({})).toThrow("APP_URL");
  });
});

describe("production environment", () => {
  it("allows an absent optional provider", () => expect(() => validateProductionEnv(production)).not.toThrow());
  it("does not require production settings in development", () => expect(() => validateProductionEnv({ NODE_ENV: "development" })).not.toThrow());
  it.each(["APP_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "RATE_LIMIT_SECRET", "DATABASE_URL", "TRUST_PROXY_IP_HEADERS", "TRUSTED_CLIENT_IP_HEADER"])("fails explicitly when %s is missing", key => {
    expect(() => validateProductionEnv({ ...production, [key]: "" })).toThrow(new RegExp(key));
  });
  it.each([
    { BETTER_AUTH_URL: "https://other.example" }, { BETTER_AUTH_SECRET: "short" }, { BETTER_AUTH_SECRET: "replace-with-random-secret-at-least-32-bytes" }, { RATE_LIMIT_SECRET: "short" }, { RATE_LIMIT_SECRET: "CHANGE_ME_TO_A_LONG_RANDOM_SECRET_123456" },
    { DATABASE_URL: "https://user:secret@database.example/db" }, { DATABASE_URL: "postgresql://db/" },
    { TRUST_PROXY_IP_HEADERS: "false" }, { TRUSTED_CLIENT_IP_HEADER: "x-real-ip, x-forwarded-for" },
  ])("rejects malformed configuration without reflecting values", invalid => {
    expect(() => validateProductionEnv({ ...production, ...invalid })).toThrow();
    try { validateProductionEnv({ ...production, ...invalid }); } catch (error) {
      expect(String(error)).not.toContain("user:secret");
      expect(String(error)).not.toContain("other.example");
      expect(String(error)).not.toContain(production.BETTER_AUTH_SECRET);
    }
  });
});

describe("indexing and metadata", () => {
  it("lists only stable public URLs with no fake timestamps", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", production.APP_URL);
    expect(sitemap()).toEqual([{ url: "https://trustcheck.app/" }, { url: "https://trustcheck.app/check" }]);
    expect(robots()).toMatchObject({ rules: { allow: "/", disallow: expect.arrayContaining(["/check/", "/api/", "/account/", "/history", "/login", "/register"]) }, sitemap: "https://trustcheck.app/sitemap.xml" });
    const metadata = rootMetadata();
    const metadataBase = metadata.metadataBase;
    expect(metadataBase).toBeDefined();
    expect(
      metadataBase instanceof URL
        ? metadataBase.origin
        : new URL(metadataBase as string).origin,
    ).toBe(new URL(production.APP_URL).origin);
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("documents every required production variable without real secret material", () => {
    const example = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");
    for (const name of [
      "DATABASE_URL", "APP_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "RATE_LIMIT_SECRET",
      "GOOGLE_WEB_RISK_API_KEY", "TRUST_PROXY_IP_HEADERS", "TRUSTED_CLIENT_IP_HEADER",
    ]) expect(example).toMatch(new RegExp(`^${name}=`, "m"));
    expect(example).not.toMatch(/AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z_-]{20,}/);
  });

  it("does not advertise production crawling in development", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("APP_URL", production.APP_URL);
    expect(sitemap()).toEqual([]); expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
  it("sets conservative headers without breaking clipboard or framework scripts", async () => {
    const headers = await nextConfig.headers!();
    expect(headers[0].headers).toEqual(expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    ]));
    expect(JSON.stringify(headers)).not.toMatch(/clipboard|script-src|Strict-Transport-Security/);
    for (const source of ["/history/:path*", "/account/:path*", "/api/:path*", "/check/:path+", "/login", "/register"]) {
      expect(headers.find(header => header.source === source)?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" });
    }
  });
});
