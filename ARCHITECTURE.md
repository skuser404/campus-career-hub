# Campus Career Hub — Architecture

> Centralized platform for placement, internship, hackathon, certification and event
> opportunities. Replaces the "lost in a WhatsApp group" workflow with a searchable,
> deadline-aware, application-tracked system.

---

## 1. The problem, stated precisely

Opportunities arrive as unstructured links in chat. Three things break:

1. **Discovery** — a link posted on Monday is unreachable by Friday. Solved by a
   structured, indexed, searchable `jobs` table.
2. **Memory** — students cannot recall what they already applied to. Solved by an
   `applications` table with a real status lifecycle, not a boolean.
3. **Deadlines** — nothing surfaces "closes in 2 days". Solved by a first-class
   `deadline` column, indexed, and driven into dashboard sorting and badges.

Every design decision below traces back to one of these three.

---

## 2. Repository structure

An npm-workspaces monorepo. Two deployables, one shared contract.

```
campus-career-hub/
├── package.json                  # workspaces root, orchestration scripts
├── tsconfig.base.json            # shared compiler options, path aliases
├── .env.example                  # every variable, documented, no secrets
├── .gitignore
├── ARCHITECTURE.md
├── README.md
│
├── packages/
│   └── shared/                   # THE CONTRACT — imported by both apps
│       ├── src/
│       │   ├── schemas/          # Zod: auth, job, company, category,
│       │   │                     #      application, announcement, banner,
│       │   │                     #      user, settings, pagination
│       │   ├── types/            # types INFERRED from the Zod schemas
│       │   ├── constants/        # enums, roles, statuses, limits
│       │   └── index.ts
│       └── package.json
│
├── apps/
│   ├── api/                      # Express + TypeScript
│   │   ├── src/
│   │   │   ├── index.ts          # entrypoint: listen, graceful shutdown
│   │   │   ├── app.ts            # express app: middleware chain, routes
│   │   │   ├── config/           # env parsing (Zod-validated), constants
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     # Drizzle table definitions
│   │   │   │   ├── client.ts     # pool + drizzle instance
│   │   │   │   ├── migrations/   # generated SQL, committed
│   │   │   │   └── seed.ts       # idempotent seed
│   │   │   ├── middleware/       # auth, rbac, validate, rateLimit,
│   │   │   │                     # errorHandler, notFound, requestId
│   │   │   ├── modules/          # one folder per domain
│   │   │   │   ├── auth/         # *.routes.ts *.controller.ts *.service.ts
│   │   │   │   ├── jobs/
│   │   │   │   ├── companies/
│   │   │   │   ├── categories/
│   │   │   │   ├── tags/
│   │   │   │   ├── applications/
│   │   │   │   ├── saved/
│   │   │   │   ├── users/
│   │   │   │   ├── announcements/
│   │   │   │   ├── banners/
│   │   │   │   ├── settings/
│   │   │   │   ├── uploads/
│   │   │   │   └── analytics/
│   │   │   ├── lib/              # jwt, password, cloudinary, logger,
│   │   │   │                     # errors, pagination, slugify, audit
│   │   │   └── tests/            # vitest + supertest
│   │   └── package.json
│   │
│   └── web/                      # Next.js 15 App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── (marketing)/  # public: landing
│       │   │   ├── (auth)/       # login, register
│       │   │   ├── (student)/    # dashboard, opportunities, saved,
│       │   │   │                 # applications, profile, settings
│       │   │   ├── (admin)/      # admin console
│       │   │   ├── layout.tsx    # providers, theme, fonts
│       │   │   └── globals.css   # Tailwind v4 + design tokens
│       │   ├── components/
│       │   │   ├── ui/           # shadcn primitives
│       │   │   ├── jobs/         # JobCard, JobFilters, JobGrid, ...
│       │   │   ├── admin/        # DataTable, forms, ...
│       │   │   └── layout/       # Navbar, Sidebar, Footer, ThemeToggle
│       │   ├── hooks/            # TanStack Query hooks, one per resource
│       │   ├── lib/              # api client, auth, utils, query client
│       │   ├── providers/        # Theme, Query, Auth
│       │   └── middleware.ts     # redirect-only route guard
│       └── package.json
```

**Why a shared package.** A Zod schema written once is the single definition of
"what a valid job is". The API validates with it; the browser form validates with
the same object; both sides' TypeScript types are `z.infer` of it. There is no
second place to update, so the client and server cannot silently disagree.

---

## 3. Database

PostgreSQL, normalized to 3NF. Drizzle ORM for type-safe, parameterized access.

### 3.1 Tables

| # | Table | Purpose |
|---|-------|---------|
| 1 | `users` | Students and admins. One table, discriminated by `role`. |
| 2 | `companies` | Normalized out of `jobs` — a company posts many jobs. |
| 3 | `categories` | Placement / Internship / Hackathon / Certification / Event. |
| 4 | `jobs` | The core opportunity record. |
| 5 | `tags` | Free-form skill/tech labels ("React", "DSA", "Remote-friendly"). |
| 6 | `job_tags` | Many-to-many join: jobs ↔ tags. |
| 7 | `saved_jobs` | Bookmarks. Join table, composite PK. |
| 8 | `applications` | "Mark as Applied" + status lifecycle + history. |
| 9 | `announcements` | Admin broadcasts, time-windowed. |
| 10 | `banners` | Homepage promo slots, ordered, time-windowed. |
| 11 | `site_settings` | Key/JSONB store for "Website settings". |
| 12 | `refresh_tokens` | Hashed, rotating, revocable sessions. |
| 13 | `audit_logs` | Who changed what, when. Admin accountability. |
| 14 | `job_views` | View events, so Analytics reports facts not guesses. |

### 3.2 Column detail

**users**
`id uuid pk` · `email citext unique not null` · `password_hash text not null`
`full_name text not null` · `role user_role not null default 'student'`
`college text` · `branch text` · `graduation_year int` · `phone text`
`avatar_url text` · `is_active bool not null default true`
`created_at` · `updated_at`
Indexes: unique(email), (role), (is_active)
Constraint: `graduation_year between 1950 and 2100`

**companies**
`id uuid pk` · `name text unique not null` · `slug text unique not null`
`logo_url text` · `website text` · `description text` · timestamps
Indexes: unique(slug), (name)

**categories**
`id uuid pk` · `name text unique not null` · `slug text unique not null`
`description text` · `color text` · `icon text` · `sort_order int default 0`
Indexes: unique(slug), (sort_order)

**jobs**
`id uuid pk` · `slug text unique not null`
`company_id uuid not null → companies(id) on delete restrict`
`category_id uuid not null → categories(id) on delete restrict`
`role text not null` · `description text not null` · `eligibility text`
`salary_min int` · `salary_max int` · `salary_currency char(3) default 'INR'`
`salary_text text`  ← for "As per company norms"
`location text` · `mode job_mode not null default 'onsite'`
`deadline timestamptz` · `application_link text not null` · `image_url text`
`status job_status not null default 'draft'`
`posted_by uuid → users(id) on delete set null`
`views_count int not null default 0`
timestamps

Indexes:
- `(status, deadline)` — the hot path: "published, closing soon"
- `(category_id)`, `(company_id)`, `(created_at desc)`
- **GIN full-text** on `to_tsvector('english', role || description || eligibility)`
  — real search, not `LIKE '%q%'`
Constraints:
- `salary_max >= salary_min` when both present
- `application_link` must match `^https?://`

`on delete restrict` on company/category is deliberate: deleting a company that
still has jobs should fail loudly, not silently orphan or cascade-destroy records.

**job_tags** — `job_id → jobs on delete cascade` · `tag_id → tags on delete cascade`
PK(job_id, tag_id), index on (tag_id) for reverse lookup.

**saved_jobs** — `user_id → users cascade` · `job_id → jobs cascade` ·
PK(user_id, job_id) · `created_at`. Composite PK makes double-saving impossible
at the database level.

**applications**
`id uuid pk` · `user_id → users cascade` · `job_id → jobs cascade`
`status application_status not null default 'applied'`
`notes text` · `applied_at timestamptz not null default now()` · `updated_at`
**unique(user_id, job_id)** — one application per student per job, enforced by
the database, not by hopeful application code.

**refresh_tokens**
`id uuid pk` · `user_id → users cascade` · `token_hash text not null unique`
`expires_at timestamptz not null` · `revoked_at timestamptz`
`user_agent text` · `ip text` · `created_at`
The raw token is never stored. Rotation + reuse detection live here.

**announcements** — `title` · `body` · `priority` (low|normal|high|urgent) ·
`is_active` · `starts_at` · `ends_at` · `created_by → users` · timestamps

**banners** — `title` · `image_url not null` · `link_url` · `sort_order` ·
`is_active` · `starts_at` · `ends_at` · timestamps

**site_settings** — `key text unique` · `value jsonb` · `updated_by` · `updated_at`

**audit_logs** — `actor_id → users set null` · `action` · `entity_type` ·
`entity_id` · `metadata jsonb` · `ip` · `created_at`

**job_views** — `job_id → jobs cascade` · `user_id → users set null` ·
`viewed_at` · index (job_id, viewed_at)

### 3.3 Enums (native PG types)

- `user_role`: `student` | `admin`
- `job_mode`: `onsite` | `remote` | `hybrid`
- `job_status`: `draft` | `published` | `closed` | `archived`
- `application_status`: `applied` | `interviewing` | `offered` | `rejected` | `withdrawn`
- `announcement_priority`: `low` | `normal` | `high` | `urgent`

---

## 4. API

Express, versioned at `/api/v1`. Every response is a consistent envelope; every
input is Zod-validated at the edge; every error flows through one handler.

```
{ "success": true,  "data": <T>, "meta": { pagination? } }
{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }
```

### 4.1 Auth — `/api/v1/auth`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/register` | — | Create student. Hash password (bcrypt 12). Issue tokens. |
| POST | `/login` | — | Verify credentials. Issue access + refresh cookies. |
| POST | `/refresh` | refresh cookie | Rotate refresh token. Detect reuse → revoke family. |
| POST | `/logout` | any | Revoke refresh token, clear cookies. |
| GET | `/me` | access | Current user. |
| POST | `/change-password` | access | Verify old, set new, revoke all other sessions. |

Rate limited: 5 attempts / 15 min on `/login` and `/register`, per IP.

### 4.2 Public — no auth required

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/jobs` | Search + filter + sort + paginate. The workhorse. |
| GET | `/jobs/:slug` | Full detail, with company, category, tags. |
| POST | `/jobs/:id/view` | Record a view (fire-and-forget). |
| GET | `/categories` | All categories, for filter chips. |
| GET | `/companies` | All companies, for filter dropdown. |
| GET | `/tags` | All tags. |
| GET | `/announcements/active` | Currently-live announcements. |
| GET | `/banners/active` | Currently-live banners, ordered. |

**`GET /jobs` query parameters** — all optional, all Zod-validated:
`q` (full-text) · `category` (slug) · `company` (slug) · `mode` · `tags` (repeatable)
· `status` · `deadlineBefore` / `deadlineAfter` · `salaryMin`
· `sort` (`newest` | `deadline` | `salary` | `popular`) · `page` · `limit` (max 100)

### 4.3 Student — `/api/v1/me` (requires `student` or `admin`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/profile` | Own profile. |
| PATCH | `/profile` | Update name, college, branch, year, phone, avatar. |
| GET | `/saved` | Saved jobs, paginated. |
| POST | `/saved/:jobId` | Save. Idempotent. |
| DELETE | `/saved/:jobId` | Unsave. |
| GET | `/applications` | Application history, filterable by status. |
| POST | `/applications` | Mark as applied. |
| PATCH | `/applications/:id` | Advance status / edit notes. Ownership-checked. |
| DELETE | `/applications/:id` | Withdraw. Ownership-checked. |
| GET | `/stats` | Counts for the dashboard cards. |

Every `/me/*` handler filters by `req.user.id`. Passing someone else's row id
returns 404, never their data. This is the IDOR boundary.

### 4.4 Admin — `/api/v1/admin` (requires `admin`)

| Resource | Endpoints |
|----------|-----------|
| Jobs | `GET /jobs` `POST /jobs` `GET /jobs/:id` `PATCH /jobs/:id` `DELETE /jobs/:id` |
| Companies | full CRUD |
| Categories | full CRUD |
| Tags | full CRUD |
| Announcements | full CRUD |
| Banners | full CRUD (+ reorder) |
| Users | `GET /users` `PATCH /users/:id/role` `PATCH /users/:id/status` |
| Settings | `GET /settings` `PATCH /settings` |
| Analytics | `GET /analytics/overview` |
| Uploads | `POST /uploads/signature` → signed Cloudinary params |

`POST /uploads/signature` matters: the browser uploads **directly to Cloudinary**
using a short-lived signature. The API secret never reaches the client, and job
images never transit our server.

---

## 5. Pages

### Public
| Route | Description |
|-------|-------------|
| `/` | Landing. Hero, live banners, active announcements, latest + closing-soon opportunities, category tiles. |
| `/login` | Email + password. |
| `/register` | Student signup with college/branch/year. |
| `/opportunities` | The search page. Debounced full-text box, category chips, mode/tag/company/salary filters, sort, pagination, skeletons, empty state. |
| `/opportunities/[slug]` | Detail: description, eligibility, salary, deadline countdown, tags. **Apply** (external link, records intent), **Save**, **Mark as Applied**. |

### Student (auth required)
| Route | Description |
|-------|-------------|
| `/dashboard` | Stat cards (saved / applied / closing-soon), deadline feed, recommended by branch, recent announcements. |
| `/saved` | Saved jobs grid, unsave inline. |
| `/applications` | History grouped by status, editable status + notes, timeline. |
| `/profile` | View + edit profile, Cloudinary avatar upload. |
| `/settings` | Theme, change password, active sessions, delete account. |

### Admin (role=admin)
| Route | Description |
|-------|-------------|
| `/admin` | Overview: totals, recent activity, quick actions. |
| `/admin/jobs` | Data table: search, filter, bulk status change, delete. |
| `/admin/jobs/new`, `/admin/jobs/[id]/edit` | Full job form, Zod-validated, live preview, image upload, tag multiselect. |
| `/admin/companies` | CRUD + logo upload. |
| `/admin/categories` | CRUD + color/icon/order. |
| `/admin/announcements` | CRUD + priority + schedule window. |
| `/admin/banners` | CRUD + drag-reorder + schedule window. |
| `/admin/users` | List, search, promote/demote, activate/deactivate. |
| `/admin/analytics` | Charts: views over time, applications per category, top jobs, funnel. |
| `/admin/settings` | Site name, contact, feature flags, maintenance mode. |

**States are not optional.** Every list has a loading skeleton, an empty state
with a call to action, and an error state with retry. Every mutation is optimistic
where safe and rolls back on failure.

---

## 6. Security

| Threat | Control |
|--------|---------|
| Password theft | BCrypt, cost 12. Never logged, never returned, never in a JWT. |
| Token theft | Access JWT 15 min. Refresh rotating + hashed at rest + revocable. Reuse of a rotated token revokes the whole family. |
| XSS → token exfiltration | Tokens live in `httpOnly` cookies. JavaScript cannot read them. `Secure` + `SameSite=None` (cross-origin Vercel↔Render) + CSRF defense below. |
| CSRF | `SameSite=None` requires it: origin allowlist check on all mutations + custom header requirement. |
| SQL injection | Drizzle parameterizes everything. Zero string-concatenated SQL. |
| XSS (stored) | React escapes by default. Job descriptions are rendered as text/sanitized markdown, never `dangerouslySetInnerHTML` of raw input. |
| IDOR | Every `/me/*` query is scoped to `req.user.id`. Ownership is a `WHERE` clause, not an `if`. |
| Privilege escalation | `role` is never accepted from a request body on register or profile update. Only `/admin/users/:id/role` can change it, and it requires admin. |
| Brute force | `express-rate-limit` on auth routes, per IP. |
| Header attacks | `helmet` with CSP, HSTS, frameguard, nosniff. |
| Open CORS | Explicit origin allowlist from env. `credentials: true`. No wildcard. |
| Secret leakage | All secrets from env, Zod-validated at boot — the process refuses to start if one is missing. `.env` is gitignored. `.env.example` documents shape only. |
| Payload abuse | `express.json({ limit: '100kb' })`. Pagination `limit` capped at 100. |
| Insider risk | `audit_logs` records every admin mutation with actor, entity, and IP. |

---

## 7. Deployment

**Database — Render PostgreSQL** (or Neon). Migrations run via
`npm run db:migrate` as a Render pre-deploy command, so schema changes ship
atomically with the code that needs them.

**API — Render Web Service.**
Build `npm ci && npm run build -w api`, start `node apps/api/dist/index.js`.
Health check at `/health`. Env: `DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `CLOUDINARY_*`, `NODE_ENV=production`.

**Web — Vercel.** Root `apps/web`. Env: `NEXT_PUBLIC_API_URL`.

**Images — Cloudinary.** Browser → Cloudinary direct, via server-signed params.

**CI — GitHub Actions.** On every push: typecheck → lint → test → build both apps.
A red pipeline blocks the merge.

---

## 8. Build order

Each module is verified before the next begins.

1. Monorepo scaffold + tooling
2. `packages/shared` — Zod schemas, inferred types
3. Drizzle schema + migrations + seed
4. API core — config, db client, errors, middleware, logging
5. API auth
6. API jobs / companies / categories / tags
7. API student — saved, applications, profile
8. API admin — CRUD, users, settings, uploads
9. API analytics, announcements, banners
10. Web design system — Tailwind v4, shadcn, dark/light
11. Web auth + route guards + API client
12. Web public + opportunities
13. Web student app
14. Web admin console
15. Tests
16. Deployment + docs
