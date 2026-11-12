import { describe, expect, it } from "vitest";
import type { CheckResult } from "@/entities/check/model/types";
import { buildCopiedResult } from "./copy-result";

const result: CheckResult = {
  riskLevel: "HIGH",
  riskScore: 80,
  confidence: "HIGH",
  summary: "Suspicious",
  signals: [
    { code: "OTP_REQUEST", title: "Requests a verification code", description: "Requests a one-time code." },
    { code: "IMPERSONATION", title: "Claims to be a trusted organization", description: "Claims to be a bank." },
  ],
  recommendedActions: [
    { code: "PROTECT_CODES", title: "Do not share verification codes" },
  ],
  analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "COMPLETED" }],
};

describe("buildCopiedResult", () => {
  it("builds a compact English report without raw submitted content", () => {
    const text = buildCopiedResult(result, "en");
    expect(text).toContain("TrustCheck — High Risk");
    expect(text).toContain("Risk score: 80 / 100");
    expect(text).toContain("• Requests a verification code");
    expect(text).toContain("• Do not share verification codes");
    expect(text).toContain("not a guarantee of safety");
  });

  it("localizes the copied report to Russian using signal and action codes", () => {
    const text = buildCopiedResult(result, "ru");
    expect(text).toContain("TrustCheck — Высокий риск");
    expect(text).toContain("Оценка риска: 80 / 100");
    expect(text).toContain("• Запрашивает код подтверждения");
    expect(text).toContain("• Не сообщайте коды подтверждения");
    expect(text).toContain("не является гарантией безопасности");
  });
});
