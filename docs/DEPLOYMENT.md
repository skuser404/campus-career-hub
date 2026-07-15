# Deployment

Database → **Render PostgreSQL** · API → **Render Web Service** · Web → **Vercel**
· Images → **Cloudinary**

Total cost on free tiers: **₹0**. The Render free instance sleeps after 15 minutes
of inactivity and takes ~30 seconds to wake — fine for a campus tool, and the
paid Starter tier ($7/mo) removes it.

---

## Order matters

The API **refuses to boot** without a reachable database and valid secrets — by
design, because an API that starts with a placeholder JWT secret and only fails at
the first login is far more dangerous than one that never starts. So:

**Database → API → Web.** Not any other order.

---

## 1. Database — Render PostgreSQL

1. Render dashboard → **New → PostgreSQL**
2. Name `campus-career-hub-db`, region **Singapore** (closest to India), plan **Free**
3. Once live, copy the **Internal Database URL**

> Use the **Internal** URL for the API — it never leaves Render's network. The
> External URL is for running migrations from your laptop, and it is slower and
> exposed.

---

## 2. Generate your secrets

Run this locally. **Do not reuse the values from `.env.example`** — the API
detects them and refuses to start in production.

```bash
node -e "console.log('JWT_ACCESS_SECRET =', require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('JWT_REFRESH_SECRET=', require('crypto').randomBytes(48).toString('base64url'))"
```

They must be **different from each other**. Reusing one secret for both token
types means a stolen access token can be replayed as a refresh token — the env
schema rejects that outright.

---

## 3. API — Render Web Service

**New → Web Service** → connect the repo.

| Setting | Value |
|---------|-------|
| Root Directory | *(blank — it is a monorepo)* |
| Runtime | Node |
| Build Command | `npm ci && npm run build -w @cch/shared && npm run build -w @cch/api` |
| **Pre-Deploy Command** | `npm run db:migrate -w @cch/api` |
| Start Command | `node apps/api/dist/index.js` |
| Health Check Path | `/health` |

> **The Pre-Deploy Command is not optional.** It runs migrations *before* the new
> code goes live, so a release that needs a new column never starts without it.
> Drizzle records what it has applied, so re-running is safe.

### Environment

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the **Internal** URL from step 1 |
| `JWT_ACCESS_SECRET` | from step 2 |
| `JWT_REFRESH_SECRET` | from step 2 (different!) |
| `CORS_ORIGINS` | `https://your-app.vercel.app` — **exact, no trailing slash** |
| `SEED_ADMIN_EMAIL` | `admin@jainuniversity.ac.in` — **must be a college address**, or the admin can never sign in |
| `SEED_ADMIN_PASSWORD` | something real. The default is rejected in production. |
| `CLOUDINARY_*` | optional — without it, image upload returns 503 and the admin UI falls back to pasting a URL |

`PORT` is injected by Render. Do not set it.

### Seed the first admin

Once it is live, open the Render **Shell** and run:

```bash
npm run db:seed -w @cch/api
```

Idempotent — safe to run twice, and it will never overwrite an existing admin's
password.

---

## 4. Web — Vercel

**Add New → Project** → import the repo.

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| **Root Directory** | `apps/web` |
| Build Command | *(leave default)* |

### Environment

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://your-api.onrender.com/api/v1` |
| `NEXT_PUBLIC_APP_NAME` | `Campus Career Hub` |

Anything behind `NEXT_PUBLIC_` is **visible in the browser bundle**. Never put a
secret there.

---

## 5. Close the CORS loop

Go back to Render and set `CORS_ORIGINS` to the real Vercel URL. Redeploy the API.

**Why this matters more than usual here.** Vercel and Render are different sites,
so the auth cookies must be `SameSite=None; Secure` to survive the cross-site
request. That removes SameSite as a CSRF defence — which is exactly why the API
checks the `Origin` header on every mutation against this allowlist. A browser
will not let `evil.com` forge that header, so the allowlist *is* the CSRF
protection. Get it wrong and either nothing works, or the protection is void.

There is also no wildcard option: browsers refuse to send credentials to
`Access-Control-Allow-Origin: *`, so cookie auth would silently stop working.

---

## 6. Verify

```bash
curl https://your-api.onrender.com/health
# {"status":"ok","database":"up",...}
```

Then, in the browser:

1. Sign in as the admin.
2. **Departments** → confirm CSE/ISE/AIML/CTIS/ECE/MBA exist.
3. **Students → Import** → upload your roll. **Run the dry run first.**
4. **Opportunities → New** → create one restricted to a single department.
5. Sign in as a student of *another* department and confirm they **cannot see it**,
   including by pasting its direct URL.

That last step is the one that actually proves the system works.

---

## Docker (self-hosting)

```bash
cp .env.example .env      # fill in real secrets
docker compose up -d
docker compose exec api npm run db:migrate -w @cch/api
docker compose exec api npm run db:seed -w @cch/api
```

Runs Postgres 17 and the API. The web app is deliberately not containerised — the
Next.js dev server is a better experience run natively.

---

## Operational notes

**Backups.** Render's free Postgres has **no automatic backups**. Before any
bulk import, take one:

```bash
pg_dump "$EXTERNAL_DATABASE_URL" > backup-$(date +%F).sql
```

**Cold starts.** The free API instance sleeps. The first request after idle takes
~30 s. Students will read that as "the site is broken". Either upgrade to Starter,
or ping `/health` every 10 minutes from a free uptime monitor.

**The USN password window.** Every imported student's password *is* their USN
until they change it. They are locked out of every endpoint until they do — but
the window is real. After a bulk import, watch
**Students → “Still using USN”** and chase the stragglers.

**Rotating a JWT secret** signs everybody out immediately. That is the intended
behaviour if you suspect a leak; it is a bad surprise otherwise.
