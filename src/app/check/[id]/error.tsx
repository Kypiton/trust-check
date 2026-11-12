"use client";

import Link from "next/link";
import { useLocale } from "@/shared/i18n/LocaleProvider";

export default function SavedResultError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const ru = useLocale() === "ru";
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 xl:px-8">
      <section className="mx-auto max-w-[var(--tc-result-max)] rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">{ru ? "Сохранённый результат недоступен" : "Saved result unavailable"}</h1>
        <p className="mt-2 text-muted">{ru ? "Не удалось показать сохранённый результат. Попробуйте ещё раз или вернитесь в Историю." : "We could not display this saved result. Please try again or return to History."}</p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="button" onClick={retry} className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Попробовать снова" : "Try again"}</button>
          <Link href="/history" className="rounded-md text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Вернуться в Историю" : "Back to History"}</Link>
        </div>
      </section>
    </main>
  );
}
