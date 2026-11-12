"use client";

import { useId, useRef, useState } from "react";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
const maxSize = 10 * 1024 * 1024;

export function ScreenshotInput({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const locale = useLocale();
  const ru = locale === "ru";
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  function selectFile(files: FileList | null) {
    if (!files?.length) return;
    const selected = files[0];
    const message = files.length > 1
      ? (ru ? "Выберите один скриншот за раз." : "Choose one screenshot at a time.")
      : selected.size === 0
        ? (ru ? "Выберите непустой скриншот." : "Choose a screenshot that isn't empty.")
      : !supportedTypes.includes(selected.type)
        ? (ru ? "Выберите изображение PNG, JPG или WebP." : "Choose a PNG, JPG or WebP image.")
        : selected.size > maxSize
          ? (ru ? "Выберите изображение размером не более 10 МБ." : "Choose an image no larger than 10 MB.")
          : "";
    setError(message);
    onChange(message ? null : selected);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current === 0) setIsDragging(false); }}
        onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDragging(false); selectFile(event.dataTransfer.files); }}
        className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center transition-colors duration-150 hover:bg-surface-secondary ${isDragging ? "border-primary bg-surface-secondary" : "border-border bg-surface"}`}
      >
        <svg aria-hidden="true" className="size-7 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
        {file ? (
          <div className="w-full min-w-0" role="status">
            <p className="break-all text-sm font-medium text-foreground">{file.name}</p>
            <p className="mt-1 text-sm text-muted">{file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</p>
          </div>
        ) : (
          <div>
            <p className="font-medium text-foreground">{ru ? "Перетащите скриншот сюда" : "Drop a screenshot here"}</p>
            <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{ru ? "PNG, JPG или WebP — до 10 МБ" : "PNG, JPG or WebP — up to 10 MB"}</p>
          </div>
        )}
        <input
          ref={inputRef}
          id={id}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          aria-label={ru ? "Выбрать скриншот" : "Choose a screenshot"}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : !file ? `${id}-hint` : undefined}
          onChange={(event) => selectFile(event.target.files)}
        />
        {file ? (
          <button type="button" onClick={() => { onChange(null); setError(""); }} className="min-h-11 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Удалить" : "Remove"}</button>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} aria-describedby={error ? `${id}-error` : `${id}-hint`} className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Выбрать файл" : "Choose file"}</button>
        )}
      </div>
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
