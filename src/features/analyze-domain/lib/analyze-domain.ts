import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";
import type { DetectedSignal } from "../../../entities/risk";
import { createRdapBootstrap } from "./rdap-bootstrap";
import { lookupRegistration } from "./rdap-client";
import type { RequestFailure } from "./rdap-http";
import { createRdapGuard } from "./rdap-guard";
import { MAX_PENDING_DOMAINS, withDomainDeadline, type DomainDeadline } from "./rdap-limits";

export const NEW_DOMAIN_THRESHOLD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type DomainAnalysis =
  | {
      status: "COMPLETED";
      registrableDomain: string;
      registrationDate: string | null;
      domainAgeDays: number | null;
      signals: DetectedSignal[];
    }
  | { status: "UNAVAILABLE"; reason: RequestFailure | "BOOTSTRAP_UNAVAILABLE" | "NO_RDAP_SERVICE" }
  | { status: "NOT_APPLICABLE" };

function getRegistrableDomain(hostname: string): string | null {
  // Accept a hostname only. Refuse URLs, ports, userinfo, encoded delimiters and
  // controls rather than letting a permissive parser reinterpret user input.
  if (!hostname || /[\s/:@?#%\\\[\]]/.test(hostname) || /[\u0000-\u001f\u007f]/.test(hostname)) return null;
  const ascii = domainToASCII(hostname).toLowerCase().replace(/\.$/, "");
  if (!ascii || ascii.length > 253 || isIP(ascii)) return null;
  if (ascii.split(".").some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))) return null;
  // Registry registration is at the ICANN boundary, not a private hosting
  // suffix (e.g. tenant.blogspot.com is registered as blogspot.com).
  const parsed = parse(ascii, { allowPrivateDomains: false });
  return parsed.isIcann ? parsed.domain : null;
}

/** Node-only detector; inject fetch/time for isolated tests, not provider URLs. */
export function createDomainAnalyzer({
  fetch: fetcher = globalThis.fetch,
  now = Date.now,
}: { fetch?: typeof fetch; now?: () => number } = {}) {
  const guard = createRdapGuard(now);
  const discover = createRdapBootstrap(fetcher, now, guard);
  const inFlight = new Map<string, Promise<DomainAnalysis>>();

  async function lookup(registrableDomain: string, deadline: DomainDeadline): Promise<DomainAnalysis> {
    const { signal } = deadline;
    const service = await discover(registrableDomain);
    if (signal.aborted) return { status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED" };
    if (!service.ok) return { status: "UNAVAILABLE", reason: service.reason };
    const currentTime = now();
    const metadata = await guard.run(service.baseUrl, deadline, () =>
      lookupRegistration(service.baseUrl, registrableDomain, fetcher, currentTime, signal));
    if (!metadata.ok) return { status: "UNAVAILABLE", reason: metadata.reason };
    const domainAgeDays = metadata.registrationDate === null ? null :
      Math.floor((currentTime - Date.parse(metadata.registrationDate)) / DAY_MS);
    const signals: DetectedSignal[] = domainAgeDays !== null && domainAgeDays < NEW_DOMAIN_THRESHOLD_DAYS ? [{
      code: "NEW_DOMAIN",
      category: "DOMAIN",
      title: "Recently registered domain",
      description: `This domain was registered less than ${NEW_DOMAIN_THRESHOLD_DAYS} days ago. A new domain alone does not establish fraud.`,
    }] : [];
    return { status: "COMPLETED", registrableDomain, registrationDate: metadata.registrationDate, domainAgeDays, signals };
  }

  return async (hostname: string): Promise<DomainAnalysis> => {
    const registrableDomain = getRegistrableDomain(hostname);
    if (!registrableDomain) return { status: "NOT_APPLICABLE" };
    const existing = inFlight.get(registrableDomain);
    if (existing) return existing;
    if (inFlight.size >= MAX_PENDING_DOMAINS) return { status: "UNAVAILABLE", reason: "QUEUE_FULL" };
    // Joiners inherit the original lookup's deadline, never extending it.
    const pending = withDomainDeadline<DomainAnalysis>(
      (deadline) => lookup(registrableDomain, deadline),
      { status: "UNAVAILABLE", reason: "DEADLINE_EXCEEDED" },
      now,
    ).finally(() => { inFlight.delete(registrableDomain); });
    inFlight.set(registrableDomain, pending);
    return pending;
  };
}

// One process-local bootstrap cache across calls. No domain responses or
// personal registration data are cached or logged.
export const analyzeDomain = createDomainAnalyzer();
