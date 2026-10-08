# October 2026 update: Gatevoo fix, 24/7 support agent, stronger ad AI

## 1. Spyvoo ↔ Gatevoo payments fixed
The two apps used different field names, so:
- Paid crypto orders were treated as "underpaid" and never switched the plan on.
- "Test payment connection" said 404.
- Customers weren't sent back to Spyvoo after paying.

Both sides now speak the same contract. Either app alone already fixes it, so the deploy order doesn't matter. Full
details are in [docs/GATEVOO.md](docs/GATEVOO.md).

- **Customers who paid while it was broken get their plan automatically.** About 15 seconds after Spyvoo starts, it re-checks every unpaid crypto order from the last 45 days. **Admin → Payments → Re-check unpaid crypto orders** does the same on demand.
- A short payment matched by hand in Gatevoo is reported as what really arrived, so Spyvoo flags it instead of giving the plan.
- "Test payment connection" also warns when Gatevoo has no webhook URL for Spyvoo, or no wallet for a coin Spyvoo offers.
- Cross-app test: `npm run e2e:gatevoo` (with `gatevoo-main` next to this folder). It runs 16 checks: USDT and BTC paid → plan on, webhook delivered, redirect back, replay, forged webhook, underpaid, short payment assigned by hand, and late payment.

## 2. 24/7 support agent ("Leo")
A chat in the dashboard and on the website that talks like a person:
- Greets by first name and replies in short separate messages with typing in between.
- Opens jovially or seriously, depending on the message.

It knows Spyvoo, the live plans, offers and policies, and this customer's account, usage and payments. It can:
- re-check a crypto payment and switch the plan on;
- resend the confirmation email;
- check coupons;
- build search links;
- hand the chat to a person.

Admins work from **Admin → Support**: the inbox, take-over and agent settings. See [docs/SUPPORT.md](docs/SUPPORT.md).

## 3. Stronger ad-breakdown AI
The breakdown now follows an expert media-buyer framework. It adds hook type, awareness stage, offer mechanics,
funnel, Meta ban risk (important for trading/iGaming), 1–10 scores and test ideas. Old breakdowns keep working. An old
AI breakdown is refreshed once, the next time someone runs a breakdown on that ad.

## Deploy (Ademola)
Both database migrations (006 support, 007 breakdown) run by themselves on start. Nothing else needs doing in the
database.

**Gatevoo (gatevoo.com)**
1. Deploy the new code and restart (`pm2 restart gatevoo`).
2. Check `.env`:
   - `BASE_URL=https://gatevoo.com`
   - `APP_SECRET` is set
   - `MOCK_CHAIN=0`
   - the wallets are set (`USDT_TRC20_ADDRESS`, plus `BTC_MODE=fresh` with `BTC_ZPUB`)
3. In the Gatevoo dashboard, go to **Connect → Spyvoo** and:
   - set the webhook URL to `https://spyvoo.com/webhooks/gatevoo`;
   - copy the API key and webhook secret (make new ones if they're lost).

**Spyvoo (Railway)**
4. Set these variables:
   - `GATEVOO_API_KEY=gv_live_…`
   - `GATEVOO_WEBHOOK_SECRET=whsec_…`
   - `GATEVOO_API_URL`: leave it unset, or `https://gatevoo.com/api/v1`. **Delete it if it says api.gatevoo.com.**
   - `PAYMENTS_DEMO=false`
   - `APP_URL=https://spyvoo.com`
   - an AI key: `ANTHROPIC_API_KEY`, or `AI_PROVIDER=openrouter` with `OPENROUTER_API_KEY`. Without one, the support agent and breakdowns run in basic mode.
5. Deploy, then work through **Admin → Payments**:
   - press **Test payment connection** and look for "Connected … API key accepted";
   - under **Crypto**, switch on only the coins Gatevoo has wallets for.
6. In Gatevoo, go to **Connect → Spyvoo → Send test webhook**. It must say delivered; a 401 means the secret doesn't match.
7. Pay a real $1–2 order in USDT and one in BTC. The plan should switch on and you should land back on Plan & billing.
8. In **Admin → Support → Agent settings**, check the name, AI on, website chat and the daily AI budgets. Then, from a test account, send "I paid but my plan isn't active".

## Tests
- Spyvoo: `npm test`, 136 tests. One is skipped: the VooSquare end-to-end test, which needs the voosquare-app checkout.
- Gatevoo: `npm test`, 46 tests.
- Cross-app: `npm run e2e:gatevoo`, 16 checks.

Before release, the work was reviewed by a separate bug team, security team and supervisor, and everything they found
was fixed and re-checked.

## Second round (same day)
- **Phone home screen:**
  - Shorter, mostly blue hero.
  - Search box at the top.
  - Example searches in one row that swipes sideways.
  - The tour button reads "Tour" on phones.
  - Two different ads in the hero.
  - Winners show on the first screen.
- **Tour narrator voice (Megan, American, ElevenLabs).** Run `ELEVENLABS_API_KEY=... npm run tour-voice` once and commit `public/audio/tour/*.mp3`. Until then the tour uses the phone's own voice. The tour waits for each line to finish, and has pause and mute.
- **Owner label and premium badge:**
  - Admin accounts show "Owner" instead of "Agency".
  - Paying customers get an **agent ID** badge instead of a crown: an ID clip on the avatar, a "PRO AGENT" pill with clearance bars on desktop, and an animated ID card when the payment confirms. Starter = steel (level 1), Pro = electric blue (level 2), Agency and Owner = black and gold (level 3).
- **Emails:**
  - All 14 rewritten, and the plain-text version fixed.
  - One-click unsubscribe (RFC 8058) on marketing mail at `/unsubscribe/<token>`.
  - Alerts are only emailed to confirmed addresses.
- **Sales copy:**
  - Website, pricing and Plan & billing rewritten.
  - The fake "ROAS" badges are gone and the wording is now honest about "no auto-charge".
  - Leo has a "Selling" section and example conversations.
  - Plan taglines are updated by migration 008, which keeps any taglines you edited in Admin.
- **QA fixes:**
  - Leo's bubble steps aside when a pop-up or the ad panel is open.
  - The basic agent answers "Can I pay with crypto?" and "Is there a free plan?" correctly.
  - The Account page no longer scrolls sideways on phone.
  - Pricing table works on phone.
  - Dark-mode labels are readable.
  - Admin Support works on phone.
