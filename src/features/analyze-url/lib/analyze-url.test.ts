import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { calculateRisk } from "../../../entities/risk";
import { analyzeUrl } from "../index";
import { detectUrlSignals, LONG_URL_THRESHOLD } from "./detectors";

function valid(rawUrl: string) {
  const result = analyzeUrl(rawUrl);
  if (!result.valid) throw new Error("Expected valid test URL");
  return result;
}

function codes(rawUrl: string) {
  return valid(rawUrl).signals.map((signal) => signal.code);
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("URL normalization and validation", () => {
  it.each([
    ["example.com", "https://example.com/"],
    ["www.example.com", "https://www.example.com/"],
    ["paypal.com/login", "https://paypal.com/login"],
    ["  https://example.com/login \n", "https://example.com/login"],
    ["HTTPS://EXAMPLE.COM:443/Login?q=Case#Top", "https://example.com/Login?q=Case#Top"],
    ["example.com:8443/login", "https://example.com:8443/login"],
    ["http://example.com:80/path", "http://example.com/path"],
    ["https://example.com/a%20b", "https://example.com/a%20b"],
  ])("normalizes %s", (input, expected) => {
    expect(valid(input).normalizedUrl).toBe(expected);
  });

  it("defaults a bare domain to HTTPS without adding NO_HTTPS", () => {
    expect(codes("example.com")).toEqual([]);
  });

  it("keeps the serialized hostname intact while normalizing the analysis hostname", () => {
    const result = valid("HTTPS://WWW.PAYPAL.COM./Login");
    expect(result.normalizedUrl).toBe("https://www.paypal.com./Login");
    expect(result.hostname).toBe("www.paypal.com");
    expect(result.signals).toEqual([]);
  });

  it.each([
    "", " \n\t ", "not a url", "hello", "/relative/path", "//example.com", "?next=example.com", "#example.com",
    "javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "ftp://example.com", "mailto:user@example.com", "ws://example.com", "vbscript:msgbox(1)",
    "https:example.com", "http:/example.com", "http:///example.com", "https://", "https://?q=test", "https://#fragment", "https://[invalid]/",
    "https://example.com:99999", "https://example.com:abc", "https://999.999.999.999", "user@example.com", "https://exa mple.com", "https://example.com/a b",
    "https://exam\nple.com", "https://example.com\u0000/path", "https://example.com\u007f/path", "https://example.com\\other", "https://.example.com", "https://example..com", "https://-example.com", "https://example-.com",
  ])("rejects invalid URL %j without a fabricated score", (input) => {
    expect(analyzeUrl(input)).toEqual({ valid: false, error: "INVALID_URL" });
  });

  it.each([null, undefined, 42, {}, []])("rejects non-string input (case %#)", (input) => {
    expect(analyzeUrl(input)).toEqual({ valid: false, error: "INVALID_URL" });
  });

  it("uses the actual parsed hostname rather than userinfo, path or query text", () => {
    const result = valid("https://paypal.com@paypal-login.example/https://paypal.com?host=paypal.com");
    expect(result.hostname).toBe("paypal-login.example");
    expect(result.signals.map((signal) => signal.code)).toEqual(["BRAND_IMPERSONATION"]);
  });
});

describe("canonical URL signals", () => {
  it("returns no signals and 0 / LOW for an ordinary HTTPS URL", () => {
    expect(valid("https://example.com")).toMatchObject({ signals: [], risk: { score: 0, level: "LOW", scoredSignals: [] } });
  });

  it("scores HTTP alone as 10 / LOW", () => {
    const result = valid("http://example.com");
    expect(result.signals.map((signal) => signal.code)).toEqual(["NO_HTTPS"]);
    expect(result.risk).toMatchObject({ score: 10, level: "LOW" });
  });

  it.each([
    "http://192.168.1.20/login", "http://185.23.44.11/login", "http://185.234.12.8/verify", "http://[2001:db8::1]/login", "http://[::1]/",
    "http://[::ffff:192.168.1.1]/", "http://127.1/", "http://0x7f000001/",
  ])("detects parser-normalized IP addresses in %s", (input) => {
    const result = valid(input);
    expect(result.signals.map((signal) => signal.code)).toEqual(["NO_HTTPS", "IP_ADDRESS_URL"]);
    expect(result.risk).toMatchObject({ score: 30, level: "MEDIUM" });
  });

  it("does not confuse an IP-looking subdomain or path with an IP host", () => {
    expect(codes("https://192.168.1.1.example.com/185.23.44.11")).not.toContain("IP_ADDRESS_URL");
  });

  it.each(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "tiny.cc", "WWW.BIT.LY."])("recognizes shortener %s", (host) => {
    expect(codes(`https://${host}/example`)).toEqual(["SHORTENED_URL"]);
  });

  it.each(["bit.ly.evil.example", "notbit.ly", "bit-ly.example", "go.bit.ly", "www.www.bit.ly"])("does not assume %s is a shortener", (host) => {
    expect(codes(`https://${host}/login`)).not.toContain("SHORTENED_URL");
  });

  it.each([199, 200, 201])("uses the documented normalized length boundary at %i characters", (length) => {
    expect(LONG_URL_THRESHOLD).toBe(200);
    const prefix = "https://example.com/";
    const result = valid(prefix + "a".repeat(length - prefix.length));
    expect(result.normalizedUrl.length).toBe(length);
    expect(result.signals.some((signal) => signal.code === "LONG_URL")).toBe(length >= 200);
  });

  it.each([
    "https://docs.example.com/articles/normal-page?sort=recent&page=2#section",
    "https://example.com/?next=https%3A%2F%2Fpaypal-login.example",
    "https://example.com/apple/paypal/bit.ly",
    "https://my-normal-subdomain.example.com/",
  ])("does not score ordinary URL structure: %s", (input) => {
    expect(codes(input)).toEqual([]);
  });
});

describe("brand token and domain boundaries", () => {
  it.each([
    "paypal.com", "www.paypal.com", "support.apple.com", "accounts.google.com", "login.microsoft.com", "microsoft.live.com", "amazon.com",
    "facebook.com", "instagram.com", "whatsapp.com", "telegram.org", "netflix.com", "accounts.paypal.com.",
  ])("exempts the configured official domain %s and its subdomains", (host) => {
    expect(codes(`https://${host}/security`)).not.toContain("BRAND_IMPERSONATION");
  });

  it.each([
    "paypal.com.evil.example", "paypal-security-check.xyz", "paypa1-login.example", "apple-account-verification.example",
    "microsoft-login-security.example", "micros0ft-login.example", "g00gle-login.example", "google-security.example", "amazon-login.example",
    "facebook-login.example", "instagram-verify.example", "whatsapp-support.example", "telegram-login.example", "netflix-account.example",
    "paypal.com.evil.example.", "paypal.com-evil.example", "login.paypal.example", "evil-paypal.com",
  ])("detects a recognizable brand token outside its configured domains: %s", (host) => {
    expect(codes(`https://${host}/login`)).toEqual(["BRAND_IMPERSONATION"]);
  });

  it.each(["pineapple.com", "crabapple.example", "notpaypal.example", "microsoftish.example", "www.www.example.com", "example.com"])("avoids brand substring matches in %s", (host) => {
    expect(codes(`https://${host}`)).not.toContain("BRAND_IMPERSONATION");
  });

  it("does not turn Unicode labels into ASCII homoglyph evidence", () => {
    expect(codes("https://аррӏе.example/")).not.toContain("BRAND_IMPERSONATION");
  });

  it("emits one brand signal even with repeated brands and several lookalikes", () => {
    expect(codes("https://paypal-paypa1-micros0ft-g00gle.paypal.example/")).toEqual(["BRAND_IMPERSONATION"]);
  });
});

describe("integration, purity and scope", () => {
  it("scores the combined suspicious URL through the existing engine", () => {
    const input = `http://paypa1-login.example/${"a".repeat(220)}`;
    const result = valid(input);
    expect(result.signals.map((signal) => signal.code)).toEqual(["NO_HTTPS", "LONG_URL", "BRAND_IMPERSONATION"]);
    expect(result.risk).toEqual(calculateRisk(result.signals));
    expect(result.risk).toMatchObject({ score: 35, level: "MEDIUM" });
    for (const signal of result.signals) {
      expect(signal.category).toBe("URL");
      expect(signal.title).toBeTruthy();
      expect(signal.description).toBeTruthy();
      expect(signal).not.toHaveProperty("weight");
    }
  });

  it("leaves input and parsed evidence unchanged and is deterministic", () => {
    const input = "  HTTP://PAYPA1-LOGIN.EXAMPLE/path  ";
    const first = valid(input);
    analyzeUrl("javascript:alert(1)");
    expect(valid(input)).toEqual(first);
    expect(input).toBe("  HTTP://PAYPA1-LOGIN.EXAMPLE/path  ");
    const evidence = Object.freeze({ protocol: "http:", hostname: first.hostname, normalizedUrl: first.normalizedUrl });
    const before = { ...evidence };
    expect(detectUrlSignals(evidence)).toEqual(first.signals);
    expect(evidence).toEqual(before);
    expect(valid(input).signals[0]).not.toBe(first.signals[0]);
  });

  it("never emits network-only or unweighted structure signals", () => {
    const result = valid(`http://paypal-bit.example/${"a".repeat(220)}`);
    const forbidden = ["MULTIPLE_REDIRECTS", "NEW_DOMAIN", "DOMAIN_MISMATCH", "KNOWN_MALICIOUS_DOMAIN", "KNOWN_PHISHING_DOMAIN", "SUSPICIOUS_URL_STRUCTURE"];
    expect(result.signals.some((signal) => forbidden.includes(signal.code))).toBe(false);
  });

  it("performs no fetch, DNS resolution, HTTP requests or socket connections", () => {
    const blocked = () => { throw new Error("Network access is forbidden in URL analysis"); };
    const fetch = vi.fn(blocked);
    vi.stubGlobal("fetch", fetch);
    const spies = [
      vi.spyOn(dns, "lookup").mockImplementation(blocked),
      vi.spyOn(dns, "resolve").mockImplementation(blocked),
      vi.spyOn(dns.promises, "lookup").mockImplementation(blocked),
      vi.spyOn(dns.promises, "resolve").mockImplementation(blocked),
      vi.spyOn(http, "request").mockImplementation(blocked),
      vi.spyOn(http, "get").mockImplementation(blocked),
      vi.spyOn(https, "request").mockImplementation(blocked),
      vi.spyOn(https, "get").mockImplementation(blocked),
      vi.spyOn(net, "connect").mockImplementation(blocked),
      vi.spyOn(net, "createConnection").mockImplementation(blocked),
      vi.spyOn(net.Socket.prototype, "connect").mockImplementation(blocked),
      vi.spyOn(tls, "connect").mockImplementation(blocked),
    ];
    expect(valid("http://127.0.0.1/private").risk.score).toBe(30);
    expect(valid("https://bit.ly/example").risk.score).toBe(10);
    expect(valid("https://paypal-login.example/").risk.score).toBe(20);
    expect(fetch).not.toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
