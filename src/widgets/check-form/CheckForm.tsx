"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CheckAnalysis } from "@/entities/check/model/types";
import { analyzeTextAction } from "@/features/analyze-text/actions/analyze-text-action";
import { analyzeUrlAction } from "@/features/analyze-url/actions/analyze-url-action";
import { analyzeScreenshotAction } from "@/features/analyze-screenshot/actions/analyze-screenshot-action";
import { CheckAnalysisState } from "@/widgets/check-result";
import { ScreenshotInput } from "./ScreenshotInput";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const modes = [
  { value: "TEXT", label: "Text", path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5" },
  { value: "URL", label: "Link", path: "M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7" },
  { value: "SCREENSHOT", label: "Screenshot", path: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M8 7h.01" },
] as const;

type Mode = (typeof modes)[number]["value"];

export function CheckForm({ introduction, children }: { introduction?: ReactNode; children?: ReactNode }) {
  const locale = useLocale();
  const ru = locale === "ru";
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
  const urlRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLDivElement>(null);

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
    if (mode !== "SCREENSHOT") setMode("TEXT");
    setError("");
    focusForm.current = true;
    setAnalysis(null);
  }

  async function runCheck() {
    if (inFlight.current || (mode === "SCREENSHOT" && !file)) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const upload = new FormData();
      if (mode === "SCREENSHOT" && file) { upload.set("file", file); upload.set("language", locale); }
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
      // Transport failures receive the same safe UI as server-side failures.
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
        <CheckAnalysisState analysis={{ status: "ANALYZING", steps: [
          { code: mode, title: mode === "SCREENSHOT" ? (ru ? "Читаем скриншот и проверяем содержимое" : "Reading screenshot and checking its content") : mode === "URL" ? (ru ? "Проверяем структуру ссылки" : "Checking link structure") : (ru ? "Проверяем сообщение" : "Checking message"), status: "CURRENT" },
        ] }} />
      </div>
    );
  }

  if (analysis) {
    return (
      <div ref={resultRef} tabIndex={-1} role="region" aria-label={ru ? "Результат проверки" : "Check result"} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <button type="button" onClick={newCheck} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden="true">←</span> {ru ? "Новая проверка" : "New check"}
        </button>
        <CheckAnalysisState analysis={analysis} onRetry={() => void runCheck()} onNewCheck={newCheck} />
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
              onClick={() => { setMode(item.value); setError(""); }}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${mode === item.value ? "bg-surface text-foreground" : "text-muted hover:bg-surface hover:text-foreground"}`}
            >
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
            <p id={`${id}-count`} className="mt-2 text-right text-xs tabular-nums text-muted">{text.length.toLocaleString(ru ? "ru-RU" : "en-US")} / 10,000</p>
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
        <button type="submit" disabled={disabled} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary">
          {mode === "TEXT" ? (ru ? "Проверить текст" : "Check text") : mode === "URL" ? (ru ? "Проверить ссылку" : "Check link") : (ru ? "Проверить скриншот" : "Check screenshot")}
        </button>
      </form>
      {children}
    </div>
  );
}
