"use client";

import { useLocale } from "@/shared/i18n/LocaleProvider";

export default function HistoryError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const ru = useLocale() === "ru";
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 xl:px-8">
      <div className="mx-auto max-w-[var(--tc-result-max)] rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">{ru ? "Не удалось загрузить Историю" : "Unable to load History"}</h1>
        <p className="mt-2 text-muted">{ru ? "История временно недоступна. Попробуйте ещё раз." : "Your history is temporarily unavailable. Please try again."}</p>
        <button onClick={retry} type="button" className="mt-5 min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Попробовать снова" : "Try again"}</button>
      </div>
    </main>
  );
}
