import Link from "next/link";
import { HeaderNav } from "./HeaderNav";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";
import { TrustCheckMark } from "./TrustCheckMark";

export function Header() {
  return (
    <header className="sticky top-0 z-40 h-[var(--tc-header-height)] w-full border-b border-border bg-surface">
      <div className="mx-auto flex h-full w-full max-w-[var(--tc-content-max)] items-center gap-4 px-4 md:gap-8 md:px-6 xl:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-sm text-base font-semibold tracking-tight text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <TrustCheckMark />
          <span>TrustCheck</span>
        </Link>

        <div className="hidden md:block">
          <HeaderNav />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex"
          >
            Sign in
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
