"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/shared/i18n/LocaleProvider";

export function HeaderNav({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const locale = useLocale();
  const navigationItems = [
    { label: locale === "ru" ? "Проверить" : "Check", href: "/check" },
    { label: locale === "ru" ? "История" : "History", href: "/history" },
  ];
  return (
    <nav aria-label={locale === "ru" ? "Основная навигация" : "Main navigation"} className={mobile ? "flex flex-col gap-1" : "flex items-center gap-1 md:gap-2"}>
      {navigationItems.map(({ label, href }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} onClick={onNavigate} aria-current={isActive ? "page" : undefined} className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mobile ? "flex min-h-11 items-center" : ""} ${isActive ? "bg-surface-secondary text-foreground" : "text-muted hover:bg-surface-secondary hover:text-foreground"}`}>{label}</Link>;
      })}
    </nav>
  );
}
