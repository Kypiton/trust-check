"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { shouldRenderTrustCoreCanvas } from "./policy";

const TrustCoreCanvas = dynamic(
  () => import("./TrustCoreCanvas").then((module) => module.TrustCoreCanvas),
  {
    ssr: false,
    loading: () => <TrustCoreFallback />,
  },
);

type TrustCoreHeroProps = {
  boosted?: boolean;
  ru?: boolean;
};

type Palette = {
  foreground: string;
  muted: string;
  primary: string;
  danger: string;
  surface: string;
  border: string;
  dark: boolean;
};

const fallbackPalette: Palette = {
  foreground: "#F8FAFC",
  muted: "#94A3B8",
  primary: "#60A5FA",
  danger: "#F87171",
  surface: "#111827",
  border: "#263244",
  dark: true,
};

function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readPalette(): Palette {
  return {
    foreground: cssVar("--tc-foreground", fallbackPalette.foreground),
    muted: cssVar("--tc-muted", fallbackPalette.muted),
    primary: cssVar("--tc-primary", fallbackPalette.primary),
    danger: cssVar("--tc-danger", fallbackPalette.danger),
    surface: cssVar("--tc-surface", fallbackPalette.surface),
    border: cssVar("--tc-border", fallbackPalette.border),
    dark: document.documentElement.classList.contains("dark"),
  };
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;

    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function useTrustCorePalette() {
  const [palette, setPalette] = useState<Palette>(fallbackPalette);

  useEffect(() => {
    const update = () => setPalette(readPalette());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => observer.disconnect();
  }, []);

  return palette;
}

export function TrustCoreHero({ boosted = false, ru = false }: TrustCoreHeroProps) {
  const hostRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const palette = useTrustCorePalette();
  const [nearViewport, setNearViewport] = useState(false);
  const [sceneVisible, setSceneVisible] = useState(true);
  const [browserReady, setBrowserReady] = useState(false);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const preloadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          preloadObserver.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    const visibilityObserver = new IntersectionObserver(([entry]) => setSceneVisible(entry.isIntersecting));
    preloadObserver.observe(node);
    visibilityObserver.observe(node);
    return () => {
      preloadObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const markReady = () => {
      setWebgl(supportsWebGL());
      setBrowserReady(true);
    };

    if (win.requestIdleCallback) idleId = win.requestIdleCallback(markReady, { timeout: 700 });
    else timeoutId = window.setTimeout(markReady, 180);

    return () => {
      if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const useCanvas = shouldRenderTrustCoreCanvas({ nearViewport, browserReady, webgl, reducedMotion });

  return (
    <figure
      ref={hostRef}
      aria-label={ru ? "Декоративная 3D-иллюстрация анализа TrustCheck" : "Decorative TrustCheck 3D analysis illustration"}
      className="relative isolate min-h-[360px] w-full max-w-[560px] justify-self-center overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_24px_80px_rgba(15,23,42,0.08)] md:min-h-[440px]"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,var(--tc-primary-soft),transparent_38%),linear-gradient(180deg,transparent,rgba(15,23,42,0.02))] opacity-80 dark:opacity-50" />

      {useCanvas ? (
        <TrustCoreCanvas boosted={boosted} palette={palette} active={sceneVisible} />
      ) : (
        <TrustCoreFallback boosted={boosted} />
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 sm:left-5 sm:top-5">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/85 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted shadow-sm backdrop-blur-md">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--tc-primary)]" />
          Trust Core
        </span>
      </div>

      <figcaption className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex items-end justify-between gap-4 sm:inset-x-5 sm:bottom-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/78 px-3 py-2 text-[11px] font-medium text-muted shadow-sm backdrop-blur-xl">
          <span className="text-foreground">{ru ? "Сообщение" : "Message"}</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-primary/70" />
          <span className="text-foreground">{ru ? "Ссылка" : "Link"}</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-primary/70" />
          <span className="text-foreground">{ru ? "Скриншот" : "Screenshot"}</span>
        </div>
        <p className="max-w-[11rem] text-right text-[10px] leading-4 text-muted/80">
          {ru ? "Демо-визуализация — не реальный результат." : "Demo visualization — not a real assessment."}
        </p>
      </figcaption>
    </figure>
  );
}

function TrustCoreFallback({ boosted = false }: { boosted?: boolean }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className={`tc-trust-core-fallback relative size-[230px] sm:size-[290px] ${boosted ? "tc-trust-core-fallback--boosted" : ""}`}>
        <div className="absolute inset-[18%] rounded-full border border-primary/30 bg-primary-soft/70 shadow-[0_0_70px_var(--tc-primary-soft),inset_0_0_36px_rgba(255,255,255,0.18)]" />
        <div className="absolute inset-[29%] rounded-full border border-primary/50 bg-surface/60 shadow-[0_0_30px_color-mix(in_srgb,var(--tc-primary)_45%,transparent)] backdrop-blur-md" />
        <div className="absolute inset-[40%] rounded-full bg-primary shadow-[0_0_40px_color-mix(in_srgb,var(--tc-primary)_70%,transparent)]" />
        <div className="tc-trust-core-orbit absolute inset-[4%] rounded-full border border-primary/20" />
        <div className="tc-trust-core-orbit tc-trust-core-orbit--reverse absolute inset-[12%] rotate-[58deg] rounded-full border border-border" />
        <span className="tc-trust-core-node absolute left-[6%] top-[calc(50%-0.375rem)] size-3 rounded-full bg-primary shadow-[0_0_18px_var(--tc-primary)]" />
        <span className="tc-trust-core-node absolute right-[15%] top-[11%] size-2.5 rounded-full bg-danger shadow-[0_0_16px_var(--tc-danger)]" />
        <span className="tc-trust-core-node absolute bottom-[10%] left-[29%] size-2 rounded-full bg-foreground/60" />
      </div>
    </div>
  );
}
