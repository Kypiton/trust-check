export const RDAP_TIMEOUT_MS = 4_000;
export const MAX_JSON_BYTES = 1_048_576;

export type RequestFailure =
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "REDIRECT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE";

type JsonResult = { ok: true; data: unknown } | { ok: false; reason: RequestFailure };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Internal transport: callers supply only the fixed IANA URL or a discovered
// RDAP query. This is intentionally not exported from the feature's public API.
export async function requestRdapJson(url: URL, fetcher: typeof fetch): Promise<JsonResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<JsonResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: "TIMEOUT" });
    }, RDAP_TIMEOUT_MS);
  });

  async function read(): Promise<JsonResult> {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/rdap+json, application/json" },
        credentials: "omit",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR" };
    }

    const reject = (reason: RequestFailure): JsonResult => {
      void response.body?.cancel().catch(() => {});
      return { ok: false, reason };
    };
    if (controller.signal.aborted) return reject("TIMEOUT");
    // Never follow Location or RDAP links, including same-origin redirects.
    if (response.redirected || (response.status >= 300 && response.status < 400)) return reject("REDIRECT");
    if (!response.ok) return reject("HTTP_ERROR");
    const mediaType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (mediaType !== "application/json" && mediaType !== "application/rdap+json") return reject("INVALID_RESPONSE");
    const length = response.headers.get("content-length");
    if (length !== null && Number(length) > MAX_JSON_BYTES) return reject("RESPONSE_TOO_LARGE");
    if (!response.body) return reject("INVALID_RESPONSE");

    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0;
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) return { ok: false, reason: "TIMEOUT" };
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_JSON_BYTES) return { ok: false, reason: "RESPONSE_TOO_LARGE" };
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      try {
        return { ok: true, data: JSON.parse(text) as unknown };
      } catch {
        return { ok: false, reason: "INVALID_RESPONSE" };
      }
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "TIMEOUT" : "INVALID_RESPONSE" };
    } finally {
      controller.signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  }

  try {
    // Covers both response headers and streaming the body, even for an adapter
    // that fails to reject promptly when aborted.
    return await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}
