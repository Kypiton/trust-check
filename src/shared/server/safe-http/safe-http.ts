import { request as httpRequest, type ClientRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { performance } from "node:perf_hooks";
import { checkServerIdentity } from "node:tls";
import { isPublicAddress } from "./ip-policy";
import { resolveAddresses, type ResolveAddresses, type ResolvedAddress } from "./dns";

export const MAX_SAFE_HTTP_CONCURRENCY = 5;
export const MAX_SAFE_HTTP_QUEUE = 50;
export const SAFE_HTTP_TIMEOUT_MS = 3_000;
export const MAX_SAFE_HTTP_URL_LENGTH = 2_048;
export const MAX_SAFE_HTTP_HEADER_BYTES = 16 * 1_024;

export type SafeHttpFailureReason =
  | "INVALID_URL" | "UNSUPPORTED_PROTOCOL" | "CREDENTIALS_NOT_ALLOWED"
  | "PORT_NOT_ALLOWED" | "BLOCKED_HOST" | "BLOCKED_IP" | "DNS_FAILED"
  | "TIMEOUT" | "NETWORK_ERROR" | "QUEUE_FULL";
export type SafeHttpResult =
  | { ok: true; statusCode: number; location?: string; resolvedAddress: string; hostname: string }
  | { ok: false; reason: SafeHttpFailureReason };

// Internal injection seam for deterministic tests, not user request options.
type RequestTransport = (options: RequestOptions, onResponse: (response: IncomingMessage) => void) => ClientRequest;
type Dependencies = { resolve?: ResolveAddresses; httpRequest?: RequestTransport; httpsRequest?: RequestTransport; now?: () => number };
const failure = (reason: SafeHttpFailureReason): SafeHttpResult => ({ ok: false, reason });

function parse(input: unknown): URL | SafeHttpResult {
  if (typeof input !== "string" || !input || input.length > MAX_SAFE_HTTP_URL_LENGTH ||
    /[\s\\]/.test(input) || /[\u0000-\u001f\u007f]/.test(input)) return failure("INVALID_URL");
  let url: URL;
  try { url = new URL(input); } catch { return failure("INVALID_URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") return failure("UNSUPPORTED_PROTOCOL");
  // Require an explicit, unambiguous authority rather than accepting URL's
  // permissive repairs of inputs such as 'http:example.com' or 'http:///host'.
  if (!/^https?:\/\/[^/?#]/i.test(input)) return failure("INVALID_URL");
  if (url.username || url.password) return failure("CREDENTIALS_NOT_ALLOWED");
  // URL canonicalizes explicit :80/:443 to an empty port for the matching scheme.
  if (url.port) return failure("PORT_NOT_ALLOWED");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // Explicitly disallow local-only suffixes and single-label DNS search names.
  // Strip the absolute DNS dot only for policy comparison, never for transport.
  if (host === "localhost" || host.endsWith(".localhost") ||
    host === "metadata.google.internal" || host === "metadata.amazonaws.com" ||
    host === "local" || host.endsWith(".local") || host === "internal" || host.endsWith(".internal") ||
    (!host.includes(".") && !host.startsWith("["))) return failure("BLOCKED_HOST");
  const literal = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (!isIP(literal) && (host.length > 253 || host.split(".").some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))) {
    return failure("INVALID_URL");
  }
  url.hash = "";
  if (url.href.length > MAX_SAFE_HTTP_URL_LENGTH) return failure("INVALID_URL");
  return url;
}

/** Node-only, headers-only GET. No redirects, retries, cookies, pooling or logs. */
export function createSafeHttp({
  resolve: resolveDns = resolveAddresses,
  httpRequest: requestHttp = httpRequest,
  httpsRequest: requestHttps = httpsRequest,
  now = () => performance.now(),
}: Dependencies = {}) {
  let active = 0;
  type Release = () => void;
  const queue: { grant: () => void }[] = [];

  function release() {
    active -= 1;
    queue.shift()?.grant();
  }
  function acquire(signal: AbortSignal): Promise<Release | null> {
    if (signal.aborted) return Promise.resolve(null);
    if (active < MAX_SAFE_HTTP_CONCURRENCY) {
      active += 1;
      return Promise.resolve(release);
    }
    return new Promise((resolve) => {
      const waiter = { grant: () => {
        signal.removeEventListener("abort", cancel);
        active += 1;
        resolve(release);
      } };
      const cancel = () => {
        const index = queue.indexOf(waiter);
        if (index !== -1) queue.splice(index, 1);
        resolve(null);
      };
      signal.addEventListener("abort", cancel, { once: true });
      queue.push(waiter);
    });
  }

  function headers(url: URL, pinned: ResolvedAddress, signal: AbortSignal, expired: () => boolean): Promise<SafeHttpResult> {
    return new Promise((resolve) => {
      let request: ClientRequest | undefined;
      let settled = false;
      const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
      const finish = (result: SafeHttpResult) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        request?.destroy();
        resolve(expired() ? failure("TIMEOUT") : result);
      };
      const abort = () => finish(failure("TIMEOUT"));
      if (expired()) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      // This callback NEVER resolves a name. Copy values before entering the
      // transport so neither changing DNS answers nor resolver-owned objects can
      // alter the connection target after validation. Handle both Node shapes.
      const { address, family } = pinned;
      const lookup: LookupFunction = (_host, options, callback) => {
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      };
      // Node passes TCP connection options through; @types/node 20's HTTP
      // RequestOptions does not yet declare this supported net option.
      const options: RequestOptions & { autoSelectFamily: boolean } = {
        protocol: url.protocol,
        hostname,
        port: url.protocol === "https:" ? 443 : 80,
        path: url.pathname + url.search,
        method: "GET",
        headers: { Host: url.host, "Accept-Encoding": "identity", "User-Agent": "TrustCheck/1.0", Connection: "close" },
        lookup,
        family,
        autoSelectFamily: false,
        agent: false,
        maxHeaderSize: MAX_SAFE_HTTP_HEADER_BYTES,
        insecureHTTPParser: false,
        ...(url.protocol === "https:" ? {
          servername: isIP(hostname) ? "" : hostname,
          rejectUnauthorized: true,
          checkServerIdentity: (_name, cert) => checkServerIdentity(hostname, cert),
        } : {}),
      };
      try {
        request = (url.protocol === "https:" ? requestHttps : requestHttp)(options, (response) => {
          // Do not attach data listeners, read, resume or decompress the body.
          // Destroy even a late response after a timeout. No Location is followed.
          response.on("error", () => {});
          const statusCode = response.statusCode;
          const location = response.headers.location;
          if (!statusCode || statusCode < 200 || statusCode > 599 ||
            (location !== undefined && typeof location !== "string")) {
            finish(failure("NETWORK_ERROR"));
          } else {
            finish({ ok: true, statusCode, ...(location === undefined ? {} : { location }), resolvedAddress: address, hostname });
          }
          // finish marks the result settled before destroying the request, so
          // teardown's close/error events cannot replace successful metadata.
          response.destroy();
        });
        request.on("error", () => finish(failure("NETWORK_ERROR")));
        request.on("close", () => finish(failure("NETWORK_ERROR")));
        // Unsolicited protocol upgrades hand off a socket instead of a normal
        // response. Close it immediately rather than leaving it unowned.
        request.on("upgrade", (_response, socket) => { socket.destroy(); finish(failure("NETWORK_ERROR")); });
        if (settled) request.destroy();
        else request.end();
      } catch {
        finish(failure("NETWORK_ERROR"));
      }
    });
  }

  return async (input: unknown): Promise<SafeHttpResult> => {
    const parsed = parse(input);
    if (!(parsed instanceof URL)) return parsed;
    if (active >= MAX_SAFE_HTTP_CONCURRENCY && queue.length >= MAX_SAFE_HTTP_QUEUE) return failure("QUEUE_FULL");
    const controller = new AbortController();
    const expiresAt = now() + SAFE_HTTP_TIMEOUT_MS;
    const expired = () => controller.signal.aborted || now() >= expiresAt;
    let timer: ReturnType<typeof setTimeout>;
    let slot: Release | null = null;
    const timeout = new Promise<SafeHttpResult>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(failure("TIMEOUT")); }, SAFE_HTTP_TIMEOUT_MS);
    });
    async function run(): Promise<SafeHttpResult> {
      slot = await acquire(controller.signal);
      if (!slot || expired()) return failure("TIMEOUT");
      const url = parsed as URL;
      const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
      const family = isIP(hostname);
      let candidates: readonly ResolvedAddress[];
      try {
        candidates = family ? [{ address: hostname, family: family as 4 | 6 }] : await resolveDns(hostname, controller.signal);
      } catch {
        return expired() ? failure("TIMEOUT") : failure("DNS_FAILED");
      }
      if (expired()) return failure("TIMEOUT");
      if (!Array.isArray(candidates) || !candidates.length) return failure("DNS_FAILED");
      for (const candidate of candidates) {
        if (!candidate || typeof candidate.address !== "string" ||
          isIP(candidate.address) !== candidate.family || (candidate.family !== 4 && candidate.family !== 6)) return failure("DNS_FAILED");
        if (!isPublicAddress(candidate.address)) return failure("BLOCKED_IP");
      }
      const pinned = { address: candidates[0].address, family: candidates[0].family };
      return headers(url, pinned, controller.signal, expired);
    }
    try {
      const result = await Promise.race([run(), timeout]);
      return expired() ? failure("TIMEOUT") : result;
    } catch {
      return failure("NETWORK_ERROR");
    } finally {
      clearTimeout(timer!);
      controller.abort();
      // Abort/destroy before releasing capacity. Late DNS completions see the
      // aborted signal and cannot start a request after their slot was released.
      if (slot) (slot as Release)();
    }
  };
}

// Shared process-local admission limit; factories exist for isolated tests.
export const safeHttp = createSafeHttp();
