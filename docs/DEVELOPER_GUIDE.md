# Spyvoo: Developer Launch Guide

For the developer taking Spyvoo live on Railway at `spyvoo.com`. Read it once top to bottom, then follow it step by step.
Prices were checked on 4 October 2026. Links are in **Sources** at the end.

---

## 1. What Spyvoo is and what's in the zip

Spyvoo is an ad spy tool by Zedapex Limited. It pulls Facebook and Instagram ads from Meta's Ad Library through Apify.
It saves every image and video for good and scores each ad. Claude explains why each ad works and rewrites it for the
user's product. Everything runs as **one Node.js 22 process with zero npm dependencies**. That process serves the
website, the dashboard, the `/admin` control room, the data pipeline, the emails and payments. Data lives in a
**SQLite file** (`node:sqlite`, FTS5). There is no `npm install`, no build step, no Redis and no Postgres.

```
spyvoo/
  src/server.js        entry point; seeds a fresh DB; starts the scheduler; /healthz
  src/config.js        every env var with its default (read this first)
  src/db.js            SQLite (WAL), migrations, helpers
  src/lib/             http framework, auth (cookie sv_s, CSRF header x-sv: 1), security, countries
  src/providers/       ad data adapters: apify.js, demo.js (sample ads), template.js, index.js (registry)
  src/services/        ingest, ads (search/score), ai (Claude), media (disk/R2), mailer, payments, gatevoo,
                       voosquare, library (boards/alerts), account (plans/limits), settings, scheduler
  src/routes/          auth, app (/api/app), admin (/api/admin), public, webhooks, pages, voosquare
  public/              CSS + browser JS (dashboard SPA, admin SPA, landing)
  views/               landing, auth, pricing, app.html, admin.html
  emails/              base.html + 13 templates
  content/legal/       terms, privacy, refunds, acceptable-use (Markdown → /legal/<name>)
  migrations/          001_init.sql (the full table layout)
  scripts/             seed.js, create-admin.js, check.js, backup.js
  test/                node --test suites (npm test)
  docs/                RAILWAY, LAUNCH_CHECKLIST, ADMIN_GUIDE, ARCHITECTURE, API, EMAILS, GATEVOO, VOOSQUARE
  Dockerfile, railway.json, .env.example, package.json
```

Useful commands (Node 22.13 or newer):

```bash
npm start                    # run locally; open http://localhost:3000 and /admin
npm test                     # test suite
npm run check                # launch readiness report
npm run check -- --ping      # same, and also calls Apify, Claude and Gatevoo
npm run backup               # SQLite copy into data/backups/ (keeps the newest 14)
npm run create-admin -- you@example.com "password-of-10+-chars" ["Name"]
npm run seed -- --demo       # re-add the sample ads
```

---

## 2. Accounts and keys to collect BEFORE you start

Collect these first and keep them in a password manager. Only the first four rows are needed to go live with real
ads. Everything else can be switched on later by adding a variable and redeploying.

| Service | What it's for | Env var(s) | Where to get it | Required? | Current price |
|---|---|---|---|---|---|
| **Secret** | Signs sessions, encrypts saved tokens | `APP_SECRET` | Run `openssl rand -hex 32`. **Never change it after launch.** | Yes | Free |
| **Railway** | Hosting + persistent volume | none (Railway sets `PORT`, `RAILWAY_PUBLIC_DOMAIN`) | railway.com → Sign in with GitHub → upgrade to **Hobby** (Account → Plans) | Yes | Hobby $5/mo incl. $5 usage; Pro $20/mo incl. $20. Usage: ≈$10 per GB RAM-month, ≈$20 per vCPU-month, ≈$0.15 per GB-month of volume, $0.05 per GB egress |
| **Apify** | Meta Ad Library scraper (actor `apify~facebook-ads-scraper`) | `APIFY_TOKEN`, optional `APIFY_ACTOR`, `APIFY_API_URL` | console.apify.com → sign up → **Settings → Integrations (API & Integrations)** → copy the Personal API token. You can also paste it later in Admin → Ad data & AI (stored encrypted, and it wins over the env var) | Yes for real ads (otherwise sample ads only) | Plans: Free $0 ($5 credit), Starter $19, Scale $199, Business $999 (each includes that much usage). Actor is pay-per-result: **$5.80 / $5.00 / $4.20 / $3.40 per 1,000 ads** on Free / Starter / Scale / Business |
| **Domain DNS** | `spyvoo.com` → Railway, email records | none | Move DNS to Cloudflare (free): dash.cloudflare.com → **Add a domain** → change nameservers at your registrar | Yes | Cloudflare DNS: free |
| **Anthropic (Claude)** | AI breakdowns, "Make it mine" scripts, plain-English search, weekly niche summary | `ANTHROPIC_API_KEY`, `AI_MODEL` (default `claude-haiku-4-5-20251001`) | console.anthropic.com → **Settings → Billing**: add credit → **API keys → Create key** | Recommended (without it a rule-based "basic" mode runs) | Haiku 4.5: $1 input / $5 output per million tokens. Sonnet 5.5: $2 / $10. Batch is half price (the app doesn't use batch) |
| **Email sending: Resend** (recommended) | All 13 automatic emails | `MAIL_PROVIDER=resend`, `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` | resend.com → **Domains → Add domain** `spyvoo.com` → add the DNS records it shows → **API Keys → Create** (sending access) | Yes in production (otherwise emails are only logged) | Free: 3,000/mo, **100/day cap**. Pro $20/mo for 50,000. Scale $90/mo for 100,000. Extra $0.90 per 1,000 |
| Email alt: **Brevo** | Same | `MAIL_PROVIDER=brevo`, `MAIL_API_KEY` | app.brevo.com → **Senders, Domains & IPs → Domains** → authenticate → **SMTP & API → API keys** | Alternative | Free 300/day (Brevo logo on emails). Starter from about $9/mo for 5,000 (check current price) |
| Email alt: **Postmark** | Same | `MAIL_PROVIDER=postmark`, `MAIL_API_KEY` = *Server* token | account.postmarkapp.com → **Sender Signatures → Add Domain** → Server → **API Tokens** | Alternative | Free 100/mo. Basic $15/mo for 10,000, then $1.80 per 1,000 |
| **Email receiving** | `support@`, `billing@`, `legal@`, `privacy@` (and `hello@` replies) | none (addresses set in Admin → Settings → Company) | **Cloudflare Email Routing**: domain → Email → Email Routing → enable → add each address → your inbox. Or **ImprovMX**, or a **Zoho Mail** mailbox for `support@` | Yes (`support@` is the Reply-To on every email) | Cloudflare Email Routing: free. ImprovMX: free (1 domain, 25 aliases, 500/day), Premium $9/mo. Zoho Mail: free plan exists, check current price |
| **Gatevoo** | Crypto checkout (USDT TRC20, BTC), Zedapex's own | `GATEVOO_API_KEY` (`gv_live_…`), `GATEVOO_WEBHOOK_SECRET`, optional `GATEVOO_API_URL` (default `https://api.gatevoo.com/v1`) | Gatevoo dashboard → create an API key for Spyvoo + a webhook secret → add webhook URL `https://spyvoo.com/webhooks/gatevoo`. The API Gatevoo must provide is in `docs/GATEVOO.md` §3 | Yes to take money | Internal (Zedapex) |
| **OpenAI Whisper** | Transcribes video ads so the AI can read what they say | `TRANSCRIBE_API_KEY`, optional `TRANSCRIBE_API_URL`, `TRANSCRIBE_MODEL` (default `whisper-1`) | platform.openai.com → **Billing** add credit → **API keys → Create new secret key** | Optional | whisper-1: $0.006 per minute ($0.0001/sec) |
| **Cloudflare R2** | **Stores every ad video and image**, streamed to users with zero egress fees | `MEDIA_DRIVER=r2`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` (optional `R2_ENDPOINT`) | Cloudflare → **R2** → Create bucket `spyvoo-media` → bucket **Settings → Custom Domains** → `media.spyvoo.com` → R2 overview → **Manage R2 API Tokens** → Create (Object Read & Write, this bucket) | **Yes, from day one** | $0.015 per GB-month. Free each month: 10 GB, 1M Class A, 10M Class B ops. Then $4.50 per million writes and $0.36 per million reads. **Zero egress** |
| **VooSquare** | Optional single sign-on for every Voo tool | `VOO_ISSUER`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_SERVICE_KEY`, `VOO_WEBHOOK_SECRET`, optional `VOO_REDIRECT_URI`, `VOO_EVENTS_URL`, `VOO_HOME_URL` | VooSquare admin → register client `spyvoo` with redirect `https://spyvoo.com/auth/voosquare/callback`. See `docs/VOOSQUARE.md` | Optional. **Note:** once `VOO_ISSUER` + `VOO_CLIENT_ID` are set, email sign-up turns off | Internal |

---

## 3. Deploy to Railway (about 30 minutes)

### 3.1 Put the code on GitHub (3 min)

1. Unzip, then in the folder run:
   ```bash
   git init && git add . && git commit -m "Spyvoo 1.0"
   gh repo create zedapex/spyvoo --private --source=. --push
   ```
2. Check that `.env` and `data/` are **not** in the repo. `.gitignore` already leaves them out.

### 3.2 Create the service (3 min)

1. railway.com → **New Project** → **Deploy from GitHub repo** → pick `spyvoo`. Allow the Railway GitHub app if asked.
2. Railway reads `railway.json`. It builds with the `Dockerfile` (`node:22-alpine`), runs **1 replica**, uses
   healthcheck `/healthz` (60 s timeout) and restarts on failure.
3. **Stop the first deploy or let it fail.** Without variables it exits on purpose: `NODE_ENV=production` is set in
   the image, so a missing `APP_SECRET` stops the process.

### 3.3 Add the volume (2 min). Do this before the first real deploy.

1. On the project canvas, right-click (or press `⌘K` / `Ctrl+K`) → **Create Volume**. Attach it to the Spyvoo service.
2. Mount path: **`/app/data`**. This folder holds the database (`/app/data/spyvoo.db`), the media (`/app/data/media`)
   and the backups (`/app/data/backups`).
3. Without the volume, **every deploy wipes all data**.

### 3.4 Variables (5 min)

Service → **Variables** → **Raw Editor**. Paste `.env.example`, then fill in at least:

```
NODE_ENV=production
APP_URL=https://spyvoo.com
APP_SECRET=<openssl rand -hex 32>
ADMIN_EMAIL=<founder's email>
ADMIN_PASSWORD=<long random password>
DATABASE_PATH=/app/data/spyvoo.db
APIFY_TOKEN=<token>
APIFY_ACTOR=apify~facebook-ads-scraper
DEMO_ADS=true
ANTHROPIC_API_KEY=<key>
AI_MODEL=claude-haiku-4-5-20251001
MEDIA_DRIVER=r2
R2_ACCOUNT_ID=<cloudflare account id>
R2_BUCKET=spyvoo-media
R2_ACCESS_KEY_ID=<r2 token key id>
R2_SECRET_ACCESS_KEY=<r2 token secret>
R2_PUBLIC_URL=https://media.spyvoo.com
MAIL_PROVIDER=resend
MAIL_API_KEY=<resend key>
MAIL_FROM=Spyvoo <hello@spyvoo.com>
MAIL_REPLY_TO=support@spyvoo.com
GATEVOO_API_KEY=<gv_live_...>
GATEVOO_WEBHOOK_SECRET=<secret>
PAYMENTS_DEMO=false
TRUST_PROXY=true
SCHEDULER=true
AUTO_SEED=true
```

Rules:
- Leave `PORT` unset. Railway sets it.
- Delete blank lines like `TRANSCRIBE_API_KEY=` if you don't use them. Empty values fall back to defaults anyway.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` only create the admin on the **first boot of an empty database**. If you set them
  later, use `npm run create-admin` instead.
- Click **Deploy** to apply the changes.

### 3.5 First deploy: what the logs should say

**Deployments → View logs.** On a fresh volume you should see:

```
Fresh database: seeding plans, settings, admin and sample ads…
Admin created: you@...
Sample ads added: 27
Spyvoo running on https://spyvoo.com (port 3000, production)
```

Extra lines are hints, not errors. For example `Ads: provider not connected yet…`, `AI: basic breakdowns…` or
`Email: printed to the console…` mean that key is missing. If you see
`WARNING: PAYMENTS_DEMO=true in production`, fix it at once. The healthcheck passes when `GET /healthz` returns
`{ "ok": true, "time": … }`.

### 3.6 Domain (5 min plus DNS wait)

1. Service → **Settings → Networking → Generate Domain**. This gives a `*.up.railway.app` URL for testing.
2. Same panel → **Custom Domain** → add `spyvoo.com`, then add `www.spyvoo.com`. Railway shows a CNAME target for each.
3. In Cloudflare DNS add `CNAME @ → <target>` (Cloudflare flattens the apex for you) and `CNAME www → <target>`.
   Add any TXT verification record Railway asks for.
4. Start with the records **DNS only (grey cloud)** until Railway shows the certificate as issued. If you turn the
   proxy on later, set SSL/TLS to **Full (strict)**.
5. The app does **not** redirect `www` → apex. Add a Cloudflare **Redirect Rule** `www.spyvoo.com/*` →
   `https://spyvoo.com/$1` (301). Otherwise users get logged out when they switch hosts.

### 3.7 Getting a shell

Railway has no shell tab in the dashboard. Use the CLI:

```bash
npm i -g @railway/cli && railway login && railway link   # pick the project + service
railway ssh                                              # interactive shell in the running container
railway ssh -- npm run check -- --ping                   # or run a single command
```

---

## 4. First login and setup in the control room (`/admin`)

Log in at `https://spyvoo.com/login` with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. **Change the password right away** at
`/app/account`. Then open `/admin`. Everything here is live, needs no redeploy and is written to the **Audit log**.
Work through the pages in this order:

1. **Ad data & AI** (`/admin/provider`)
   - Provider: **Apify · Facebook Ads Library**. Paste the Apify token here if you didn't set `APIFY_TOKEN`.
     Leave the actor empty to use the default.
   - **Daily budget (USD): start at 5.** Scraping stops for the day once it's spent, you get an email, and it resets
     at midnight UTC. Spend is checked *between* runs, so one run can go over the budget a little.
   - Default interval and ads per run apply to new rules. Leave **Save images and videos forever** on. Leave **Write AI
     breakdowns for every new ad** off for now: off means Claude only runs when someone opens an ad.
   - Press **Test connection**, then go to **Test scrape** → keyword `online course`, country `IN` → **Run test**.
     You should see up to 10 ads.
2. **Tracking rules** (`/admin/rules`). Five examples are seeded: `crypto/BR`, `skincare/MX`, `trading app/EG`,
   `money transfer/AE` and `online course/IN`. Each runs every 12 h at 50 ads, so about 500 ads a day, roughly $2.50/day on Apify Starter,
   inside the default $5 budget. Edit or switch them off as you like. Then add your own rules (**New rule**) or use **Import CSV**:
   ```
   type,value,countries,niche,interval_hours
   keyword,forex signals,BR|MX|EG|AE,Trading,24
   keyword,betting app,BR CO,iGaming,24
   advertiser,102938475610,ALL,Trading,12
   ```
   `type` can be `keyword`, `advertiser` (a numeric Facebook page ID) or `domain`. Countries are ISO-2 codes,
   separated by `|` or a space. Use **Run now** on one rule and check it in **Job monitor**.
3. **Job monitor** (`/admin/jobs`). Check that scrape jobs say `done` with "found / new" counts and that media jobs are
   draining. Use **Retry** and **Retry failed media** when needed.
4. **Ads manager** (`/admin/ads`). Once real ads have arrived, press **Remove sample ads**. Mark 6–10 strong ads as
   **Featured** for the website's live wall. Use **Hidden** for anything unsuitable.
5. **Plans** (`/admin/plans`). Seeded plans: Free $0, Starter $29/$290, Pro $79/$790 (most popular), Agency $199/$1990
   (3 seats). Limits use `-1` for unlimited. Hide a plan rather than delete it.
6. **Payments** (`/admin/payments`)
   - Gatevoo card: the status should be **live**. Copy the webhook URL (`https://spyvoo.com/webhooks/gatevoo`) into
     Gatevoo, then press **Test connection**. You want "Connected".
   - **Payment methods**: "Crypto (USDT or Bitcoin)" is global and on. "Bank transfer" is local and **off**. For a
     local method, set scope **Only some countries** and countries like `BR, EG`, add instructions, and switch it on.
     Users only see the methods for their country. You confirm bank payments with **Orders → Mark paid**.
   - **Coupons**: `SPYLAUNCH` (50% off the first month of Starter/Pro/Agency) is already there.
7. **Offer & Voo family** (`/admin/offer`). The launch offer is on with code `SPYLAUNCH`. Set an end date if you want a
   countdown. The code must match an active coupon. Add a dashboard announcement if needed. Check that each **Voo family
   slide** (Joinvoo, Replyvoo, Castvoo, Vooads, Gatevoo, Affleego, VooSquare) has the right link and perk, then press
   **Save slides**. The first four active ones (not VooSquare) also appear at the bottom of every email.
8. **Emails** (`/admin/emails`). Preview `welcome`, then **Send me this email**. Check inbox *and* spam. Repeat for
   `payment-receipt`.
9. **Settings** (`/admin/settings`). Company name and the five addresses (support/hello/billing/legal/privacy).
   Platforms (live/soon/off), winner-score weights, niches, billing reminder days (3) and grace days (2). Switches:
   sign-ups, the try-it search on the website, and **Maintenance mode**. In maintenance mode users see "back soon",
   while admins, `/login`, webhooks and `/healthz` keep working. Use it during risky changes.
10. **Users / Audit log**: nothing to set. Just check that your admin shows the Agency plan.

---

## 5. Verify everything

1. **Readiness check.** Run `railway ssh -- npm run check -- --ping`. It must end with **Ready to launch**. Every ✗ is
   a blocker; ! is optional. The pings prove the Apify token, Claude (`AI_MODEL`) and the Gatevoo key work.
2. **Real $1 payment.** Admin → Payments → Coupons → new code `TEST1`: **amount off 28**, plans `starter`, monthly,
   max uses 1. Use percent 0. (Checkout refuses a total of $0, so don't make it 100%.) As a normal test user, buy
   Starter monthly with `TEST1` → Crypto → USDT. Pay $1 from a real wallet. Expect: the Gatevoo hosted page →
   redirect to `/pay/callback?ref=SV-…` → "Payment received!" → plan = Starter → `payment-receipt` email → the order
   in Admin → Payments → Orders with a Tronscan link. If it stays pending, press **Check** and read
   `docs/GATEVOO.md` §2. Afterwards, switch the coupon off.
3. **Email deliverability.** Resend should show the domain as **Verified**, with SPF (`TXT` on `send` / the root, as
   shown) and DKIM records. Add DMARC:
   `_dmarc.spyvoo.com TXT "v=DMARC1; p=none; rua=mailto:privacy@spyvoo.com"`. Move to `p=quarantine` after 2–4 clean
   weeks. Send a test to mail-tester.com and aim for 9/10 or better. Reply to a Spyvoo email and confirm it lands in
   the `support@` inbox.
4. **Phone test.** On a real phone: sign up, verify the email, use Discover with a plain-English search ("crypto ads
   in Brazil over 30 days"), open an ad (AI breakdown), save it to a board, then sign out and back in. Check the bottom
   tab bar and that nothing scrolls sideways.
5. **Beginner tour.** It starts on first login, or from the "How it works" button. Watch it on a phone and a laptop.
   It must not use up searches (`GET /api/app/tour` is free).
6. **Legal + sharing.** Read `/legal/terms`, `/legal/privacy`, `/legal/refunds` and `/legal/acceptable-use`. Paste
   `https://spyvoo.com` into WhatsApp/Telegram and check the preview card.

---

## 6. Monthly cost estimate

**Assumptions.** Apify is billed per ad returned, *every run*, including ads you already have. About 30–40% of results
are new ads. Average stored media is about 2 MB per new ad. One Claude breakdown is about 800 input + 600 output
tokens, so ≈$0.0038 on Haiku. A "Make it mine" call is about 700 in + 1,000 out ≈ $0.0057. An AI search parse is about
250 in + 100 out ≈ $0.00075. Breakdowns are cached per ad, so you pay once per ad. Each user gets about 15 emails a
month (weekly report, alerts, receipts). Railway figures are averages for one always-on service.

| | **Launch (~100 users)** | **Growth (~1,000)** | **Scale (~10,000)** |
|---|---|---|---|
| Tracking rules × runs/day × ads/run | 10 × 1 × 50 = 500/day ≈ 15,000/mo | 40 × 2 × 50 = 4,000/day ≈ 120,000/mo | 100 × 2 × 75 = 15,000/day ≈ 450,000/mo |
| **Apify** | Starter: 15k × $5.00/1k = **$75** ($19 plan counts toward it) | Scale: 120k × $4.20/1k = **$504** ($199 plan included) | Business: 450k × $3.40/1k = **$1,530** ($999 plan included) |
| Daily budget to set | $2.50 | $17 | $51 |
| Claude breakdowns | 1,500 opened ads × $0.0038 = $5.70 | analyse-new **off**: 15,000 × $0.0038 = $57 | analyse-new **on**: ~150k new ads × $0.0038 = $570 |
| Claude scripts + search | 300 × $0.0057 + 3,000 × $0.00075 = $4 | 3,000 × $0.0057 + 30,000 × $0.00075 = $40 | 30,000 × $0.0057 + 300,000 × $0.00075 = $396 |
| **Claude total** | **≈ $10** | **≈ $97** | **≈ $966** |
| Whisper (optional, 30 s/video, 40% video) | ~2,000 × $0.003 = $6 | ~15,000 × $0.003 = $45 | ~60,000 × $0.003 = $180 |
| **Email** | 1,500/mo. Resend Free *only if* the Monday report stays under 100/day, else **$20** | 15,000/mo → Pro **$20** | 150,000/mo → Scale $90 + 50k × $0.90/1k = **$135** |
| Media growth (in R2) | ~12 GB/mo | ~70 GB/mo | ~300 GB/mo |
| **R2** | ~$0 (inside the 10 GB free tier at first) | ~400 GB after 6 mo × $0.015 = **$6** | ~3.6 TB after 12 mo × $0.015 = **$54**, plus ~$5 ops |
| **Railway** | 0.5 GB RAM ($5) + 0.2 vCPU ($4) + 20 GB vol ($3) + 100 GB egress ($5) ≈ **$17** (Hobby) | 1 GB ($10) + 0.5 vCPU ($10) + 30 GB vol ($4.50) + 200 GB egress ($10) ≈ $35 (Pro $20 min) → **$35** | 2 GB ($20) + 1 vCPU ($20) + 60 GB vol ($9) + 400 GB egress ($20) ≈ **$69** |
| **Total (without Whisper)** | **≈ $100–125** | **≈ $660** | **≈ $2,760** |

Revenue check: 3 Starter sales cover launch. At growth, about 9 Pro subscribers cover costs. Apify is the cost that
matters, so keep `interval_hours` long and `ads per run` modest. Use 24 h for most rules and 6–12 h only for the
hottest niches.

---

## 7. Day-2 operations

**Backups**
- In Railway, open the service's volume → **Backups** → turn on the **Daily** (kept 6 days) and **Weekly** (kept 27
  days) schedules. Backups are incremental and billed at volume rates.
- Run `railway ssh -- npm run backup` weekly. It uses `VACUUM INTO`, which is safe while the app is running, writes to
  `/app/data/backups/` and keeps the newest 14. It does **not** include media.
- Copy one backup off Railway every month.
- To restore: turn on Maintenance mode, copy the backup over `/app/data/spyvoo.db`, then redeploy.

**Updating code.** Push to the GitHub branch Railway watches. Railway builds the image, waits for `/healthz` and then
switches traffic. Migrations in `migrations/` run on boot. For big changes, turn on Maintenance mode first and run
`npm test` locally before you push. Email templates are cached, so redeploy after you edit them.

**Logs.** Service → **Deployments → View logs** (or `railway logs`). Background job errors show as `[job:<name>]`.
The Admin **Overview → System health** and the **Job monitor** are the friendlier view.

**Scaling**
- Keep **one replica**. SQLite and the in-process scheduler (scrape 5 min, media 1 min, refresh 1 h, alerts 30 min,
  billing 1 h, voosquare 1 min, weekly Mon 08:00 UTC, cleanup daily) assume a single instance. Scale up first by
  giving the service more RAM/CPU.
- Media is on R2 from launch, so the Railway volume only holds the database and backups. Watch R2 storage in the Cloudflare dashboard.
- Move to Postgres when you need more than one web instance or the DB passes about 20 GB. The schema is in
  `migrations/001_init.sql`, and FTS5 becomes `tsvector`. Plan about a week. Then run web with `SCHEDULER=false` and
  one worker copy with `SCHEDULER=true`.

**Adding a data provider.** Copy `src/providers/template.js` to `src/providers/<name>.js`. Implement `search()` so it
returns `{ ads, credits, runs }` in the normalised shape described in the file. `library_id` must be unique. Register
it in `REGISTRY` in `src/providers/index.js`, deploy, and pick it in Admin → Ad data & AI. Nothing else changes.

**Troubleshooting**

| Symptom | Cause → fix |
|---|---|
| Deploy crashes: `APP_SECRET is missing` | Set `APP_SECRET`. |
| Healthcheck fails / crash loop | Node older than 22.13 (`node:sqlite` missing) or a bad variable. Read the logs. Keep the Dockerfile base `node:22-alpine`. |
| All data gone after a deploy | No volume at `/app/data` or a wrong `DATABASE_PATH`. Attach the volume, then restore a backup. |
| Can't log in as admin | The admin is only seeded on an empty DB. Run `railway ssh -- npm run create-admin -- you@x.com "new-password"`. |
| Only sample ads show | Provider not connected. Set the token, then run **Test scrape**. |
| Scrape jobs fail "Daily credit budget reached" | Raise the budget or lengthen the rule intervals. It resets at 00:00 UTC. |
| Apify error 401/403 | Bad token, or you're out of Apify credit. Check console.apify.com → Billing. |
| Breakdowns look generic (`spyvoo-basic`) | `ANTHROPIC_API_KEY` missing or out of credit. Run `npm run check -- --ping`. |
| Emails show "logged", not sent | `MAIL_PROVIDER`/`MAIL_API_KEY` missing, or the domain isn't verified with the provider. |
| Emails land in spam | Missing DKIM/DMARC, or `MAIL_FROM` isn't on the verified domain. |
| Resend 429 / emails stop mid-Monday | Free plan's 100/day cap. Upgrade to Pro. The app already paces sends (about 2 a second) and retries 429/5xx, so short bursts are fine. |
| Gatevoo "rejected the API key" | Wrong `GATEVOO_API_KEY` or `GATEVOO_API_URL`. |
| Order paid but plan not active | Webhook not reaching `/webhooks/gatevoo`, a wrong secret, or the server clock is off (signatures older than 5 min are rejected). Press **Check** on the order. Underpaid orders stay pending on purpose. |
| Everyone shares one IP in rate limits | `TRUST_PROXY` must be `true` behind Railway. |
| Media 404s | Media job still running or failed. Press **Retry failed media**. With R2, check `R2_PUBLIC_URL`. |
| Logged out when switching www/apex | Add the www → apex redirect rule (§3.6). |

---

## 8. Security checklist before launch

- [ ] `NODE_ENV=production`, `APP_URL=https://spyvoo.com`, and a 64-hex `APP_SECRET` stored in a password manager.
      Changing it later logs everyone out and makes saved encrypted tokens unreadable.
- [ ] `PAYMENTS_DEMO=false`, and `npm run check` shows no "PAYMENTS_DEMO is on".
- [ ] Admin password changed after the first login. Optionally remove `ADMIN_PASSWORD` from Railway variables.
- [ ] Only trusted people have Railway, GitHub, Apify, Anthropic, Resend, Cloudflare and Gatevoo access. 2FA is on
      for every one of them.
- [ ] API keys are scoped. Resend key is "sending access" only. R2 token covers one bucket only. Anthropic workspace
      has a monthly spend limit. Apify has a usage limit set (Billing → Limits).
- [ ] The Admin daily scrape budget is set. Anthropic and Apify billing alerts are on.
- [ ] `GATEVOO_WEBHOOK_SECRET` is set. The webhook is HTTPS only. The $1 test passed.
- [ ] Repo is private. `.env` and `data/` are not committed (`git ls-files | grep -E '\.env$|\.db'` prints nothing).
- [ ] HTTPS works on `spyvoo.com` and `www`. Cloudflare SSL is Full (strict) if proxied.
- [ ] Volume backups are on, and one `npm run backup` has been run.
- [ ] SPF, DKIM and DMARC are published.
- [ ] Legal pages are reviewed: company shown as "Zedapex Limited, Lagos", and the contact emails are right.
- [ ] If VooSquare is on, `VOO_REDIRECT_URI` exactly matches the registered URI, and admins can still log in with a
      password.
- [ ] Maintenance mode tested once (on → user sees "back soon" → off).

---

## Sources

- Apify pricing (plans, CU prices): https://apify.com/pricing
- Apify Facebook Ads Library Scraper (pay-per-result tiers): https://apify.com/apify/facebook-ads-scraper
- Claude API pricing (Haiku 4.5, Sonnet 5.5, batch): https://platform.claude.com/docs/en/about-claude/pricing
- OpenAI whisper-1 per-second price (via OpenRouter listing; OpenAI's own page was unreachable, so recheck): https://openrouter.ai/openai/whisper-1/pricing
- Resend pricing: https://resend.com/pricing
- Brevo free/Starter (third-party review; check current price): https://dreamlit.ai/blog/brevo-review
- Postmark pricing: https://postmarkapp.com/pricing
- ImprovMX pricing: https://www.improvmx.com/pricing
- Cloudflare R2 pricing: https://www.cloudflare.com/developer-platform/products/r2/
- Railway pricing (per-second rates; monthly figures here = rate × 2,592,000 s): https://railway.com/pricing
- Railway volume backups: https://docs.railway.com/volumes/backups
- Railway volumes (mount path, resizing): https://docs.railway.com/volumes
- Railway SSH: https://docs.railway.com/cli/ssh
- Zoho Mail: check current price at https://www.zoho.com/mail/zohomail-pricing.html
