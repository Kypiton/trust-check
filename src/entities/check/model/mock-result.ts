import type { CheckResult } from "./types";

// Temporary display fixture. Replace at the route boundary when real data exists.
export const mockCheckResult: CheckResult = {
  riskLevel: "HIGH",
  riskScore: 84,
  confidence: "HIGH",
  summary: "This message contains several common signs of phishing.",
  signals: [
    {
      code: "VERIFICATION_CODE_REQUEST",
      title: "Requests a verification code",
      description: "The message asks you to share a one-time verification code.",
    },
    {
      code: "ARTIFICIAL_URGENCY",
      title: "Creates artificial urgency",
      description: "The message pressures you to act immediately.",
    },
    {
      code: "DOMAIN_MISMATCH",
      title: "Domain does not match the claimed bank",
      description: "The link uses a domain unrelated to the organization mentioned.",
    },
  ],
  recommendedActions: [
    { code: "AVOID_LINK", title: "Do not open the link" },
    { code: "PROTECT_CODES", title: "Do not share verification codes" },
    { code: "AVOID_PAYMENT", title: "Do not send money" },
    { code: "CONTACT_BANK", title: "Contact the bank using its official website or phone number" },
  ],
  analysisCoverage: [
    { code: "TEXT", title: "Text analysis", status: "COMPLETED" },
    { code: "URL", title: "URL analysis", status: "COMPLETED" },
    { code: "DOMAIN", title: "Domain analysis", status: "COMPLETED" },
    { code: "REPUTATION", title: "Threat reputation", status: "UNAVAILABLE" },
    { code: "AI_CONTEXT", title: "AI context analysis", status: "COMPLETED" },
  ],
};
