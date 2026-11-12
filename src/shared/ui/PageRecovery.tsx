"use client";

import Link from "next/link";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function PageRecovery({ notFound = false, retry }: { notFound?: boolean; retry?: () => void }) {
  const ru = useLocale() === "ru";
  return <main className="w-full flex-1 bg-background px-4 py-12 text-foreground md:px-6 md:py-20"><section className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-6 md:p-8"><p className="text-sm font-semibold text-primary">TrustCheck</p><h1 className="mt-3 text-2xl font-semibold tracking-tight">{notFound ? (ru ? "Страница не найдена" : "Page not found") : (ru ? "Что-то пошло не так" : "Something went wrong")}</h1><p className="mt-3 text-sm leading-6 text-muted">{notFound ? (ru ? "Страница не существует или сейчас недоступна." : "The page you’re looking for doesn’t exist or is unavailable.") : (ru ? "Не удалось загрузить страницу. Попробуйте ещё раз или начните новую проверку." : "We couldn’t load this page. Please try again or start a new check.")}</p><div className="mt-6 flex flex-wrap gap-3">{retry && <button type="button" onClick={retry} className={`min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${focus}`}>{ru ? "Попробовать снова" : "Try again"}</button>}<Link href="/check" className={`inline-flex min-h-11 items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-secondary ${focus}`}>{notFound ? (ru ? "Перейти к проверке" : "Go to Check") : (ru ? "Новая проверка" : "Start new check")}</Link><Link href="/" className={`inline-flex min-h-11 items-center rounded-md px-4 py-2 text-sm text-muted hover:text-foreground ${focus}`}>{ru ? "На главную" : "Go home"}</Link></div></section></main>;
}
