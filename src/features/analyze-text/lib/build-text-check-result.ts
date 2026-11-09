import { calculateConfidence, type AnalysisSource } from "../../../entities/confidence";
import type { CheckAnalysis, CheckResult, RecommendedAction } from "../../../entities/check/model/types";
import type { DetectedSignal, RiskLevel, SignalCode } from "../../../entities/risk";
import { analyzeText, type TextAnalysis } from "./analyze-text";

export type TextCheckResponse =
  | { ok: false; error: string }
  | { ok: true; analysis: Exclude<CheckAnalysis, { status: "ANALYZING" }> };

const summaries: Record<RiskLevel, string> = {
  LOW: "No strong signs of fraud were detected.",
  MEDIUM: "Some suspicious signs were detected.",
  HIGH: "This message contains several signs commonly associated with scams or phishing.",
};

const verifyPressure: RecommendedAction = {
  code: "VERIFY_PRESSURE",
  title: "Do not act under pressure; verify the claim independently",
};
const actionsBySignal: Partial<Record<SignalCode, RecommendedAction>> = {
  OTP_REQUEST: { code: "PROTECT_CODES", title: "Do not share verification codes" },
  CREDENTIAL_REQUEST: { code: "PROTECT_CREDENTIALS", title: "Do not share passwords or login credentials" },
  MONEY_REQUEST: { code: "VERIFY_PAYMENT", title: "Do not send money until the request is independently verified" },
  GIFT_CARD_PAYMENT: { code: "AVOID_GIFT_CARDS", title: "Do not purchase or share gift card codes" },
  CRYPTO_PAYMENT: { code: "VERIFY_CRYPTO_RECIPIENT", title: "Do not send cryptocurrency until the recipient is independently verified" },
  IMPERSONATION: { code: "CONTACT_ORGANIZATION", title: "Contact the organization through its official website or phone number" },
  THREAT_OR_INTIMIDATION: verifyPressure,
  ARTIFICIAL_URGENCY: verifyPressure,
  UNEXPECTED_REWARD: { code: "VERIFY_REWARD", title: "Verify the reward independently before sharing information or paying a fee" },
};

export function buildTextRecommendations(signals: readonly DetectedSignal[]): RecommendedAction[] {
  const actions = new Map<string, RecommendedAction>();
  for (const signal of signals) {
    const action = actionsBySignal[signal.code];
    if (action) actions.set(action.code, { ...action });
  }
  if (!actions.size) {
    actions.set("VERIFY_REQUESTS", {
      code: "VERIFY_REQUESTS",
      title: "Verify unexpected requests independently before sharing sensitive information",
    });
  }
  return [...actions.values()];
}

export function mapTextCheckResult(analysis: TextAnalysis): CheckResult {
  const analysisCoverage: AnalysisSource[] = [
    { code: "TEXT_HEURISTICS", status: "COMPLETED" },
  ];
  const confidence = calculateConfidence({ sources: analysisCoverage, signals: analysis.signals });
  return {
    riskLevel: analysis.risk.level,
    riskScore: analysis.risk.score,
    confidence: confidence.level,
    summary: summaries[analysis.risk.level],
    analysisNote: "Text analysis currently supports English only.",
    signals: analysis.signals.map(({ code, title, description }) => ({ code, title, description })),
    recommendedActions: buildTextRecommendations(analysis.signals),
    analysisCoverage,
  };
}

/** Validates untrusted input and returns display data without retaining the message. */
export function buildTextCheckResult(value: unknown): TextCheckResponse {
  if (typeof value !== "string") return { ok: false, error: "Enter a text message to check." };
  const text = value.trim();
  if (!text) return { ok: false, error: "Enter a message to check." };
  // Bound the raw payload as well as the trimmed content, matching the textarea limit.
  if (value.length > 10000) return { ok: false, error: "Keep your message to 10,000 characters or fewer." };

  // A script safeguard, not language identification: other Latin-script
  // languages cannot be distinguished from English here. Permit small amounts
  // of non-Latin text (e.g. a name), but require at least 80% Latin letters.
  const letters = text.match(/\p{L}/gu) ?? [];
  const latinLetters = letters.filter((letter) => /\p{Script=Latin}/u.test(letter)).length;
  if (letters.length > 0 && latinLetters / letters.length < 0.8) {
    return { ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE" } };
  }

  const analysis = analyzeText(text);
  // Conservative, explicit sufficiency rule: no detected evidence AND a tiny
  // fragment, fewer than two words, or no letters. Short real requests still count.
  const words = text.match(/\p{L}+/gu) ?? [];
  if (analysis.signals.length === 0 && (text.length < 10 || words.length < 2)) {
    return { ok: true, analysis: { status: "INSUFFICIENT_DATA" } };
  }
  return { ok: true, analysis: { status: "COMPLETED", result: mapTextCheckResult(analysis) } };
}
