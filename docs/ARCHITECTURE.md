# Architecture

## Why this stack (and not the one in the build spec)

The build spec suggested Next.js, Postgres, Redis and R2. Spyvoo ships instead as **one Node.js 22 process with zero
npm dependencies, SQLite (built into Node) and an in-process job scheduler**, with R2 available as an option for media.

Reasons:

- **Deploy in 30 minutes, not a day.** One Railway service and one volume. No database service, no Redis, no build
  step, no `npm install`, nothing to keep patched.
- **Same base as Replyvoo.** The HTTP layer, auth, sessions, CSRF, mailer, Gatevoo checkout and VooSquare login are
  the proven Replyvoo modules, so a developer who knows one Voo tool knows this one.
- **Fast enough for the real load.** Spyvoo is read-heavy: searches hit a SQLite FTS5 index on one machine with no
  network hop. Writes come mainly from the scraper, a few thousand rows per run. That is comfortably inside SQLite's
  limits for the first tens of thousands of users.
- **Every external service is behind an adapter.** Ad data (`src/providers`), AI (`src/services/ai.js`), media storage
  (`src/services/media.js`), email (`src/services/mailer.js`), payments (`src/services/gatevoo.js`) and login
  (`src/services/voosquare.js`). Swapping any of them doesn't touch the rest.

**When to move to Postgres:** if you need more than one web instance, or the database passes ~20 GB. The SQL is plain
and the table layout is in `migrations/001_init.sql`; FTS5 maps to a Postgres `tsvector` column. Plan about a week.

## Map

```
src/
  server.js            builds the app: middleware, routes, scheduler. Seeds a fresh database on first boot
  config.js            every environment variable, with safe defaults
  db.js                node:sqlite, WAL mode, migrations, tiny helpers (one, all, insert, update, tx)
  lib/http.js          ~300-line HTTP framework: routing, JSON, static files with byte ranges, rate limits
  lib/auth.js          sessions (cookie sv_s, 30 days), CSRF header x-sv: 1, needUser / needAdmin
  lib/security.js      scrypt passwords, AES-256-GCM for saved tokens, HMAC, order refs (SV-...)
  lib/countries.js     ~150 countries with names in several languages, used by search and signup
  providers/           ad data adapters. apify.js (Meta Ad Library actor), demo.js (sample ads), template.js
  services/
    ingest.js          runs tracking rules within the daily budget, saves + de-duplicates ads
    ads.js             scoring, search (FTS5 + filters + relax fallback), plain-English parser, stats
    media.js           downloads images/videos (3 retries), stores on disk or R2 (hand-written S3 SigV4)
    ai.js              AI breakdowns, "Make it mine" scripts, search parsing; rule-based fallback
    llm.js             one complete() for Claude direct, OpenRouter or OpenAI; retries, fallbacks, ai_usage
    library.js         boards + sharing, follows, saved searches, notifications, alert and weekly-report jobs
    account.js         plans, usage limits (402 + upgrade prompt), team seats
    payments.js        payment methods per country, coupons, quotes, checkout, fulfilment, renewals
    gatevoo.js         crypto checkout (live, or sandbox when PAYMENTS_DEMO is on)
    voosquare.js       Voo ID login + account linking, money/activity events, summary card (Voo Connect kit)
    mailer.js          13 templates, Resend / Brevo / Postmark / log
    settings.js        everything editable in /admin, stored as JSON rows over defaults
    scheduler.js       in-process jobs (below)
  routes/              auth, app (dashboard API), admin, public (website API), webhooks, pages, voosquare
  lib/                 http (router, cookies, rate limits), auth (sessions, CSRF), csp (Content-Security-Policy with
                       hashed inline scripts), urls (http(s)-only links/media from scraped ads), netguard (media
                       downloads only to public hosts: SSRF guard), voo (the Voo Connect instance), security, tpl, md
voo-connect/           VooSquare's Voo Connect kit, copied unchanged (never edit; copy again on a new version)
public/
  css/                 app.css (dashboard), admin.css, auth.css, page.css (legal, notices, pricing)
  js/app/              dashboard SPA: core, art (animated people), cards, family slides, pages, detail, account, tour, main
  js/admin/            control room SPA
  js/landing.js, auth.js, confetti.js
views/                 site/index.html (landing), site/auth.html, site/pricing.html, app.html, admin.html
emails/                base.html + 13 templates
content/legal/         terms, privacy, refunds, acceptable use (Markdown)
```

## Background jobs

| Job | Every | What it does |
| --- | --- | --- |
| scrape | 5 min | Runs tracking rules that are due, until the daily budget is spent |
| media | 1 min | Downloads pending images and videos, retries failures with backoff |
| refresh | 1 hour | Recomputes days running, active/inactive and winner scores |
| alerts | 30 min | New ads from followed advertisers, new results for saved searches |
| billing | 1 hour | Renewal reminders, expiry downgrades after the grace period |
| voosquare | 1 min | Closes finished search hours (search_run) and sends queued VooSquare events (the kit also sends every VOO_FLUSH_MS, retried with backoff) |
| weekly | Mondays 08:00 UTC | Weekly winners report email |
| cleanup | daily | Old sessions, tokens, expired orders, old job rows |

Set `SCHEDULER=false` to turn them off on an instance (for example a second web instance).

## Data flow for one ad

1. A tracking rule is due → `ingest.runRule` asks the active provider (`providers.get()`) for ads.
2. Apify runs the Meta Ad Library actor; `apify.normalise` turns its output (camelCase or snake_case) into one shape.
3. `ads.upsert` saves or updates the advertiser and the ad (key: Meta library id), updates the FTS index, computes
   days running and the winner score (weights in Admin → Settings).
4. Media rows are queued; the media job copies every file to storage so the ad never expires.
5. On first open (or straight away when "analyse new" is on) Claude writes the breakdown, cached per ad.

## Security

- Passwords: scrypt. Sessions: random 32-byte tokens, stored hashed. CSRF: every state-changing API call needs the
  `x-sv: 1` header (browsers can't add it cross-site).
- Saved API tokens (Apify) are encrypted with AES-256-GCM using a key derived from `APP_SECRET`.
- Rate limits on signup, login, password reset, the public try-it search, coupon checks (30 per 10 min), quotes, AI (plus 200 plain-English searches per account per day) and checkout, keyed on the real client IP that Railway's proxy appends (the last `X-Forwarded-For` entry; ignored unless `TRUST_PROXY`). Browsing the library is paced per account (120 a minute, 3,000 a day).
- The admin "Test scrape" respects the daily provider budget like scheduled runs.
- Gatevoo webhooks are HMAC-checked and the invoice is re-read from the API before a plan switches on.
- Admin actions are written to the audit log.
