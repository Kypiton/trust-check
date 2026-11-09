import Link from "next/link";
import type { AnalysisStep, CheckAnalysis } from "@/entities/check/model/types";
import { CheckResult } from "./CheckResult";

const stepStyles = {
  COMPLETED: { label: "Completed", color: "text-success", background: "bg-surface" },
  CURRENT: { label: "In progress", color: "text-primary", background: "bg-surface-secondary" },
  PENDING: { label: "Pending", color: "text-muted", background: "bg-surface" },
} satisfies Record<AnalysisStep["status"], { label: string; color: string; background: string }>;

const primaryAction = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const secondaryAction = "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function InfoIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={`size-5 shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-9h.01" />
    </svg>
  );
}

export function PartialAnalysisNotice() {
  return (
    <aside aria-labelledby="partial-heading" className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 md:p-5">
      <InfoIcon className="mt-0.5 text-warning" />
      <div>
        <h2 id="partial-heading" className="text-sm font-semibold">Some checks were unavailable</h2>
        <p className="mt-1 text-sm leading-6 text-muted">The result is based on the information we could verify.</p>
      </div>
    </aside>
  );
}

export function CheckAnalysisState({ analysis }: { analysis: CheckAnalysis }) {
  if (analysis.status === "COMPLETED" || analysis.status === "PARTIAL") {
    return (
      <div className="space-y-6">
        {analysis.status === "PARTIAL" && <PartialAnalysisNotice />}
        <CheckResult result={analysis.result} />
      </div>
    );
  }

  if (analysis.status === "ANALYZING") {
    return (
      <section aria-labelledby="analysis-heading" className="rounded-xl border border-border bg-surface p-5 md:p-8">
        <div role="status" aria-atomic="true" className="text-center">
          <h1 id="analysis-heading" className="text-2xl font-semibold tracking-tight">Checking this content...</h1>
          <p className="mt-3 text-sm leading-6 text-muted">This usually takes a few seconds.</p>
        </div>
        <ol className="mx-auto mt-7 max-w-md space-y-2">
          {analysis.steps.map((step) => {
            const style = stepStyles[step.status];
            return (
              <li key={step.code} aria-current={step.status === "CURRENT" ? "step" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3 ${style.background}`}>
                <svg aria-hidden="true" className={`size-5 shrink-0 ${style.color}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  {step.status === "COMPLETED" ? <path d="m5 12 4 4L19 6" /> : <circle cx="12" cy="12" r={step.status === "CURRENT" ? "5" : "7"} fill={step.status === "CURRENT" ? "currentColor" : "none"} />}
                </svg>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                  <span className={step.status === "CURRENT" ? "font-medium text-foreground" : "text-muted"}>{step.title}</span>
                  <span className="text-xs text-muted">{style.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  const failed = analysis.status === "FAILED";
  return (
    <section aria-labelledby="outcome-heading" className="rounded-xl border border-border bg-surface p-5 md:p-8">
      <div className="flex items-center gap-3">
        <InfoIcon className={failed ? "text-danger" : "text-muted"} />
        <h1 id="outcome-heading" className="text-2xl font-semibold tracking-tight">{failed ? "Analysis failed" : "Not enough information"}</h1>
      </div>
      <p className="mt-3 text-base leading-7 text-muted">
        {failed ? "Something went wrong while checking this content." : "We need more information to assess this content."}
      </p>
      {!failed && (
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>Paste the full message</li>
          <li>Provide a complete URL</li>
          <li>Upload a clearer screenshot</li>
        </ul>
      )}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        {failed && <button type="button" className={primaryAction}>Try again</button>}
        <Link href="/check" className={failed ? secondaryAction : primaryAction}>Start a new check</Link>
      </div>
    </section>
  );
}
