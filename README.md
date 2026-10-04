# Spyvoo

**Spy on winning Facebook and Instagram ads. Steal the angle.** A product of Zedapex Limited.

Spyvoo collects ads from Meta's Ad Library through Apify, keeps every image and video forever, scores each ad
(how long it has run, how many variations, how many countries, still live), and uses Claude to explain why it works
and rewrite it for your product. Users search in plain English ("crypto ads in Brazil over 30 days"), save winners to
boards, follow competitors and get alerts.

Everything (website, dashboard, admin control room, data pipeline, emails, payments) is **one Node.js process with
zero npm dependencies** and a SQLite file. It deploys to Railway in about 30 minutes.

## What's inside

| Part | Where | What it does |
| --- | --- | --- |
| Website | `/`, `/pricing`, `/login`, `/signup`, `/legal/*` | Landing page with live demo laptop, before/after slider, try-it search, plans, the launch offer and the swipeable Voo family slides |
| Dashboard | `/app` | Home, Discover (plain-English search, filters, infinite scroll), ad drawer with AI breakdown and "Make it mine", Boards, Alerts, AI scripts, Plan & billing, Account. Phone layout with a bottom tab bar |
| Beginner tour | "How it works" button, and on first login | A guided video-style walkthrough of the real dashboard with a moving cursor, captions and optional voice. It never spends the user's searches |
| Admin control room | `/admin` | Overview with charts and health, tracking rules (+ CSV), ad data & AI, job monitor, ads manager, users, plans, payments (methods, coupons, orders), offer & Voo family slides, emails (preview, test, broadcast), settings, audit log |
| Pipeline | `src/services/ingest.js`, `src/providers/*` | Runs tracking rules on a schedule within a daily budget, saves and de-duplicates ads, downloads media, refreshes scores |
| Emails | `emails/*.html` | 13 branded emails (welcome, verify, reset, receipt, renewal, expired, advertiser alert, search alert, weekly report, team invite, offer, announcement, admin budget) with the Voo family strip |
| Payments | `src/services/payments.js`, `gatevoo.js` | Gatevoo crypto checkout (USDT TRC20, Bitcoin), manual methods per country, coupons, renewals |

## Run it locally (2 minutes)

```bash
# Node.js 22.13 or newer. No npm install needed.
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=change-me-please npm start
# open http://localhost:3000  ·  admin at http://localhost:3000/admin
```

The first boot creates the database, the four plans, the SPYLAUNCH coupon, five example tracking rules, your admin
and 27 sample ads so nothing is empty. Payments run in test mode locally (`PAYMENTS_DEMO` is on outside production).

```bash
npm test          # 51 tests, about 10 seconds
npm run check     # launch readiness: what's connected, what's missing
npm run backup    # copy the database to data/backups/
npm run create-admin -- you@example.com "a-long-password"
```

## Deploy

Read **[docs/RAILWAY.md](docs/RAILWAY.md)**. The short version: push this folder to GitHub, create a Railway service
from it, add a volume at `/app/data`, paste the variables from `.env.example`, deploy, point `spyvoo.com` at it.

## Docs

- [docs/RAILWAY.md](docs/RAILWAY.md): the 30-minute deploy, step by step
- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md): everything to tick before you announce
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): how to run Spyvoo day to day from `/admin`
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together, and why it is not Next.js
- [docs/API.md](docs/API.md): every endpoint
- [docs/EMAILS.md](docs/EMAILS.md): the email list, sender addresses and DNS
- [docs/GATEVOO.md](docs/GATEVOO.md): crypto checkout contract
- [docs/VOOSQUARE.md](docs/VOOSQUARE.md): one login for every Voo tool
