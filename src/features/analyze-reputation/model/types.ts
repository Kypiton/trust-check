import type { AnalysisSource } from "../../../entities/confidence";
import type { DetectedSignal } from "../../../entities/risk";

// CLEAN means absent from the checked lists, never a guarantee of safety.
export type ReputationVerdict = "CLEAN" | "PHISHING" | "MALWARE" | "UNWANTED_SOFTWARE";

export type ReputationFailureReason =
  | "INVALID_URL"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "REDIRECT"
  | "INVALID_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "EXPIRED_RESPONSE";

export type ReputationLookup =
  | {
      status: "COMPLETED";
      verdicts: readonly ReputationVerdict[];
      // Provider's original timestamp. No invented TTL or cached lookup data.
      expiresAt?: string;
    }
  | { status: "SKIPPED"; reason: "MISSING_CONFIGURATION" }
  | { status: "UNAVAILABLE"; reason: ReputationFailureReason };

export type ReputationProvider = (normalizedUrl: string) => Promise<ReputationLookup>;

export type ReputationAnalysis = ReputationLookup & {
  signals: DetectedSignal[];
  source: AnalysisSource;
};
