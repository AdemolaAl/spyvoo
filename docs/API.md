# API

JSON over HTTPS. Sessions use the `sv_s` cookie (set by login/sign-up). Every `POST/PUT/PATCH/DELETE` under `/api/`
must send the header **`x-sv: 1`** (CSRF guard). Errors: non-2xx with `{ "error": "Plain-English message" }`.
**402** means a plan limit was reached: `{ "error": "…", "upgrade": true, "kind": "searches" }`.

## Auth — `/api/auth`
| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/api/auth/me` | `{ user, voosquare }`; `user` is null when logged out |
| POST | `/api/auth/signup` | `{ name, email, password (8+), country (ISO-2), niche?, ref? }` → starts a session, sends `welcome` |
| POST | `/api/auth/login` | `{ email, password }` |
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
| GET | `/search` | `q, countries, niche, cta, media, platforms, status, min_days, sort (score/new/days), offset` (counts 1 search) |
| POST | `/ai-search` | `{ text }` → filters understood + results ("crypto ads in Brazil over 30 days") |
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
| POST | `/checkout` | `{ plan, interval, method_id?, coupon?, coin? }` → `{ ref, amount, provider, checkout_url, instructions }` |
| GET | `/orders/:ref` | Order status (checks Gatevoo when pending) |
| GET/PATCH | `/me` | Profile: `{ name, country, marketing_opt_out, password + new_password }` |
| POST | `/onboarding` | `{ tour_seen, niche, … }` |
| POST | `/delete-account` | `{ password }` |
| GET | `/tour` | Data for the beginner tour (free, no usage) |
| GET | `/checklist` | First-steps checklist |

## Website — `/api/public` (no login)
`GET /site` (stats, plans, offer, family, company), `GET /plans-full`, `GET /featured`, `GET /search?q=` (try-it search,
rate limited, first N results visible, rest locked), `GET /countries`, `GET /coupon?code=`.

## Admin — `/api/admin` (admins only)
`GET /overview` · rules: `GET/POST /rules`, `PATCH/DELETE /rules/:id`, `POST /rules/:id/run`, `POST /rules/import { csv }` ·
provider: `GET/PATCH /provider`, `POST /provider/ping`, `POST /provider/test { value, country }` ·
jobs: `GET /jobs?kind&status`, `POST /jobs/:id/retry`, `POST /media/retry`, `POST /scheduler/:name` ·
ads: `GET /ads?q&filter&source&offset`, `PATCH/DELETE /ads/:id`, `POST /ads/:id/reanalyse`, `POST /demo { action: seed|clear }` ·
users: `GET /users?q&offset`, `GET/PATCH /users/:id { plan_id, plan_renews_at, role, suspended, name }` ·
plans: `GET /plans`, `PUT/DELETE /plans/:id` ·
payments: `GET /payments`, `POST /payments/methods`, `PATCH/DELETE /payments/methods/:id`, `POST /payments/gatevoo/ping`,
`GET /orders?status`, `POST /orders/:ref/paid`, `POST /orders/:ref/check`, `POST /coupons`, `PATCH/DELETE /coupons/:code` ·
settings: `GET /settings`, `PATCH /settings/:group { value }` for platforms, score, announcement, offer, family, niches,
company, billing, flags · emails: `GET /emails`, `GET /emails/:name/preview`, `POST /emails/test { to, name }`,
`POST /emails/broadcast { subject, body, plan?, dry? }`, `POST /emails/offer { dry? }` · `GET /audit`.

## Webhooks and integrations
- `POST /webhooks/gatevoo` — signed (`X-Gatevoo-Signature`), see GATEVOO.md.
- `GET /api/voosquare/summary` — for VooSquare, see VOOSQUARE.md.
- `GET /healthz` — `{ ok: true }` for Railway.
