import type { CheckAnalysis, RiskLevel } from "../model/types";
import type { SignalCode } from "../../risk/model/types";
import type { AnalysisSourceCode, AnalysisSourceStatus } from "../../confidence/model/types";

// Exhaustive presentation vocabulary; no scoring or provider code is imported.
const signalCodes = {
  ARTIFICIAL_URGENCY: true, CREDENTIAL_REQUEST: true, OTP_REQUEST: true,
  MONEY_REQUEST: true, CRYPTO_PAYMENT: true, GIFT_CARD_PAYMENT: true,
  THREAT_OR_INTIMIDATION: true, UNEXPECTED_REWARD: true, IMPERSONATION: true,
  NO_HTTPS: true, BRAND_IMPERSONATION: true, NEW_DOMAIN: true, LONG_URL: true,
  IP_ADDRESS_URL: true, SHORTENED_URL: true, MULTIPLE_REDIRECTS: true,
  DOMAIN_MISMATCH: true, KNOWN_MALICIOUS_DOMAIN: true, KNOWN_PHISHING_DOMAIN: true,
  KNOWN_MALICIOUS_URL: true, KNOWN_PHISHING_URL: true,
} satisfies Record<SignalCode, true>;
const sourceCodes = {
  TEXT_HEURISTICS: true, URL_STRUCTURE: true, DOMAIN_METADATA: true,
  REDIRECT_ANALYSIS: true, THREAT_REPUTATION: true, AI_CONTEXT: true,
  SCREENSHOT_EXTRACTION: true,
} satisfies Record<AnalysisSourceCode, true>;
const sourceStatuses = { COMPLETED: true, FAILED: true, SKIPPED: true, NOT_APPLICABLE: true } satisfies Record<AnalysisSourceStatus, true>;

function invalid(): never { throw new Error("Saved result is unavailable."); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) return invalid();
  return value;
}
function member<T extends string>(value: unknown, vocabulary: Record<T, true>): T {
  if (typeof value !== "string" || !Object.hasOwn(vocabulary, value)) return invalid();
  return value as T;
}
const levels = { LOW: true, MEDIUM: true, HIGH: true } satisfies Record<RiskLevel, true>;

/** Decode persisted metadata only. Never derive historical scores or confidence. */
export function parsePersistedCheck(value: unknown): Extract<CheckAnalysis, { status: "COMPLETED" | "PARTIAL" }> {
  const row = object(value);
  if (row.status !== "COMPLETED" && row.status !== "PARTIAL") return invalid();
  if (typeof row.riskScore !== "number" || !Number.isInteger(row.riskScore) || row.riskScore < 0 || row.riskScore > 100) return invalid();
  const notes = row.analysisNotes === null ? [] : array(row.analysisNotes).map(text);
  return {
    status: row.status,
    result: {
      riskScore: row.riskScore,
      riskLevel: member(row.riskLevel, levels),
      confidence: member(row.confidence, levels),
      summary: text(row.summary),
      signals: array(row.signals).map(value => {
        const signal = object(value);
        return { code: member(signal.code, signalCodes), title: text(signal.title), description: text(signal.description) };
      }),
      recommendedActions: array(row.recommendedActions).map(value => {
        const action = object(value);
        const code = text(action.code);
        if (!/^[A-Z][A-Z0-9_]*$/.test(code)) return invalid();
        return { code, title: text(action.title) };
      }),
      analysisCoverage: array(row.analysisCoverage).map(value => {
        const source = object(value);
        return { code: member(source.code, sourceCodes), status: member(source.status, sourceStatuses) };
      }),
      ...(notes.length ? { analysisNote: notes.join(" ") } : {}),
    },
  };
}
