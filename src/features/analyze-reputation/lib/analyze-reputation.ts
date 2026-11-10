import type { DetectedSignal } from "../../../entities/risk";
import type { ReputationAnalysis, ReputationLookup, ReputationProvider } from "../model/types";
import { createGoogleWebRiskProvider } from "../providers/google-web-risk";

/** Evidence and coverage only. Final risk/confidence remain pipeline decisions. */
export function createReputationAnalyzer({
  provider = createGoogleWebRiskProvider(),
  now = Date.now,
}: { provider?: ReputationProvider; now?: () => number } = {}) {
  return async (normalizedUrl: string): Promise<ReputationAnalysis> => {
    let lookup: ReputationLookup;
    try {
      lookup = await provider(normalizedUrl);
    } catch {
      // Never propagate provider exceptions that may contain URLs/credentials.
      lookup = { status: "UNAVAILABLE", reason: "NETWORK_ERROR" };
    }
    // Recheck freshness at the point evidence is consumed, not only on receipt.
    if (lookup.status === "COMPLETED" && lookup.expiresAt !== undefined) {
      const expiration = Date.parse(lookup.expiresAt);
      if (!Number.isFinite(expiration)) lookup = { status: "UNAVAILABLE", reason: "INVALID_RESPONSE" };
      else if (expiration <= now()) lookup = { status: "UNAVAILABLE", reason: "EXPIRED_RESPONSE" };
    }
    const signals: DetectedSignal[] = [];
    if (lookup.status === "COMPLETED") {
      if (lookup.verdicts.includes("PHISHING")) signals.push({
        code: "KNOWN_PHISHING_URL",
        category: "REPUTATION",
        title: "Known phishing URL",
        description: "A threat reputation source lists this URL for phishing or social engineering.",
      });
      if (lookup.verdicts.includes("MALWARE")) signals.push({
        code: "KNOWN_MALICIOUS_URL",
        category: "REPUTATION",
        title: "Known malicious URL",
        description: "A threat reputation source lists this URL for malware.",
      });
      // UNWANTED_SOFTWARE remains metadata: no canonical weighted signal yet.
    }
    return {
      ...lookup,
      signals,
      source: { code: "THREAT_REPUTATION", status: lookup.status === "UNAVAILABLE" ? "FAILED" : lookup.status },
    };
  };
}

export const analyzeReputation = createReputationAnalyzer();
