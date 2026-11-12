"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useAnimationControls, useInView, useReducedMotion } from "motion/react";

/** Visible during SSR and without JS; each mounted section reveals at most once. */
export function Reveal({ children, className, delay = 0, enabled = true }: { children: ReactNode; className?: string; delay?: number; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const played = useRef(false);
  const visible = useInView(ref, { once: true, amount: 0.1 });
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduced || !enabled) { controls.stop(); controls.set({ opacity: 1, y: 0 }); return; }
    if (!visible || played.current) return;
    played.current = true;
    void controls.start({ opacity: [0, 1], y: [10, 0], transition: { duration: 0.3, delay, ease: "easeOut" } });
  }, [visible, enabled, reduced, controls, delay]);
  return <motion.div ref={ref} initial={false} animate={controls} className={className}>{children}</motion.div>;
}
