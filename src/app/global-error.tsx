"use client";

import { PageRecovery } from "@/shared/ui/PageRecovery";
import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><PageRecovery retry={reset} /></body></html>;
}
