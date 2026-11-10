import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { parse } from "tldts";
import { safeHttp } from "../../../shared/server/safe-http";
import { MAX_SAFE_HTTP_URL_LENGTH } from "../../../shared/server/safe-http/safe-http";
import { detectShortenedUrl } from "../../analyze-url/lib/detectors";
import type { RedirectAnalysis, RedirectFailureReason, RedirectHop, RedirectStatusCode } from "../model/types";

export const MAX_REDIRECT_HOPS = 5;
export const REDIRECT_ANALYSIS_DEADLINE_MS = 6_000;

function isRedirect(status: number): status is RedirectStatusCode {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}
function unavailable(reason: RedirectFailureReason): RedirectAnalysis {
  // Incomplete chains yield no weighted evidence or misleading final URL.
  return { status: "UNAVAILABLE", reason, signals: [] };
}
function normalizedUrl(value: string, base?: URL): URL {
  const url = new URL(value, base);
  url.hash = "";
  return url;
}
function hostnameKey(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}
function domainKey(url: URL): string {
  const hostname = hostnameKey(url);
  // Include private PSL suffixes here: separate hosting tenants are different
  // destinations. RDAP intentionally uses the ICANN registration boundary.
  const domain = parse(hostname, { allowPrivateDomains: true });
  return (domain.isIcann || domain.isPrivate) && domain.domain ? domain.domain : hostname;
}
function hop(from: URL, to: URL, statusCode: RedirectStatusCode): RedirectHop {
  return {
    from: from.href, to: to.href, statusCode,
    fromHostname: from.hostname, toHostname: to.hostname,
    crossDomain: domainKey(from) !== domainKey(to),
    protocolDowngrade: from.protocol === "https:" && to.protocol === "http:",
    targetIsIp: isIP(to.hostname.replace(/^\[|\]$/g, "")) !== 0,
    // Reuse the configured local shortener detector only for host recognition;
    // its SHORTENED_URL signal is not emitted by redirect analysis.
    shortenedLinkDestinationChange: hostnameKey(from) !== hostnameKey(to) && detectShortenedUrl({
      hostname: from.hostname, protocol: from.protocol, normalizedUrl: from.href,
    }) !== null,
  };
}

/** Sequential HTTP metadata only. All networking belongs to safe-http. */
export function createRedirectAnalyzer({
  request = safeHttp,
  now = () => performance.now(),
}: { request?: typeof safeHttp; now?: () => number } = {}) {
  return async (input: string): Promise<RedirectAnalysis> => {
    if (typeof input !== "string" || input.length > MAX_SAFE_HTTP_URL_LENGTH) return unavailable("INVALID_URL");
    let current: URL;
    try { current = normalizedUrl(input); } catch { return unavailable("INVALID_URL"); }
    const initialUrl = current.href;
    const visited = new Set([current.href]);
    const hops: RedirectHop[] = [];
    const controller = new AbortController();
    const expiresAt = now() + REDIRECT_ANALYSIS_DEADLINE_MS;
    const expired = () => controller.signal.aborted || now() >= expiresAt;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<RedirectAnalysis>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(unavailable("DEADLINE_EXCEEDED"));
      }, REDIRECT_ANALYSIS_DEADLINE_MS);
    });

    async function follow(): Promise<RedirectAnalysis> {
      // Preserve the raw first input for safe-http's strict validation, so URL
      // normalization cannot silently repair an otherwise rejected input.
      let nextRequest = input;
      let pendingHop: RedirectHop | undefined;
      while (true) {
        if (expired()) return unavailable("DEADLINE_EXCEEDED");
        const response = await request(nextRequest, controller.signal);
        if (expired()) return unavailable("DEADLINE_EXCEEDED");
        if (!response.ok) return unavailable(response.reason);
        if (pendingHop) hops.push(pendingHop);
        if (!isRedirect(response.statusCode)) {
          return {
            status: "COMPLETED", initialUrl, finalUrl: current.href, hops,
            signals: hops.length >= 2 ? [{
              code: "MULTIPLE_REDIRECTS", category: "REDIRECT",
              title: "Multiple HTTP redirects",
              description: "The link followed two or more HTTP redirects before reaching its final destination. Redirects alone do not establish malicious intent.",
            }] : [],
          };
        }
        // Five followed redirects permits six requests (initial + five targets).
        // A redirect on that sixth response would require a forbidden sixth hop.
        if (hops.length >= MAX_REDIRECT_HOPS) return unavailable("TOO_MANY_REDIRECTS");
        if (response.location === undefined || response.location === "") return unavailable("MISSING_LOCATION");
        // Do not let URL's permissive parser hide controls/backslashes from
        // safe-http validation. Every resolved target still uses safe-http.
        if (typeof response.location !== "string" || response.location.length > MAX_SAFE_HTTP_URL_LENGTH ||
          /[\s\\]/.test(response.location) || /[\u0000-\u001f\u007f]/.test(response.location)) return unavailable("INVALID_LOCATION");
        let next: URL;
        try { next = normalizedUrl(response.location, current); } catch { return unavailable("INVALID_LOCATION"); }
        if (visited.has(next.href)) return unavailable("REDIRECT_LOOP");
        pendingHop = hop(current, next, response.statusCode);
        visited.add(next.href);
        current = next;
        nextRequest = next.href;
      }
    }

    try {
      const result = await Promise.race([follow(), deadline]);
      return expired() ? unavailable("DEADLINE_EXCEEDED") : result;
    } finally {
      clearTimeout(timer!);
      controller.abort();
    }
  };
}

export const analyzeRedirect = createRedirectAnalyzer();
