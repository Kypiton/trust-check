import { describe, expect, it } from "vitest";
import { calculateRisk } from "./risk-engine";
import type { DetectedSignal, SignalCode } from "../model/types";

function signal(code: SignalCode, category: DetectedSignal["category"] = "TEXT"): DetectedSignal {
  return { code, category, title: code, description: `Evidence for ${code}` };
}

// Independent expectations protect the documented scoring contract.
const weights: [SignalCode, number][] = [
  ["ARTIFICIAL_URGENCY", 10],
  ["CREDENTIAL_REQUEST", 30],
  ["OTP_REQUEST", 35],
  ["MONEY_REQUEST", 20],
  ["CRYPTO_PAYMENT", 20],
  ["GIFT_CARD_PAYMENT", 30],
  ["THREAT_OR_INTIMIDATION", 15],
  ["UNEXPECTED_REWARD", 10],
  ["IMPERSONATION", 20],
  ["NO_HTTPS", 10],
  ["BRAND_IMPERSONATION", 20],
  ["NEW_DOMAIN", 15],
  ["LONG_URL", 5],
  ["IP_ADDRESS_URL", 20],
  ["SHORTENED_URL", 10],
  ["MULTIPLE_REDIRECTS", 10],
  ["DOMAIN_MISMATCH", 30],
  ["KNOWN_MALICIOUS_DOMAIN", 50],
  ["KNOWN_PHISHING_DOMAIN", 50],
];

describe("calculateRisk", () => {
  it.each(["UNKNOWN", "", "constructor", "toString", "__proto__", null, undefined, 42, {}, ["OTP_REQUEST"]])(
    "rejects an unsupported runtime signal code without returning a score (case %#)", (code) => {
      const malformed = { code, category: "URL", title: "Private title", description: "Private description" };
      const input = [signal("OTP_REQUEST"), malformed] as unknown as DetectedSignal[];
      expect(() => calculateRisk(input)).toThrow(new TypeError("Invalid risk evidence."));
    },
  );

  it.each([null, undefined, "OTP_REQUEST", 5, {}])("rejects malformed signal records (case %#)", (record) => {
    expect(() => calculateRisk([record] as unknown as DetectedSignal[])).toThrow("Invalid risk evidence.");
  });

  it.each([null, undefined, {}, "OTP_REQUEST"])("rejects non-array evidence (case %#)", (input) => {
    expect(() => calculateRisk(input as unknown as DetectedSignal[])).toThrow("Invalid risk evidence.");
  });

  it("returns the mathematical zero result for empty input", () => {
    expect(calculateRisk([])).toEqual({ score: 0, level: "LOW", scoredSignals: [] });
  });

  it.each(weights)("assigns the canonical weight to %s", (code, weight) => {
    const input = signal(code);
    const result = calculateRisk([input]);
    expect(result.scoredSignals).toEqual([{ ...input, weight }]);
    const malicious = code === "KNOWN_MALICIOUS_DOMAIN" || code === "KNOWN_PHISHING_DOMAIN";
    expect(result.score).toBe(malicious ? 95 : weight);
  });

  it.each<{ codes: SignalCode[]; score: number; level: string }>([
    { codes: ["ARTIFICIAL_URGENCY"], score: 10, level: "LOW" },
    { codes: ["ARTIFICIAL_URGENCY", "OTP_REQUEST"], score: 45, level: "MEDIUM" },
    { codes: ["OTP_REQUEST", "IMPERSONATION", "DOMAIN_MISMATCH"], score: 85, level: "HIGH" },
    // All canonical weights are multiples of five: 25 and 55 are the nearest reachable scores below the boundaries.
    { codes: ["MONEY_REQUEST", "LONG_URL"], score: 25, level: "LOW" },
    { codes: ["CREDENTIAL_REQUEST"], score: 30, level: "MEDIUM" },
    { codes: ["OTP_REQUEST", "IMPERSONATION"], score: 55, level: "MEDIUM" },
    { codes: ["CREDENTIAL_REQUEST", "DOMAIN_MISMATCH"], score: 60, level: "HIGH" },
  ])("scores $codes as $score / $level", ({ codes, score, level }) => {
    expect(calculateRisk(codes.map((code) => signal(code)))).toMatchObject({ score, level });
  });

  it("deduplicates across detectors and preserves the first explanation in input order", () => {
    const first = signal("OTP_REQUEST");
    const duplicate = { ...signal("OTP_REQUEST", "AI"), title: "AI explanation" };
    const result = calculateRisk([first, duplicate]);
    expect(result).toEqual({ score: 35, level: "MEDIUM", scoredSignals: [{ ...first, weight: 35 }] });
    const next = signal("IMPERSONATION");
    expect(calculateRisk([first, next, duplicate]).scoredSignals.map((item) => item.code)).toEqual(["OTP_REQUEST", "IMPERSONATION"]);
  });

  it("caps heuristic scores above 100", () => {
    const codes: SignalCode[] = ["OTP_REQUEST", "CREDENTIAL_REQUEST", "DOMAIN_MISMATCH", "IMPERSONATION"];
    expect(calculateRisk(codes.map((code) => signal(code)))).toMatchObject({ score: 100, level: "HIGH" });
  });

  it.each(["KNOWN_MALICIOUS_DOMAIN", "KNOWN_PHISHING_DOMAIN"] as const)("applies the reputation floor for %s", (code) => {
    expect(calculateRisk([signal(code, "REPUTATION")])).toMatchObject({ score: 95, level: "HIGH" });
    expect(calculateRisk([signal(code), signal("CREDENTIAL_REQUEST")])).toMatchObject({ score: 95, level: "HIGH" });
    expect(calculateRisk([signal(code), signal("OTP_REQUEST"), signal("IMPERSONATION")])).toMatchObject({ score: 100, level: "HIGH" });
  });

  it("deduplicates reputation evidence before applying the floor", () => {
    const input = signal("KNOWN_PHISHING_DOMAIN", "REPUTATION");
    expect(calculateRisk([input, input])).toEqual({ score: 95, level: "HIGH", scoredSignals: [{ ...input, weight: 50 }] });
  });

  it("ignores any extra detector-supplied weight", () => {
    const input = { ...signal("OTP_REQUEST"), weight: 99 };
    expect(calculateRisk([input])).toMatchObject({ score: 35, scoredSignals: [{ weight: 35 }] });
  });

  it("does not mutate frozen inputs or reuse their objects and is deterministic", () => {
    const input = Object.freeze([
      Object.freeze(signal("OTP_REQUEST")),
      Object.freeze(signal("IMPERSONATION")),
      Object.freeze(signal("OTP_REQUEST", "AI")),
    ]);
    const before = structuredClone(input);
    const first = calculateRisk(input);
    expect(input).toEqual(before);
    expect(first.scoredSignals[0]).not.toBe(input[0]);
    expect(calculateRisk(input)).toEqual(first);
    expect(calculateRisk([...input].reverse()).score).toBe(first.score);
  });
});
