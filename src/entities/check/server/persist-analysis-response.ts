import "server-only";

import { getSession } from "@/shared/server/auth/session";
import type { CheckAnalysis } from "../model/types";
import { isPersistableAnalysis, persistCheck, type CheckInputType } from "./persist-check";

type AnalysisResponse = { ok: false; error: string } | { ok: true; analysis: CheckAnalysis };

/** Called once per Server Action, after processing finishes. Storage is best-effort. */
export async function persistAnalysisResponse<T extends AnalysisResponse>(
  inputType: CheckInputType,
  response: T,
): Promise<T & { persistedCheckId?: string }> {
  if (!response.ok || !isPersistableAnalysis(response.analysis)) return response;
  try {
    const session = await getSession();
    if (!session) return response;
    const persistedCheckId = await persistCheck(session.user.id, inputType, response.analysis);
    return persistedCheckId ? { ...response, persistedCheckId } : response;
  } catch {
    // Session and database errors can contain credentials or submitted content.
    console.error("[TrustCheck] CHECK_PERSISTENCE_FAILED");
    return response;
  }
}
