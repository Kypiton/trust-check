"use client";

import { useLocale } from "@/shared/i18n/LocaleProvider";

type Mode = "TEXT" | "URL" | "SCREENSHOT";

export function AnalysisActivity({ mode }: { mode: Mode }) {
  const ru = useLocale() === "ru";
  const title = mode === "TEXT" ? (ru ? "Анализируем сообщение" : "Analyzing message") : mode === "URL" ? (ru ? "Проверяем ссылку" : "Checking link") : (ru ? "Анализируем скриншот" : "Analyzing screenshot");
  const topics = mode === "TEXT" ? (ru ? ["Срочность и давление", "Запросы личных данных", "Признаки выдачи себя за других"] : ["Urgency and pressure", "Requests for sensitive information", "Impersonation signals"])
    : mode === "URL" ? (ru ? ["Структура ссылки", "Данные домена", "Перенаправления", "Репутация угроз"] : ["Link structure", "Domain information", "Redirects", "Threat reputation"])
    : (ru ? ["Распознавание текста", "Признаки риска в сообщении", "Найденные ссылки"] : ["Text extraction", "Message signals", "Detected links"]);
  return (
    <section aria-labelledby="analysis-heading" className="rounded-xl border border-border bg-surface p-5 md:p-8">
      <div role="status" aria-atomic="true" className="text-center">
        <span aria-hidden="true" className="mx-auto mb-5 block size-3 rounded-full bg-primary motion-safe:animate-pulse" />
        <h1 id="analysis-heading" className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{ru ? "Проверка выполняется. Это может занять некоторое время." : "Your check is running. This may take a moment."}</p>
      </div>
      <div className="mx-auto mt-7 max-w-md">
        <p className="text-sm font-medium">{ru ? "Что может включать проверка" : "What this check may include"}</p>
        <ul className="mt-3 space-y-2">{topics.map((topic, index) => <li key={topic} className="flex items-center gap-3 rounded-lg bg-surface-secondary px-3 py-3 text-sm"><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" style={{ animationDelay: `${index * 0.3}s` }} />{topic}</li>)}</ul>
        <p className="mt-4 text-xs leading-5 text-muted">{ru ? "Это обзор возможных проверок, а не текущих этапов. Покрытие анализа появится в результате." : "These are possible checks, not live progress steps. Actual coverage will appear with your result."}</p>
      </div>
    </section>
  );
}
