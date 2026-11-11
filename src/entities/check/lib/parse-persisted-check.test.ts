import { expect, it } from "vitest";
import { parsePersistedCheck } from "./parse-persisted-check";
const row = {
  status: "COMPLETED", riskLevel: "HIGH", riskScore: 81, confidence: "MEDIUM", summary: "Historical assessment.",
  signals: [{ code: "OTP_REQUEST", title: "Code requested", description: "A verification code was requested." }],
  recommendedActions: [{ code: "PROTECT_CODES", title: "Do not share codes" }],
  analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "COMPLETED" }], analysisNotes: ["Historical coverage note."],
};
it.each(["COMPLETED", "PARTIAL"])("maps %s without recalculating historical values", status => {
  const analysis = parsePersistedCheck({ ...row, status });
  expect(analysis).toEqual({ status, result: { riskLevel: "HIGH", riskScore: 81, confidence: "MEDIUM", summary: row.summary, signals: row.signals, recommendedActions: row.recommendedActions, analysisCoverage: row.analysisCoverage, analysisNote: "Historical coverage note." } });
});
it("does not infer a new risk level or confidence from signals or score", () => {
  const analysis = parsePersistedCheck({ ...row, riskLevel: "LOW", riskScore: 81, confidence: "HIGH", signals: [] });
  expect(analysis.result).toMatchObject({ riskLevel: "LOW", riskScore: 81, confidence: "HIGH", signals: [] });
});
it.each([null, []])("allows absent optional notes: %j", analysisNotes => {
  expect(parsePersistedCheck({ ...row, analysisNotes }).result).not.toHaveProperty("analysisNote");
});
it.each([
  { signals: null }, { signals: {} }, { signals: [null] }, { signals: [{ code: "UNKNOWN", title: "x", description: "x" }] },
  { signals: [{ code: "__proto__", title: "x", description: "x" }] }, { signals: [{ code: "OTP_REQUEST", title: {}, description: "x" }] },
  { recommendedActions: {} }, { recommendedActions: [{ code: "PROTECT_CODES", title: 2 }] },
  { analysisCoverage: null }, { analysisCoverage: [{ code: "UNKNOWN", status: "COMPLETED" }] },
  { analysisCoverage: [{ code: "TEXT_HEURISTICS", status: "UNKNOWN" }] },
  { analysisNotes: "not an array" }, { analysisNotes: [{ error: "private" }] },
  { riskScore: NaN }, { riskScore: Infinity }, { riskScore: null }, { riskScore: "0" }, { riskScore: -1 }, { riskScore: 101 }, { riskScore: 0.5 },
  { riskLevel: null }, { riskLevel: "UNKNOWN" }, { confidence: null }, { summary: null },
  { status: "FAILED" }, { status: "INSUFFICIENT_DATA" }, { status: "UNKNOWN" },
])("rejects malformed presentation metadata %j", patch => {
  expect(() => parsePersistedCheck({ ...row, ...patch })).toThrow("Saved result is unavailable.");
});
it("copies only known fields and drops surplus metadata at every JSON level", () => {
  const extra = { userId: "PRIVATE_USER", originalUrl: "PRIVATE_URL", rawInput: "PRIVATE_TEXT" };
  const analysis = parsePersistedCheck({ ...row, ...extra, signals: row.signals.map(value => ({ ...value, ...extra })), recommendedActions: row.recommendedActions.map(value => ({ ...value, ...extra })), analysisCoverage: row.analysisCoverage.map(value => ({ ...value, ...extra })) });
  expect(JSON.stringify(analysis)).not.toContain("PRIVATE_");
});
