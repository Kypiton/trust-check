import { isIP } from "node:net";
import { parse } from "tldts";
import { isRecord, requestRdapJson } from "./rdap-http";
import { createRdapGuard, type RdapGuard } from "./rdap-guard";
import { RDAP_FAILURE_COOLDOWN_MS, withDomainDeadline } from "./rdap-limits";

export const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1_000;

type BootstrapResult =
  | { ok: true; services: ReadonlyMap<string, string> }
  | { ok: false; reason: "BOOTSTRAP_UNAVAILABLE" };
type ServiceResult =
  | { ok: true; baseUrl: URL }
  | { ok: false; reason: "BOOTSTRAP_UNAVAILABLE" | "NO_RDAP_SERVICE" };

function secureBaseUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // HTTPS only, with no credentials, custom ports, or literal IP destinations.
  // Discovery is trusted only from the fixed IANA endpoint; no DNS lookups or
  // user-supplied service URLs are accepted. Redirects are disabled separately.
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
  if (isIP(url.hostname.replace(/^\[|\]$/g, "")) || !parse(url.hostname).isIcann) return null;
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

function parseBootstrap(data: unknown): ReadonlyMap<string, string> | null {
  if (!isRecord(data) || !Array.isArray(data.services)) return null;
  const services = new Map<string, string>();
  for (const entry of data.services) {
    if (!Array.isArray(entry) || entry.length !== 2 ||
        !Array.isArray(entry[0]) || !entry[0].every((tld) => typeof tld === "string") ||
        !Array.isArray(entry[1]) || !entry[1].every((url) => typeof url === "string")) return null;
    const baseUrl = entry[1].map(secureBaseUrl).find((url) => url !== null);
    if (!baseUrl) continue;
    for (const tld of entry[0] as string[]) {
      // A TLD is one complete DNS label, never a substring or arbitrary suffix.
      if (/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(tld)) services.set(tld.toLowerCase(), baseUrl);
    }
  }
  return services;
}

/** Each analyzer instance owns one cache, shared across every domain it checks. */
export function createRdapBootstrap(fetcher: typeof fetch, now: () => number, guard: RdapGuard = createRdapGuard(now)) {
  let cached: { services: ReadonlyMap<string, string>; expiresAt: number } | undefined;
  let pending: Promise<BootstrapResult> | undefined;
  let retryAfter = 0;

  async function load(): Promise<BootstrapResult> {
    if (cached && now() < cached.expiresAt) return { ok: true, services: cached.services };
    if (now() < retryAfter) return { ok: false, reason: "BOOTSTRAP_UNAVAILABLE" };
    if (pending) return pending;
    // Shared discovery owns its cancellation: one caller must not abort work
    // used by another. It is bounded independently, including admission wait.
    pending = withDomainDeadline<BootstrapResult>(async (deadline) => {
      const url = new URL(IANA_BOOTSTRAP_URL);
      const response = await guard.run(url, deadline, () => requestRdapJson(url, fetcher, deadline.signal));
      if (!response.ok) return { ok: false, reason: "BOOTSTRAP_UNAVAILABLE" };
      const services = parseBootstrap(response.data);
      if (!services) return { ok: false, reason: "BOOTSTRAP_UNAVAILABLE" };
      cached = { services, expiresAt: now() + BOOTSTRAP_TTL_MS };
      return { ok: true, services };
    }, { ok: false, reason: "BOOTSTRAP_UNAVAILABLE" }, now);
    try {
      const result = await pending;
      if (!result.ok) retryAfter = now() + RDAP_FAILURE_COOLDOWN_MS;
      return result;
    } finally {
      pending = undefined;
    }
  }

  return async (registrableDomain: string): Promise<ServiceResult> => {
    const bootstrap = await load();
    if (!bootstrap.ok) return bootstrap;
    const tld = registrableDomain.split(".").at(-1)!;
    const baseUrl = bootstrap.services.get(tld);
    return baseUrl ? { ok: true, baseUrl: new URL(baseUrl) } : { ok: false, reason: "NO_RDAP_SERVICE" };
  };
}
