export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type SignalCode =
  | "ARTIFICIAL_URGENCY"
  | "CREDENTIAL_REQUEST"
  | "OTP_REQUEST"
  | "MONEY_REQUEST"
  | "CRYPTO_PAYMENT"
  | "GIFT_CARD_PAYMENT"
  | "THREAT_OR_INTIMIDATION"
  | "UNEXPECTED_REWARD"
  | "IMPERSONATION"
  | "NO_HTTPS"
  | "BRAND_IMPERSONATION"
  | "NEW_DOMAIN"
  | "LONG_URL"
  | "IP_ADDRESS_URL"
  | "SHORTENED_URL"
  | "MULTIPLE_REDIRECTS"
  | "DOMAIN_MISMATCH"
  | "KNOWN_MALICIOUS_DOMAIN"
  | "KNOWN_PHISHING_DOMAIN"
  | "KNOWN_MALICIOUS_URL"
  | "KNOWN_PHISHING_URL";

export type SignalCategory =
  | "TEXT"
  | "URL"
  | "DOMAIN"
  | "REPUTATION"
  | "REDIRECT"
  | "SCREENSHOT"
  | "AI";

// Detectors supply evidence, never scoring weights.
export type DetectedSignal = {
  readonly code: SignalCode;
  readonly title: string;
  readonly description: string;
  readonly category: SignalCategory;
};

export type ScoredSignal = DetectedSignal & { readonly weight: number };

export type RiskCalculation = {
  score: number;
  level: RiskLevel;
  scoredSignals: ScoredSignal[];
};
