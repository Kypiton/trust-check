"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CheckAnalysis } from "@/entities/check/model/types";
import { analyzeTextAction } from "@/features/analyze-text/actions/analyze-text-action";
import { CheckAnalysisState } from "@/widgets/check-result";
import { ScreenshotInput } from "./ScreenshotInput";

const modes = [
  { value: "TEXT", label: "Text", path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5" },
  { value: "URL", label: "Link", path: "M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7" },
  { value: "SCREENSHOT", label: "Screenshot", path: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M8 7h.01" },
] as const;

type Mode = (typeof modes)[number]["value"];

export function CheckForm({ introduction, children }: { introduction?: ReactNode; children?: ReactNode }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("TEXT");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CheckAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const focusForm = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pending) return;
    if (analysis) resultRef.current?.focus();
    else if (focusForm.current) {
      textareaRef.current?.focus();
      focusForm.current = false;
    }
  }, [analysis, pending]);

  function newCheck() {
    setText("");
    setUrl("");
    setFile(null);
    setMode("TEXT");
    setError("");
    focusForm.current = true;
    setAnalysis(null);
  }

  async function runTextCheck() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await analyzeTextAction(text);
      if (!response.ok) {
        setError(response.error);
        focusForm.current = true;
        setAnalysis(null);
      } else {
        setAnalysis(response.analysis);
        if (response.analysis.status !== "FAILED") setText("");
      }
    } catch {
      // Transport failures receive the same safe UI as server-side failures.
      setAnalysis({ status: "FAILED" });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "TEXT") void runTextCheck();
  }

  const disabled = mode === "TEXT" ? !text.trim() : mode === "URL" ? !url.trim() : !file;
  const inputClass = "w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  if (pending) {
    return (
      <div aria-busy="true">
        <CheckAnalysisState analysis={{ status: "ANALYZING", steps: [
          { code: "TEXT", title: "Checking message", status: "CURRENT" },
        ] }} />
      </div>
    );
  }

  if (analysis) {
    return (
      <div ref={resultRef} tabIndex={-1} role="region" aria-label="Check result" className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <button type="button" onClick={newCheck} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden="true">←</span> New check
        </button>
        <CheckAnalysisState analysis={analysis} onRetry={() => void runTextCheck()} onNewCheck={newCheck} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[var(--tc-check-max)]">
      {introduction}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div role="group" aria-label="Content to check" className="mx-auto grid w-full max-w-sm grid-cols-3 gap-1 rounded-lg border border-border bg-surface-secondary p-1">
          {modes.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              onClick={() => setMode(item.value)}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mode === item.value ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"}`}
            >
              <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg>
              {item.label}
            </button>
          ))}
        </div>

        {mode === "TEXT" && (
          <div>
            <label htmlFor={`${id}-text`} className="sr-only">Suspicious message</label>
            <textarea
              ref={textareaRef}
              id={`${id}-text`}
              value={text}
              onChange={(event) => { setText(event.target.value); setError(""); }}
              maxLength={10000}
              placeholder="Paste the suspicious message here..."
              aria-invalid={!!error}
              aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
              className={`${inputClass} block min-h-[170px] resize-y md:min-h-[180px]`}
            />
            <p id={`${id}-count`} className="mt-2 text-right text-xs tabular-nums text-muted">{text.length.toLocaleString("en-US")} / 10,000</p>
            {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}

        {mode === "URL" && (
          <div>
            <label htmlFor={`${id}-url`} className="sr-only">Suspicious link</label>
            <input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" autoCapitalize="none" spellCheck={false} className={inputClass} />
          </div>
        )}

        {mode === "SCREENSHOT" && <ScreenshotInput file={file} onChange={setFile} />}

        <p className="flex items-start justify-center gap-2 text-sm text-muted">
          <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
          Your content is only used for this analysis.
        </p>
        <button type="submit" disabled={disabled} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary">
          {mode === "TEXT" ? "Check message" : mode === "URL" ? "Check link" : "Check screenshot"}
        </button>
      </form>
      {children}
    </div>
  );
}
