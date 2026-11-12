import "server-only";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

type Environment = { NODE_ENV?: string; TRUST_PROXY_IP_HEADERS?: string; TRUSTED_CLIENT_IP_HEADER?: string };
export function trustedClientIpHeader(env: Environment = process.env): string | undefined {
  if (env.TRUST_PROXY_IP_HEADERS !== "true") return undefined;
  const name = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  return name && /^[a-z0-9-]+$/.test(name) ? name : undefined;
}

/** Only a proxy that overwrites the configured single-address header may be trusted.
 * App Router does not expose the socket peer. No forwarded chain is guessed here.
 */
export function resolveClientIp(headers: Pick<Headers, "get">, env: Environment = process.env): string | null {
  const header = trustedClientIpHeader(env);
  if (header) {
    const value = headers.get(header)?.trim();
    if (!value || !isIP(value)) return null;
    return ipaddr.process(value).toString();
  }
  // Local development intentionally shares one loopback bucket; supplied headers
  // cannot create extra quota, even when a dev server is exposed on a LAN.
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" ? "127.0.0.1" : null;
}
