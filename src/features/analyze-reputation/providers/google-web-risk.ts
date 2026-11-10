// Node-only adapter: credentials and provider requests must stay on the server.
import { env } from "node:process";
import type { ReputationFailureReason, ReputationLookup, ReputationProvider, ReputationVerdict } from "../model/types";

export const WEB_RISK_TIMEOUT_MS = 3_000;
export const WEB_RISK_MAX_BYTES = 256 * 1_024;

const threatMapping = [
  ["SOCIAL_ENGINEERING", "PHISHING"],
  ["MALWARE", "MALWARE"],
  ["UNWANTED_SOFTWARE", "UNWANTED_SOFTWARE"],
] as const satisfies readonly (readonly [string, ReputationVerdict])[];

function unavailable(reason: ReputationFailureReason): ReputationLookup {
  return { status: "UNAVAILABLE", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseResponse(value: unknown, now: number): ReputationLookup {
  if (!isRecord(value)) return unavailable("INVALID_RESPONSE");
  if (Object.keys(value).length === 0) return { status: "COMPLETED", verdicts: ["CLEAN"] };
  if (!isRecord(value.threat)) return unavailable("INVALID_RESPONSE");
  const { threatTypes, expireTime } = value.threat;
  // Reject the whole response on unknown/malformed threats, including mixed
  // known/unknown lists. Silently dropping them could fabricate a clean result.
  if (!Array.isArray(threatTypes) || threatTypes.length === 0 ||
    threatTypes.some((type: unknown) => !threatMapping.some(([known]) => type === known))) {
    return unavailable("INVALID_RESPONSE");
  }
  let expiresAt: string | undefined;
  if (expireTime !== undefined) {
    // Web Risk specifies an RFC3339 UTC timestamp with up to nine fractional
    // digits. Round-trip the calendar fields to reject dates such as February 30.
    if (typeof expireTime !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(expireTime) ||
      expireTime.startsWith("0000-")) return unavailable("INVALID_RESPONSE");
    const expiration = Date.parse(expireTime);
    if (!Number.isFinite(expiration) || new Date(expiration).toISOString().slice(0, 19) !== expireTime.slice(0, 19)) {
      return unavailable("INVALID_RESPONSE");
    }
    if (expiration <= now) return unavailable("EXPIRED_RESPONSE");
    expiresAt = expireTime;
  }
  const verdicts = threatMapping.filter(([type]) => threatTypes.includes(type)).map(([, verdict]) => verdict);
  return { status: "COMPLETED", verdicts, ...(expiresAt === undefined ? {} : { expiresAt }) };
}

/** Fixed Google Lookup endpoint only. No input URL is ever fetched directly. */
export function createGoogleWebRiskProvider({
  fetch: fetcher = globalThis.fetch,
  apiKey = env.GOOGLE_WEB_RISK_API_KEY,
  now = Date.now,
}: { fetch?: typeof fetch; apiKey?: string; now?: () => number } = {}): ReputationProvider {
  return async (normalizedUrl) => {
    if (!apiKey?.trim()) return { status: "SKIPPED", reason: "MISSING_CONFIGURATION" };
    let submitted: URL;
    try {
      submitted = new URL(normalizedUrl);
      if (submitted.protocol !== "http:" && submitted.protocol !== "https:") return unavailable("INVALID_URL");
      submitted.hash = "";
    } catch {
      return unavailable("INVALID_URL");
    }

    const endpoint = new URL("https://webrisk.googleapis.com/v1/uris:search");
    for (const [type] of threatMapping) endpoint.searchParams.append("threatTypes", type);
    // Lookup sends path/query/userinfo to Google. Only the fragment is removed.
    // Never log this endpoint, the submitted URL, response bodies, or exceptions.
    endpoint.searchParams.set("uri", submitted.href);
    endpoint.searchParams.set("key", apiKey);

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = now();
    const timeout = new Promise<ReputationLookup>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(unavailable("TIMEOUT"));
      }, WEB_RISK_TIMEOUT_MS);
    });

    async function lookup(): Promise<ReputationLookup> {
      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "omit",
          redirect: "manual",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
        return unavailable(controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR");
      }
      const reject = (reason: ReputationFailureReason) => {
        void response.body?.cancel().catch(() => {});
        return unavailable(reason);
      };
      if (controller.signal.aborted) return reject("TIMEOUT");
      if (response.redirected || (response.status >= 300 && response.status < 400)) return reject("REDIRECT");
      if (!response.ok) return reject("HTTP_ERROR");
      const mediaType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (mediaType !== "application/json") return reject("INVALID_RESPONSE");
      const length = response.headers.get("content-length");
      if (length !== null && Number(length) > WEB_RISK_MAX_BYTES) return reject("RESPONSE_TOO_LARGE");
      if (!response.body) return reject("INVALID_RESPONSE");

      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      controller.signal.addEventListener("abort", cancel, { once: true });
      try {
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let body = "";
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) return unavailable("TIMEOUT");
          if (done) break;
          bytes += value.byteLength;
          if (bytes > WEB_RISK_MAX_BYTES) return unavailable("RESPONSE_TOO_LARGE");
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
        return parseResponse(JSON.parse(body) as unknown, now());
      } catch {
        return unavailable(controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE");
      } finally {
        controller.signal.removeEventListener("abort", cancel);
        cancel();
        reader.releaseLock();
      }
    }

    try {
      // Encompasses headers and the entire streaming body, even if fetch ignores
      // abort. An overdue result cannot win merely because timers were delayed.
      const result = await Promise.race([lookup(), timeout]);
      return now() - startedAt >= WEB_RISK_TIMEOUT_MS ? unavailable("TIMEOUT") : result;
    } finally {
      clearTimeout(timer!);
      controller.abort();
    }
  };
}
