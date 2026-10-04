# VooSquare: one account for every Voo tool

VooSquare is optional. Without it, Spyvoo uses its own email + password login. When `VOO_ISSUER` and `VOO_CLIENT_ID`
are set, the login and sign-up pages show **Continue with VooSquare** and email sign-up is turned off (admins keep their
password login so you can never lock yourself out).

## Variables

```
VOO_ISSUER=https://id.voosquare.com          # OpenID Connect issuer (has /.well-known/openid-configuration)
VOO_CLIENT_ID=spyvoo
VOO_CLIENT_SECRET=...
VOO_REDIRECT_URI=https://spyvoo.com/auth/voosquare/callback   # default: APP_URL + /auth/voosquare/callback
VOO_SERVICE_KEY=...                           # VooSquare uses it to read the summary endpoint
VOO_WEBHOOK_SECRET=...                        # signs events Spyvoo sends to VooSquare
VOO_EVENTS_URL=https://api.voosquare.com/v1/events
VOO_HOME_URL=https://voosquare.com
```

## 1. Login (OIDC, Authorization Code + PKCE)
- `GET /auth/voosquare` → redirects to VooSquare with `state`, `nonce` and a PKCE challenge.
- `GET /auth/voosquare/callback` → exchanges the code, verifies the ID token (RS256 via JWKS, issuer, audience, nonce,
  expiry), then finds the user by `voo_id` (the `sub` claim). Never by email alone.
- New users are created from the claims (`email`, `name`, `country`) and get the welcome email.
- `GET /auth/voosquare/logout` ends both sessions.

## 2. Summary card
`GET /api/voosquare/summary?voo_id=<sub>&period=1d|7d|30d` with `Authorization: Bearer <VOO_SERVICE_KEY>` returns:

```json
{ "tool": "spyvoo", "linked": true, "period": "7d", "open_url": "https://spyvoo.com/app", "status": "active",
  "metrics": [
    { "key": "searches", "label": "Searches", "value": 42, "unit": "count", "change_pct": 12.5 },
    { "key": "ads_saved", "label": "Ads saved", "value": 9, "unit": "count", "change_pct": 0 },
    { "key": "ai_breakdowns", "label": "AI breakdowns", "value": 6, "unit": "count", "change_pct": 50 },
    { "key": "advertisers_followed", "label": "Advertisers followed", "value": 3, "unit": "count", "change_pct": 0 } ] }
```

## 3. Events
Key moments (today: `plan_purchased`) are queued in `voo_outbox` and posted by the `voosquare` job to `VOO_EVENTS_URL`
with header `X-Voo-Signature: <hex HMAC-SHA256(VOO_WEBHOOK_SECRET, raw body)>`, retried with backoff for 24 hours.

```json
{ "event_id": "sv_…", "tool": "spyvoo", "voo_id": "…", "type": "plan_purchased", "occurred_at": "…", "label": "Upgraded to Pro", "value_usd": 79 }
```

VooSquare never takes or moves money: payments stay inside Spyvoo (Gatevoo).
