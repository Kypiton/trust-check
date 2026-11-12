"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { InteractionButton } from "@/shared/ui/motion/InteractionButton";
import { Toast, useToast } from "@/shared/ui/Toast";
import { AnalysisActivity } from "@/widgets/check-result/AnalysisActivity";
import type { CheckAnalysis } from "@/entities/check/model/types";
import { analyzeTextAction } from "@/features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "@/features/analyze-url/actions/analyze-url-action";
import { analyzeScreenshotAction } from "@/features/analyze-screenshot/actions/analyze-screenshot-action";
import { useLocale } from "@/shared/i18n/LocaleProvider";
import { CheckAnalysisState } from "@/widgets/check-result";
import { LINK_EXAMPLE, suggestedLinkFromText, textExample } from "./check-examples";
import { ScreenshotInput } from "./ScreenshotInput";

const modes = [
  { value: "TEXT", label: "Text", path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5" },
  { value: "URL", label: "Link", path: "M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7" },
  { value: "SCREENSHOT", label: "Screenshot", path: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M8 7h.01" },
] as const;

type Mode = (typeof modes)[number]["value"];

const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function ExampleIcon() {
  return <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3ZM18 13l.8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM6 14l.8 2.2L9 17l-2.2.8L6 20l-.8-2.2L3 17l2.2-.8L6 14Z" /></svg>;
}

export function CheckForm({ introduction, children }: { introduction?: ReactNode; children?: ReactNode }) {
  const locale = useLocale();
  const ru = locale === "ru";
  const id = useId();
  const reduced = useReducedMotion();
  const { notice, notify } = useToast();
  const [mode, setMode] = useState<Mode>("TEXT");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CheckAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [dismissedSuggestion, setDismissedSuggestion] = useState("");
  const inFlight = useRef(false);
  const focusForm = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLDivElement>(null);
  const suggestedLink = suggestedLinkFromText(text);
  const showLinkSuggestion = suggestedLink !== null && dismissedSuggestion !== text.trim();

  useEffect(() => {
    if (pending) return;
    if (analysis) resultRef.current?.focus();
    else if (focusForm.current) {
      if (mode === "URL") urlRef.current?.focus();
      else if (mode === "SCREENSHOT") screenshotRef.current?.focus();
      else textareaRef.current?.focus();
      focusForm.current = false;
    }
  }, [analysis, pending, mode]);

  function newCheck() {
    setText("");
    setUrl("");
    setFile(null);
    setDismissedSuggestion("");
    if (mode !== "SCREENSHOT") setMode("TEXT");
    setError("");
    focusForm.current = true;
    setAnalysis(null);
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
  }

  function useExample() {
    setError("");
    notify(ru ? "Пример добавлен" : "Example loaded");
    if (mode === "TEXT") {
      setText(textExample(locale));
      setDismissedSuggestion("");
      textareaRef.current?.focus();
    } else if (mode === "URL") {
      setUrl(LINK_EXAMPLE);
      urlRef.current?.focus();
    }
  }

  function moveSuggestedLinkToUrl() {
    if (!suggestedLink) return;
    setUrl(suggestedLink);
    setDismissedSuggestion(text.trim());
    setError("");
    focusForm.current = true;
    setMode("URL");
  }

  async function runCheck() {
    if (inFlight.current || (mode === "SCREENSHOT" && !file)) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const upload = new FormData();
      if (mode === "SCREENSHOT" && file) {
        upload.set("file", file);
        upload.set("language", locale);
      }
      const response = mode === "SCREENSHOT"
        ? await analyzeScreenshotAction(upload)
        : mode === "URL"
          ? await analyzeUrlAction(url)
          : await analyzeTextAction(text);
      if (!response.ok) {
        if (response.code === "RATE_LIMITED") {
          const minutes = Math.max(1, Math.ceil(response.retryAfterSeconds / 60));
          setError(ru ? `Слишком много проверок. Попробуйте снова примерно через ${minutes} мин.` : `Too many checks. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`);
        } else {
          const errors: Record<string, string> = {
            "Checks are temporarily unavailable. Please try again shortly.": "Проверки временно недоступны. Попробуйте немного позже.",
            "Enter a text message to check.": "Введите сообщение для проверки.",
            "Enter a message to check.": "Введите сообщение для проверки.",
            "Keep your message to 10,000 characters or fewer.": "Сообщение должно быть не длиннее 10 000 символов.",
            "Enter a valid HTTP or HTTPS link.": "Введите корректную HTTP- или HTTPS-ссылку.",
            "Choose a screenshot to check.": "Выберите скриншот для проверки.",
            "Choose one screenshot to check.": "Выберите один скриншот для проверки.",
            "Choose a PNG, JPG or WebP image.": "Выберите изображение PNG, JPG или WebP.",
            "Choose a screenshot that isn't empty.": "Выберите непустой скриншот.",
            "Choose an image no larger than 10 MiB.": "Выберите изображение размером не более 10 МиБ.",
            "The file contents don't match its image type. Export a new PNG, JPG or WebP screenshot.": "Содержимое файла не соответствует типу изображения. Экспортируйте новый скриншот PNG, JPG или WebP.",
            "We couldn't read this image. Try exporting the screenshot again.": "Не удалось прочитать изображение. Попробуйте экспортировать скриншот заново.",
            "Choose a single still image. Animated screenshots aren't supported.": "Выберите одно статичное изображение. Анимация не поддерживается.",
            "Choose an image with no more than 25 megapixels.": "Выберите изображение не более 25 мегапикселей.",
            "This image is too large to process. Try a smaller screenshot.": "Изображение слишком большое для обработки. Попробуйте уменьшить его.",
            "Screenshot analysis is busy. Please try again shortly.": "Сервис анализа скриншотов занят. Попробуйте немного позже.",
            "This image took too long to prepare. Try a smaller screenshot.": "Подготовка изображения заняла слишком много времени. Попробуйте уменьшить скриншот.",
          };
          const translated = errors[response.error] ?? (response.error.startsWith("Keep your link to ") ? "Ссылка слишком длинная. Используйте адрес короче 2048 символов." : response.error);
          setError(ru ? translated : response.error);
        }
        focusForm.current = true;
        setAnalysis(null);
      } else {
        setAnalysis(response.analysis);
        if (response.analysis.status !== "FAILED") {
          if (mode === "URL") setUrl("");
          else if (mode === "SCREENSHOT") setFile(null);
          else setText("");
        }
      }
    } catch {
      setAnalysis({ status: "FAILED" });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCheck();
  }

  const disabled = mode === "TEXT" ? !text.trim() : mode === "URL" ? !url.trim() : !file;
  const inputClass = "w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  if (pending) {
    return (
      <div aria-busy="true">
        <AnalysisActivity mode={mode} />
      </div>
    );
  }

  if (analysis) {
    return (
      <div ref={resultRef} tabIndex={-1} role="region" aria-label={ru ? "Результат проверки" : "Check result"} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <button type="button" onClick={newCheck} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden="true">←</span> {ru ? "Новая проверка" : "New check"}
        </button>
        <CheckAnalysisState fresh analysis={analysis} onRetry={() => void runCheck()} onNewCheck={newCheck} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[var(--tc-check-max)]">
      {introduction}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div role="group" aria-label={ru ? "Тип содержимого для проверки" : "Content to check"} className="mx-auto grid w-full max-w-sm grid-cols-3 gap-1 rounded-lg border border-border bg-surface-secondary p-1">
          {modes.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              onClick={() => changeMode(item.value)}
              className={`relative isolate flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mode === item.value ? "text-foreground" : "text-muted hover:bg-surface hover:text-foreground"}`}
            >
              {mode === item.value && <motion.span aria-hidden="true" layoutId={`mode-${id}`} initial={false} transition={{ type: "spring", duration: reduced ? 0 : 0.22, bounce: 0 }} className="absolute inset-0 -z-10 rounded-md bg-surface" />}
              <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={item.path} /></svg>
              {ru ? (item.value === "TEXT" ? "Текст" : item.value === "URL" ? "Ссылка" : "Скриншот") : item.label}
            </button>
          ))}
        </div>

        {mode === "TEXT" && (
          <div>
            <label htmlFor={`${id}-text`} className="sr-only">{ru ? "Подозрительное сообщение" : "Suspicious message"}</label>
            <p id={`${id}-language`} className="mb-2 text-sm text-muted">{ru ? "Анализ текста поддерживает русский и английский языки." : "Text analysis supports English and Russian."}</p>
            <textarea
              ref={textareaRef}
              id={`${id}-text`}
              value={text}
              onChange={(event) => { setText(event.target.value); setError(""); }}
              maxLength={10000}
              placeholder={ru ? "Вставьте подозрительное сообщение..." : "Paste the suspicious message here..."}
              aria-invalid={!!error}
              aria-describedby={`${id}-language ${id}-count${error ? ` ${id}-error` : ""}`}
              className={`${inputClass} block min-h-[170px] resize-y md:min-h-[180px]`}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <InteractionButton type="button" onClick={useExample} className={secondaryButton}><ExampleIcon />{ru ? "Попробовать пример" : "Try an example"}</InteractionButton>
              <p id={`${id}-count`} className="text-xs tabular-nums text-muted">{text.length.toLocaleString(ru ? "ru-RU" : "en-US")} / {(10000).toLocaleString(ru ? "ru-RU" : "en-US")}</p>
            </div>
            {showLinkSuggestion && (
              <aside aria-live="polite" className="mt-3 rounded-lg border border-border bg-surface-secondary p-4">
                <div className="flex items-start gap-3">
                  <svg aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{ru ? "Похоже, это ссылка" : "This looks like a link"}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{ru ? "Режим «Ссылка» дополнительно проверяет домен, перенаправления и репутацию угроз." : "Link mode also checks the domain, redirects, and threat reputation."}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <InteractionButton type="button" onClick={moveSuggestedLinkToUrl} className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Проверить как ссылку" : "Check as a link"}</InteractionButton>
                      <InteractionButton type="button" onClick={() => setDismissedSuggestion(text.trim())} className="inline-flex min-h-10 items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Оставить как текст" : "Keep as text"}</InteractionButton>
                    </div>
                  </div>
                </div>
              </aside>
            )}
            {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}

        {mode === "URL" && (
          <div>
            <label htmlFor={`${id}-url`} className="sr-only">{ru ? "Подозрительная ссылка" : "Suspicious link"}</label>
            <input
              ref={urlRef}
              id={`${id}-url`}
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => { setUrl(event.target.value); setError(""); }}
              placeholder="https://example.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-url-error` : undefined}
              className={inputClass}
            />
            <div className="mt-2 flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <InteractionButton type="button" onClick={useExample} className={secondaryButton}><ExampleIcon />{ru ? "Попробовать пример" : "Try an example"}</InteractionButton>
              <span className="text-xs leading-5 text-muted">{ru ? "Пример использует безопасный домен .example" : "Example uses the reserved .example domain"}</span>
            </div>
            {error && <p id={`${id}-url-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}

        {mode === "SCREENSHOT" && (
          <div ref={screenshotRef} tabIndex={-1} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <p className="mb-2 text-sm text-muted">{ru ? "OCR использует русский язык, выбранный в интерфейсе. Переключитесь на EN для английского скриншота." : "OCR uses English, matching the interface language. Switch to RU for a Russian screenshot."}</p>
            <ScreenshotInput file={file} onChange={(value) => { setFile(value); setError(""); }} />
            {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}

        <p className="flex items-start justify-center gap-2 text-sm text-muted">
          <svg aria-hidden="true" className="mt-0.5 size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>
          {ru ? "Исходное содержимое не сохраняется в Истории. Для вошедших пользователей сохраняются только метаданные результата." : "Raw content is not saved to History. Signed-in results are saved as metadata."}
        </p>
        {mode !== "TEXT" && <p className="text-center text-xs leading-5 text-muted">{ru ? "Отправленные или найденные ссылки могут передаваться внешним сервисам проверки безопасности." : "Submitted or detected links may be sent to external security providers."}</p>}
        <InteractionButton type="submit" disabled={disabled} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary">
          {mode === "TEXT" ? (ru ? "Проверить текст" : "Check text") : mode === "URL" ? (ru ? "Проверить ссылку" : "Check link") : (ru ? "Проверить скриншот" : "Check screenshot")}
        </InteractionButton>
      </form>
      {children}
      <Toast notice={notice} />
    </div>
  );
}
