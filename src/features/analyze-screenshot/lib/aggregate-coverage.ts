import type { AnalysisSource, AnalysisSourceCode, AnalysisSourceStatus } from "../../../entities/confidence";

/** N/A executions do not diminish successful applicable checks; failures do. */
export function aggregateCoverage(sources: readonly AnalysisSource[]): AnalysisSource[] {
  const statuses = new Map<AnalysisSourceCode, Set<AnalysisSourceStatus>>();
  for (const { code, status } of sources) {
    if (!statuses.has(code)) statuses.set(code, new Set());
    statuses.get(code)!.add(status);
  }
  return [...statuses].map(([code, values]) => ({
    code,
    status: values.has("FAILED") ? "FAILED" : values.has("SKIPPED") ? "SKIPPED" :
      values.has("COMPLETED") ? "COMPLETED" : "NOT_APPLICABLE",
  }));
}
