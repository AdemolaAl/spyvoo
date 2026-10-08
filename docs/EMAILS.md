# Emails

## Addresses on spyvoo.com

| Address | Used for | Set up as |
| --- | --- | --- |
| `hello@spyvoo.com` | Sender of every automatic email (`MAIL_FROM`) | Verified sending domain in Resend / Brevo / Postmark |
| `support@spyvoo.com` | Reply-to on every email (`MAIL_REPLY_TO`), shown in the app and legal pages | A real mailbox someone reads |
| `billing@spyvoo.com` | Payment questions, bank transfer confirmations | Mailbox or forward to support |
| `legal@spyvoo.com` | Terms, takedown and legal notices | Forward |
| `privacy@spyvoo.com` | Data requests (access, deletion) | Forward |

All five can be changed in **Admin → Settings → Company**. They fill the legal pages and footers automatically.

Cheapest working setup: send with **Resend** (free up to 3,000 emails a month, then from $20), receive with
**Cloudflare Email Routing** or **ImprovMX** forwarding all five to your inbox, or a Zoho Mail / Google Workspace mailbox
for support.

DNS for sending (the provider shows the exact values): SPF `TXT`, DKIM `TXT`/`CNAME`, and a DMARC record such as
`_dmarc.spyvoo.com TXT "v=DMARC1; p=none; rua=mailto:privacy@spyvoo.com"`.

## The emails

Every email uses `emails/base.html` (Spyvoo blue, blue top bar, logo) and ends with the **Voo family strip**: cards
for Joinvoo, Replyvoo, Castvoo and Vooads taken from Admin → Offer & Voo family, so editing a slide updates the emails too.

| Template | Sent when | Who |
| --- | --- | --- |
| `welcome` | Sign-up (also first VooSquare login) | New user |
| `verify-email` | User asks to resend the confirmation | User |
| `password-reset` | "Forgot password" | User |
| `team-invite` | Agency owner invites a teammate | Invitee |
| `payment-receipt` | An order is paid (crypto, manual or test) | Buyer |
| `payment-rejected` | An admin rejects a custom-method payment (bank transfer, mobile money…) | Buyer, with the reason |
| `renewal-reminder` | N days before the plan ends (Admin → Settings → Billing) | Paying user |
| `plan-expired` | Plan ended and the grace period passed; account moves to Free | User |
| `advertiser-alert` | A followed advertiser launches new ads | Follower |
| `search-alert` | A saved search has new results | User |
| `weekly-report` | Mondays 08:00 UTC: top new winners in the user's niches | Users who haven't opted out |
| `offer` | Admin presses "Email it to free users" on the offer | Free users who haven't opted out |
| `announcement` | Admin sends news from Admin → Emails | Everyone (or one plan) who hasn't opted out |
| `admin-budget` | Daily scrape budget reached | Admins |

Preview any of them with sample data in **Admin → Emails**, and send yourself a copy with one click.

## Editing

Each template is plain HTML with a subject and preheader in the first two comment lines:

```html
<!-- subject: Welcome to Spyvoo: your spy kit is ready -->
<!-- preheader: Three quick steps to find ads that are already making money. -->
```

`{{value}}` is escaped, `{{{value}}}` is raw HTML, `{{#if value}}…{{/if}}` shows a block only when the value is set
(`{{#unless value}}` is the opposite). Blocks can't be nested inside the same kind of block.
Templates are cached in memory: restart (redeploy) after editing.

Only use variables the sender passes (the table in `test/emails.test.js` lists them per template; `npm test` fails
if a template uses one that no caller sends). Every email also gets `app_url`, `logo_url`, `support_email`,
`company_name`, `company_city` and `year`.

### Writing rules

- **Subject** under 50 characters, specific (plan name, advertiser, niche), no ALL CAPS, no "!!!", no "FREE".
- **Preheader** adds to the subject instead of repeating it.
- **One button** per email (`sv-btn`), with a short verb label. Links that matter (verify, reset, invite) are also
  printed as plain text under the button for clients that block buttons.
- Billing and help emails end with the support line: reply to the email, or chat with Leo in the dashboard.
- Plain English, short sentences. Spy flavour is fine ("agent", "spy report"), never childish.

### HTML rules (Gmail, Outlook, Apple Mail, dark mode, mobile)

- Tables for layout, inline styles, one 600px column that goes full width under 620px. Body text is 16px, buttons
  are at least 48px tall and go full width on phones.
- Buttons are "bulletproof": coloured `<td>` (with `mso-padding-alt` for Outlook) around a padded `<a>`.
- Fonts: Bricolage Grotesque / Manrope when the device has them, then system fonts (Segoe UI in Outlook). No web
  fonts are loaded.
- Dark mode: the `sv-ink`, `sv-text`, `sv-muted`, `sv-card`, `sv-panel`, `sv-line`, `sv-accent` classes switch colours
  in Apple Mail / iOS / Outlook.com. Gmail and the Outlook apps recolour by themselves. The logo is a solid blue tile,
  so it stays visible on dark backgrounds.
- Every `<img>` has `alt`. Ad screenshots have a text title next to them, so the email still reads well with images off.
- The plain-text part is generated from the HTML (`mailer.build().text`): entities decoded, table cells kept apart.

## Deliverability

- **Sender**: `MAIL_FROM` = `Spyvoo <hello@spyvoo.com>`, reply-to `support@spyvoo.com`. Set SPF, DKIM and DMARC (above).
- **Bulk mail** (`{ bulk: true }`: advertiser and search alerts, weekly report, offer, announcements) is queued behind
  transactional mail.
- **One-click unsubscribe** (RFC 8058, required by Gmail and Yahoo for bulk senders): marketing mail (weekly report,
  offer, announcements) carries `List-Unsubscribe: <https://spyvoo.com/unsubscribe/<signed token>>, <mailto:support>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Gmail's button POSTs the link and marketing mail stops for that
  address (`users.marketing_opt_out`). Opening the link in a browser shows a confirm button first (mail scanners open
  links). The token is an HMAC of the address with `APP_SECRET`, so it can't be guessed or reused for another address.
  Alerts don't carry the header: people switch them off on the follow or saved search, and they only go to confirmed
  emails.

- **Postmark**: bulk mail goes to the stream named in `POSTMARK_BROADCAST_STREAM` (default `outbound`). Postmark
  wants marketing mail on a broadcast stream, so create one and set the variable.
- Every footer links to email settings, the privacy page and names Zedapex Limited, Lagos.
- No URL shorteners; all links point to the app domain or the Voo tool sites.
- Emails stay well under Gmail's 102 KB clipping limit (about 14–18 KB each).

Without `MAIL_PROVIDER` + `MAIL_API_KEY`, emails are not sent: they are printed to the server log (with their links
in development) and shown as "logged" in Admin → Emails.
