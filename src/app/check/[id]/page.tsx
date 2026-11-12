import type { Metadata } from "next";
import Link from "next/link";
import { DeleteCheckControl } from "@/features/delete-check/ui/DeleteCheckControl";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/shared/server/auth/session";
import { getUserCheckById } from "@/entities/check/server/get-user-check-by-id";
import { parsePersistedCheck } from "@/entities/check/lib/parse-persisted-check";
import type { CheckAnalysis } from "@/entities/check/model/types";
import { CheckAnalysisState } from "@/widgets/check-result";

const previewIds = new Set(["high", "medium", "low", "loading", "error", "insufficient", "partial"]);
const linkClass = "inline-flex min-h-11 items-center rounded-md text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const metadata: Metadata = {
  title: "Saved assessment",
  robots: { index: false, follow: false },
};

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let analysis: CheckAnalysis;
  const preview = process.env.NODE_ENV === "development" && previewIds.has(id);
  if (preview) {
    // Lazy import keeps fixture initialization out of persisted result requests.
    const { getMockAnalysis } = await import("@/entities/check/model/mock-result");
    const fixture = getMockAnalysis(id);
    if (!fixture) notFound();
    analysis = fixture;
  } else {
    const session = await getSession();
    if (!session) redirect("/login");
    const row = await getUserCheckById(session.user.id, id);
    if (!row) notFound();
    analysis = parsePersistedCheck(row);
  }
  return (
    <main className="w-full flex-1 bg-background px-4 py-8 text-foreground md:px-6 md:py-10 xl:px-8">
      <div className="mx-auto w-full max-w-[var(--tc-result-max)]">
        {preview && <p className="mb-4 text-sm text-muted">Development preview — sample data.</p>}
        <nav aria-label="Result navigation" className="mb-6 flex items-center justify-between gap-4">
          <Link href="/history" className={linkClass}>← History</Link>
          <div className="flex items-center gap-4">
            {!preview && <DeleteCheckControl mode="single" checkId={id} returnToHistory />}
            <Link href="/check" className={linkClass}>New check</Link>
          </div>
        </nav>
        <CheckAnalysisState analysis={analysis} />
      </div>
    </main>
  );
}
