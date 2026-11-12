export type Locale = "en" | "ru";

export const LOCALE_COOKIE = "trustcheck-locale";

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ru";
}

export function pick<T>(locale: Locale, en: T, ru: T): T {
  return locale === "ru" ? ru : en;
}
