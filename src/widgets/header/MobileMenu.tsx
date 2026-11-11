"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HeaderNav } from "./HeaderNav";
import Link from "next/link";
import { SignOutButton } from "@/features/auth/ui/SignOutButton";

export function MobileMenu({ identity }: { identity: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    const desktop = window.matchMedia("(min-width: 768px)");
    function handleBreakpointChange() {
      if (desktop.matches) setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", handleBreakpointChange);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", handleBreakpointChange);
    };
  }, [isOpen]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex size-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d={isOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      <div
        id={panelId}
        hidden={!isOpen}
        className="absolute inset-x-0 top-full border-b border-border bg-surface px-4 py-3"
      >
        <HeaderNav mobile onNavigate={() => setIsOpen(false)} />
        {identity !== null ? <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3"><span className="truncate text-sm text-foreground">{identity}</span><SignOutButton onSignedOut={() => setIsOpen(false)} /></div> : <Link href="/login" onClick={() => setIsOpen(false)} className="flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Sign in</Link>}
      </div>
    </div>
  );
}
