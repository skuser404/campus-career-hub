# Campus Career Hub

A placement portal for **Jain University** — roughly 1,400 students.

Opportunities arrive as links in WhatsApp groups. A link posted on Monday is
unreachable by Friday, nobody can remember what they already applied to, and
deadlines get missed. This replaces that with a searchable, deadline-aware,
application-tracked system that every student reaches with one Google tap.

**Next.js 15 · React 19 · TypeScript · Tailwind v4 · Express · PostgreSQL ·
Drizzle · Google Sign-In · JWT · Cloudinary**

**Live:** web on Vercel, API + PostgreSQL on Render.

---

## Authentication — Google, domain-gated, auto-create

- **Students sign in with Google.** The only gate is the email domain: any
  verified `@jainuniversity.ac.in` Google account is let in, and one that has
  never signed in before has a student account **created automatically** from the
  Google profile (name, email, photo). No import, no passwords, no USN. The domain
  is the guest list.
- **The admin keeps an email + password login** as a guaranteed way in that never
  depends on Google being reachable.
- Sessions are JWTs in **`httpOnly` cookies** (15-min access, rotating 7-day
  refresh stored SHA-256-hashed and revocable). JavaScript cannot read them, so an
  XSS bug cannot steal a session.

The Google ID token is verified server-side against Google's public keys, with the
audience pinned to our OAuth Client ID and the expiry enforced — a forged or
replayed token buys nothing. Google proving *who* someone is does not bypass the
domain check.

> Google Sign-In is **optional at the infrastructure level**: with no
> `GOOGLE_CLIENT_ID` set, the button is hidden and the API's Google endpoint
> returns 503, leaving password login working. Set the Client ID in both apps to
> switch it on — see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

---

## What students get

Every signed-in student sees **every published opportunity** — one shared list,
no per-department gating. They can search (Postgres full-text, not `LIKE`), filter,
open a detail page, **Save**, **Mark as Applied**, track application history, browse
companies, read announcements, and get notified when something new is posted.

## What the admin gets

Full CRUD over opportunities, companies, categories, tags, announcements, banners,
departments, students, and site settings — plus analytics computed from real
tables. Every edit is live immediately; nothing needs a redeploy.

### Paste a WhatsApp message → publish

The headline admin feature. Paste a forwarded placement message into
**Opportunities → New**, hit **Extract details**, and a heuristic parser pulls out
the role, company, eligibility, salary, location, mode, deadline, application link
and tags — filling the form for you to review, edit, and publish. It runs
server-side in a millisecond, calls no external service, and never guesses: a field
it is unsure about is left blank rather than filled with something wrong.

---

## Architecture

An npm-workspaces monorepo. Two deployables, one shared contract.

```
packages/shared/   Zod schemas + inferred types. THE contract.
                   The API validates with it; the forms resolve with it; both
                   sides' types are z.infer of it. No second definition to drift.

apps/api/          Express + Drizzle
  db/schema.ts       normalized Postgres: users, jobs, companies, categories,
                     tags, applications, saved_jobs, notifications, announcements,
                     banners, departments, audit_logs, refresh_tokens, job_views…
  lib/google.ts      Google ID-token verification
  modules/auth/      Google auto-create + admin password + rotating refresh
  modules/jobs/      queries, and parser.service.ts (WhatsApp extraction)

apps/web/           Next.js 15 App Router
  (auth)/            login (Google + password), first-login
  (site)/            dashboard · opportunities · companies · saved ·
                     applications · notifications · profile · settings
  admin/             jobs (+ WhatsApp paste) · students · departments ·
                     companies · categories · announcements · banners ·
                     analytics · settings
```

### Split-hosting note (important)

Web (Vercel) and API (Render) are on different domains. A cookie the API sets is
third-party to the web page — invisible to middleware and blocked by many
browsers. So the web app **proxies `/api/v1/*` to the API through a Next.js
rewrite**, making every request same-origin and the auth cookie first-party. This
is why login works across the two hosts; see `apps/web/next.config.ts`.

---

## Quick start

**Prerequisites:** Node 20+, PostgreSQL 17 (or `docker compose up -d postgres`).

```bash
npm install
cp .env.example .env      # fill in DB URL + two different JWT secrets
createdb campus_career_hub
npm run db:migrate
npm run db:seed           # demo data, or db:seed:minimal for just admin + scaffolding

npm run dev               # api :4000 · web :3000
```

Admin (password): `admin@jainuniversity.ac.in`. Students sign in with Google once
a `GOOGLE_CLIENT_ID` is configured.

---

## Verification

```bash
npm run verify     # typecheck + lint + build, all workspaces — all clean
npm test           # 51 tests against a REAL Postgres, no mocks
```

The suite covers auth (domain lock, admin fallback, the Google endpoint's
guardrails), the mass-assignment guard, ownership/IDOR boundaries, the
all-students-see-all visibility model with status still gating drafts, CORS/CSRF,
and the WhatsApp parser (including day-first Indian date parsing).

Two bugs were caught by executing the code and could not have been caught any
other way: `jsonwebtoken` throwing when a `subject` option duplicates the payload
`sub`, and `err instanceof ZodError` silently failing across module realms so every
validation error became a 500. Both fixed, both now regression-tested.

---

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — design and trade-offs
- [docs/API.md](./docs/API.md) — every endpoint
- [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) — Render + Vercel + Google, step by step
- [.env.example](./.env.example) — every variable, documented

## Security summary

| Threat | Control |
|--------|---------|
| Outsider gaining access | Google domain lock (`@jainuniversity.ac.in`) in Zod, in the service, **and** as a database CHECK; ID token verified against Google's keys |
| Privilege escalation | `role` absent from every self-service schema; changing it is admin-only and refuses to demote the last admin |
| IDOR | Ownership is a `WHERE` clause, not an `if` |
| XSS → session theft | `httpOnly` cookies; React escaping; no `dangerouslySetInnerHTML` of user input |
| CSRF | Cross-site cookies force an **Origin allowlist** check on every mutation |
| Token theft | Access 15 min; refresh rotates, stored SHA-256-hashed, reuse ⇒ revoke the family |
| SQL injection | Drizzle parameterises everything; zero string-concatenated SQL |
| Brute force | Rate limits: 5 failures / 15 min on auth, 60/min on mutations |
| Header attacks | Helmet — CSP, HSTS, nosniff, frameguard; `x-powered-by` hidden |
| Insider risk | `audit_logs` records every admin mutation with actor, entity and IP |
| Secret leakage | Every env var Zod-validated at boot; the API refuses to start if one is missing or malformed |
