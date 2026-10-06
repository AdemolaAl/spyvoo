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

Every email uses `emails/base.html` (Spyvoo blue, gradient top bar, logo) and ends with the **Voo family strip**: cards
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
<!-- subject: Welcome to Spyvoo, {{name}} 🕵️ -->
<!-- preheader: Your first winning ad is 30 seconds away. -->
```

`{{value}}` is escaped, `{{{value}}}` is raw HTML, `{{#if value}}…{{/if}}` shows a block only when the value is set.
Templates are cached in memory: restart (redeploy) after editing.

Without `MAIL_PROVIDER` + `MAIL_API_KEY`, emails are not sent: they are printed to the server log (with their links
in development) and shown as "logged" in Admin → Emails.
