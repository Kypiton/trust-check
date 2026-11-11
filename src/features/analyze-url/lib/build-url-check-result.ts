import { calculateConfidence } from "../../../entities/confidence";
import type { CheckAnalysis, CheckResult, RecommendedAction } from "../../../entities/check/model/types";
import { calculateRisk, type DetectedSignal, type RiskCalculation, type RiskLevel, type SignalCode } from "../../../entities/risk";
import type { DomainAnalysis } from "../../analyze-domain";
import type { ReputationAnalysis } from "../../analyze-reputation";
import type { RedirectAnalysis } from "../../analyze-redirect";
import { inspectUrl } from "./analyze-url";
import { MAX_URL_INPUT_LENGTH } from "./limits";
import { collectUrlEvidence, urlCoverage, type UrlEvidenceDependencies } from "./collect-url-evidence";

export type UrlCheckResponse =
  | { ok: false; error: string }
  | { ok: true; analysis: Exclude<CheckAnalysis, { status: "ANALYZING" }>; persistedCheckId?: string };

const summaries: Record<RiskLevel, string> = {
  LOW: "No strong suspicious URL patterns were detected.",
  MEDIUM: "Some suspicious characteristics were detected in this link.",
  HIGH: "This link contains several characteristics commonly associated with suspicious or deceptive URLs.",
};

const doNotOpen: RecommendedAction = { code: "DO_NOT_OPEN_LINK", title: "Do not open the link" };
const useOfficialWebsite: RecommendedAction = { code: "USE_OFFICIAL_WEBSITE", title: "Open the organization's official website manually instead of using this link" };

const actionsBySignal: Partial<Record<SignalCode, readonly RecommendedAction[]>> = {
  NO_HTTPS: [{ code: "AVOID_SENSITIVE_INFORMATION", title: "Avoid entering passwords, payment details, or other sensitive information on this page" }],
  IP_ADDRESS_URL: [{ code: "VERIFY_DESTINATION", title: "Verify the destination independently before opening the link" }],
  SHORTENED_URL: [{ code: "VERIFY_SHORTENED_DESTINATION", title: "Verify the final destination before trusting a shortened link" }],
  BRAND_IMPERSONATION: [useOfficialWebsite],
  LONG_URL: [{ code: "CHECK_DOMAIN", title: "Check the actual domain carefully before continuing" }],
  NEW_DOMAIN: [{ code: "VERIFY_RECENT_DOMAIN", title: "Verify the organization independently before trusting a recently registered domain" }],
  KNOWN_PHISHING_URL: [
    doNotOpen,
    { code: "AVOID_SENSITIVE_INFORMATION", title: "Do not enter passwords, payment information, or verification codes" },
    useOfficialWebsite,
  ],
  KNOWN_MALICIOUS_URL: [
    doNotOpen,
    { code: "DO_NOT_DOWNLOAD_FILES", title: "Do not download files from this address" },
    { code: "CLOSE_PAGE", title: "Close the page if it is already open" },
  ],
};

export function buildUrlRecommendations(signals: readonly DetectedSignal[]): RecommendedAction[] {
  const actions = new Map<string, RecommendedAction>();
  for (const signal of signals) {
    for (const action of actionsBySignal[signal.code] ?? []) actions.set(action.code, { ...action });
  }
  if (signals.some(({ code }) => code === "MULTIPLE_REDIRECTS") &&
    !actions.has("DO_NOT_OPEN_LINK") && !actions.has("VERIFY_SHORTENED_DESTINATION")) {
    actions.set("VERIFY_DESTINATION", {
      code: "VERIFY_DESTINATION",
      title: "Check the final destination carefully before entering sensitive information.",
    });
  }
  if (!actions.size) {
    actions.set("VERIFY_DESTINATION", {
      code: "VERIFY_DESTINATION",
      title: "Verify the destination independently before opening the link",
    });
  }
  return [...actions.values()];
}

function analysisNote(domain: DomainAnalysis, reputation: ReputationAnalysis, redirect: RedirectAnalysis): string {
  let note: string;
  switch (domain.status) {
    case "COMPLETED":
      note = "URL structure and domain registration metadata were analyzed.";
      if (domain.domainAgeDays === null) note += " The domain's registration age is unknown.";
      break;
    case "UNAVAILABLE":
      note = "URL structure was analyzed. Domain registration metadata was unavailable.";
      break;
    case "NOT_APPLICABLE":
      note = "URL structure was analyzed. Domain registration metadata does not apply to this host.";
      break;
  }
  switch (reputation.status) {
    case "COMPLETED":
      note += " Threat reputation was checked.";
      break;
    case "UNAVAILABLE":
      note += " Threat reputation was unavailable.";
      break;
    case "SKIPPED":
      note += " Threat reputation was not checked.";
      break;
  }
  if (redirect.status === "COMPLETED") {
    note += " Redirect analysis completed successfully.";
    if (redirect.hops.length > 0) note += " Domain and threat reputation coverage refers to the submitted URL, not the final destination.";
  } else {
    const blocked = ["BLOCKED_IP", "BLOCKED_HOST", "PORT_NOT_ALLOWED", "CREDENTIALS_NOT_ALLOWED", "UNSUPPORTED_PROTOCOL"].includes(redirect.reason);
    note += blocked
      ? " Redirect analysis could not safely follow one of the destinations."
      : " Redirect analysis could not be completed.";
  }
  return note;
}

export function mapUrlCheckResult(
  analysis: { signals: readonly DetectedSignal[]; risk: RiskCalculation },
  domain: DomainAnalysis,
  reputation: ReputationAnalysis,
  redirect: RedirectAnalysis,
): CheckResult {
  const analysisCoverage = urlCoverage(domain, reputation, redirect);
  const confidence = calculateConfidence({ sources: analysisCoverage, signals: analysis.signals });
  const confirmedThreat = reputation.status === "COMPLETED" && analysis.signals.some(
    ({ code }) => code === "KNOWN_PHISHING_URL" || code === "KNOWN_MALICIOUS_URL",
  );
  return {
    riskLevel: analysis.risk.level,
    riskScore: analysis.risk.score,
    confidence: confidence.level,
    summary: confirmedThreat && analysis.risk.level === "HIGH"
      ? "This link was identified by a threat reputation source and should be treated as high risk."
      : summaries[analysis.risk.level],
    analysisNote: analysisNote(domain, reputation, redirect),
    signals: analysis.signals.map(({ code, title, description }) => ({
      code, title,
      description: code === "SHORTENED_URL" && redirect.status === "COMPLETED"
        ? "The hostname matches a configured URL shortening service. Its HTTP redirect chain was checked."
        : description,
    })),
    recommendedActions: buildUrlRecommendations(analysis.signals),
    analysisCoverage,
    ...(redirect.status === "COMPLETED" ? { redirectDetails: {
      hopCount: redirect.hops.length,
      crossDomain: redirect.hops.some((hop) => hop.crossDomain),
      protocolDowngrade: redirect.hops.some((hop) => hop.protocolDowngrade),
      targetIsIp: redirect.hops.some((hop) => hop.targetIsIp),
      shortenedLinkDestinationChange: redirect.hops.some((hop) => hop.shortenedLinkDestinationChange),
    } } : {}),
  };
}

/** Combine real evidence before scoring; return display fields only. */
export async function buildUrlCheckResult(
  value: unknown,
  dependencies: UrlEvidenceDependencies = {},
): Promise<UrlCheckResponse> {
  const invalid: UrlCheckResponse = { ok: false, error: "Enter a valid HTTP or HTTPS link." };
  if (typeof value !== "string") return invalid;
  if (value.length > MAX_URL_INPUT_LENGTH) return { ok: false, error: `Keep your link to ${MAX_URL_INPUT_LENGTH} characters or fewer.` };
  if (!value.trim()) return invalid;
  const analysis = inspectUrl(value.trim());
  if (!analysis.valid) return invalid;
  const { signals, domain, reputation, redirect, unexpectedFailure } = await collectUrlEvidence(analysis, dependencies);
  if (unexpectedFailure) throw new Error("URL evidence collection failed.");
  const risk = calculateRisk(signals);
  const result = mapUrlCheckResult({ signals, risk }, domain, reputation, redirect);
  // Optional unconfigured reputation remains SKIPPED. Only a
  // failure of an applicable current provider makes the result PARTIAL.
  const partial = domain.status === "UNAVAILABLE" || reputation.status === "UNAVAILABLE" || redirect.status === "UNAVAILABLE";
  return { ok: true, analysis: { status: partial ? "PARTIAL" : "COMPLETED", result } };
}
