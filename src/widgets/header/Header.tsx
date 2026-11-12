import Link from "next/link";
import { getSession } from "@/shared/server/auth/session";
import { SignOutButton } from "@/features/auth/ui/SignOutButton";
import { HeaderNav } from "./HeaderNav";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";
import { TrustCheckMark } from "./TrustCheckMark";

export async function Header() {
  const session = await getSession();
  const identity = session ? session.user.name || session.user.email : null;
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
          {identity !== null ? <div className="hidden items-center gap-3 md:flex"><span className="max-w-24 truncate lg:max-w-40 text-sm text-foreground">{identity}</span><SignOutButton /></div> : <Link
            href="/login"
            className="hidden rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:inline-flex"
          >
            Sign in
          </Link>}
          <MobileMenu identity={identity} />
        </div>
      </div>
    </header>
  );
}
