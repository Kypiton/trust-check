import type { Locale } from "@/shared/i18n";

export function textExample(locale: Locale): string {
  return locale === "ru"
    ? "СРОЧНО! Это служба безопасности банка. Ваш счёт будет заблокирован. Отправьте нам код подтверждения, чтобы сохранить доступ."
    : "URGENT! This is your bank security team. Your account will be locked. Send us your verification code to keep access.";
}

export const LINK_EXAMPLE = "http://paypa1.example/login";

export function suggestedLinkFromText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (/^[^/@]+@[^/@]+\.[^/@]+$/.test(trimmed)) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
    const ipv6 = hostname.includes(":");
    const lastLabel = hostname.split(".").at(-1) ?? "";
    const domain = hostname.includes(".") && /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(lastLabel);
    if (!domain && !ipv4 && !ipv6) return null;
    return trimmed;
  } catch {
    return null;
  }
}
