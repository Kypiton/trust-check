"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearHistoryAction, deleteCheckAction } from "../actions/delete-check-actions";
import { useLocale } from "@/shared/i18n/LocaleProvider";

type Props = { mode: "all"; label?: string } | { mode: "single"; checkId: string; returnToHistory?: boolean; iconOnly?: boolean };
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function DeleteCheckControl(props: Props) {
  const locale = useLocale();
  const ru = locale === "ru";
  const all = props.mode === "all";
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const label = all ? props.label ?? (ru ? "Очистить историю" : "Clear history") : (ru ? "Удалить проверку" : "Delete check");

  function open() {
    setError("");
    setNotice("");
    dialog.current?.showModal();
    cancel.current?.focus();
  }
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = all ? await clearHistoryAction() : await deleteCheckAction(props.checkId);
      if (!result.ok) {
        const translated = result.error === "Sign in to manage your saved checks." ? "Войдите, чтобы управлять сохранёнными проверками." : result.error === "This saved check is unavailable." ? "Сохранённая проверка недоступна." : result.error === "Unable to delete saved checks. Please try again." ? "Не удалось удалить сохранённые проверки. Попробуйте ещё раз." : result.error;
        setError(ru ? translated : result.error); return;
      }
      dialog.current?.close();
      setNotice(all ? (ru ? "История очищена." : "Saved history cleared.") : (ru ? "Проверка удалена." : "Saved check deleted."));
      if (props.mode === "single" && props.returnToHistory) router.replace("/history");
      router.refresh();
    } catch {
      setError(ru ? "Не удалось удалить сохранённые проверки. Попробуйте ещё раз." : "Unable to delete saved checks. Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div>
      <button ref={trigger} type="button" onClick={open} aria-label={label} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-secondary hover:text-danger ${focus}`}>
        {!all && <svg aria-hidden="true" className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6m4-6v6" /></svg>}
        {(all || !props.iconOnly) && label}
      </button>
      {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
      <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { if (busy.current) event.preventDefault(); }} onClose={() => trigger.current?.focus()} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-surface p-6 text-foreground backdrop:bg-foreground/30">
        <h2 id={titleId} className="text-xl font-semibold">{all ? (ru ? "Очистить сохранённую историю?" : "Clear saved history?") : (ru ? "Удалить эту проверку?" : "Delete this check?")}</h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-muted">{all ? (ru ? "Все сохранённые результаты TrustCheck будут удалены без возможности восстановления." : "All of your saved TrustCheck analyses will be permanently deleted.") : (ru ? "Этот сохранённый результат будет навсегда удалён из истории." : "This saved analysis will be permanently removed from your history.")}</p>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div aria-busy={pending} className="mt-6 flex justify-end gap-3">
          <button ref={cancel} type="button" onClick={() => dialog.current?.close()} disabled={pending} className={`min-h-11 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary disabled:opacity-60 ${focus}`}>{ru ? "Отмена" : "Cancel"}</button>
          <button type="button" onClick={confirm} disabled={pending} className={`min-h-11 rounded-md bg-danger-soft px-4 py-2 text-sm font-semibold text-danger disabled:cursor-wait disabled:opacity-60 ${focus}`}>{pending ? (ru ? "Удаляем…" : "Deleting…") : all ? (ru ? "Очистить историю" : "Clear history") : (ru ? "Удалить" : "Delete")}</button>
        </div>
      </dialog>
    </div>
  );
}
