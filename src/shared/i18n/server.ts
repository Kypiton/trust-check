import "server-only";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, type Locale } from "./index";

export async function getRequestLocale(): Promise<Locale> {
  try {
    const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(stored)) return stored;
    const acceptLanguage = (await headers()).get("accept-language")?.toLowerCase() ?? "";
    if (/(^|,)\s*ru(?:-|;|,|$)/.test(acceptLanguage)) return "ru";
  } catch {
    // Tests and build-time rendering without a request context fall back to English.
  }
  return "en";
}
