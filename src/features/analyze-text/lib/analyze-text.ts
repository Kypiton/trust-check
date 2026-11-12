import { calculateRisk, type DetectedSignal, type RiskCalculation } from "../../../entities/risk";
import { detectTextSignals } from "./detectors";

export type TextAnalysis = {
  signals: DetectedSignal[];
  risk: RiskCalculation;
};

/** Unscored evidence for application flows that merge several input sources. */
export function inspectText(text: string): { signals: DetectedSignal[] } {
  return { signals: detectTextSignals(text) };
}

/** English and Russian rule-based evidence; input sufficiency and confidence belong upstream. */
export function analyzeText(text: string): TextAnalysis {
  const { signals } = inspectText(text);
  return { signals, risk: calculateRisk(signals) };
}
