# Deploy Spyvoo on Railway in 30 minutes

You need: a GitHub account, a Railway account, the `spyvoo.com` domain, and (for real data) an Apify account.
Everything else can be switched on later from the admin panel or by adding a variable.

## 0. Before you start (5 min): get the keys

| Key | Where | Needed for |
| --- | --- | --- |
| `APP_SECRET` | Run `openssl rand -hex 32` (or any 64 random characters) | Required |
| `APIFY_TOKEN` | console.apify.com → Settings → Integrations | Real ads (without it, sample ads show) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | AI breakdowns, scripts, plain-English search (basic mode works without) |
| `MAIL_API_KEY` | resend.com (recommended), brevo.com or postmarkapp.com | Emails |
| `GATEVOO_API_KEY` + `GATEVOO_WEBHOOK_SECRET` | Gatevoo dashboard | Taking money |
| `VOO_BASE`, `VOO_CLIENT_ID`, `VOO_CLIENT_SECRET`, `VOO_API_KEY`, `VOO_SIGNAL_SECRET` | VooSquare → Admin → Products → Spyvoo → Credentials (signal secret: `openssl rand -hex 32`) | Continue with Voo ID, affiliate commissions, VooSquare dashboard card (docs/VOOSQUARE.md) |

## 1. Put the code on GitHub (3 min)

Unzip the source, then:

```bash
cd spyvoo
git init && git add . && git commit -m "Spyvoo 1.0"
gh repo create zedapex/spyvoo --private --source=. --push    # or create the repo on github.com and push
```

## 2. Create the Railway service (3 min)

1. railway.com → **New Project** → **Deploy from GitHub repo** → pick `spyvoo`.
2. Railway finds the `Dockerfile` and `railway.json` on its own. Health check: `/healthz`.
3. Open the service → **Settings** → **Volumes** → **Add volume**, mount path **`/app/data`**, 5 GB to start.
   This holds the database and saved ad media. Without it, data is lost on every deploy.

## 3. Variables (5 min)

Service → **Variables** → **Raw Editor**, paste `.env.example`, then fill in:

```
NODE_ENV=production
APP_URL=https://spyvoo.com
APP_SECRET=<64 random characters>
ADMIN_EMAIL=you@yourmail.com
ADMIN_PASSWORD=<a long password, change it after first login>
DATABASE_PATH=/app/data/spyvoo.db
APIFY_TOKEN=<apify token>
ANTHROPIC_API_KEY=<anthropic key>
MAIL_PROVIDER=resend
MAIL_API_KEY=<resend key>
MAIL_FROM=Spyvoo <hello@spyvoo.com>
GATEVOO_API_KEY=<gatevoo key>
GATEVOO_WEBHOOK_SECRET=<gatevoo webhook secret>
PAYMENTS_DEMO=false
```

Leave the rest empty. Save; Railway redeploys.

## 4. Domain (5 min)

Pick one address and redirect the other: in Cloudflare add a Redirect Rule `www.spyvoo.com/*` → `https://spyvoo.com/$1` (301), so logins don't split across two sites.


1. Service → **Settings** → **Networking** → **Custom domain** → `spyvoo.com` (and `www.spyvoo.com`).
2. Railway shows a CNAME target. At your DNS provider add it (for the bare domain use CNAME flattening / ALIAS, or
   Cloudflare's proxied CNAME). HTTPS is automatic once DNS resolves.

## 5. Email DNS (5 min)

In Resend (or Brevo/Postmark) add the domain `spyvoo.com` and copy the SPF, DKIM and (optional) DMARC records into your
DNS. Wait until it says **Verified**. Sender: `hello@spyvoo.com`. Replies go to `support@spyvoo.com`, so make sure that
mailbox exists (Zoho, Google Workspace, or forwarding with ImprovMX / Cloudflare Email Routing). The full address list is
in [EMAILS.md](EMAILS.md).

## 6. First login and checks (5 min)

1. Open `https://spyvoo.com/login`, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`, then go to `/admin`.
2. **Overview → System health** should be green for Ad data, AI, Emails and Payments.
3. **Ad data & AI → Test scrape**: type `online course`, country `IN`, press **Run test**. You should see ads.
4. **Payments → Test connection** (Gatevoo) should say "Connected". Copy the webhook URL into Gatevoo.
5. **Emails → Send me this email** on `welcome`. Check your inbox (and spam the first time).
6. **Tracking rules**: edit the five examples or import your own CSV. Each rule runs on its own schedule.
7. When real ads have arrived, **Ads manager → Remove sample ads**.
8. Change your password: `/app/account`.

Optional, from a terminal on your computer with the Railway CLI (`npm i -g @railway/cli`, then `railway login`, `railway link`, `railway ssh`):

```bash
npm run check -- --ping     # proves every key works
npm run backup              # snapshot the database into /app/data/backups
```

## Scaling notes

- **One replica.** SQLite and the in-process scheduler expect a single instance, and a Railway volume belongs to one service.
  One service comfortably handles thousands of users. Past that, plan the Postgres move described in ARCHITECTURE.md before
  adding replicas.
- **Media (videos) live in Cloudflare R2 from day one.** Set `MEDIA_DRIVER=r2` and the `R2_*` variables before launch.
  Videos are the bulk of storage and traffic: R2 has zero egress fees, while every GB served from Railway is billed.
  Users stream straight from `media.spyvoo.com`; downloads use short-lived signed R2 links. (Files saved earlier on the
  volume keep working from disk.)
- **Costs.** The daily scrape budget (Admin → Ad data & AI) stops Apify spend for the day once reached and emails you.
- **Backups.** Railway volumes support snapshots. Also run `npm run backup` weekly (keeps the last 14).
