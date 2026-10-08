# Gatevoo crypto checkout

Spyvoo takes **USDT (TRON / TRC20)** and **Bitcoin** through **Gatevoo**, Zedapex's own non-custodial crypto
checkout. The money goes straight to the Zedapex wallet, and orders activate on their own once the coins land.

| Mode | When | What customers see |
| --- | --- | --- |
| **Live** | `GATEVOO_API_KEY` and `GATEVOO_WEBHOOK_SECRET` are set | Gatevoo's real hosted payment page |
| **Sandbox** | No keys, `PAYMENTS_DEMO=true` | A practice Gatevoo page at `/pay/gatevoo/<ref>`, with no real coins |
| **Off** | No keys, `PAYMENTS_DEMO=false` | No crypto option (a custom method such as bank transfer shows if you switch one on) |

## What was broken (October 2026) and what changed

Spyvoo had been built to a different Gatevoo contract than the Gatevoo that is running, so the two apps talked past
each other:

| Symptom | Cause | Fixed in |
| --- | --- | --- |
| "Test payment connection" said the address was wrong (404) | Spyvoo called `GET /me`, which Gatevoo did not have | Gatevoo now has `GET /api/v1/me`; Spyvoo also falls back if it's missing |
| **Paid orders never switched the plan on** ("underpaid") | Spyvoo needed `paid_usd`; Gatevoo never sent it, so every paid order looked short | Gatevoo now sends `paid_usd` (measured from what arrived); Spyvoo also reads the old answer correctly |
| Customer not sent back to Spyvoo after paying | Spyvoo sent `success_url`; Gatevoo reads `redirect_url` | Spyvoo sends both; Gatevoo accepts both |
| Coin and transaction not shown on the order | Different field names (`method`/`txid` vs `coin`/`tx_hash`) | Both sides read and send both |

Either app alone already fixes the main problem, so the deploy order doesn't matter. **Orders paid while it was broken
heal by themselves**: about 15 seconds after Spyvoo starts, it asks Gatevoo again about every unpaid crypto order from
the last 45 days and switches on the ones that were paid. You can run the same thing any time with **Admin → Payments →
Re-check unpaid crypto orders**.

## 1. Go live (10 minutes)

1. **Gatevoo dashboard → Connect → Add app** "Spyvoo", webhook URL `https://spyvoo.com/webhooks/gatevoo`.
   Copy the **API key** (`gv_live_…`) and the **webhook secret** (`whsec_…`). They are shown once; if lost, press
   *New key* / *New secret* there.
2. **Railway → Spyvoo → Variables**:
   ```
   GATEVOO_API_KEY=gv_live_...
   GATEVOO_WEBHOOK_SECRET=whsec_...
   # Optional. Default https://gatevoo.com/api/v1. Delete it if it says api.gatevoo.com (that host doesn't exist).
   GATEVOO_API_URL=https://gatevoo.com/api/v1
   ```
3. **Admin → Payments → Test payment connection**. It should say "Connected … as Zedapex. API key accepted." It also
   warns if Gatevoo has no webhook URL for the app, or if Spyvoo offers a coin Gatevoo has no wallet for.
4. **Admin → Payments → Payment methods → Crypto**: switch on only the coins Gatevoo has wallets for. (Gatevoo shows the
   customer every coin it has a wallet for; Spyvoo's coin list decides what Spyvoo's checkout offers.)
5. **Gatevoo → Connect → Spyvoo → Send test webhook**. "Delivered" means the secret matches. A 401 means
   `GATEVOO_WEBHOOK_SECRET` is not the same as Gatevoo's secret for this app.
6. Pay a real $1–2 order in USDT and in Bitcoin. The plan switches on, Gatevoo shows the webhook as delivered, and you
   land back on Plan & billing.

## 2. How a payment flows

1. The customer picks **Crypto** at checkout, chooses USDT or Bitcoin, and presses **Pay**.
2. Spyvoo creates an order (`provider = gatevoo`, status `pending`) and calls `POST /api/v1/invoices` on Gatevoo.
3. The customer is sent to the invoice's `checkout_url` (`https://gatevoo.com/pay/inv_…`) and pays the exact amount.
4. Gatevoo's watcher sees the coins and marks the invoice paid, then calls `POST /webhooks/gatevoo` (signed).
   Spyvoo **does not trust the body**: it fetches the invoice again (`GET /api/v1/invoices/:id`) and only then
   activates the order.
5. Gatevoo sends the customer to `redirect_url` (`/pay/callback?ref=…`). The dashboard shows "Payment received!".

Checks Spyvoo makes before switching a plan on:

- the invoice id must match the one stored on the order, and the invoice's `order_id` must be this order;
- status `paid` **and** `paid_usd` ≥ the order total (1 cent tolerance). Gatevoo counts a transfer it matched as full
  (exact amount, up to 10 % over, or Bitcoin within 1 %) as the whole invoice; anything less is reported as what
  arrived, and Spyvoo flags the order **underpaid** for a person instead;
- `expired` / `cancelled` invoices mark a pending order failed, but a late payment (Gatevoo matches for 24 hours after
  expiry) still activates it;
- refunded, charged-back and rejected orders are never switched back on;
- webhooks are idempotent: a replay never extends the plan twice.

Admins can press **Check** on any Gatevoo order in Admin → Payments → Orders. The support agent does the same when a
customer says "I paid" (see [SUPPORT.md](SUPPORT.md)).

## 3. The contract (what Gatevoo really does)

Base URL `GATEVOO_API_URL` (default `https://gatevoo.com/api/v1`). Every call sends `Authorization: Bearer <key>`.
Errors are non-2xx with `{ "error": "message" }`.

**`GET /me`** → `{ name, merchant: { name }, app: { id, name, webhook_url_set }, methods: ["USDT_TRC20", "BTC"] }`. 401 = bad key.

**`POST /invoices`** (Spyvoo sends these fields; Gatevoo ignores unknown ones)
```json
{ "order_id": "SV-…", "reference": "SV-…", "amount_usd": 79, "amount": { "value": "79.00", "currency": "USD" },
  "description": "Spyvoo · Pro plan (monthly)", "customer_email": "…", "customer_name": "…",
  "redirect_url": "https://spyvoo.com/pay/callback?ref=SV-…", "expires_in_min": 60,
  "metadata": { "app": "spyvoo", "user_id": 12, "plan": "pro", "interval": "month" } }
```
The same `order_id` asked again while its checkout is open returns the same invoice. `redirect_url` must be https.

**Invoice** (from `POST`, `GET /invoices/:id` and the webhook's `data`)
```json
{ "id": "inv_…", "status": "open | confirming | paid | expired | cancelled", "amount_usd": 79,
  "order_id": "SV-…", "reference": "SV-…", "method": "USDT_TRC20", "coin": "USDT_TRC20",
  "pay_amount": "79.13", "address": "T…", "received": "79.13", "txid": "…", "tx_hash": "…",
  "paid_usd": 79, "payment": { "coin": "USDT_TRC20", "amount": "79.13", "tx_hash": "…", "confirmations": 1, "amount_usd": 79 },
  "late": false, "overpaid": false, "duplicate_of": null, "checkout_url": "https://gatevoo.com/pay/inv_…",
  "created_at": "…", "expires_at": "…", "paid_at": "…" }
```

**Webhook** `POST https://spyvoo.com/webhooks/gatevoo` (also answered at `/webhooks/gatevoo/gatevoo`), body
`{ "id": "evt_…", "type": "invoice.paid", "created": "…", "data": <invoice> }`, headers `X-Gatevoo-Timestamp`
and `X-Gatevoo-Signature` = hex HMAC-SHA256(webhook secret, `<timestamp>.<raw body>`). Spyvoo rejects signatures older
than 5 minutes. Gatevoo retries at 30 s, 2 m, 10 m, 30 m, 2 h, 6 h and 24 h until it gets a 2xx. The webhook URL is set
on the app in Gatevoo's dashboard (the `webhook_url` Spyvoo sends per invoice is ignored).
