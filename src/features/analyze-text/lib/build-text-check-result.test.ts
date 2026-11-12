import { calculateConfidence } from "../../../entities/confidence";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateRisk } from "../../../entities/risk";
import { analyzeTextAction } from "../actions/analyze-text-action";
import * as analyzer from "./analyze-text";
import * as builder from "./build-text-check-result";
import * as detectors from "./detectors";

const phishing = "URGENT! Your bank account will be suspended. Send us the verification code you receive.";
const normal = "Hi, are we still meeting tomorrow at 6?";

afterEach(() => vi.restoreAllMocks());

function completed(text: string) {
  const response = builder.buildTextCheckResult(text);
  if (!response.ok || response.analysis.status !== "COMPLETED") throw new Error("Expected a completed test result");
  return response.analysis.result;
}

describe("text check orchestration", () => {
  it.each([
    "Терміново надішліть нам ваш пароль та код підтвердження.",
    "Надішліть ваш OTP негайно, інакше рахунок буде заблоковано.",
    "立即发送您的密码和验证码，否则账户将被封锁。",
  ])("does not score clearly unsupported text: %s", async (text) => {
    const analyze = vi.spyOn(analyzer, "analyzeText");
    const response = await analyzeTextAction(text);
    expect(response).toEqual({ ok: true, analysis: { status: "INSUFFICIENT_DATA", reason: "UNSUPPORTED_LANGUAGE" } });
    expect(analyze).not.toHaveBeenCalled();
    expect(response).not.toHaveProperty("analysis.result");
  });

  it.each([phishing, normal, "Hi 李, are we still meeting tomorrow at the café?"])("keeps English-compatible text working and discloses the scope: %s", (text) => {
    expect(completed(text).analysisNote).toBe("Text analysis currently supports English only.");
  });

  it("rejects unsupported runtime detector evidence through the safe action boundary", async () => {
    vi.spyOn(detectors, "detectTextSignals").mockReturnValue([
      { code: "PRIVATE_UNKNOWN_SIGNAL", category: "TEXT", title: "Private", description: "Private" },
    ] as unknown as ReturnType<typeof detectors.detectTextSignals>);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await analyzeTextAction(normal)).toEqual({ ok: true, analysis: { status: "FAILED" } });
    expect(error).toHaveBeenCalledExactlyOnceWith("[TrustCheck] TEXT_ANALYSIS_FAILED");
  });

  it("uses real detection and Risk Engine scoring for phishing", () => {
    const result = completed(phishing);
    const analysis = analyzer.analyzeText(phishing);
    expect(result.riskScore).toBe(calculateRisk(analysis.signals).score);
    expect(result.riskScore).toBe(60);
    expect(result.riskLevel).toBe("HIGH");
    expect(result.summary).toBe("This message contains several signs commonly associated with scams or phishing.");
    expect(result.signals.map((signal) => signal.code)).toEqual(analysis.signals.map((signal) => signal.code));
  });

  it("returns a real LOW result for a normal message", () => {
    expect(completed(normal)).toMatchObject({ riskScore: 0, riskLevel: "LOW", confidence: "LOW", signals: [], summary: "No strong signs of fraud were detected." });
  });

  it("maps a MEDIUM result", () => {
    expect(completed("Send us the verification code.")).toMatchObject({ riskScore: 35, riskLevel: "MEDIUM", confidence: "LOW", summary: "Some suspicious signs were detected." });
  });

  it.each([
    [normal, "LOW"],
    ["Send us the verification code.", "LOW"],
    [phishing, "MEDIUM"],
  ])("uses coverage-based confidence independently of risk for %s", (text, confidence) => {
    const result = completed(text);
    const computed = calculateConfidence({ sources: result.analysisCoverage, signals: analyzer.analyzeText(text).signals });
    expect(result.confidence).toBe(confidence);
    expect(result.confidence).toBe(computed.level);
  });

  it.each([
    ["Send your OTP.", "Do not share verification codes"],
    ["Send your password.", "Do not share passwords or login credentials"],
    ["Send money.", "Do not send money until the request is independently verified"],
    ["Buy gift cards.", "Do not purchase or share gift card codes"],
    ["Send Bitcoin.", "Do not send cryptocurrency until the recipient is independently verified"],
    ["This is your bank.", "Contact the organization through its official website or phone number"],
    ["You will be arrested.", "Do not act under pressure; verify the claim independently"],
  ])("derives the recommendation from %s", (text, title) => {
    expect(completed(text).recommendedActions.map((action) => action.title)).toEqual([title]);
  });

  it("deduplicates recommendations across signals and duplicate input signals", () => {
    const signals = analyzer.analyzeText(phishing).signals;
    const actions = builder.buildTextRecommendations([...signals, ...signals]);
    expect(actions.filter((action) => action.code === "VERIFY_PRESSURE")).toHaveLength(1);
    expect(actions.filter((action) => action.code === "PROTECT_CODES")).toHaveLength(1);
    expect(actions).toHaveLength(2);
  });

  it("does not claim absent signals or completed detector families", () => {
    const result = completed(normal);
    expect(result.recommendedActions.map((action) => action.code)).toEqual(["VERIFY_REQUESTS"]);
    expect(result.analysisCoverage).toEqual([{ code: "TEXT_HEURISTICS", status: "COMPLETED" }]);
  });

  it("copies the analysis score instead of recalculating weights in the adapter", () => {
    const analysis = analyzer.analyzeText(phishing);
    analysis.risk = { ...analysis.risk, score: 77, level: "HIGH" };
    expect(builder.mapTextCheckResult(analysis).riskScore).toBe(77);
    expect(builder.mapTextCheckResult(analysis).confidence).toBe("MEDIUM");
  });

  it.each(["Hello", "...", "1234567890123456", "abcdefghijklmno"])("returns insufficient data without a score for %j", (text) => {
    expect(builder.buildTextCheckResult(text)).toEqual({ ok: true, analysis: { status: "INSUFFICIENT_DATA" } });
  });

  it("does not discard short input with real detected evidence", () => {
    expect(completed("Pay now")).toMatchObject({ riskScore: 20, riskLevel: "LOW" });
  });

  it("trims input before invoking the analyzer", () => {
    const spy = vi.spyOn(analyzer, "analyzeText");
    builder.buildTextCheckResult(` \n ${normal} \t `);
    expect(spy).toHaveBeenCalledExactlyOnceWith(normal);
  });
});

describe("server action boundary and privacy", () => {
  it.each([undefined, null, 7, {}, [], true, "", " \n\t ", "x".repeat(10001), ` ${"x".repeat(10000)}`])("rejects invalid input (case %#) without invoking analysis", async (value) => {
    const spy = vi.spyOn(analyzer, "analyzeText");
    const response = await analyzeTextAction(value);
    expect(response.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(response).not.toHaveProperty("analysis");
  });

  it("accepts exactly 10,000 characters", async () => {
    const response = await analyzeTextAction("word ".repeat(2000));
    expect(response.ok).toBe(true);
  });

  it("returns serializable display data without the message or private fragments", async () => {
    const secret = "PRIVATE_ACCOUNT_8791";
    const text = `${phishing} ${secret}`;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeTextAction(text);
    const serialized = JSON.stringify(response);
    expect(JSON.parse(serialized)).toEqual(response);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(text);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("reports unexpected failures without logging or returning sensitive exception details", async () => {
    const secret = "PRIVATE_ACCOUNT_8791";
    vi.spyOn(analyzer, "analyzeText").mockImplementation(() => { throw new Error(secret); });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await analyzeTextAction(`${normal} ${secret}`);
    expect(response).toEqual({ ok: true, analysis: { status: "FAILED" } });
    expect(error).toHaveBeenCalledExactlyOnceWith("[TrustCheck] TEXT_ANALYSIS_FAILED");
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
  });
});

// Keep existing engine/orchestration tests independent of session/database state.
vi.mock("@/entities/check/server", () => ({
  persistAnalysisResponse: vi.fn(async (_inputType: string, response: unknown) => response),
}));

// Existing analysis/persistence tests do not consume application quotas.
vi.mock("@/shared/server/rate-limit", () => ({ checkAnalysisRateLimit: vi.fn(async () => null) }));
