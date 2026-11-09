import { describe, expect, it } from "vitest";
import { calculateConfidence, ANALYSIS_SOURCE_LABELS, type AnalysisSource, type AnalysisSourceCode, type AnalysisSourceStatus } from "../index";
import type { SignalCode } from "../../risk";

function source(code: AnalysisSourceCode, status: AnalysisSourceStatus = "COMPLETED"): AnalysisSource {
  return { code, status };
}
function signals(...codes: SignalCode[]) {
  return codes.map((code) => ({ code }));
}

const sourcePoints: [AnalysisSourceCode, number][] = [
  ["TEXT_HEURISTICS", 1], ["URL_STRUCTURE", 1], ["DOMAIN_METADATA", 1],
  ["REDIRECT_ANALYSIS", 1], ["THREAT_REPUTATION", 2], ["AI_CONTEXT", 1], ["SCREENSHOT_EXTRACTION", 1],
];

describe("calculateConfidence", () => {
  it("returns LOW with no sources or evidence", () => {
    expect(calculateConfidence({ sources: [], signals: [] })).toEqual({ level: "LOW", points: 0, completedSources: [], unavailableSources: [] });
  });

  it.each(sourcePoints)("assigns the canonical completed-source points to %s", (code, points) => {
    expect(calculateConfidence({ sources: [source(code)], signals: [] })).toEqual({
      level: points === 1 ? "LOW" : "MEDIUM", points, completedSources: [code], unavailableSources: [],
    });
    expect(ANALYSIS_SOURCE_LABELS[code]).toBeTruthy();
  });

  it.each([
    [0, 1, "LOW"], [1, 1, "LOW"], [2, 2, "MEDIUM"], [3, 2, "MEDIUM"], [4, 3, "MEDIUM"], [5, 3, "MEDIUM"],
  ] as const)("combines one source with %i distinct signals", (count, points, level) => {
    const codes: SignalCode[] = ["ARTIFICIAL_URGENCY", "OTP_REQUEST", "IMPERSONATION", "MONEY_REQUEST", "CREDENTIAL_REQUEST"];
    expect(calculateConfidence({ sources: [source("TEXT_HEURISTICS")], signals: signals(...codes.slice(0, count)) })).toMatchObject({ points, level });
  });

  it("keeps local URL evidence at MEDIUM with three signals and skipped external checks", () => {
    expect(calculateConfidence({
      sources: [source("URL_STRUCTURE"), source("DOMAIN_METADATA", "SKIPPED"), source("THREAT_REPUTATION", "SKIPPED")],
      signals: signals("NO_HTTPS", "BRAND_IMPERSONATION", "LONG_URL"),
    })).toEqual({ points: 2, level: "MEDIUM", completedSources: ["URL_STRUCTURE"], unavailableSources: ["DOMAIN_METADATA", "THREAT_REPUTATION"] });
  });

  it("gives two completed sources plus two signals exactly three points", () => {
    expect(calculateConfidence({ sources: [source("URL_STRUCTURE"), source("DOMAIN_METADATA")], signals: signals("NO_HTTPS", "LONG_URL") })).toMatchObject({ points: 3, level: "MEDIUM" });
  });

  it("reaches HIGH at four points from independent sources", () => {
    expect(calculateConfidence({ sources: [source("URL_STRUCTURE"), source("DOMAIN_METADATA"), source("THREAT_REPUTATION")], signals: [] })).toMatchObject({ points: 4, level: "HIGH" });
  });

  it("adds corroboration to completed URL, domain and reputation sources", () => {
    expect(calculateConfidence({ sources: [source("URL_STRUCTURE"), source("DOMAIN_METADATA"), source("THREAT_REPUTATION")], signals: signals("NO_HTTPS", "LONG_URL") })).toMatchObject({ points: 5, level: "HIGH" });
  });

  it.each(["FAILED", "SKIPPED", "NOT_APPLICABLE"] as const)("does not award points for %s", (status) => {
    const result = calculateConfidence({ sources: [source("THREAT_REPUTATION", status)], signals: [] });
    expect(result).toEqual({ points: 0, level: "LOW", completedSources: [], unavailableSources: status === "NOT_APPLICABLE" ? [] : ["THREAT_REPUTATION"] });
  });

  it("does not treat NOT_APPLICABLE as a failure or change existing points", () => {
    const base = { sources: [source("TEXT_HEURISTICS")], signals: signals("OTP_REQUEST", "IMPERSONATION") };
    expect(calculateConfidence({ ...base, sources: [...base.sources, source("SCREENSHOT_EXTRACTION", "NOT_APPLICABLE")] })).toEqual(calculateConfidence(base));
  });

  it("deduplicates signal codes across detector categories", () => {
    const base = { sources: [source("TEXT_HEURISTICS")], signals: signals("OTP_REQUEST") };
    expect(calculateConfidence({ ...base, signals: [...base.signals, { code: "OTP_REQUEST", category: "AI" } as typeof base.signals[number]] })).toEqual(calculateConfidence(base));
    expect(calculateConfidence({ ...base, signals: signals("OTP_REQUEST", "IMPERSONATION", "OTP_REQUEST", "IMPERSONATION") })).toMatchObject({ points: 2, level: "MEDIUM" });
  });

  it("counts repeated completed sources only once", () => {
    expect(calculateConfidence({ sources: [source("THREAT_REPUTATION"), source("THREAT_REPUTATION")], signals: [] })).toEqual({ points: 2, level: "MEDIUM", completedSources: ["THREAT_REPUTATION"], unavailableSources: [] });
  });

  it("handles conflicting source statuses conservatively regardless of order", () => {
    const sources = [source("THREAT_REPUTATION"), source("THREAT_REPUTATION", "FAILED")];
    const inputSignals = signals("KNOWN_MALICIOUS_DOMAIN");
    const result = calculateConfidence({ sources, signals: inputSignals });
    expect(result).toEqual({ points: 0, level: "LOW", completedSources: [], unavailableSources: ["THREAT_REPUTATION"] });
    expect(calculateConfidence({ sources: [...sources].reverse(), signals: inputSignals })).toEqual(result);
  });

  it.each(["KNOWN_MALICIOUS_DOMAIN", "KNOWN_PHISHING_DOMAIN"] as const)("overrides confidence only with completed reputation and %s", (code) => {
    expect(calculateConfidence({ sources: [source("THREAT_REPUTATION")], signals: signals(code) })).toMatchObject({ points: 2, level: "HIGH" });
    for (const status of ["FAILED", "SKIPPED", "NOT_APPLICABLE"] as const) {
      expect(calculateConfidence({ sources: [source("URL_STRUCTURE"), source("THREAT_REPUTATION", status)], signals: signals(code) })).toMatchObject({ points: 1, level: "LOW" });
    }
    expect(calculateConfidence({ sources: [], signals: signals(code) }).level).toBe("LOW");
  });

  it("ignores risk scores and signal weights", () => {
    const sources = [source("TEXT_HEURISTICS")];
    const lowRisk = { sources, signals: [{ code: "LONG_URL" as const, weight: 5 }], riskScore: 5 };
    const highRisk = { sources, signals: [{ code: "OTP_REQUEST" as const, weight: 35 }], riskScore: 100 };
    expect(calculateConfidence(lowRisk)).toEqual(calculateConfidence(highRisk));
  });

  it("is deterministic and accepts frozen inputs without mutation", () => {
    const sources = Object.freeze([Object.freeze(source("URL_STRUCTURE")), Object.freeze(source("THREAT_REPUTATION", "SKIPPED"))]);
    const inputSignals = Object.freeze(signals("NO_HTTPS", "LONG_URL").map((signal) => Object.freeze(signal)));
    const before = structuredClone({ sources, signals: inputSignals });
    const result = calculateConfidence({ sources, signals: inputSignals });
    expect({ sources, signals: inputSignals }).toEqual(before);
    expect(calculateConfidence({ sources, signals: inputSignals })).toEqual(result);
  });
});
