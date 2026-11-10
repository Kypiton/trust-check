import type { DetectedSignal } from "../../../entities/risk";
import type { SafeHttpFailureReason } from "../../../shared/server/safe-http";

export type RedirectStatusCode = 301 | 302 | 303 | 307 | 308;

// Server-side chain metadata may contain sensitive paths and queries. Do not
// log/persist it or serialize it directly into a public CheckResult.
export type RedirectHop = {
  readonly from: string;
  readonly to: string;
  readonly statusCode: RedirectStatusCode;
  readonly fromHostname: string;
  readonly toHostname: string;
  readonly crossDomain: boolean;
  readonly protocolDowngrade: boolean;
  readonly targetIsIp: boolean;
  readonly shortenedLinkDestinationChange: boolean;
};

export type RedirectFailureReason = SafeHttpFailureReason
  | "MISSING_LOCATION" | "INVALID_LOCATION" | "TOO_MANY_REDIRECTS"
  | "REDIRECT_LOOP" | "DEADLINE_EXCEEDED";

export type RedirectAnalysis =
  | {
      status: "COMPLETED";
      initialUrl: string;
      // The chain ended here; this is not a claim that the destination is safe.
      finalUrl: string;
      hops: RedirectHop[];
      signals: DetectedSignal[];
    }
  | { status: "UNAVAILABLE"; reason: RedirectFailureReason; signals: [] };
