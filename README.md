This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Local PostgreSQL

The development database uses PostgreSQL 17 Alpine in Docker with a named volume
so data survives container restarts. The credentials below are for local use only.

Set this value in the Git-ignored `.env.local`, preserving any existing settings:

```dotenv
DATABASE_URL="postgresql://trustcheck:trustcheck_dev@localhost:5433/trustcheck"
```

Start Docker, then run:

```bash
docker compose up -d --wait --wait-timeout 60
npx prisma migrate deploy
npx prisma validate
npx prisma generate
```

Host port 5433 must be available. `docker compose ps` shows database health.
`docker compose stop` stops PostgreSQL without deleting its data. The named
volume stays outside the repository; do not remove it if you want to keep data.
The `Check` schema stores result metadata only. Authenticated analyses save their
completed or partial assessments; anonymous analyses are never saved.

### Local authentication

Better Auth provides email/password registration at `/register` and sign-in at
`/login`. Set `BETTER_AUTH_URL="http://localhost:3000"` and a cryptographically
random `BETTER_AUTH_SECRET` of at least 32 bytes in the ignored `.env.local`.
Keep the secret stable between restarts and never commit it. `.env.example`
contains only empty placeholders. Apply the existing migrations with the command
above before using authentication.

Passwords must contain at least 10 characters. Better Auth handles password
hashing and database-backed sessions. `/history` requires a validated session;
`/check` remains public. Sign-up, sign-in, and sign-out return to `/check`.
Email verification and password reset are not enabled yet. History displays only
the authenticated user's latest 50 checks, newest first, with dates in UTC.
The list selects lightweight assessment metadata and does not load result JSON
payloads. History rows open authenticated saved results at `/check/[id]`. Each detail query
filters by both Check ID and session user ID. Stored JSON is validated before
rendering; historical scores and confidence are never recalculated. Missing or
other-user checks share the same 404 behavior. Known sample IDs work only in
development. Pagination is not implemented yet.

Saved checks can be permanently deleted individually from History or a saved
result, or cleared together from History and `/account/privacy`. Each action
requires confirmation and a validated session, and the database deletion is
scoped to that user. Missing and other-user IDs return the same unavailable
outcome. Deletion removes saved results from the application database while
keeping accounts and sign-in sessions.

### Analysis persistence

Text, Link, and Screenshot Server Actions save final `COMPLETED` and `PARTIAL`
assessments once, using the server-validated session for ownership. The server-only
Check persistence layer explicitly maps display metadata into Prisma JSON fields;
the optional analysis note is stored as an array in `analysisNotes`. Submitted
content, images, filenames, OCR text, raw URLs, and provider responses are excluded.
Validation errors, failed analyses, and insufficient-data results are not saved.

A successful write adds only `persistedCheckId` to the action response. Session
lookup or storage failures leave the valid analysis intact without an ID. The UI
does not redirect or change its presentation when a Check is saved.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
