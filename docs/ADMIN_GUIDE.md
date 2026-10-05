# Running Spyvoo from the control room

Log in, then open **`/admin`** (or "Admin panel" at the bottom of the dashboard menu). Everything below is live: no
code, no redeploy. Every change is written to the **Audit log**.

## Overview
Greeting, live numbers (ads tracked, users, paying users, revenue), 14-day charts for new ads, sign-ups and revenue,
**System health** (green = working on its own; tap a row to fix it), people per plan, background jobs and recent failures.

## Tracking rules — what Spyvoo watches
A rule is a **keyword**, a **Facebook page ID** or a **website domain**, in one or more countries, checked every N hours.
- **New rule**: e.g. keyword `forex signals`, countries `BR, MX`, niche `Trading`, every 6 hours, 100 ads per run.
- **Run now** runs it immediately and shows how many ads were found and how many were new.
- **Import CSV**: `type,value,countries,niche,interval_hours`, one rule per line, countries separated by a space or `|`.
- Switch a rule off to pause it without losing it.
Tip: start with 10–20 rules across your best niches and countries, watch the cost for two days, then add more.

## Ad data & AI
- **Provider**: Apify (real Meta Ad Library data) or Sample data. Paste the Apify token here (stored encrypted) or set
  `APIFY_TOKEN` on Railway.
- **Daily budget**: scraping stops for the day when it's spent, and you get an email. Resets at midnight UTC.
- **Save images and videos forever**: keep on. It is what makes Spyvoo better than the Ad Library (links expire there).
- **Write AI breakdowns for every new ad**: off = only when someone opens an ad (much cheaper). On = instant everywhere.
- **Test scrape** pulls up to 10 ads right now to prove the connection.

## Job monitor
Every scrape, media download and AI job. Filter by kind and status, **Retry** failed ones, **Run now** any scheduled
job, **Retry failed media** in one tap.

## Ads manager
Search every ad. **Featured** ads appear first on the website's live wall. **Hidden** ads disappear for users.
**Re-run AI** rewrites the breakdown. **Remove sample ads** once real ads arrive (or **Add sample ads** for a demo).

## Users
Search by email or name. **Manage** shows usage meters, boards, follows and orders, and lets you change the plan,
move the paid-until date (free time), make someone an admin, or suspend them (logs them out at once).

## Plans
Edit names, prices (monthly and yearly), limits (`-1` = unlimited), seats, the feature list, the "most popular" badge,
and visibility. The website, pricing page and checkout update instantly. Hide a plan instead of deleting it if people
are on it.

## Payments
- **Gatevoo**: status (live / sandbox / off), the webhook URL to paste into Gatevoo, **Test connection**.
- **Payment methods**: global (everyone) or local (only listed countries). Gatevoo crypto, or manual methods like a local
  bank transfer with your own instructions. Users only see the methods for their country.
- **Coupons**: percent or amount off, limited to plans, monthly/yearly, first purchase only, max uses, end date.
- **Orders**: crypto orders confirm on their own; **Check** asks Gatevoo now; **Mark paid** for a bank transfer once the
  money is in (the plan starts and a receipt is emailed).
- **Refund** (paid orders): record that you sent money back (send it yourself first). The plan ends unless another paid
  order covers it, and VooSquare is told (`refund`): the affiliate's commission is **not** reversed.
- **Chargeback** (paid or refunded orders): the payment was disputed and taken back. The plan ends and VooSquare reverses
  the affiliate's commission on that payment. Filter the list with **Refunded** / **Chargebacks**.

## Offer & Voo family
- **Offer**: badge, title, text, coupon code, optional countdown end date, plans. Shows on the website bar, pricing page,
  dashboard and checkout. **Email it to free users** sends the offer email.
- **Dashboard announcement**: a strip at the top of every user's dashboard (info or warning).
- **Voo family slides**: the swiping cards that sell Joinvoo, Replyvoo, Castvoo, Vooads, Gatevoo and VooSquare on the
  landing page, the dashboard and at the bottom of every email (Joinvoo, Replyvoo, Castvoo, Vooads, Gatevoo, Affleego, VooSquare, each with its real logo). Edit text, perk, link and colours, reorder with the
  arrows, hide or add brands, then **Save slides**.

## Emails
Preview every email, send yourself a test, see the last 100 sent, and **send news** to everyone or one plan
(it shows how many people will get it before sending).

## Settings
Company name and the five email addresses, platforms (live / coming soon / off), **winner score** weights and caps
(saving re-scores every ad), niche list, billing reminders and grace days, and switches: sign-ups open, the website's
try-it search, and **maintenance mode** (users see "back soon", admins still get in).
