import type { Metadata } from "next";
import { CheckForm } from "@/widgets/check-form/CheckForm";
import { getRequestLocale } from "@/shared/i18n/server";

export const metadata: Metadata = {
  title: "Check something suspicious",
  description: "Check suspicious text, links, or screenshots for scam and phishing warning signs.",
};

const paths = [
  "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  "M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21v-2a7 7 0 0 1 14 0v2",
];

export default async function CheckPage() {
  const ru = (await getRequestLocale()) === "ru";
  const signals = ru ? [
    { title: "Срочность", description: "Давление и ограничение по времени", path: paths[0] },
    { title: "Подозрительные ссылки", description: "Рискованные или вводящие в заблуждение адреса", path: paths[1] },
    { title: "Выдача себя за организацию", description: "Попытки выглядеть как доверенный банк, сервис или компания", path: paths[2] },
  ] : [
    { title: "Urgency", description: "Pressure and time limits", path: paths[0] },
    { title: "Suspicious links", description: "Risky or misleading URLs", path: paths[1] },
    { title: "Impersonation", description: "Attempts to look like a trusted organization", path: paths[2] },
  ];

  return <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 md:py-14 xl:px-8"><div className="mx-auto w-full max-w-[var(--tc-result-max)]"><CheckForm introduction={<div className="mb-7 text-center md:mb-8"><h1 className="text-3xl font-bold tracking-tight md:text-4xl">{ru ? "Проверьте что-то подозрительное" : "Check something suspicious"}</h1><p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted">{ru ? "Не уверены в сообщении, ссылке или скриншоте? Проверьте их перед тем, как нажать, заплатить или ответить." : "Not sure if a message, link or screenshot is trustworthy? Check it before you click, pay or reply."}</p></div>}><section aria-labelledby="signals-heading" className="mt-10 border-t border-border pt-7 md:mt-12 md:pt-8"><h2 id="signals-heading" className="text-center text-sm font-semibold">{ru ? "Что ищет TrustCheck" : "What TrustCheck looks for"}</h2><ul className="mt-6 grid gap-5 md:grid-cols-3 md:gap-6">{signals.map(signal => <li key={signal.title} className="flex items-start gap-3 md:flex-col md:items-center md:text-center"><svg aria-hidden="true" className="size-5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={signal.path} /></svg><div><h3 className="text-sm font-medium">{signal.title}</h3><p className="mt-1 text-sm leading-5 text-muted">{signal.description}</p></div></li>)}</ul></section></CheckForm></div></main>;
}
