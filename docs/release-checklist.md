# TrustCheck release checklist

Complete on the selected production host before opening public traffic. Use disposable
accounts and synthetic content; remove test data afterward. Record the release SHA,
origin and operator/date in the deployment record. Local validation is not a substitute
for checking the deployed proxy, native dependencies and database.

## Application and environment
- [ ] Tests, lint (zero warnings), TypeScript, Prisma validation/generation pass.
- [ ] Webpack production build succeeds; `next start` is used, not `next dev`.
- [ ] Canonical APP_URL and matching BETTER_AUTH_URL are the real public HTTPS origin (not an example/test placeholder) and are set at build/runtime.
- [ ] Independent auth/rate-limit secrets and database credentials are in the secret store.
- [ ] PostgreSQL migrations are applied/status clean; backup/restore and rollback are understood.
- [ ] Native Sharp/Tesseract workers and EN/RU trained data are present in the artifact.

## Auth and analysis
- [ ] Register, login, logout; anonymous protected routes redirect; expired sessions recover safely.
- [ ] EN Text and RU Text; Link; English screenshot OCR and Russian screenshot OCR.
- [ ] Optional Web Risk credentials work, or the skipped coverage is understood.
- [ ] Development preview IDs cannot show fixture assessments in production.

## Privacy, caching and security
- [ ] Anonymous checks are not persisted; signed-in results store only metadata.
- [ ] Raw messages/URLs/images/OCR/provider payloads are absent from saved History and logs.
- [ ] Two users cannot read/delete each other's results; missing/foreign IDs behave identically.
- [ ] Delete one and clear all work; accounts/sessions remain; temporary test records are removed.
- [ ] Private HTML/RSC/API responses are not shared by a proxy/CDN cache.
- [ ] Analysis/auth quotas apply; denial does not invoke providers or persist a result.
- [ ] Proxy overwrites one trusted IP header, spoofed headers cannot bypass quotas, direct origin is blocked.
- [ ] SSRF smoke: loopback/private/link-local targets are blocked without network access to those targets.
- [ ] Secrets are absent from Git, generated public assets and browser bundles.
- [ ] HTTPS/certificate renewal, framing/nosniff/referrer/permissions headers verified.
- [ ] HSTS policy reviewed at the HTTPS edge; full CSP considered/tested separately.
- [ ] Rate-limit cleanup/retention and operational monitoring have an owner.

## Product and SEO
- [ ] Light/dark, EN/RU, mobile/tablet/desktop, keyboard focus and reduced motion.
- [ ] Copy result, examples, smart paste, screenshot file/drop/clipboard, error recovery.
- [ ] `/` and `/check` canonical URLs use the real origin, without user data.
- [ ] History/auth/account/saved results/API are noindex; unknown routes return safe 404s.
- [ ] `/robots.txt` has intentional private exclusions and the real sitemap URL.
- [ ] `/sitemap.xml` lists only `/` and `/check`; no private IDs or artificial timestamps.
- [ ] OG/Twitter image, favicon and Apple icon render correctly from the real host.
