"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { InteractionButton } from "@/shared/ui/motion/InteractionButton";
import { Toast, useToast } from "@/shared/ui/Toast";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
const maxSize = 10 * 1024 * 1024;
type SelectionSource = "picker" | "drop" | "paste";

export function ScreenshotInput({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const locale = useLocale();
  const ru = locale === "ru";
  const id = useId();
  const reduced = useReducedMotion();
  const { notice, notify } = useToast();
  const [selectionVersion, setSelectionVersion] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectionSource, setSelectionSource] = useState<SelectionSource | null>(null);
  const dragDepth = useRef(0);

  const selectFiles = useCallback((files: FileList | readonly File[] | null, source: SelectionSource) => {
    const selectedFiles = files ? Array.from(files) : [];
    if (!selectedFiles.length) return;
    const selected = selectedFiles[0];
    const message = selectedFiles.length > 1
      ? (ru ? "Выберите один скриншот за раз." : "Choose one screenshot at a time.")
      : selected.size === 0
        ? (ru ? "Выберите непустой скриншот." : "Choose a screenshot that isn't empty.")
        : !supportedTypes.includes(selected.type)
          ? (ru ? "Выберите изображение PNG, JPG или WebP." : "Choose a PNG, JPG or WebP image.")
          : selected.size > maxSize
            ? (ru ? "Выберите изображение размером не более 10 МБ." : "Choose an image no larger than 10 MB.")
            : "";
    setError(message);
    if (!message) {
      setSelectionVersion(version => version + 1);
      if (source === "paste") notify(ru ? "Скриншот вставлен" : "Screenshot pasted");
    }
    setSelectionSource(message ? null : source);
    onChange(message ? null : selected);
    if (inputRef.current) inputRef.current.value = "";
  }, [onChange, ru, notify]);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const itemFiles = Array.from(clipboard.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((item): item is File => item !== null);
      const files = itemFiles.length > 0 ? itemFiles : Array.from(clipboard.files);
      if (!files.length) return;
      event.preventDefault();
      selectFiles(files, "paste");
    }

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [selectFiles]);

  function clearFile() {
    onChange(null);
    setError("");
    setSelectionSource(null);
  }

  return (
    <div>
      <div
        role="group"
        aria-label={ru ? "Загрузка скриншота" : "Screenshot upload"}
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setIsDragging(false); }}
        onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDragging(false); selectFiles(event.dataTransfer.files, "drop"); }}
        className={`flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-6 text-center transition-colors duration-150 ${isDragging ? "border-primary bg-surface-secondary" : "border-border bg-surface hover:bg-surface-secondary"}`}
      >
        <svg aria-hidden="true" className={`size-8 ${isDragging ? "text-primary" : "text-muted"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
        {file ? (
          <motion.div key={selectionVersion} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }} className="w-full min-w-0" role="status">
            <p className="break-all text-sm font-medium text-foreground">{file.name || (ru ? "Скриншот из буфера" : "Clipboard screenshot")}</p>
            <p className="mt-1 text-sm text-muted">{file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</p>
            {selectionSource === "paste" && <p className="mt-1 text-xs text-success">{ru ? "Вставлено из буфера обмена" : "Pasted from clipboard"}</p>}
            {selectionSource === "drop" && <p className="mt-1 text-xs text-muted">{ru ? "Добавлено перетаскиванием" : "Added by drag and drop"}</p>}
          </motion.div>
        ) : (
          <div>
            <p className="font-medium text-foreground">{ru ? "Перетащите скриншот сюда" : "Drop a screenshot here"}</p>
            <p className="mt-1 text-sm text-muted">{ru ? "или вставьте изображение из буфера" : "or paste an image from your clipboard"}</p>
            <p id={`${id}-hint`} className="mt-2 text-xs text-muted">{ru ? "PNG, JPG или WebP · до 10 МБ · ⌘V / Ctrl+V" : "PNG, JPG or WebP · up to 10 MB · ⌘V / Ctrl+V"}</p>
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
          onChange={(event) => selectFiles(event.target.files, "picker")}
        />
        {file ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <InteractionButton type="button" onClick={() => inputRef.current?.click()} className="min-h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Заменить" : "Replace"}</InteractionButton>
            <button type="button" onClick={clearFile} className="min-h-10 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Удалить" : "Remove"}</button>
          </div>
        ) : (
          <InteractionButton type="button" onClick={() => inputRef.current?.click()} aria-describedby={error ? `${id}-error` : `${id}-hint`} className="min-h-11 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "Выбрать файл" : "Choose file"}</InteractionButton>
        )}
      </div>
      <Toast notice={notice} />
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
