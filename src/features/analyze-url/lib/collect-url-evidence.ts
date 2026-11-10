import type { AnalysisSource } from "../../../entities/confidence";
import type { DetectedSignal, SignalCode } from "../../../entities/risk";
import { analyzeDomain, type DomainAnalysis } from "../../analyze-domain";
import { analyzeReputation, currentReputationAnalysis, type ReputationAnalysis } from "../../analyze-reputation";
import { analyzeRedirect, type RedirectAnalysis } from "../../analyze-redirect";
import type { UrlInspection } from "./analyze-url";

export type ValidUrlInspection = Extract<UrlInspection, { valid: true }>;
export type UrlEvidenceDependencies = {
  analyzeDomain?: typeof analyzeDomain;
  analyzeReputation?: typeof analyzeReputation;
  analyzeRedirect?: typeof analyzeRedirect;
};
export type UrlEvidence = {
  inspection: ValidUrlInspection;
  domain: DomainAnalysis;
  reputation: ReputationAnalysis;
  redirect: RedirectAnalysis;
  signals: DetectedSignal[];
  coverage: AnalysisSource[];
  unexpectedFailure: boolean;
};

export function urlCoverage(domain: DomainAnalysis, reputation: ReputationAnalysis, redirect: RedirectAnalysis): AnalysisSource[] {
  return [
    { code: "URL_STRUCTURE", status: "COMPLETED" },
    { code: "DOMAIN_METADATA", status: domain.status === "UNAVAILABLE" ? "FAILED" : domain.status },
    { code: "REDIRECT_ANALYSIS", status: redirect.status === "COMPLETED" ? "COMPLETED" : "FAILED" },
    { code: reputation.source.code, status: reputation.source.status },
  ];
}

/** Recheck reputation after all concurrent URLs have settled, before scoring. */
export function refreshUrlEvidence({ inspection, domain, reputation: original, redirect, unexpectedFailure = false }: Pick<UrlEvidence, "inspection" | "domain" | "reputation" | "redirect"> & Partial<Pick<UrlEvidence, "unexpectedFailure">>): UrlEvidence {
  const reputation = currentReputationAnalysis(original);
  const unique = new Map<SignalCode, DetectedSignal>();
  for (const signal of [
    ...inspection.signals,
    ...(domain.status === "COMPLETED" ? domain.signals : []),
    ...(reputation.status === "COMPLETED" ? reputation.signals : []),
    ...(redirect.status === "COMPLETED" ? redirect.signals : []),
  ]) if (!unique.has(signal.code)) unique.set(signal.code, signal);
  return { inspection, domain, reputation, redirect, signals: [...unique.values()], coverage: urlCoverage(domain, reputation, redirect), unexpectedFailure };
}

/** Shared guarded enrichments, without Risk/Confidence calculation or public mapping. */
async function runProvider<T>(operation: () => Promise<T>): Promise<T> {
  // Invoke immediately, preserving Link's scheduling; convert synchronous
  // provider throws to rejected promises without suppressing other providers.
  return operation();
}

export async function collectUrlEvidence(inspection: ValidUrlInspection, {
  analyzeDomain: domainAnalyzer = analyzeDomain,
  analyzeReputation: reputationAnalyzer = analyzeReputation,
  analyzeRedirect: redirectAnalyzer = analyzeRedirect,
}: UrlEvidenceDependencies = {}): Promise<UrlEvidence> {
  // Preserve successful evidence even if another provider unexpectedly throws.
  // The Link application retains its existing FAILED policy for those errors;
  // a merged Screenshot can still use the available evidence as PARTIAL.
  const [domainResult, reputationResult, redirectResult] = await Promise.allSettled([
    runProvider(() => domainAnalyzer(inspection.hostname)),
    runProvider(() => reputationAnalyzer(inspection.normalizedUrl)),
    runProvider(() => redirectAnalyzer(inspection.normalizedUrl)),
  ]);
  const domain: DomainAnalysis = domainResult.status === "fulfilled" ? domainResult.value : { status: "UNAVAILABLE", reason: "NETWORK_ERROR" };
  const reputation: ReputationAnalysis = reputationResult.status === "fulfilled" ? reputationResult.value : {
    status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [], source: { code: "THREAT_REPUTATION", status: "FAILED" },
  };
  const redirect: RedirectAnalysis = redirectResult.status === "fulfilled" ? redirectResult.value : { status: "UNAVAILABLE", reason: "NETWORK_ERROR", signals: [] };
  // Never restart enrichment on a redirect destination.
  return refreshUrlEvidence({ inspection, domain, reputation, redirect,
    unexpectedFailure: [domainResult, reputationResult, redirectResult].some(({ status }) => status === "rejected"),
  });
}
