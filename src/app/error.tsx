"use client";

import { PageRecovery } from "@/shared/ui/PageRecovery";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageRecovery retry={reset} />;
}
