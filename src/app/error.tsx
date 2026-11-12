"use client";

import { PageRecovery } from "@/shared/ui/PageRecovery";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PageRecovery retry={retry} />;
}
