export const MAX_SCREENSHOT_URLS = 10;
const MAX_URL_LENGTH = 2048;

function trimPunctuation(candidate: string): string {
  let previous: string;
  do {
    previous = candidate;
    candidate = candidate.replace(/[.,;]+$/, "");
    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      if (candidate.endsWith(close) && candidate.split(close).length > candidate.split(open).length) {
        candidate = candidate.slice(0, -1);
      }
    }
  } while (candidate !== previous);
  return candidate;
}

/** Pure candidate extraction. Never follows links or invokes URL analysis. */
export function extractUrlsFromText(text: string): string[] {
  const urls = new Set<string>();
  // Only explicit HTTP(S) and www prefixes; bare domains are deliberately omitted.
  const candidates = /(?:https?:\/\/|www\.)[^\s<>"`“”‘’]+/gi;
  for (const match of text.matchAll(candidates)) {
    const preceding = text[match.index - 1];
    // Avoid extracting fragments of emails, other schemes or larger tokens.
    if (preceding && /[\p{L}\p{N}_@./:+-]/u.test(preceding)) continue;
    let candidate = match[0];
    if (candidate.length > MAX_URL_LENGTH || /[\\\u0000-\u001f\u007f]/.test(candidate)) continue;
    if (preceding === "'" && candidate.endsWith("'")) candidate = candidate.slice(0, -1);
    candidate = trimPunctuation(candidate);
    if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
    // URL would otherwise repair malformed forms such as https:///example.com.
    if (/^https?:\/\/(?:[/?#]|$)/i.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      if (url.username || url.password) continue;
      const host = url.hostname.replace(/\.$/, "");
      // Conservative public-looking DNS hosts. Bracketed IPv6 literals are
      // validated by URL; no safety/network verdict is implied by extraction.
      if (!host.startsWith("[") && (host.length > 253 || !host.includes(".") ||
        host.split(".").some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))) continue;
      urls.add(url.href);
      if (urls.size === MAX_SCREENSHOT_URLS) break;
    } catch {
      // Malformed candidates are ordinary OCR noise.
    }
  }
  return [...urls];
}
