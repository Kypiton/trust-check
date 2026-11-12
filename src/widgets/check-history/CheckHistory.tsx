import Link from "next/link";
import { DeleteCheckControl } from "@/features/delete-check/ui/DeleteCheckControl";
import type { CheckHistoryItem } from "@/entities/check/server/get-user-check-history";

const inputLabels = { TEXT: "Text", URL: "Link", SCREENSHOT: "Screenshot" };
const riskStyles = {
  LOW: { label: "Low Risk", className: "bg-success-soft text-success" },
  MEDIUM: { label: "Medium Risk", className: "bg-warning-soft text-warning" },
  HIGH: { label: "High Risk", className: "bg-danger-soft text-danger" },
};
const confidenceLabels = { LOW: "Low confidence", MEDIUM: "Medium confidence", HIGH: "High confidence" };
const statusLabels = { COMPLETED: "Completed", PARTIAL: "Partial analysis", FAILED: "Analysis failed", INSUFFICIENT_DATA: "Insufficient data" };
const dateFormatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const columns = "md:grid-cols-[1fr_1fr_.65fr_1.3fr_1.2fr_1.1fr]";

export function CheckHistory({ checks }: { checks: readonly CheckHistoryItem[] }) {
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 md:py-14 xl:px-8">
      <div className="mx-auto w-full max-w-[var(--tc-result-max)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">History</h1>
            <p className="mt-2 text-muted">Your recent TrustCheck analyses.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/account/privacy" className="rounded-md text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Privacy</Link>
            {checks.length > 0 && <DeleteCheckControl mode="all" />}
            <Link href="/check" className={actionClass}>New check</Link>
          </div>
        </div>
        {checks.length === 0 ? (
          <section aria-labelledby="empty-history-title" className="mt-8 rounded-xl border border-border bg-surface px-6 py-12 text-center">
            <h2 id="empty-history-title" className="text-xl font-semibold">No checks yet</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted">Your saved analyses will appear here after you check a message, link, or screenshot.</p>
            <Link href="/check" className={`${actionClass} mt-6`}>Start a check</Link>
          </section>
        ) : (
          <section aria-label="Saved checks" className="mt-8">
            <p className="mb-3 text-sm text-muted">Up to 50 most recent checks · Dates in UTC</p>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div aria-hidden="true" className={`hidden gap-4 border-b border-border bg-surface-secondary px-5 py-3 text-xs font-medium text-muted md:grid md:pr-20 ${columns}`}>
                {['Type', 'Risk', 'Score', 'Confidence', 'Status', 'Date'].map(label => <span key={label}>{label}</span>)}
              </div>
              <ul className="divide-y divide-border">
                {checks.map(check => {
                  const risk = check.riskLevel ? riskStyles[check.riskLevel] : undefined;
                  const validDate = Number.isFinite(check.createdAt.getTime());
                  return (
                    <li key={check.id} className="flex items-start md:items-center">
                      <Link href={`/check/${encodeURIComponent(check.id)}`} className="block min-w-0 flex-1 px-4 py-5 transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:px-5 md:py-4">
                      <dl className={`grid grid-cols-2 items-start gap-x-4 gap-y-4 text-sm md:items-center ${columns}`}>
                        <div className="min-w-0"><dt className="sr-only">Type</dt><dd className="font-semibold">{inputLabels[check.inputType] ?? "Unknown type"}</dd></div>
                        <div className="min-w-0"><dt className="sr-only">Risk</dt><dd><span className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${risk?.className ?? "bg-surface-secondary text-muted"}`}>{risk?.label ?? "Risk unavailable"}</span></dd></div>
                        <div className="min-w-0"><dt className="text-xs text-muted md:sr-only">Score</dt><dd className="mt-1 tabular-nums md:mt-0">{check.riskScore !== null && Number.isFinite(check.riskScore) && check.riskScore >= 0 && check.riskScore <= 100 ? `${check.riskScore}/100` : "Unavailable"}</dd></div>
                        <div className="min-w-0"><dt className="sr-only">Confidence</dt><dd className="text-muted">{check.confidence ? confidenceLabels[check.confidence] ?? "Confidence unavailable" : "Confidence unavailable"}</dd></div>
                        <div className="min-w-0"><dt className="sr-only">Status</dt><dd className="text-muted">{statusLabels[check.status] ?? "Status unavailable"}</dd></div>
                        <div className="min-w-0"><dt className="sr-only">Date</dt><dd className="text-muted">{validDate ? <time dateTime={check.createdAt.toISOString()}>{dateFormatter.format(check.createdAt)}</time> : "Date unavailable"}</dd></div>
                      </dl>
                      </Link>
                      <div className="shrink-0 py-3 pr-2 md:pr-3"><DeleteCheckControl mode="single" checkId={check.id} iconOnly /></div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
