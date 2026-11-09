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

function isSignalCode(code: unknown): code is SignalCode {
  return typeof code === "string" && Object.hasOwn(SIGNAL_WEIGHTS, code);
}

/** Scores validated detector signals; coverage and confidence belong to the pipeline. */
export function calculateRisk(signals: readonly DetectedSignal[]): RiskCalculation {
  // Types protect callers at compile time; adapters can still supply malformed
  // runtime data. Reject the entire calculation rather than inventing LOW risk.
  if (!Array.isArray(signals)) throw new TypeError("Invalid risk evidence.");
  const seen = new Set<SignalCode>();
  const scoredSignals: ScoredSignal[] = [];
  let total = 0;

  for (const signal of signals) {
    const code: unknown = signal !== null && typeof signal === "object" ? signal.code : undefined;
    if (!isSignalCode(code)) {
      throw new TypeError("Invalid risk evidence.");
    }
    if (seen.has(code)) continue;
    seen.add(code);

    const weight = SIGNAL_WEIGHTS[code];
    total += weight;
    // Keep the first explanation, copy it, and always attach the canonical weight.
    scoredSignals.push({
      code,
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
