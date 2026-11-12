"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

export function RiskScore({ value, fresh }: { value: number; fresh: boolean }) {
  const visual = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!fresh || reduced || !visual.current) return;
    const element = visual.current;
    const animation = animate(0, value, { duration: 0.6, ease: "easeOut", onUpdate: number => { element.textContent = String(Math.round(number)); }, onComplete: () => { element.textContent = String(value); } });
    return () => { animation.stop(); element.textContent = String(value); };
  }, [value, fresh, reduced]);
  return <><span className="sr-only">{value} / 100</span><span aria-hidden="true"><span ref={visual}>{value}</span><span className="text-lg font-medium"> / 100</span></span></>;
}
