import { CheckForm } from "@/widgets/check-form/CheckForm";

const signals = [
  { title: "Urgency", description: "Pressure and time limits", path: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" },
  { title: "Suspicious links", description: "Risky or misleading URLs", path: "M10 13a5 5 0 0 0 7 .1l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7-.1l-3 3a5 5 0 0 0 7 7l1.7-1.7" },
  { title: "Impersonation", description: "Attempts to look like a trusted organization", path: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM5 21v-2a7 7 0 0 1 14 0v2" },
];

export default function CheckPage() {
  return (
    <main className="w-full flex-1 bg-background px-4 py-10 text-foreground md:px-6 md:py-14 xl:px-8">
      <div className="mx-auto w-full max-w-[var(--tc-result-max)]">
        <CheckForm
          introduction={
            <div className="mb-7 text-center md:mb-8">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Check something suspicious</h1>
              <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-muted">
                Not sure if a message, link or screenshot is trustworthy? Check it before you click, pay or reply.
              </p>
            </div>
          }
        >
          <section aria-labelledby="signals-heading" className="mt-10 border-t border-border pt-7 md:mt-12 md:pt-8">
            <h2 id="signals-heading" className="text-center text-sm font-semibold">What TrustCheck looks for</h2>
            <ul className="mt-6 grid gap-5 md:grid-cols-3 md:gap-6">
              {signals.map((signal) => (
                <li key={signal.title} className="flex items-start gap-3 md:flex-col md:items-center md:text-center">
                  <svg aria-hidden="true" className="size-5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d={signal.path} /></svg>
                  <div>
                    <h3 className="text-sm font-medium">{signal.title}</h3>
                    <p className="mt-1 text-sm leading-5 text-muted">{signal.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </CheckForm>
      </div>
    </main>
  );
}
