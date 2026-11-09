import { isIP } from "node:net";
import type { DetectedSignal } from "../../../entities/risk";

export type UrlEvidence = {
  readonly protocol: string;
  readonly hostname: string;
  readonly normalizedUrl: string;
};

type UrlDetector = (url: UrlEvidence) => DetectedSignal | null;

// Length of the standard parser's serialized URL, including path/query/fragment.
// This is a weak structural heuristic, not a claim that long URLs are malicious.
export const LONG_URL_THRESHOLD = 200;

const shortenerHosts = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
  "is.gd", "buff.ly", "cutt.ly", "tiny.cc",
]);

// Deliberately small MVP allowlist, not a public-suffix or brand-ownership database.
const brands = [
  { tokens: ["paypal", "paypa1"], domains: ["paypal.com"] },
  { tokens: ["apple"], domains: ["apple.com"] },
  { tokens: ["microsoft", "micros0ft"], domains: ["microsoft.com", "live.com"] },
  { tokens: ["google", "g00gle"], domains: ["google.com"] },
  { tokens: ["amazon"], domains: ["amazon.com"] },
  { tokens: ["facebook"], domains: ["facebook.com"] },
  { tokens: ["instagram"], domains: ["instagram.com"] },
  { tokens: ["whatsapp"], domains: ["whatsapp.com"] },
  { tokens: ["telegram"], domains: ["telegram.org"] },
  { tokens: ["netflix"], domains: ["netflix.com"] },
] as const;

function comparisonHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

export function detectNoHttps(url: UrlEvidence): DetectedSignal | null {
  return url.protocol === "http:" ? {
    code: "NO_HTTPS",
    category: "URL",
    title: "Does not use HTTPS",
    description: "The URL uses HTTP rather than HTTPS. This alone does not establish malicious intent.",
  } : null;
}

export function detectIpAddressUrl(url: UrlEvidence): DetectedSignal | null {
  // WHATWG URL.hostname includes brackets around IPv6 literals. isIP only
  // validates the address string; it performs no DNS lookup or network access.
  const address = url.hostname.replace(/^\[|\]$/g, "");
  return isIP(address) !== 0 ? {
    code: "IP_ADDRESS_URL",
    category: "URL",
    title: "Uses an IP address",
    description: "The URL uses an IP address instead of a domain name.",
  } : null;
}

export function detectLongUrl(url: UrlEvidence): DetectedSignal | null {
  return url.normalizedUrl.length >= LONG_URL_THRESHOLD ? {
    code: "LONG_URL",
    category: "URL",
    title: "Unusually long URL",
    description: "The normalized URL is at least 200 characters long. Length alone does not establish malicious intent.",
  } : null;
}

export function detectShortenedUrl(url: UrlEvidence): DetectedSignal | null {
  // Only exact configured hosts (plus a leading www.) qualify. Arbitrary
  // subdomains are not assumed to provide a shortening service.
  return shortenerHosts.has(comparisonHostname(url.hostname)) ? {
    code: "SHORTENED_URL",
    category: "URL",
    title: "Uses a URL shortener",
    description: "The hostname matches a configured URL shortening service. Its destination has not been checked.",
  } : null;
}

export function detectBrandImpersonation(url: UrlEvidence): DetectedSignal | null {
  const hostname = comparisonHostname(url.hostname);
  // Dot/hyphen boundaries avoid matches inside words such as pineapple.
  // Punycode labels are intentionally excluded; Unicode lookalikes are out of scope.
  const tokens = new Set(hostname.split(".").filter((label) => !label.startsWith("xn--")).flatMap((label) => label.split("-")));
  const suspicious = brands.some((brand) =>
    brand.tokens.some((token) => tokens.has(token)) &&
    !brand.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)),
  );
  return suspicious ? {
    code: "BRAND_IMPERSONATION",
    category: "URL",
    title: "Resembles a known brand domain",
    description: "The hostname includes a recognizable brand token outside that brand's configured official domains. The site's identity has not been verified.",
  } : null;
}

const urlDetectors: readonly UrlDetector[] = [
  detectNoHttps,
  detectIpAddressUrl,
  detectLongUrl,
  detectShortenedUrl,
  detectBrandImpersonation,
];

export function detectUrlSignals(url: UrlEvidence): DetectedSignal[] {
  return urlDetectors.flatMap((detect) => {
    const signal = detect(url);
    return signal ? [signal] : [];
  });
}
