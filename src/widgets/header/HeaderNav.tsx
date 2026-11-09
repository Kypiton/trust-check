"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { label: "Check", href: "/check" },
  { label: "History", href: "/history" },
];

export function HeaderNav({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = mobile
    ? [...navigationItems, { label: "Sign in", href: "/login" }]
    : navigationItems;

  return (
    <nav aria-label="Main navigation" className={mobile ? "flex flex-col gap-1" : "flex items-center gap-1 md:gap-2"}>
      {items.map(({ label, href }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mobile ? "flex min-h-11 items-center" : ""} ${
              isActive
                ? "bg-surface-secondary text-foreground"
                : "text-muted hover:bg-surface-secondary hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
