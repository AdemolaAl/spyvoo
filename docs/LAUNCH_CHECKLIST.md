# Launch checklist

Run `npm run check -- --ping` in the Railway shell. When it says **Ready to launch**, go through this list.

## Must do
- [ ] `NODE_ENV=production`, `APP_URL=https://spyvoo.com`, a random 64-character `APP_SECRET`
- [ ] Railway volume mounted at `/app/data`
- [ ] `PAYMENTS_DEMO=false`
- [ ] Logged in as admin, changed the first password
- [ ] Apify connected, **Test scrape** returns ads, daily budget set (start with $5)
- [ ] Tracking rules cover your niches and countries; first runs finished in the **Job monitor**
- [ ] Sample ads removed (**Ads manager → Remove sample ads**) once real ads are in
- [ ] Email domain verified; test email received (not in spam); `support@spyvoo.com` mailbox works
- [ ] Gatevoo **Test payment connection** says Connected; webhook URL pasted into Gatevoo; one real $1 test order (make a coupon)
- [ ] Legal pages read through: `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/acceptable-use`
- [ ] Domain + `www` on HTTPS
- [ ] VooSquare: Spyvoo product has SSO on and both Redirect URIs (`/auth/voosquare/callback` and `/`); `VOO_*` set;
      `npm run check -- --ping` shows "VooSquare self-test passed"; one test affiliate link → Start free → test payment
      shows the commission in VooSquare (docs/VOOSQUARE.md §7)

## Should do
- [ ] Claude connected (`ANTHROPIC_API_KEY`): open an ad and check the breakdown reads well
- [ ] Offer set (code, end date) and the matching coupon exists
- [ ] Voo family slides point to the right links with your perks
- [ ] Featured a few great ads for the website's live wall (**Ads manager → Featured**)
- [ ] Watched the beginner tour on a phone and a laptop
- [ ] Shared the website link on WhatsApp/Telegram to check the preview image
- [ ] Railway volume snapshots switched on; ran `npm run backup` once

## After launch
- Watch **Overview → System health** and the scrape spend for the first week
- Add rules for the niches your users search most (Overview charts + Ads manager)
- Turn on **Write AI breakdowns for every new ad** when the AI cost is comfortable
- Ad videos and images are stored in Cloudflare R2 (`MEDIA_DRIVER=r2`), set up before launch (see RAILWAY.md)
