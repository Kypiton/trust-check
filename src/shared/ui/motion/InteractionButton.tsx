"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

/** Native button semantics and focus styles belong to the caller. */
export function InteractionButton(props: HTMLMotionProps<"button">) {
  const reduced = useReducedMotion();
  const interactive = !reduced && !props.disabled;
  return <motion.button {...props} whileHover={interactive ? { y: -1 } : undefined} whileTap={interactive ? { scale: 0.985, y: 0 } : undefined} transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.5 }} />;
}
