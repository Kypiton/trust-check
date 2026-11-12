"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/shared/i18n";
import { useLocale } from "@/shared/i18n/LocaleProvider";

export function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const next: Locale = locale === "ru" ? "en" : "ru";
  const label = locale === "ru" ? "Switch interface to English" : "Переключить интерфейс на русский";

  function toggle() {
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-md px-2 text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {locale === "ru" ? "EN" : "RU"}
    </button>
  );
}
