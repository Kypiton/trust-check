"use client";

import { Reveal } from "@/shared/ui/motion/Reveal";
import { TrustCoreHero } from "@/widgets/trust-core";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/shared/i18n/LocaleProvider";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export function HomeContent() {
  const ru = useLocale() === "ru";
  const [trustCoreBoosted, setTrustCoreBoosted] = useState(false);
  const inputs = ru ? [
    { title: "Текст", description: "Вставьте подозрительное SMS, письмо или сообщение из чата. Поддерживаются русский и английский.", path: "M5 4h14v12H9l-4 4V4Zm4 4h6m-6 4h4" },
    { title: "Ссылка", description: "Проверьте структуру ссылки, данные домена, перенаправления и репутацию угроз.", path: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" },
    { title: "Скриншот", description: "Загрузите скриншот: TrustCheck распознает русский или английский текст и найденные ссылки.", path: "M4 3h16v18H4V3Zm0 13 5-5 4 4 3-3 4 4M8 7h.01" },
  ] : [
    { title: "Text", description: "Paste a suspicious text, email, or chat message. Text checks support English and Russian.", path: "M5 4h14v12H9l-4 4V4Zm4 4h6m-6 4h4" },
    { title: "Link", description: "Check a link’s structure, domain information, redirects, and threat reputation.", path: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" },
    { title: "Screenshot", description: "Upload a screenshot to extract readable English or Russian text and links, then check them for warning signs.", path: "M4 3h16v18H4V3Zm0 13 5-5 4 4 3-3 4 4M8 7h.01" },
  ];
  const steps = ru ? [
    ["Добавьте", "Вставьте подозрительное сообщение, ссылку или загрузите скриншот."],
    ["Проверьте", "TrustCheck ищет несколько независимых признаков риска."],
    ["Разберитесь", "Получите оценку риска, уверенность, найденные признаки и рекомендации."],
  ] : [
    ["Submit", "Add a suspicious message, link, or screenshot."],
    ["Analyze", "TrustCheck looks for multiple independent warning signs."],
    ["Understand", "Review the risk score, confidence, detected signals, and recommended actions."],
  ];

  return (
    <main className="w-full flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-[var(--tc-content-max)] px-4 md:px-6 xl:px-8">
        <Reveal><section aria-labelledby="hero-title" className="grid items-center gap-10 py-10 md:grid-cols-2 md:gap-8 md:py-16 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12 lg:py-20">
          <div className="relative z-10">
            <p className="text-sm font-semibold text-primary">{ru ? "Безопасность в интернете — проще" : "Online safety, simplified"}</p>
            <h1 id="hero-title" className="mt-4 max-w-lg text-4xl font-bold leading-tight tracking-tight">{ru ? "Не уверены, что это настоящее?" : "Not sure if it’s real?"}</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted">{ru ? "Проверьте подозрительное сообщение, ссылку или скриншот на признаки мошенничества и фишинга." : "Check suspicious messages, links, and screenshots for signs commonly associated with scams and phishing."}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/check"
                onPointerEnter={() => setTrustCoreBoosted(true)}
                onPointerLeave={() => setTrustCoreBoosted(false)}
                onFocus={() => setTrustCoreBoosted(true)}
                onBlur={() => setTrustCoreBoosted(false)}
                className={`inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover ${focus}`}
              >
                {ru ? "Проверить" : "Check something"}<span aria-hidden="true" className="ml-3">→</span>
              </Link>
              <a href="#how-it-works" className={`inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-surface px-5 py-3 text-sm font-medium hover:bg-surface-secondary ${focus}`}>{ru ? "Как это работает" : "How it works"}</a>
            </div>
            <p className="mt-4 text-sm text-muted">{ru ? "Для проверки аккаунт не нужен." : "No account needed to check."}</p>
          </div>
          <TrustCoreHero boosted={trustCoreBoosted} ru={ru} />
        </section></Reveal>

        <Reveal><section aria-labelledby="inputs-title" className="border-t border-border py-10 md:py-12"><h2 id="inputs-title" className="text-2xl font-semibold tracking-tight">{ru ? "Три способа проверки" : "Three ways to check"}</h2><div className="mt-6 grid gap-4 md:grid-cols-3">{inputs.map(input => <article key={input.title} className="rounded-xl border border-border bg-surface p-5"><svg aria-hidden="true" className="size-6 text-primary" viewBox="-2 -2 28 28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={input.path} /></svg><h3 className="mt-4 font-semibold">{input.title}</h3><p className="mt-2 text-sm leading-6 text-muted">{input.description}</p></article>)}</div></section></Reveal>

        <Reveal><section id="how-it-works" aria-labelledby="steps-title" className="scroll-mt-24 border-t border-border py-10 md:py-12"><h2 id="steps-title" className="text-2xl font-semibold tracking-tight">{ru ? "От сомнений к понятному следующему шагу" : "From uncertainty to a clearer next step"}</h2><ol className="mt-6 grid gap-6 md:grid-cols-3">{steps.map(([title, copy], index) => <li key={title}><span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-surface text-sm font-semibold text-primary">{index + 1}</span><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></li>)}</ol></section></Reveal>

        <Reveal><section aria-labelledby="privacy-title" className="rounded-xl border border-border bg-surface p-5 md:p-6"><h2 id="privacy-title" className="text-xl font-semibold">{ru ? "Что происходит с вашими данными" : "Clarity about your content"}</h2><div className="mt-3 grid gap-4 text-sm leading-6 text-muted md:grid-cols-2 md:gap-8"><div><p>{ru ? "Анонимные проверки не сохраняются. После входа завершённые и частичные результаты автоматически сохраняются в Историю только как метаданные. Любой результат или всю историю можно удалить." : "Anonymous analyses are not saved. When you’re signed in, completed and partial assessments are automatically saved to History as result metadata. You can delete a result or clear your saved History."}</p><p className="mt-3">{ru ? "Исходные сообщения, введённые ссылки, скриншоты и распознанный текст в Истории не сохраняются." : "Raw messages, original submitted links, screenshots, and extracted text are not stored in saved History."}</p></div><div><p>{ru ? "Текст со скриншотов распознаётся на нашем сервере без внешнего OCR-сервиса. Некоторые ссылки могут передаваться внешним сервисам проверки репутации." : "Screenshot text is extracted on our server without an external OCR service. Some link checks may send submitted or detected links to external security providers."}</p><p className="mt-3 font-medium text-foreground">{ru ? "TrustCheck оценивает риск, но не гарантирует безопасность. Низкий риск означает, что найдено меньше тревожных признаков, а не что содержимое точно безопасно." : "TrustCheck provides a risk assessment, not a guarantee of safety. Low Risk means fewer warning signs were detected, not that content is safe."}</p></div></div></section></Reveal>

        <Reveal><section aria-labelledby="final-cta-title" className="py-12 text-center md:py-16"><h2 id="final-cta-title" className="text-2xl font-semibold tracking-tight">{ru ? "Проверьте перед тем, как нажать, заплатить или ответить." : "Check before you click, pay, or reply."}</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted">{ru ? "Быстрая проверка поможет заметить тревожные признаки и выбрать более безопасный следующий шаг." : "A quick check can help you spot warning signs and choose a safer next step."}</p><Link href="/check" className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover ${focus}`}>{ru ? "Начать проверку" : "Start a check"}<span aria-hidden="true" className="ml-3">→</span></Link></section></Reveal>
      </div>
    </main>
  );
}
