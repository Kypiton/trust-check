import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/shared/server/auth/session";
import { DeleteCheckControl } from "@/features/delete-check/ui/DeleteCheckControl";
import { getRequestLocale } from "@/shared/i18n/server";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Understand what TrustCheck saves and manage your saved analysis history.",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  const [session, locale] = await Promise.all([getSession(), getRequestLocale()]);
  const ru = locale === "ru";
  if (!session) redirect("/login");
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 md:py-14 xl:px-8">
      <div className="mx-auto w-full max-w-[var(--tc-result-max)]">
        <Link href="/history" className="rounded-md text-sm text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{ru ? "← История" : "← History"}</Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{ru ? "Приватность" : "Privacy"}</h1>
        <section className="mt-6 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-xl font-semibold">{ru ? "Сохранённые результаты" : "Your saved analyses"}</h2>
          <p className="mt-3 leading-7 text-muted">{ru ? "TrustCheck сохраняет для вошедших пользователей только метаданные результата: риск, уверенность, обнаруженные признаки и рекомендации. Анонимные проверки не сохраняются." : "TrustCheck saves only analysis result metadata for signed-in users. Completed and partial assessments are saved automatically, including risk, confidence, warning signs, and recommended actions. Anonymous analyses are not saved."}</p>
          <p className="mt-4 text-muted">{ru ? "TrustCheck не сохраняет:" : "TrustCheck does not save:"}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>{ru ? "Текст исходного сообщения" : "Submitted message text"}</li><li>{ru ? "Исходные ссылки" : "Original links"}</li><li>{ru ? "Скриншоты" : "Screenshots"}</li><li>{ru ? "Распознанный OCR-текст" : "OCR text"}</li>
          </ul>
          <p className="mt-4 leading-7 text-muted">{ru ? "Некоторые ссылки могут передаваться внешним сервисам проверки безопасности. Распознавание текста со скриншотов выполняется на нашем сервере без внешнего OCR-сервиса." : "Some link checks may send submitted or detected links to external security providers. Screenshot text extraction runs on our server without an external OCR service."}</p>
          <p className="my-5 leading-7 text-muted">{ru ? "Очистка истории навсегда удаляет сохранённые результаты из базы приложения. Аккаунт и активные сессии остаются." : "Clearing saved history permanently removes your saved results from the application database. Your account and sign-in sessions are kept."}</p>
          <DeleteCheckControl mode="all" label={ru ? "Очистить сохранённую историю" : "Clear saved history"} />
        </section>
      </div>
    </main>
  );
}
