"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const subscribeToMount = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

type Notice = { id: number; message: string };

export function useToast() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const sequence = useRef(0);
  const notify = useCallback((message: string) => setNotice({ id: ++sequence.current, message }), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);
  return { notice, notify };
}

export function Toast({ notice }: { notice: Notice | null }) {
  const reduced = useReducedMotion();
  const mounted = useSyncExternalStore(subscribeToMount, clientSnapshot, serverSnapshot);
  // The portal avoids transformed result sections changing the fixed positioning.
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex justify-center md:left-auto md:right-6 md:max-w-sm">
      <div role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence initial={false}>
          {notice && <motion.div key={notice.id} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 8 }} transition={{ duration: reduced ? 0 : 0.18 }} className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground shadow-sm">{notice.message}</motion.div>}
        </AnimatePresence>
      </div>
    </div>, document.body,
  );
}
