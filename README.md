# Campus Career Hub

A placement portal for **Jain University** — roughly 1,400 students.

Opportunities arrive as links in WhatsApp groups. A link posted on Monday is
unreachable by Friday, nobody can remember what they already applied to, and
deadlines get missed. This replaces that with a searchable, department-filtered,
deadline-aware system.

**Next.js 15 · React 19 · TypeScript · Tailwind v4 · Express · PostgreSQL ·
Drizzle · JWT**

---

## The one idea that shapes everything

**Department and year eligibility is an access-control boundary, not a UI filter.**

An admin posts an opportunity restricted to *CSE, final year*. That restriction is
enforced **in SQL, in the `WHERE` clause, on every read path** — the list, the
search, the detail page, the saved list, the dashboard rails, the notification
fan-out. An ISE student who opens that posting by its exact URL gets a `404`, not
a `403`, because confirming it exists would itself leak that it exists.

Everything else follows from that:

- **No public browsing.** An anonymous visitor has no department, so there is no
  coherent view to show them.
- **No registration endpoint.** Accounts exist only because an admin imported
  them. A self-service signup would let an outsider into a closed system.
- **Students cannot edit their own department or year.** Those fields are absent
  from the update schema entirely — not merely disabled in the UI — because
  editing them would be a one-click escalation into another branch's postings.

---

## Quick start

**Prerequisites:** Node 20+, PostgreSQL 17 (or `docker compose up -d postgres`).

```bash
npm install

cp .env.example .env
# Generate two DIFFERENT secrets and paste them into .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

createdb campus_career_hub
npm run db:migrate
npm run db:seed

npm run dev        # api :4000 · web :3000
```

### Sign in

| Who | Email | Password |
|-----|-------|----------|
| Admin | `admin@jainuniversity.ac.in` | `ChangeMe!2024` |
| Student (CSE, y3) | `priya.sharma@jainuniversity.ac.in` | `22BTRCS001` |
| Student (ECE, y4) | `sneha.reddy@jainuniversity.ac.in` | `21BTREC045` |
| Student (MBA, y1) | `arjun.mehta@jainuniversity.ac.in` | `24MBAXX012` |

A student's first password **is their USN**, and they are forced to change it
before they can reach a single endpoint.

> **Try this.** Sign in as Priya (CSE) and as Arjun (MBA) and compare what they
> see — different lists, same database. Then copy a CSE-only posting's URL from
> Priya's session and open it as Arjun. 404.

---

## The USN-as-password decision

The specification calls for the default password to be the student's USN. **A USN
is not a secret** — it is printed on the ID card and appears in every class list.
So it is treated as a bootstrap token, not a credential:

- `mustChangePassword` defaults to **`true`** in the database. A row inserted by
  any path that forgets to set it is treated as still compromised.
- A student holding a USN password is **locked out of every endpoint** except
  `POST /auth/first-login`. Someone who guesses a classmate's USN and signs in
  first can read nothing.
- Setting the new password **revokes every other session** — ejecting them.
- The new password **cannot be the USN**.
- Admins can see who has not changed theirs: **Students → “Still using USN”**.

That window is real, and it is worth watching after a bulk import.

---

## Layout

```
packages/shared/   Zod schemas + inferred types. THE contract.
                   The API validates with it; the forms resolve with it;
                   both sides' types are z.infer of it. No second definition
                   to drift out of sync.

apps/api/          Express + Drizzle
  db/schema.ts       18 tables. job_departments / job_years are the ACL.
  middleware/auth.ts requireAuth · requireFirstLogin · requireAdmin
  modules/jobs/      eligibilityFilter() — the single most important function
  modules/students/  import.service.ts — CSV/XLSX, all-or-nothing

apps/web/          Next.js 15 App Router
  (auth)/            login · first-login
  (site)/            dashboard · opportunities · saved · applications ·
                     notifications · profile · settings
  admin/             jobs · students · departments · companies · categories ·
                     announcements · banners · analytics · settings
```

---

## Data model

18 tables. The two that matter most:

**`job_departments`** and **`job_years`** are not tags. They are the access-control
list. **No rows = visible to everyone** — the opposite of what a checkbox list
usually implies, and the default a new posting gets. Getting that backwards would
silently hide every new opportunity from the entire university, so the admin UI
states it in words, in place.

Enforced in the **database**, not only in the application:

```sql
users_student_email_domain   -- a student MUST hold an @jainuniversity.ac.in address
users_student_has_usn        -- a student MUST have a USN
users_usn_unique_idx         -- USN unique, case-insensitively
applications_user_job_unique -- one application per student per opportunity
jobs_application_link_http   -- no javascript: URLs
```

These hold even against direct SQL. An outsider cannot become a student with
database access.

Search runs on a **GIN full-text index**, not `LIKE '%…%'`.

---

## Bulk import

`Admin → Students → Import`. CSV or Excel, ≤5,000 rows.

- **Dry run first**, always — the UI enforces it, and it writes nothing.
- **All-or-nothing.** One bad row rejects the whole file. A half-applied import
  leaves nobody able to say which students exist.
- Errors reported **by spreadsheet row number**, so they can be fixed in Excel.
- Upserts **by USN**, never by email — an email can be corrected, a USN is identity.
- **Re-importing never resets a password.** A student who chose one keeps it.
- Header aliases accepted: `Reg No` → USN, `Branch` → Department.

---

## Verification

```bash
npm run verify     # typecheck + lint + build, all workspaces
npm test           # 55 tests against a REAL Postgres — no mocks
```

13 of those tests exist solely to attack the department boundary: right department
+ wrong year, wrong department + right year, direct URL access, save-by-id,
apply-by-id, view-by-id, search leakage, featured-rail leakage.

**Two real bugs were caught by executing the code, and could not have been caught
any other way:**

1. `jsonwebtoken` **throws** if you pass a `subject` option when the payload
   already carries a `sub` claim. Every token mint returned 500. Typechecks clean.
2. `validate()` used `err instanceof ZodError` — which compares constructor
   identity across module realms. Under a different module resolution it silently
   returned `false`, and **every validation error became a 500 instead of a 400**.
   Fixed by using `safeParse`, which returns the error as a value rather than
   relying on cross-realm identity.

---

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — design decisions and trade-offs
- [`docs/API.md`](./docs/API.md) — every endpoint
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — Render + Vercel, step by step

---

## Security summary

| Threat | Control |
|--------|---------|
| Cross-department data leak | Eligibility filter in SQL on **every** read path. 404, never 403. |
| Outsider gaining access | No registration. College-domain lock in Zod, in the service, **and** as a database CHECK. |
| Guessed USN password | Locked out of everything until changed. Changing it revokes all other sessions. |
| Privilege escalation | `role`, `departmentId`, `year` absent from every self-service schema. |
| IDOR | Ownership is a `WHERE` clause, not an `if`. |
| XSS → session theft | `httpOnly` cookies. JavaScript cannot read the token. |
| CSRF | Cookies are `SameSite=None` cross-site, so an **Origin allowlist** is checked on every mutation. |
| Account enumeration | Wrong password and unknown account return an identical 401, in identical time. |
| Token theft | Access 15 min. Refresh rotates, stored SHA-256 hashed; reuse ⇒ revoke the family. |
| SQL injection | Drizzle parameterises everything. Zero string-concatenated SQL. |
| Brute force | 5 failures / 15 min on auth. |
| Insider risk | `audit_logs` records every admin mutation with actor, entity and IP. |
#   c a m p u s - c a r e e r - h u b  
 