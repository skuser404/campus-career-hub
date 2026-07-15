# API Reference

Base URL: `/api/v1`

---

## The security model, in one paragraph

Closed system, Google-gated. There is **no self-service registration endpoint**;
students arrive through **Google Sign-In**, and any verified `@jainuniversity.ac.in`
account is auto-created on first login (the domain is the guest list). The admin
also has a password login as a fallback. Every signed-in student sees every
**published** opportunity — there is no per-department gating; status (`published`
vs `draft`) is the only visibility boundary, enforced in SQL on every read path.

Three tiers:

| Tier | Guard | What it can reach |
|------|-------|-------------------|
| **Public** | none | `POST /auth/login`, `POST /auth/google`, `POST /auth/refresh`, `GET /settings`. |
| **Student** | `requireAuth` | Every published opportunity + their own saved/applied/notifications, scoped to their user id. |
| **Admin** | `requireAuth` + `requireAdmin` | Everything, including drafts. |

> **Auth history:** earlier revisions used an import roll with USN default
> passwords and department/year eligibility filtering. Those were superseded by
> the Google-auto-create + all-visible model. The `job_departments` / `job_years`
> tables and the admin targeting UI remain in place but no longer gate
> visibility, so filtering can be restored in a single function if ever needed.

---

## Response envelope

Every response has the same shape. The web client switches on `error.code`, never
on message text.

```jsonc
// Success
{ "success": true, "data": <T>, "meta": { "pagination": { … } } }

// Failure
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields",
    "details": [{ "path": "email", "message": "Use your college email" }]
  }
}
```

### Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Input failed the Zod schema. `details` lists the fields. |
| `UNAUTHORIZED` | 401 | No session, or the access token expired. |
| `PASSWORD_CHANGE_REQUIRED` | 403 | **The student is still using their USN.** They are locked out of every endpoint but `POST /auth/first-login`. The client redirects on this. |
| `ACCOUNT_DISABLED` | 403 | An admin disabled the account. |
| `FORBIDDEN` | 403 | Wrong role, or a mutation from a disallowed origin. |
| `NOT_FOUND` | 404 | Does not exist — **or the caller is not eligible to see it.** |
| `CONFLICT` | 409 | Unique constraint. Already applied, duplicate USN, last admin. |
| `RATE_LIMITED` | 429 | Too many attempts. |
| `SERVICE_UNAVAILABLE` | 503 | Cloudinary is not configured. |

---

## Authentication

Two `httpOnly` cookies. JavaScript cannot read either, so an XSS bug cannot steal
a session.

- **`cch_access`** — a JWT, 15 minutes, `path=/`.
- **`cch_refresh`** — opaque random bytes, 7 days, `path=/api/v1/auth`, stored
  **SHA-256 hashed** in the database. A database dump yields no usable sessions.
  It **rotates on every refresh**, and presenting an already-rotated token is
  treated as theft: every session for that user is revoked.

A `Bearer` header is also accepted, so curl and the test suite can authenticate.

### `POST /auth/login`

Only `@jainuniversity.ac.in` addresses. Rate limited to 5 failures per 15 minutes.

```jsonc
// Request
{ "email": "priya.sharma@jainuniversity.ac.in", "password": "22BTRCS001" }

// 200
{
  "success": true,
  "data": {
    "user": { "id": "…", "usn": "22BTRCS001", "department": { "code": "CSE" }, "year": 3, … },
    "accessTokenExpiresAt": "2026-07-15T10:15:00.000Z",
    "mustChangePassword": true      // ← branch on this
  }
}
```

A wrong password and an unknown account return the **identical** 401. Login also
hashes against a dummy when the account is absent, so both cost the same ~250 ms —
otherwise response latency alone would let an outsider enumerate accounts.

### `POST /auth/google`

Students' primary sign-in. Rate limited like `/login`.

```jsonc
// Request — the ID token from Google's button
{ "credential": "eyJhbGciOi..." }
```

The server verifies the token against Google's public keys (signature, audience =
our Client ID, expiry), requires `email_verified` and the `@jainuniversity.ac.in`
domain, then **finds or creates** the account and issues the same cookie session as
password login. Returns 503 if `GOOGLE_CLIENT_ID` is not configured; 403 for a
non-college or unverified Google account.

### `POST /admin/jobs/parse`

Paste a WhatsApp message, get structured fields back. **Read-only** — extracts and
returns; creates nothing.

```jsonc
// Request
{ "text": "*Backend Intern at Razorpay*\nStipend: 40k\nLast date: 30/11/2026\nhttps://…" }

// 200 — every field optional; `detected` lists what was filled
{
  "role": "Backend Intern", "companyName": "Razorpay",
  "salaryText": "40k", "deadline": "2026-11-30T23:59:00.000Z",
  "applicationLink": "https://…", "mode": null, "tags": [...],
  "detected": ["role","companyName","salaryText","deadline","applicationLink"]
}
```

### `POST /auth/first-login`

**The only endpoint a locked-out student can reach.** No `currentPassword`
argument: the current password is their USN, which is printed on their ID card and
is therefore not a secret. Holding a valid session for the account is the proof.

```jsonc
{ "newPassword": "…", "confirmPassword": "…" }
```

Revokes every other session — if someone guessed the USN and signed in first, this
is the moment they are ejected.

### Other auth routes

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/auth/refresh` | Rotates the refresh token. Reuse ⇒ revoke all. |
| `POST` | `/auth/logout` | Always 204, even with no session. |
| `GET` | `/auth/me` | The current user. |
| `POST` | `/auth/change-password` | Requires `currentPassword`. |
| `GET` | `/auth/sessions` | Where you are signed in. |
| `POST` | `/auth/sessions/revoke-all` | Sign out everywhere. |

---

## Opportunities — `/jobs`

> **Eligibility is not a query parameter.** It is derived server-side from the
> signed-in student's own row. There is no URL a student can edit to widen what
> they see.

### `GET /jobs`

| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Full-text over role, description, eligibility, location. Backed by a **GIN index**, not `LIKE '%…%'`. |
| `category` · `company` | slug | |
| `mode` | `onsite` \| `remote` \| `hybrid` | |
| `tags` | repeatable | `?tags=react&tags=node` |
| `salaryMin` | int | A posting with no stated max still qualifies. |
| `closingSoon` | bool | Deadline within 7 days. |
| `featured` | bool | |
| `sort` | `newest` \| `deadline` \| `salary` \| `popular` | Featured always ranks first. |
| `page` · `limit` | int | `limit` **capped at 100**, server-side. |

Note the absence of `status`. A student cannot ask for drafts — the field is not
on their schema at all.

Each job carries `departments: []` and `years: []`. **An empty array means "open
to everyone"**, not "open to nobody". This is the default a new posting gets.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/jobs/:slug` | 404 if ineligible — **not** 403. |
| `GET` | `/jobs/featured` | Latest, closing-soon and featured rails. All eligibility-filtered. |
| `POST` | `/jobs/:id/view` | Checks eligibility first, then records asynchronously. |

---

## Student — `/me`

Every handler scopes to `req.user.id`. **Ownership is a `WHERE` clause, not an
`if`** — another student's id matches no row and returns 404.

| Method | Path | Notes |
|--------|------|-------|
| `GET`/`PATCH` | `/me/profile` | **Only `phone` and `avatarUrl` are editable.** Name, USN, department, year, section and batch are institutional facts owned by the import — and department decides what you can see, so self-editing it would be privilege escalation. |
| `GET` | `/me/stats` | Dashboard counters. |
| `GET` | `/me/deadlines` | Saved, not yet applied, closing soonest. |
| `GET` | `/me/timeline` | Saves and applications, interleaved. |
| `GET` | `/me/saved` | |
| `POST`/`DELETE` | `/me/saved/:jobId` | Idempotent. Eligibility-checked. |
| `GET` | `/me/applications` | |
| `POST` | `/me/applications` | One per student per job — enforced by a unique index. |
| `PATCH`/`DELETE` | `/me/applications/:id` | Ownership-scoped. |

## Notifications — `/notifications`

Fanned out **on write**: one row per eligible student. So "is this mine?" is a
primary-key lookup, not a policy decision re-evaluated on every page load.

| Method | Path |
|--------|------|
| `GET` | `/notifications` |
| `GET` | `/notifications/unread-count` |
| `POST` | `/notifications/read` — omit `ids` to mark all |
| `DELETE` | `/notifications/:id` |

---

## Admin — `/admin`

### Students

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/admin/students` | Filter by `departmentId`, `year`, `section`, `batch`, and **`pendingPasswordChange=true`** — the list of accounts still using their USN. |
| `POST` | `/admin/students` | **No `password` field.** It is derived from the USN. An admin never chooses or sees it. |
| `PATCH` | `/admin/students/:id` | Cannot touch the password. |
| `POST` | `/admin/students/:id/reset-password` | Back to the USN, re-arms the forced change, revokes every session. |
| `PATCH` | `/admin/students/:id/status` | Disabling revokes every session immediately. |
| `PATCH` | `/admin/students/:id/role` | Refuses to demote the **last active admin**. |
| `DELETE` | `/admin/students/:id` | Cascades. Irreversible. |

### `POST /admin/students/import`

`multipart/form-data`, field `file`. CSV or XLSX, ≤5 MB, ≤5,000 rows.

| Query | Default | Notes |
|-------|---------|-------|
| `dryRun` | `false` | Validate and report what **would** happen. Writes nothing. |
| `updateExisting` | `true` | Matched **by USN**, never by email. |

Columns (aliases accepted — `Reg No` → USN, `Branch` → Department):

```
Name, USN, Email, Department, Year, Section, Batch
```

**All-or-nothing.** If any row fails, *nothing* is written. A half-applied import
is the worst outcome available: nobody can then tell which students exist, and
re-running the fixed file produces a confusing mix of creates and updates.

**Re-importing never resets a password.** A student who chose one weeks ago keeps
it — silently reverting it to their USN would both lock them out and re-expose the
account.

```jsonc
// 200
{
  "dryRun": true,
  "totalRows": 7, "created": 4, "updated": 1, "skipped": 0, "failed": 2,
  "unknownDepartments": ["MECH"],
  "errors": [
    // Row numbers match what the admin sees in Excel, header included.
    { "row": 4, "usn": "23BTRAI033", "errors": ["email: Email must be a college address"] },
    { "row": 6, "usn": "22BTRCS045", "errors": ["Duplicate USN — already appears on row 2"] }
  ]
}
```

`GET /admin/students/import/template` returns a ready-made `.xlsx`.

### Everything else

| Resource | Endpoints |
|----------|-----------|
| Departments | `GET` `POST` `PATCH` `DELETE /admin/departments` — delete refused while students remain |
| Jobs | full CRUD + `POST /admin/jobs/bulk` (`publish`/`close`/`archive`/`feature`/`unfeature`/`delete`) |
| Companies · Categories · Tags | full CRUD |
| Announcements · Banners | full CRUD, time-windowed |
| Analytics | `GET /admin/analytics/overview?days=30` |
| Settings | `GET`/`PATCH /admin/settings` |
| Uploads | `POST /admin/uploads/signature` — signed Cloudinary params; the secret never reaches the browser |

Publishing a job (on create, or draft → published) **notifies every eligible
student**. Editing an already-published job does not — that would re-notify 1,400
people over a typo fix.

---

## Rate limits

| Scope | Limit |
|-------|-------|
| `/auth/*` | 5 failures / 15 min (successes are free) |
| Mutations | 60 / min |
| Global | 500 / 15 min |
