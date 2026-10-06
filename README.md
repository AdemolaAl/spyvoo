# Spyvoo

**Spy on winning Facebook and Instagram ads. Steal the angle.** A product of Zedapex Limited.

Spyvoo collects ads from Meta's Ad Library through Apify, keeps every image and video forever, scores each ad
(how long it has run, how many variations, how many countries, still live), and uses AI (Claude by default, or any model through OpenRouter) to explain why it works
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
| Emails | `emails/*.html` | 14 branded emails (welcome, verify, reset, receipt, payment not approved, renewal, expired, advertiser alert, search alert, weekly report, team invite, offer, announcement, admin budget) with the Voo family strip |
| Payments | `src/services/payments.js`, `gatevoo.js` | Gatevoo crypto checkout (USDT TRC20, Bitcoin), custom methods per country (bank transfer, mobile money, wallet: proof upload and admin review), coupons, renewals, refunds and chargebacks |
| VooSquare | `src/services/voosquare.js`, `voo-connect/` | Continue with Voo ID (email login kept), affiliate hand-off, money and activity events, summary card, support widget |

## Run it locally (2 minutes)

```bash
# Node.js 22.13 or newer. No npm install needed.
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=change-me-please npm start
# open http://localhost:3000  ·  admin at http://localhost:3000/admin
```

The first boot creates the database, the four plans, the SPYLAUNCH coupon, five example tracking rules, your admin
and 27 sample ads so nothing is empty. Payments run in test mode locally (`PAYMENTS_DEMO` is on outside production).

```bash
npm test          # about 120 tests, about 20 seconds (the VooSquare end-to-end test needs the voosquare-app checkout)
npm run check     # launch readiness: what's connected, what's missing
npm run backup    # copy the database to data/backups/
npm run create-admin -- you@example.com "a-long-password"
```

## Deploy

Read **[docs/RAILWAY.md](docs/RAILWAY.md)**. The short version: push this folder to GitHub, create a Railway service
from it, add a volume at `/app/data`, paste the variables from `.env.example`, deploy, point `spyvoo.com` at it.

## Use OpenRouter (optional)

OpenRouter lets Spyvoo's AI run on almost any model (Claude, GPT, Gemini, Llama…) with one key and one bill.
Claude direct (`ANTHROPIC_API_KEY`) stays the default; nothing changes unless you switch.

1. Make an account at [openrouter.ai](https://openrouter.ai), add some credit, then **Keys → Create key**.
2. On Railway → your service → **Variables**, add:
   ```
   AI_PROVIDER=openrouter
   OPENROUTER_API_KEY=sk-or-...
   OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
   # optional, tried in order when the main model is down or busy:
   OPENROUTER_FALLBACK_MODELS=openai/gpt-4o-mini
   ```
   Or skip the variables and do it in **Admin → Ad data & AI → AI provider** (the key is stored encrypted, only its
   last 4 characters are ever shown, and switching provider means typing the key again).
3. **Pick a model**: copy its id from [openrouter.ai/models](https://openrouter.ai/models), e.g.
   `anthropic/claude-sonnet-4.5` (the default) or `openai/gpt-4o-mini` (much cheaper).
4. Press **Test AI** in the admin, or run `npm run check -- --ping`.

**Costs.** You pay per token at the price shown on each model's page, from prepaid OpenRouter credit. The default
`anthropic/claude-sonnet-4.5` is $3 per million input tokens and $15 per million output, so one ad breakdown costs
about 1 cent (roughly 3 times Claude Haiku direct). For a lot of traffic pick a cheaper model. Today's AI calls,
tokens and cost are shown in **Admin → Ad data & AI**, and the limits (200 AI searches a day per account, AI
breakdowns per plan) work the same with every provider.

## Docs

- [docs/RAILWAY.md](docs/RAILWAY.md): the 30-minute deploy, step by step
- [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md): everything to tick before you announce
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): how to run Spyvoo day to day from `/admin`
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code fits together, and why it is not Next.js
- [docs/API.md](docs/API.md): every endpoint
- [docs/EMAILS.md](docs/EMAILS.md): the email list, sender addresses and DNS
- [docs/GATEVOO.md](docs/GATEVOO.md): crypto checkout contract
- [docs/PAYMENTS_CHECKLIST.md](docs/PAYMENTS_CHECKLIST.md): make live payments work, read checkout errors, test the connection
- [docs/VOOSQUARE.md](docs/VOOSQUARE.md): Voo ID login, affiliate hand-off, events and the summary card (Voo Connect kit in `voo-connect/`)
