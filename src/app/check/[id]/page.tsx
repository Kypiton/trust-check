import Link from "next/link";
import { notFound } from "next/navigation";
import { getMockAnalysis } from "@/entities/check/model/mock-result";
import { CheckAnalysisState } from "@/widgets/check-result";

export default async function CheckResultPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { id } = await params;
  const analysis = getMockAnalysis(id);
  if (!analysis) notFound();
  return (
    <main className="w-full flex-1 bg-background px-4 py-8 text-foreground md:px-6 md:py-10 xl:px-8">
      <div className="mx-auto w-full max-w-[var(--tc-result-max)]">
        <p className="mb-4 text-sm text-muted">Development preview — sample data.</p>
        <Link href="/check" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 5-7 7 7 7M5 12h14" /></svg>
          New check
        </Link>
        <CheckAnalysisState analysis={analysis} />
      </div>
    </main>
  );
}
