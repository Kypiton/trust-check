import "server-only";

import type { InputType, Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/shared/server/db/prisma";
import type { CheckAnalysis } from "../model/types";

export type CheckInputType = InputType;

export function isPersistableAnalysis(
  analysis: CheckAnalysis,
): analysis is Extract<CheckAnalysis, { status: "COMPLETED" | "PARTIAL" }> {
  return analysis.status === "COMPLETED" || analysis.status === "PARTIAL";
}

// The caller supplies a final server-built result, never client-authored metadata.
// Validate primitives rather than coercing objects (including Error/File/Buffer).
function text(value: string): string {
  if (typeof value !== "string") throw new Error("Invalid persistence metadata.");
  return value;
}

/** Persist only explicitly selected display metadata. IDs/timestamps are DB-owned. */
export async function persistCheck(
  userId: string,
  inputType: CheckInputType,
  analysis: CheckAnalysis,
): Promise<string | undefined> {
  if (!isPersistableAnalysis(analysis)) return undefined;
  if (!userId || typeof userId !== "string" || !["TEXT", "URL", "SCREENSHOT"].includes(inputType)) {
    throw new Error("Invalid persistence ownership or input type.");
  }
  const { result } = analysis;
  if (!Number.isInteger(result.riskScore) || result.riskScore < 0 || result.riskScore > 100 ||
      !["LOW", "MEDIUM", "HIGH"].includes(result.riskLevel) ||
      !["LOW", "MEDIUM", "HIGH"].includes(result.confidence)) {
    throw new Error("Invalid persistence assessment.");
  }
  const data: Prisma.CheckUncheckedCreateInput = {
    userId,
    inputType,
    status: analysis.status,
    riskLevel: result.riskLevel,
    riskScore: result.riskScore,
    confidence: result.confidence,
    summary: text(result.summary),
    signals: result.signals.map((signal) => ({
      code: text(signal.code), title: text(signal.title), description: text(signal.description),
    })),
    recommendedActions: result.recommendedActions.map((action) => ({
      code: text(action.code), title: text(action.title),
    })),
    analysisCoverage: result.analysisCoverage.map((source) => ({
      code: text(source.code), status: text(source.status),
    })),
    // The application currently produces one optional sanitized note.
    analysisNotes: result.analysisNote === undefined ? [] : [text(result.analysisNote)],
    completedAt: new Date(),
  };
  const check = await getPrismaClient().check.create({ data, select: { id: true } });
  return check.id;
}
