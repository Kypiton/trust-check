"use client";

import { ANALYSIS_SOURCE_LABELS, type AnalysisSourceStatus } from "@/entities/confidence";
import type { CheckResult as CheckResultData, Confidence, RiskLevel } from "@/entities/check/model/types";
import { useLocale } from "@/shared/i18n/LocaleProvider";
import { analysisSourceLabel, localizedAction, localizedSignal, riskLabel } from "@/shared/i18n/security-copy";

const riskStyles = {
  LOW: { foreground: "text-success", background: "bg-success-soft" },
  MEDIUM: { foreground: "text-warning", background: "bg-warning-soft" },
  HIGH: { foreground: "text-danger", background: "bg-danger-soft" },
} satisfies Record<RiskLevel, { foreground: string; background: string }>;

function ResultIcon({ kind, className = "" }: { kind: "risk" | "safe" | "info"; className?: string }) {
  return <svg aria-hidden="true" className={`size-5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{kind === "risk" ? <path d="M10.3 4a2 2 0 0 1 3.4 0l8 14a2 2 0 0 1-1.7 3H4a2 2 0 0 1-1.7-3l8-14ZM12 9v4m0 4h.01" /> : kind === "safe" ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-9h.01" /></>}</svg>;
}

const cardClassName = "rounded-xl border border-border bg-surface p-5 md:p-6";
const summaryClassName = "cursor-pointer rounded-xl px-5 py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:px-6";

export function CheckResult({ result }: { result: CheckResultData }) {
  const locale = useLocale();
  const ru = locale === "ru";
  const style = riskStyles[result.riskLevel];
  const completed = result.analysisCoverage.filter((check) => check.status === "COMPLETED").length;
  const applicable = result.analysisCoverage.filter((check) => check.status !== "NOT_APPLICABLE").length;
  const confidenceLabels: Record<Confidence, string> = ru
    ? { LOW: "Низкая уверенность", MEDIUM: "Средняя уверенность", HIGH: "Высокая уверенность" }
    : { LOW: "Low confidence", MEDIUM: "Medium confidence", HIGH: "High confidence" };
  const coverageLabels: Record<AnalysisSourceStatus, string> = ru
    ? { COMPLETED: "Завершено", FAILED: "Недоступно", SKIPPED: "Пропущено", NOT_APPLICABLE: "Не применимо" }
    : { COMPLETED: "Completed", FAILED: "Failed", SKIPPED: "Skipped", NOT_APPLICABLE: "Not applicable" };
  const summary = ru
    ? result.riskLevel === "LOW" ? "Явных признаков мошенничества не обнаружено." : result.riskLevel === "MEDIUM" ? "Обнаружены некоторые подозрительные признаки." : "Обнаружено несколько признаков, часто связанных с мошенничеством или фишингом."
    : result.summary;

  return <div className="space-y-6">
    <section aria-labelledby="risk-heading" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`flex flex-col gap-5 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between md:p-6 ${style.background} ${style.foreground}`}>
        <div className="space-y-4"><h1 id="risk-heading" className="flex items-center gap-3 text-2xl font-semibold tracking-tight"><ResultIcon kind={result.riskLevel === "LOW" ? "safe" : "risk"} />{riskLabel(locale, result.riskLevel)}</h1><p className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted"><ResultIcon kind="info" />{confidenceLabels[result.confidence]}</p></div>
        <div className="shrink-0 sm:text-right"><p className="text-4xl font-semibold tabular-nums tracking-tight">{result.riskScore}<span className="text-lg font-medium"> / 100</span></p><p className="mt-1 text-sm font-medium">{ru ? "Оценка риска" : "Risk score"}</p></div>
      </div>
      <div className="p-5 md:p-6"><p className="text-base leading-7 text-foreground">{summary}</p>{!ru && result.analysisNote && <p className="mt-2 text-sm leading-6 text-muted">{result.analysisNote}</p>}{result.riskLevel === "LOW" && <p className="mt-2 text-sm leading-6 text-muted">{ru ? "Это не гарантирует, что содержимое безопасно." : "This does not guarantee that the content is safe."}</p>}{result.riskLevel === "MEDIUM" && <p className="mt-2 text-sm leading-6 text-muted">{ru ? "Проверьте информацию и будьте осторожны перед любыми действиями." : "Verify the information and be cautious before taking action."}</p>}</div>
    </section>

    <div className="grid gap-6 md:grid-cols-2">
      <section aria-labelledby="signals-heading" className={cardClassName}><h2 id="signals-heading" className="text-lg font-semibold">{result.riskLevel === "LOW" ? (ru ? "Что мы нашли" : "What we found") : (ru ? "Почему это выглядит подозрительно" : "Why this looks risky")}</h2>{result.signals.length === 0 && <p className="mt-5 text-sm leading-6 text-muted">{ru ? "Совпадающих признаков риска не обнаружено." : "No matching risk signals were detected."}</p>}<ul className="mt-5 space-y-5">{result.signals.map((raw) => { const signal = localizedSignal(locale, raw); return <li key={signal.code} className="flex items-start gap-3"><ResultIcon kind={result.riskLevel === "LOW" ? "info" : "risk"} className={`mt-0.5 ${style.foreground}`} /><div className="min-w-0 break-words"><h3 className="text-sm font-medium leading-6">{signal.title}</h3><p className="mt-1 text-sm leading-6 text-muted">{signal.description}</p></div></li>; })}</ul></section>
      <section aria-labelledby="actions-heading" className={cardClassName}><h2 id="actions-heading" className="text-lg font-semibold">{ru ? "Что стоит сделать" : "What you should do"}</h2><ul className="mt-5 space-y-4">{result.recommendedActions.map((raw) => { const action = localizedAction(locale, raw); return <li key={action.code} className="flex items-start gap-3"><ResultIcon kind="safe" className="mt-0.5 text-success" /><span className="min-w-0 break-words text-sm leading-6">{action.title}</span></li>; })}</ul></section>
    </div>

    <details className="rounded-xl border border-border bg-surface"><summary className={summaryClassName}><span className="ml-1 inline-flex w-[calc(100%-1.5rem)] flex-col gap-1 align-top sm:flex-row sm:justify-between sm:gap-4"><span>{ru ? "Покрытие анализа" : "Analysis coverage"}</span><span className="font-normal text-muted">{ru ? `${completed} из ${applicable} проверок завершено` : `${completed} of ${applicable} checks completed`}</span></span></summary><dl className="space-y-3 border-t border-border px-5 py-4 md:px-6">{result.analysisCoverage.map((check) => <div key={check.code} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm"><dt>{analysisSourceLabel(locale, check.code, ANALYSIS_SOURCE_LABELS[check.code])}</dt><dd className="text-muted">{coverageLabels[check.status]}</dd></div>)}</dl></details>

    <details className="rounded-xl border border-border bg-surface"><summary className={summaryClassName}>{ru ? "Технические детали" : "Technical details"}</summary><dl className="space-y-3 border-t border-border px-5 py-4 text-sm md:px-6"><div className="flex justify-between gap-4"><dt className="text-muted">{ru ? "Оценка риска" : "Risk score"}</dt><dd className="tabular-nums">{result.riskScore}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">{ru ? "Уровень риска" : "Risk level"}</dt><dd>{riskLabel(locale, result.riskLevel)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted">{ru ? "Уверенность" : "Confidence"}</dt><dd>{confidenceLabels[result.confidence]}</dd></div>{result.redirectDetails && <><div className="flex justify-between gap-4"><dt className="text-muted">{ru ? "HTTP-перенаправлений" : "HTTP redirects followed"}</dt><dd className="tabular-nums">{result.redirectDetails.hopCount}</dd></div>{result.redirectDetails.crossDomain && <div><dt className="text-muted">{ru ? "Конечный домен" : "Redirect destination"}</dt><dd>{ru ? "Перенаправление привело на другой домен." : "Redirect destination changed to another domain."}</dd></div>}{result.redirectDetails.protocolDowngrade && <div><dt className="text-muted">{ru ? "Протокол" : "Redirect protocol"}</dt><dd>{ru ? "Цепочка перенаправлений перешла с HTTPS на HTTP." : "The redirect chain changed from HTTPS to HTTP."}</dd></div>}{result.redirectDetails.targetIsIp && <div><dt className="text-muted">{ru ? "Адрес перенаправления" : "Redirect address"}</dt><dd>{ru ? "Один из адресов перенаправления использовал IP-адрес вместо доменного имени." : "A redirect destination used a literal IP address."}</dd></div>}{result.redirectDetails.shortenedLinkDestinationChange && <div><dt className="text-muted">{ru ? "Сокращённая ссылка" : "Shortened link"}</dt><dd>{ru ? "Сокращённая ссылка перенаправила на другой хост." : "The shortened link redirected to a different hostname."}</dd></div>}</>}</dl></details>
  </div>;
}
