"use client";

import { PageRecovery } from "@/shared/ui/PageRecovery";
import "./globals.css";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="en"><body><PageRecovery retry={retry} /></body></html>;
}
