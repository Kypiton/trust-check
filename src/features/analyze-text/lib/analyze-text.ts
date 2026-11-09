import { calculateRisk, type DetectedSignal, type RiskCalculation } from "../../../entities/risk";
import { detectTextSignals } from "./detectors";

export type TextAnalysis = {
  signals: DetectedSignal[];
  risk: RiskCalculation;
};

/** English rule-based evidence only; input sufficiency and confidence belong upstream. */
export function analyzeText(text: string): TextAnalysis {
  const signals = detectTextSignals(text);
  return { signals, risk: calculateRisk(signals) };
}
