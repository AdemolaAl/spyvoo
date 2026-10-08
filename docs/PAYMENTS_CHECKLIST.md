# Payments checklist (for the developer)

> **October 2026 fix: paid crypto orders not switching on.** Spyvoo and Gatevoo used different field names, so every
> paid order looked "underpaid", "Test payment connection" said 404, and customers weren't sent back after paying.
> Both apps now speak the same contract (details in [GATEVOO.md](GATEVOO.md)). After deploying:
> 1. In Gatevoo → Connect → Spyvoo, check the webhook URL is `https://spyvoo.com/webhooks/gatevoo` and press **Send test webhook** (must say delivered).
> 2. Spyvoo re-checks every unpaid crypto order from the last 45 days by itself 15 seconds after it starts, and switches
>    on the ones that were paid. To run it again: **Admin → Payments → Re-check unpaid crypto orders**.
> 3. Pay a real $1–2 order in USDT and in Bitcoin.


Live checkout was failing with "Something went wrong. Please try again." on every crypto payment, USDT and Bitcoin alike.
There were two reasons:

1. **Wrong Gatevoo address.** Spyvoo's default API address was `https://api.gatevoo.com/v1`. That host does not
   exist in DNS. Gatevoo's API is at `https://gatevoo.com/api/v1`, the same address Joinvoo, Castvoo and VooSquare use.
   Every invoice request failed with "could not be reached" (ENOTFOUND).
2. **The real error was hidden.** In production every 5xx error was replaced with the generic message, and the exact
   reason was only saved inside the order. It now shows in the logs, in Admin → Payments and in the overview health card.

## 1. Railway variables (Spyvoo service → Variables)

| Variable | Value | Needed for |
| --- | --- | --- |
| `GATEVOO_API_KEY` | Spyvoo's live key from the Gatevoo dashboard (`gv_live_…`). Paste it with no spaces or quotes. | Crypto |
| `GATEVOO_WEBHOOK_SECRET` | The webhook secret from the same Gatevoo screen | Crypto (if this is missing, crypto is hidden) |
| `GATEVOO_API_URL` | `https://gatevoo.com/api/v1`, or leave it unset (that is now the default). **Delete it if it says `api.gatevoo.com`.** A bare `https://gatevoo.com` also works. | Crypto |
| `PAYMENTS_DEMO` | `false` | Must be off in production |
| `APP_URL` | `https://spyvoo.com` (no trailing slash) | Webhook and return links |

In Gatevoo, set the webhook URL to `https://spyvoo.com/webhooks/gatevoo`. Admin → Payments shows it with a Copy button.

**Other payment method (bank transfer, "Manual").** No environment variable is needed. In **Admin → Payments → Payment
methods → Bank transfer**:

- switch it **on**;
- set **scope** to *global*, or to *local* with the countries (for example `NG`). A local method with no countries shows to nobody;
- put your bank details in **instructions**.

Customers then get the instructions with an order reference. Confirm each payment with **Mark paid** in Admin → Payments → Orders.

Redeploy after changing variables. Railway does this automatically when you save.

## 2. Test it (2 minutes)

1. Open **Admin → Payments** and press **Test payment connection**.
   - "Connected to https://gatevoo.com/api/v1 as … API key accepted." means it works.
   - Anything else is the exact reason (see the table below).
2. Optional, from the Railway shell: `npm run check -- --ping`. It prints the Gatevoo API address, the ping result and the last checkout error.
3. On a phone, log in with a test account, open **Plan → Starter**, apply `SPYLAUNCH` (total $14.50), pick USDT and
   press **Continue to payment**. You should land on Gatevoo's payment page. Try Bitcoin as well.

## 3. Reading an error

The customer now sees a specific message above the Pay button. You see the exact reason in three places:

- **Railway logs**: `[gatevoo] checkout SV-… failed (<code>): <reason>`
- **Admin → Payments**: the "Last crypto checkout failed" box, and the result of "Test payment connection"
- **Admin → Overview**: the Payments health row turns red with the reason (it clears after the next successful checkout)

| Code | Exact reason (admin) | What to do | Customer sees |
| --- | --- | --- | --- |
| `unreachable` | `Gatevoo could not be reached at <url> (ENOTFOUND <host>)` | Fix `GATEVOO_API_URL` (use `https://gatevoo.com/api/v1`). With ECONNREFUSED or a timeout, Gatevoo itself is down. | "Couldn't reach the payment provider. Please try again in a minute…" |
| `rejected_key` | `Gatevoo returned 401 …` | Wrong or old `GATEVOO_API_KEY`. Copy it again from Gatevoo with no spaces. | "Crypto checkout isn't available right now…" |
| `wrong_url` | `Gatevoo returned 404 for POST <url>/invoices` | The address path is wrong. It must end in `/api/v1`. | "Crypto checkout isn't available right now…" |
| `refused` | `Gatevoo returned 4xx …: <Gatevoo's message>` | Gatevoo refused the invoice (for example a minimum amount, or a coin that is not switched on in Gatevoo). Fix it in Gatevoo. | "The payment provider refused this order…" |
| `provider_down` | `Gatevoo returned 5xx` | A problem on Gatevoo's side. Check Gatevoo's logs. | "The payment provider is having trouble…" |
| `bad_response` | `Gatevoo answered … without an invoice id and an https checkout_url` | Gatevoo must return `{ id, checkout_url: "https://…" }`. | "…unexpected answer…" |
| `not_configured` | `GATEVOO_API_KEY missing` / `GATEVOO_WEBHOOK_SECRET missing` | Set both variables. | Crypto is hidden; other methods still show |

If a payment goes through on Gatevoo but the plan doesn't switch on, check the logs for
`[gatevoo] webhook refused: …`. It means `GATEVOO_WEBHOOK_SECRET` doesn't match the secret in Gatevoo.

## 4. iPhone zoom

The page zoomed in when someone tapped the discount code field. iPhone Safari zooms on any text field smaller than
16px. All typing fields are now 16px, and pinch-zoom still works. Nothing needs configuring.

## 5. Custom payment methods (bank transfer, mobile money, a USDT wallet address…)

These work like VooSquare's: the customer sees your account details and the exact amount, pays by hand, then adds a
reference or a screenshot. The order waits in **Review** until you approve it (plan on) or reject it (with a reason).
No environment variables are needed. Everything is in **Admin → Payments**.

**Add one: Payment methods → Add → Type "Custom".**

| Field | What to put |
| --- | --- |
| Name / short description | What customers see, e.g. "Naira bank transfer" |
| Icon | Bank, Mobile money, Wallet, Card, Cash or Other |
| Who sees it | *Everyone*, or *Only some countries* plus country codes (`NG, GH`). A switched-on method with no countries can't be saved, and old ones show a red "Nobody sees this method" warning. |
| Currency and rate | e.g. `NGN` and `1600` (1 USD = 1600 NGN). Use `USD` and `1` for dollars, or `USDT` and `1` for a wallet. Each order keeps the rate it was made with. |
| Account details | One per line, `Label: value` (e.g. `Account number: 0123456789`). Each line gets a Copy button. |
| Instructions | Free text shown under the details |
| Proof the customer adds | Reference or screenshot (default), reference only, screenshot only, both, or nothing |
| Order, on/off | Use ↑ ↓ in the list to reorder. Off hides it. Delete removes it; open orders keep their own copy of the details. |

The old **Bank transfer** is now a custom method. Its name, instructions, countries and on/off setting are kept, and it
gets the defaults (Bank icon, USD, rate 1). To use it, add countries (or make it global), add the account details and
switch it on.

**What the customer sees.** The checkout lists every switched-on method for their country next to USDT and BTC. After
**Continue to payment** they see the exact amount (e.g. `23,200 NGN = $14.50`, with SPYLAUNCH already taken off), the
account details and the order reference with Copy buttons, and a form for the reference and/or screenshot. The order then
shows **In review** in Plan & billing. The price never changes after checkout.

**Approve or reject.** Go to Admin → Payments → Orders → **Review** (the tab shows how many are waiting) and open the order. You see
what should arrive, the reference and the screenshot.
- **Approve, plan on** switches the plan on at the locked price. The customer gets a receipt email and a notice, and coupon uses are counted.
- **Reject** needs a reason. The customer sees it in the app and gets the "payment wasn't approved" email.

**Expiry.** Unpaid orders (no proof sent) turn **Expired** after the number of days in **Admin → Settings → Billing →
"Unpaid orders expire after"** (default 7). Nothing is deleted. If the money arrives later, the customer can still send proof,
and you can still approve the order.

**Screenshots** are stored privately on the data volume (`/app/data/proofs`), never on R2, and only admins can open them.
