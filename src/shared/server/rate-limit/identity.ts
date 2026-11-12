import "server-only";
import { createHmac } from "node:crypto";

export function rateLimitDigest(value: string, secret = process.env.RATE_LIMIT_SECRET): string {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Rate limit identity configuration unavailable.");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function anonymousIdentity(ip: string, secret?: string): string {
  return rateLimitDigest(`analysis:${ip}`, secret);
}
