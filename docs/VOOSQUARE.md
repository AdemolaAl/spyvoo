# VooSquare: one account for every Voo tool

Spyvoo connects to VooSquare with the **Voo Connect kit** (folder `voo-connect/`, copied unchanged from the
voosquare-app repo `sdk/voo-connect/`; never edit it, copy the folder again when VooSquare publishes a new version).
The contract is VooSquare's `docs/VOO_CONNECT.md` (Spyvoo sheet) and `docs/INTEGRATION.md`.

What it gives Spyvoo:

| Part | What happens |
| --- | --- |
| **Continue with Voo ID** | Log in and sign up with the shared Voo ID. "Start free" opens VooSquare's sign-up view (`prompt=signup`). |
| **Existing accounts kept** | Email + password login keeps working. A Voo ID is linked to an existing account by a VooSquare-**verified** email, or with **Connect VooSquare** in Account. |
| **Affiliate hand-off** | `?ref=&vclick=&coupon=` from any landing URL are kept (cookie `voo_attr`, 60 days) and sent to VooSquare at login, so the affiliate gets the customer. |
| **Money events** | Every plan payment → `spend` + `plan_started` / `plan_renewed`; refunds → `refund`; disputes → `chargeback` (both point at the payment with `original_event_id`); a plan that ends → `plan_cancelled`. |
| **Activity** | `board_created`, `ad_saved`, and `search_run` (one per member per hour, with the count). |
| **Summary card** | VooSquare shows searches, ads saved and boards on the member's dashboard. |
| **Support** | VooSquare's support widget on every page except the admin (with the member's email and name). |
| **Log out everywhere** | Spyvoo's session ends, then VooSquare's, then the browser comes back to Spyvoo's home page. |

VooSquare never takes or moves money: payments stay in Spyvoo (Gatevoo). Spyvoo has no referral balances or payouts.

## 1. In VooSquare (owner, once per environment)

**Admin → Products → Spyvoo**: URL `https://spyvoo.com` · Launch path `/app` (the page VooSquare's launcher opens after login; empty means `/dashboard`, which Spyvoo also maps to `/app`) · SSO **on** · Redirect URIs, two lines, exact:
`https://spyvoo.com/auth/voosquare/callback` and `https://spyvoo.com/` · Summary URL
`https://spyvoo.com/api/voosquare/summary` · Support webhook empty (Spyvoo has no inbox of its own).
Press **Save**, open **Credentials** and copy the Client ID (`vsc_…`), Client secret (`vss_…`) and API key (`vsk_…`).
Staging and live VooSquare have separate credentials.

## 2. Variables (Railway → Variables)

```
VOO_BASE=https://voosquare.com            # exact VooSquare address (no trailing slash, same as its BASE_URL)
VOO_CLIENT_ID=vsc_...
VOO_CLIENT_SECRET=vss_...
VOO_API_KEY=vsk_...                       # events, summary card (VooSquare calls us with it)
VOO_SIGNAL_SECRET=...                     # openssl rand -hex 32, set once, never change (hashes fraud hints)
# Optional:
# VOO_REDIRECT_URI=https://spyvoo.com/auth/voosquare/callback   (default: APP_URL + /auth/voosquare/callback)
# VOO_SERVER_BASE=                        private address for server-to-server calls, if you have one
# VOO_CONNECT=off                         feature flag: switches login, events, widget off without removing the keys
# VOO_WIDGET=off                          hide only the support widget
# VOO_FLUSH_MS=5000                       how often queued events are sent
```

| Set | Turns on |
| --- | --- |
| `VOO_BASE` + `VOO_CLIENT_ID` + `VOO_CLIENT_SECRET` | Continue with Voo ID, Connect VooSquare, logout everywhere, the affiliate hand-off |
| + `VOO_API_KEY` | Events and the summary card |
| `VOO_BASE` | The support widget and the "Part of VooSquare" links |
| `VOO_CONNECT=off` | Nothing of the above (email login only, as before) |

The old variables `VOO_ISSUER`, `VOO_SERVICE_KEY`, `VOO_WEBHOOK_SECRET`, `VOO_EVENTS_URL` and `VOO_HOME_URL` are no
longer read (`npm run check` warns if they are still set).

Self-test (changes nothing in VooSquare): `npm run check -- --ping` runs the kit's `voo-connect/check.js`, or by hand:

```bash
node voo-connect/check.js --base "$VOO_BASE" --client-id "$VOO_CLIENT_ID" --client-secret "$VOO_CLIENT_SECRET" \
  --api-key "$VOO_API_KEY" --redirect-uri https://spyvoo.com/auth/voosquare/callback --logout-uri https://spyvoo.com/ \
  --summary-url https://spyvoo.com/api/voosquare/summary
```

## 3. Login, sign-up and linking

| Address | What it does |
| --- | --- |
| `GET /auth/voosquare?return_to=/app` | Starts login (VooSquare's launcher uses `return_to=/dashboard`, which opens `/app`). `&signup=1` opens the sign-up view. `return_to` only goes to `/app…`, `/admin…` or `/invite?…`. |
| `GET /auth/voosquare/callback` | The kit checks the state cookie (10 min), exchanges the code, verifies the `id_token` (HS256 with the client secret, audience, issuer, expiry). Errors show "Login did not finish" with Try again. |
| `GET /logout` (also `/auth/voosquare/logout`) | Ends Spyvoo's session. Voo ID members then go to VooSquare's `/oauth/logout?redirect_uri=<APP_URL>/` and come back to Spyvoo's home page. |
| `/signup` | With VooSquare on, goes straight to the Voo ID sign-up view (new accounts are made with a Voo ID). |
| `/login` | Shows **Continue with Voo ID** and the email + password form. |

How the callback finds the Spyvoo user (users table, unique nullable `voo_id`):

1. A user with this `voo_id` → that user (profile gaps filled; the email follows a change made in VooSquare, except for admins).
2. Someone is logged in here (the **Connect VooSquare** button in Account) → the Voo ID is saved on **that** account.
3. A user with the same email and VooSquare says `email_verified` → linked. If that Spyvoo account had never confirmed
   its own email, its password, sessions and reset links are dropped first (someone else may have registered the
   address). **Admins are never linked automatically**: they log in with their password and press Connect.
4. Otherwise a new user: email, name, country (decides payment methods) and `referred_by = voo_ref` (saved once).

## 4. Events (stable ids, prefix `sv`)

| When | Events (`event_id`) |
| --- | --- |
| A plan payment is confirmed (Gatevoo, manual "Mark paid", test checkout) | `spend` (`sv_pay_<order ref>`, value = amount paid, `plan`, `country`, `signals`) + `plan_started` (`sv_plan_<order ref>`) or, when the previous payment was for the same plan, `plan_renewed` (`sv_renew_<order ref>`). The Voo ID and the spend id are kept on the order (`meta.voo_id`, `meta.voo_spend`). |
| Admin → Payments → Orders → **Refund** | `refund` (`sv_rf_<order ref>`, `original_event_id` = that order's spend). Never reverses affiliate commission. The plan ends unless another paid order covers it. |
| Admin → Payments → Orders → **Chargeback** | `chargeback` (`sv_cb_<order ref>`, `original_event_id` = that order's spend). Reverses the commission; the plan ends. |
| A paid plan expires, or ends at a refund / chargeback | `plan_cancelled` (`sv_cancel_<voo id>_<date, or reason-order ref>`) |
| A board is made | `board_created` (`sv_board_<board id>_<creation time>`) |
| An ad is saved (first time in that board) | `ad_saved` (`sv_save_<board id>_<ad id>_<saved time>`, label "Ad saved: <advertiser>") |
| Searches | `search_run`, one per member per UTC hour once the hour is over (`sv_search_<voo id>_<YYYY-MM-DDTHH>`, label "3 searches") |

Why these ids: the order reference (`SV-…`) is unique for ever, while SQLite row ids can come back after a delete or a
restore, and VooSquare drops a repeated `event_id` as a duplicate (a real payment would never count). Activity ids add the
row's own creation time for the same reason. All ids are at most 80 characters (the kit shortens longer ones with a
hash), letters, digits and `_ . : -`.

Refunds and chargebacks are sent to the Voo ID that got the spend (kept on the order), so a chargeback still claws the
commission back after the customer deleted their Spyvoo account. A payment made before the account was connected to
VooSquare sent no spend, so its refund or chargeback sends nothing either (VooSquare would refuse it).

Only members with a Voo ID send events. Free sign-ups send nothing (VooSquare counts them itself). Spyvoo has no
wallet or credits, so there is no `wallet_topup`; the only money is plan payments. Labels never carry an email
(stripped) or a person's name; `signals` holds Spyvoo's own hashes (`payment_fingerprint` of the paying wallet when
Gatevoo reports it) and `payment_country`.

Events are queued by the kit in the database (`voo_queue`, survives restarts) and sent every `VOO_FLUSH_MS` in calls of
at most 100, with retries and backoff; a refusal for good is kept in `voo_failed` and shown by
`GET /api/admin/voosquare`. `POST /api/admin/voosquare/flush` sends at once. On shutdown Spyvoo waits up to 5 s to send
what is queued.

## 5. Summary card

`GET /api/voosquare/summary?voo_id=<sub>&period=1d|7d|30d` with `Authorization: Bearer <VOO_API_KEY>` (checked in
constant time by the kit; 401 otherwise). Unknown Voo ID: `{"linked": false}`.

```json
{ "linked": true, "status": "trial", "open_url": "https://spyvoo.com/app",
  "metrics": [ { "key": "searches", "label": "Searches", "value": 12, "unit": "count", "change_pct": 50 },
               { "key": "ads_saved", "label": "Ads saved", "value": 4, "unit": "count", "change_pct": 0 },
               { "key": "boards", "label": "Boards", "value": 2, "unit": "count", "change_pct": 100 } ] }
```

`status` is `trial` on Free and `active` on a paid plan.

## 6. Pages, cookies and security

- Landing pages (`/`, `/pricing`, `/login`) load `/voo-connect-browser.js` (keeps the click even from a cached page and
  adds it to "Start free" links). Every page but the admin loads `VOO_BASE/widget.js` with `data-product="spyvoo"`.
- Every HTML page sends a Content-Security-Policy; `VOO_BASE` is allowed for the widget's script, its API calls and
  images, and as a form target. Nothing else of VooSquare's is loaded.
- Cookies are Spyvoo's own, on Spyvoo's host only: `sv_s` (session), `voo_state` (login state, HttpOnly, 10 min),
  `voo_attr` (the affiliate click, 60 days, readable by the snippet). Spyvoo never sets or reads VooSquare's cookies.
- On phones the widget's button is lifted above the dashboard's bottom tab bar.

## 7. Test it

- `npm test` includes `test/voosquare.test.js` (against a small fake VooSquare: linking rules, event shapes, summary
  auth, widget, CSP) and `test/voosquare-hub.test.js`, which boots a **real** VooSquare from the voosquare-app checkout
  (`VOOSQUARE_DIR`; by default a fresh copy of the current hub at `/tmp/claude-0/sv/hub-src`, then `../voosquare-app`;
  never the repo itself, it is only read) with `NODE_ENV=test` and `TRUST_PROXY=1` on a free port in 4853–4859 and runs check.js plus the whole journey:
  affiliate link → landing → Start free → Voo ID sign-up → plan payment → commission → renewal → refund (commission
  stays) → chargeback (commission reversed) → activity → summary card → logout everywhere, and the linking cases.
  Without a checkout it is skipped.
- By hand: VooSquare's `docs/VOO_CONNECT.md` section 4.

| Symptom | Fix |
| --- | --- |
| "Redirect not allowed" on VooSquare | The callback is not on Spyvoo's Redirect URIs exactly (`http`/`https`, `www`, port, slash). |
| "Login did not finish: … settings are wrong" | `invalid_client`: wrong client secret, or staging credentials on live. |
| "VooSquare login could not be verified" | `VOO_BASE` differs from VooSquare's `BASE_URL` (issuer check), or the clock is off. |
| Log out lands on VooSquare's home page | Add `https://spyvoo.com/` to the Redirect URIs. |
| Payments not in VooSquare | `VOO_API_KEY` set? Was the buyer a Voo ID member? `GET /api/admin/voosquare` shows `pending` and `failed`. |
| "There's already a Spyvoo account with this email" | VooSquare has not verified that email. Confirm it there, or log in with the password and press Connect VooSquare. |
