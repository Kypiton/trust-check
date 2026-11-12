"use client";

import { useLocale } from "@/shared/i18n/LocaleProvider";

export function SavedPageLoading({ label }: { label: string }) {
  const ru = useLocale() === "ru";
  const localized = ru
    ? label.includes("History") ? "Загружаем Историю…" : label.includes("saved assessment") ? "Загружаем сохранённый результат…" : label
    : label;
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 md:py-14 xl:px-8">
      <div className="mx-auto max-w-[var(--tc-result-max)]">
        <p role="status" className="text-sm text-muted">{localized}</p>
        <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
          <div className="h-8 w-40 rounded-md bg-surface-secondary" />
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="h-6 w-1/3 rounded-md bg-surface-secondary" />
            <div className="mt-6 h-4 w-3/4 rounded-md bg-surface-secondary" />
            <div className="mt-4 h-4 w-1/2 rounded-md bg-surface-secondary" />
          </div>
        </div>
      </div>
    </main>
  );
}
