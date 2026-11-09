import type {
  DetectedSignal,
  RiskCalculation,
  ScoredSignal,
  SignalCode,
} from "../model/types";

// Canonical MVP weights from docs/risk-engine.md. Owned only by this engine.
const SIGNAL_WEIGHTS = Object.freeze({
  ARTIFICIAL_URGENCY: 10,
  CREDENTIAL_REQUEST: 30,
  OTP_REQUEST: 35,
  MONEY_REQUEST: 20,
  CRYPTO_PAYMENT: 20,
  GIFT_CARD_PAYMENT: 30,
  THREAT_OR_INTIMIDATION: 15,
  UNEXPECTED_REWARD: 10,
  IMPERSONATION: 20,
  NO_HTTPS: 10,
  BRAND_IMPERSONATION: 20,
  NEW_DOMAIN: 15,
  LONG_URL: 5,
  IP_ADDRESS_URL: 20,
  SHORTENED_URL: 10,
  MULTIPLE_REDIRECTS: 10,
  DOMAIN_MISMATCH: 30,
  KNOWN_MALICIOUS_DOMAIN: 50,
  KNOWN_PHISHING_DOMAIN: 50,
} satisfies Record<SignalCode, number>);

/** Scores validated detector signals; coverage and confidence belong to the pipeline. */
export function calculateRisk(signals: readonly DetectedSignal[]): RiskCalculation {
  const seen = new Set<SignalCode>();
  const scoredSignals: ScoredSignal[] = [];
  let total = 0;

  for (const signal of signals) {
    if (seen.has(signal.code)) continue;
    seen.add(signal.code);

    const weight = SIGNAL_WEIGHTS[signal.code];
    total += weight;
    // Keep the first explanation, copy it, and always attach the canonical weight.
    scoredSignals.push({
      code: signal.code,
      title: signal.title,
      description: signal.description,
      category: signal.category,
      weight,
    });
  }

  const knownMalicious =
    seen.has("KNOWN_MALICIOUS_DOMAIN") || seen.has("KNOWN_PHISHING_DOMAIN");
  const score = Math.min(100, knownMalicious ? Math.max(95, total) : total);
  const level = score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

  return { score, level, scoredSignals };
}
