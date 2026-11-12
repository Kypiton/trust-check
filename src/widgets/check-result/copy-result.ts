import type { CheckResult } from "@/entities/check/model/types";
import type { Locale } from "@/shared/i18n";
import { localizedAction, localizedSignal, riskLabel } from "@/shared/i18n/security-copy";

export function buildCopiedResult(result: CheckResult, locale: Locale): string {
  const ru = locale === "ru";
  const confidence = ru
    ? result.confidence === "LOW" ? "Низкая уверенность" : result.confidence === "MEDIUM" ? "Средняя уверенность" : "Высокая уверенность"
    : result.confidence === "LOW" ? "Low confidence" : result.confidence === "MEDIUM" ? "Medium confidence" : "High confidence";
  const signals = result.signals.map((signal) => localizedSignal(locale, signal));
  const actions = result.recommendedActions.map((action) => localizedAction(locale, action));

  const lines = [
    `TrustCheck — ${riskLabel(locale, result.riskLevel)}`,
    ru ? `Оценка риска: ${result.riskScore} / 100` : `Risk score: ${result.riskScore} / 100`,
    ru ? `Уверенность: ${confidence}` : `Confidence: ${confidence}`,
  ];

  lines.push("", ru ? "Обнаруженные признаки:" : "Signals found:");
  if (signals.length === 0) lines.push(ru ? "• Явных признаков риска не обнаружено" : "• No matching risk signals detected");
  else for (const signal of signals) lines.push(`• ${signal.title}`);

  if (actions.length > 0) {
    lines.push("", ru ? "Рекомендации:" : "Recommended actions:");
    for (const action of actions) lines.push(`• ${action.title}`);
  }

  lines.push("", ru ? "Оценка риска не является гарантией безопасности." : "A risk assessment is not a guarantee of safety.");
  return lines.join("\n");
}
