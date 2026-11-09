import { calculateConfidence, type AnalysisSource } from "../../confidence";
import type { CheckResult } from "./types";

const mockCoverage: AnalysisSource[] = [
  { code: "TEXT_HEURISTICS", status: "COMPLETED" },
  { code: "URL_STRUCTURE", status: "COMPLETED" },
  { code: "DOMAIN_METADATA", status: "COMPLETED" },
  { code: "THREAT_REPUTATION", status: "FAILED" },
  { code: "AI_CONTEXT", status: "COMPLETED" },
];
const basicCoverage: AnalysisSource[] = [
  { code: "TEXT_HEURISTICS", status: "COMPLETED" },
  { code: "URL_STRUCTURE", status: "COMPLETED" },
];

// Temporary display fixture. Replace at the route boundary when real data exists.
export const mockCheckResult: CheckResult = {
  riskLevel: "HIGH",
  riskScore: 84,
  confidence: calculateConfidence({ sources: mockCoverage, signals: [
    { code: "OTP_REQUEST" }, { code: "ARTIFICIAL_URGENCY" }, { code: "DOMAIN_MISMATCH" },
  ] }).level,
  summary: "This message contains several common signs of phishing.",
  signals: [
    {
      code: "OTP_REQUEST",
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
  analysisCoverage: mockCoverage,
};

// Temporary preview selection only; no IDs are generated and no data is fetched.
// Only explicit preview IDs are supported; unknown IDs have no assessment.
export function getMockAnalysis(id: string): import("./types").CheckAnalysis | null {
  const completedCoverage = mockCheckResult.analysisCoverage.map((check) => ({
    ...check,
    status: "COMPLETED" as const,
  }));

  switch (id) {
    case "loading":
      return {
        status: "ANALYZING",
        steps: [
          { code: "READ", title: "Reading message", status: "COMPLETED" },
          { code: "LINKS", title: "Detecting links", status: "COMPLETED" },
          { code: "DOMAIN", title: "Checking domain", status: "CURRENT" },
          { code: "REPUTATION", title: "Checking reputation", status: "PENDING" },
          { code: "RISK", title: "Evaluating risk", status: "PENDING" },
        ],
      };
    case "error":
      return { status: "FAILED" };
    case "insufficient":
      return { status: "INSUFFICIENT_DATA" };
    case "partial":
      return { status: "PARTIAL", result: mockCheckResult };
    case "low":
      return {
        status: "COMPLETED",
        result: {
          riskLevel: "LOW",
          riskScore: 18,
          confidence: calculateConfidence({ sources: basicCoverage, signals: [] }).level,
          summary: "No strong signs of fraud were detected.",
          signals: [
            { code: "NO_SENSITIVE_REQUEST", title: "No request for sensitive information", description: "The message does not ask for passwords, verification codes or payment details." },
            { code: "NO_URGENCY", title: "No pressure to act immediately", description: "The message does not use urgent deadlines or threats." },
          ],
          recommendedActions: [
            { code: "VERIFY_SENDER", title: "Verify the sender before sharing personal information" },
            { code: "USE_OFFICIAL_CHANNELS", title: "Use the organization’s official website if you are unsure" },
          ],
          analysisCoverage: basicCoverage,
        },
      };
    case "medium":
      return {
        status: "COMPLETED",
        result: {
          riskLevel: "MEDIUM",
          riskScore: 46,
          confidence: calculateConfidence({ sources: basicCoverage, signals: [] }).level,
          summary: "Some suspicious signs were detected.",
          signals: [
            { code: "UNEXPECTED_REQUEST", title: "Unexpected request to take action", description: "The message asks you to follow a link without clearly explaining why." },
            { code: "UNCLEAR_SENDER", title: "Sender identity is unclear", description: "The message does not provide enough context to confirm who sent it." },
          ],
          recommendedActions: [
            { code: "VERIFY_REQUEST", title: "Confirm the request through an official contact channel" },
            { code: "PAUSE", title: "Avoid sharing sensitive information until you have verified the sender" },
          ],
          analysisCoverage: basicCoverage,
        },
      };
    case "high":
      return {
        status: "COMPLETED",
        result: { ...mockCheckResult, analysisCoverage: completedCoverage, confidence: calculateConfidence({ sources: completedCoverage, signals: [] }).level },
      };
    default:
      return null;
  }
}
