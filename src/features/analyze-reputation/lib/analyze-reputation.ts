import type { DetectedSignal } from "../../../entities/risk";
import type { ReputationAnalysis, ReputationLookup, ReputationProvider } from "../model/types";
import { createGoogleWebRiskProvider } from "../providers/google-web-risk";

/** Reusable freshness check for consumers that wait for other enrichments. */
export function currentReputationAnalysis(analysis: ReputationAnalysis, now = Date.now()): ReputationAnalysis {
  if (analysis.status !== "COMPLETED" || analysis.expiresAt === undefined) return analysis;
  const expiration = Date.parse(analysis.expiresAt);
  if (Number.isFinite(expiration) && expiration > now) return analysis;
  return {
    status: "UNAVAILABLE",
    reason: Number.isFinite(expiration) ? "EXPIRED_RESPONSE" : "INVALID_RESPONSE",
    signals: [],
    source: { code: "THREAT_REPUTATION", status: "FAILED" },
  };
}

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
    return currentReputationAnalysis({
      ...lookup,
      signals,
      source: { code: "THREAT_REPUTATION", status: lookup.status === "UNAVAILABLE" ? "FAILED" : lookup.status },
    }, now());
  };
}

export const analyzeReputation = createReputationAnalyzer();
