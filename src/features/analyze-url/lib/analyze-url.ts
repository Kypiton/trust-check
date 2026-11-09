import { isIP } from "node:net";
import { calculateRisk, type DetectedSignal, type RiskCalculation } from "../../../entities/risk";
import { detectUrlSignals } from "./detectors";

export type UrlAnalysis =
  | {
      valid: true;
      normalizedUrl: string;
      hostname: string;
      signals: DetectedSignal[];
      risk: RiskCalculation;
    }
  | { valid: false; error: "INVALID_URL" };

function parseUrl(rawUrl: unknown): URL | null {
  if (typeof rawUrl !== "string") return null;
  const input = rawUrl.trim();
  // Reject ambiguous syntax rather than allowing URL to silently discard
  // controls or reinterpret backslashes. Encoded path/query characters remain valid.
  if (!input || /[\s\\]/.test(input) || [...input].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;

  const explicitHttp = /^https?:\/\//i.test(input);
  if (!explicitHttp) {
    // Permit normal bare domains with ports, but never reinterpret another
    // scheme (javascript:, data:, ftp:, etc.) as an HTTPS address.
    const domainWithPort = /^[^/?#:@]+\.[^/?#:@]+:\d+(?:[/?#]|$)/.test(input);
    if (/^[a-z][a-z\d+.-]*:/i.test(input) && !domainWithPort) return null;
    if (/^[/?#]/.test(input)) return null;
  } else if (/^https?:\/\/(?:[/?#]|$)/i.test(input)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(explicitHttp ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname) return null;
  // The standard parser handles IP normalization, ports and IDNA. These checks
  // only reject malformed DNS labels and bare words mistaken for domain input.
  const ip = isIP(hostname.replace(/^\[|\]$/g, "")) !== 0;
  if (!ip) {
    const labels = hostname.split(".");
    if (hostname.length > 253 || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
    if (!explicitHttp && labels.length < 2) return null;
  }
  // An email-like bare input is not a domain URL. Explicit HTTP(S) userinfo is
  // parsed normally, and only the actual destination hostname is analyzed.
  if (!explicitHttp && (url.username || url.password)) return null;
  return url;
}

/** Parsing only: no fetching, DNS, redirects, reputation checks or URL execution. */
export function analyzeUrl(rawUrl: unknown): UrlAnalysis {
  const url = parseUrl(rawUrl);
  if (!url) return { valid: false, error: "INVALID_URL" };

  const normalizedUrl = url.href;
  // Keep parser serialization intact, including www and any absolute DNS dot;
  // the separate analysis hostname ignores only case and a single trailing dot.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const signals = detectUrlSignals({ protocol: url.protocol, normalizedUrl, hostname });
  return { valid: true, normalizedUrl, hostname, signals, risk: calculateRisk(signals) };
}
