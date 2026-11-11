"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/shared/lib/auth-client";

export function SignOutButton({ onSignedOut }: { onSignedOut?: () => void }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) { setError(true); return; }
      onSignedOut?.();
      router.replace("/check");
      router.refresh();
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <div><button type="button" onClick={signOut} disabled={pending} className="min-h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">{pending ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className="text-sm text-danger">Unable to sign out. Try again.</p>}</div>;
}
