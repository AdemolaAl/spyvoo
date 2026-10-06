# API

JSON over HTTPS. Sessions use the `sv_s` cookie (set by login/sign-up). Every `POST/PUT/PATCH/DELETE` under `/api/`
must send the header **`x-sv: 1`** (CSRF guard). Errors: non-2xx with `{ "error": "Plain-English message" }`.
**402** means a plan limit was reached: `{ "error": "…", "upgrade": true, "kind": "searches" }`.

## Auth — `/api/auth`
| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/api/auth/me` | `{ user, voosquare }`; `user` is null when logged out |
| POST | `/api/auth/signup` | `{ name, email, password (8+), country (ISO-2), niche?, ref? }` → starts a session, sends `welcome`. With VooSquare on: 403 `{ login_url: '/auth/voosquare?signup=1' }` (new accounts are Voo IDs) |
| POST | `/api/auth/login` | `{ email, password }` (works with VooSquare on too) |
| POST | `/api/auth/logout` | |
| POST | `/api/auth/forgot` | `{ email }` → always 200, emails a reset link if the account exists |
| POST | `/api/auth/reset` | `{ token, password }` |
| POST | `/api/auth/verify` | `{ token }` |
| POST | `/api/auth/resend` | Resends the confirmation email |
| GET | `/api/team` | Team members (Agency) |
| POST | `/api/team/invite` | `{ email }` |
| POST | `/api/team/accept` | `{ token }` |
| POST | `/api/team/remove` | `{ id }` |

## Dashboard — `/api/app` (login required)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/bootstrap` | User, plan, usage meter, offer, family slides, unread count, announcement |
| GET | `/home` | Winners, trending niches, longest runners, recent ads, checklist |
| GET | `/search` | `q, countries, niche, cta, media, platforms, status, min_days, sort (score/new/days), offset` (counts 1 search). Browsing is paced per account: 120 calls a minute and 3,000 a day across `/search` and `/ads/:id` (429 after) |
| POST | `/ai-search` | `{ text }` → filters understood + results ("crypto ads in Brazil over 30 days"). 30 a minute per visitor, 200 a day per account (429 after). |
| GET | `/ads/:id` | Full ad: media, timeline, stats, advertiser, saved boards, analysis if unlocked |
| POST | `/ads/:id/analyse` | AI breakdown (counts once per ad per user) |
| POST | `/ads/:id/mine` | `{ product }` → "Make it mine" scripts (hooks, script, captions) |
| POST | `/ads/:id/download` | Signed download link for the media |
| GET | `/scripts` | Scripts the user generated |
| GET | `/advertisers/:id` | Advertiser page with their ads |
| POST | `/advertisers/:id/follow` | `{ on: true/false }` |
| GET | `/following` | |
| GET/POST | `/boards` | List / create `{ name, emoji }` |
| GET/PATCH/DELETE | `/boards/:id` | PATCH `{ name?, emoji?, share: true/false }` (share creates the public `/b/<token>` link) |
| POST | `/boards/:id/items` | `{ ad_id, note? }` |
| PATCH/DELETE | `/boards/:id/items/:ad` | Note / remove |
| POST | `/quick-save` | `{ ad_id, on? }` → saves to the first board ("Swipe file") |
| GET/POST | `/searches` | Saved searches; POST `{ name, query, alert }` |
| PATCH/DELETE | `/searches/:id` | PATCH `{ alert }` |
| GET | `/notifications` | POST `/notifications/read` marks all read |
| GET | `/plan` | Plans, methods for the user's country, orders, current offer |
| POST | `/quote` | `{ plan, interval: month/year, coupon? }` |
| POST | `/checkout` | `{ plan, interval, method_id?, coupon?, coin? }` → `{ ref, amount, provider, checkout_url, instructions, pay? }` (`pay` for custom methods: exact amount and currency, account details, instructions, proof mode). Gatevoo failures answer 502/503 `{ error, code: gatevoo_<reason>, other_methods }` |
| POST | `/orders/:ref/proof` | Custom methods: `{ reference?, image? (PNG/JPG/WebP data URL, 4 MB) }` → order goes to `review` |
| GET | `/orders/:ref` | Order status (checks Gatevoo when pending) |
| GET/PATCH | `/me` | Profile: `{ name, country, marketing_opt_out, password + new_password }` |
| POST | `/onboarding` | `{ tour_seen, niche, … }` |
| POST | `/delete-account` | `{ password }` |
| GET | `/tour` | Data for the beginner tour (free, no usage) |
| GET | `/checklist` | First-steps checklist |

## Website — `/api/public` (no login)
`GET /site` (stats, plans, offer, family, company), `GET /plans-full`, `GET /featured`, `GET /search?q=` (try-it search,
rate limited, first N results visible, rest locked), `GET /countries`, `GET /coupon?code=` (30 checks per 10 minutes per visitor).

## Admin — `/api/admin` (admins only)
`GET /overview` · rules: `GET/POST /rules`, `PATCH/DELETE /rules/:id`, `POST /rules/:id/run`, `POST /rules/import { csv }` ·
provider: `GET/PATCH /provider`, `POST /provider/ping`, `POST /provider/test { value, country }` ·
AI: `PATCH /ai { provider, openrouter_model, fallback_models, key?, clear_key? }` (key never returned; `GET /provider` shows provider, model, key source and last 4), `POST /ai/ping` ·
jobs: `GET /jobs?kind&status`, `POST /jobs/:id/retry`, `POST /media/retry`, `POST /scheduler/:name` ·
ads: `GET /ads?q&filter&source&offset`, `PATCH/DELETE /ads/:id`, `POST /ads/:id/reanalyse`, `POST /demo { action: seed|clear }` ·
users: `GET /users?q&offset`, `GET/PATCH /users/:id { plan_id, plan_renews_at, role, suspended, name }` ·
plans: `GET /plans`, `PUT/DELETE /plans/:id` ·
payments: `GET /payments` (methods with `warnings`, Gatevoo status with `last_error`, `review` count), `POST /payments/methods`, `PATCH/DELETE /payments/methods/:id` (custom: `icon, details ("Label: value" lines), currency, rate, proof_mode, instructions`), `POST /payments/methods/:id/move { dir: -1|1 }`, `POST /payments/gatevoo/ping`,
`GET /orders?status` (`review`, `rejected`, `expired`…), `POST /orders/:ref/approve { note? }`, `POST /orders/:ref/reject { reason }`, `GET /orders/:ref/proof` (screenshot), `POST /orders/:ref/paid`, `POST /orders/:ref/check`, `POST /orders/:ref/refund { amount?, end_plan? }`, `POST /orders/:ref/chargeback { amount? }` (both send the VooSquare event), `POST /coupons`, `PATCH/DELETE /coupons/:code` ·
settings: `GET /settings`, `PATCH /settings/:group { value }` for platforms, score, announcement, offer, family, niches,
company, billing, flags · emails: `GET /emails`, `GET /emails/:name/preview`, `POST /emails/test { to, name }`,
`POST /emails/broadcast { subject, body, plan?, dry? }`, `POST /emails/offer { dry? }` · `GET /audit` ·
VooSquare: `GET /voosquare` (what is on, queued and refused events), `POST /voosquare/flush`.

## Webhooks and integrations
- `POST /webhooks/gatevoo` — signed (`X-Gatevoo-Signature`: `t=…,v1=…` or plain hex HMAC of the body), see GATEVOO.md.
- `GET /api/voosquare/summary` — for VooSquare (Bearer `VOO_API_KEY`), see VOOSQUARE.md.
- `GET /auth/voosquare?return_to=&signup=1`, `GET /auth/voosquare/callback`, `GET /logout` — Voo ID login and logout
  everywhere; `GET /voo-connect-browser.js` — the landing-page snippet. See VOOSQUARE.md.
- `GET /healthz` — `{ ok: true }` for Railway.
