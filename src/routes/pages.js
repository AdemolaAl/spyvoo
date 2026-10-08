'use strict';
// HTML pages: website, auth pages, dashboard and admin shells, shared boards, legal pages, media files and test checkouts.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const md = require('../lib/md');
const settings = require('../services/settings');
const media = require('../services/media');
const voo = require('../services/voosquare');
const library = require('../services/library');
const { page, notice } = require('../views/layout');
const { csp } = require('../lib/csp');
const { esc } = md;

const VIEWS = path.join(config.root, 'views');
const cache = new Map();
const PUBLIC_VIEWS = ['site/index.html', 'site/pricing.html', 'site/auth.html'];
function view(name) {
  if (config.isProd && cache.has(name)) return cache.get(name);
  let html = fs.readFileSync(path.join(VIEWS, name), 'utf8').replace(/\{\{APP_URL\}\}/g, config.appUrl).replace(/\{\{VOO_APP_URL\}\}/g, esc(voo.publicInfo().app_url));
  // Landing pages: the Voo Connect browser snippet keeps the affiliate click even when the page comes from a cache.
  if (voo.enabled() && PUBLIC_VIEWS.includes(name)) html = html.replace('</body>', '<script src="/voo-connect-browser.js" defer></script>\n</body>');
  cache.set(name, html);
  return html;
}
// VooSquare support widget on every page but the admin (with the member's email and name when logged in).
function withWidget(body, user) {
  // Spyvoo's own 24/7 support agent takes the corner when it is on (Admin → Support); one chat bubble, never two.
  const support = require('../services/support');
  if (support.enabled()) {
    const isApp = body.includes('id="tabbar"');
    if (isApp || support.agentInfo().public_chat) return body.replace('</body>', '<script src="/js/support-chat.js" defer></script>\n</body>');
    return body;
  }
  const w = voo.widget();
  if (!w) return body;
  const who = user ? ' data-email="' + esc(user.email) + '" data-name="' + esc(user.name || '') + '"' : '';
  return body.replace('</body>', '<script src="' + esc(w.src) + '" data-product="' + w.product + '"' + who + ' defer></script>\n</body>');
}
// Form posts (test checkouts) must come from our own pages: another site cannot submit them for a logged-in user.
function sameOrigin(req) {
  const o = String(req.headers.origin || req.headers.referer || '');
  if (!o || o === 'null') return req.headers['sec-fetch-site'] ? req.headers['sec-fetch-site'] === 'same-origin' : true;
  try { const u = new URL(o); return u.origin === new URL(config.appUrl).origin || u.host === req.headers.host; } catch { return false; }
}
const html = (res, body, status = 200, extra = {}) => res.send(body, status, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', 'Content-Security-Policy': csp(body), ...extra });
const page2 = (req, res, name, status, extra) => html(res, withWidget(view(name), req.user), status, extra);
const safeNext = n => (/^\/(app|admin|invite)(\/|\?|$)/.test(String(n || '')) && !String(n).startsWith('//') ? String(n).slice(0, 300) : '');

module.exports = function (app) {
  app.get('/', (req, res) => page2(req, res, 'site/index.html'));
  app.get('/pricing', (req, res) => page2(req, res, 'site/pricing.html'));

  // Login pages. With VooSquare on, they hand over to VooSquare (admins can still use /login?password=1).
  const authPage = mode => (req, res) => {
    const next = safeNext(req.query.next) || (req.query.plan ? '/app/plan?checkout=' + encodeURIComponent(req.query.plan) + '&interval=' + (req.query.interval === 'year' ? 'year' : 'month') : '');
    if (req.user && (mode === 'login' || mode === 'signup')) return res.redirect(next || '/app');
    // With VooSquare on, new accounts are made with a Voo ID: "Start free" goes straight there (the affiliate click,
    // kept in voo_attr, rides along). Log in shows "Continue with Voo ID" and the email + password form.
    if (voo.enabled() && mode === 'signup') {
      const q = new URLSearchParams({ signup: '1' }); if (next) q.set('return_to', next);
      return res.redirect('/auth/voosquare?' + q);
    }
    html(res, withWidget(view('site/auth.html'), req.user).replace('data-mode="login"', 'data-mode="' + mode + '"'), 200, { 'X-Robots-Tag': mode === 'login' || mode === 'signup' ? 'index' : 'noindex' });
  };
  for (const m of ['login', 'signup', 'forgot', 'reset', 'verify', 'invite']) app.get('/' + m, authPage(m));

  // Dashboard and admin (single-page apps).
  const appShell = (req, res) => (req.user ? page2(req, res, 'app.html', 200, { 'X-Robots-Tag': 'noindex' }) : res.redirect('/login?next=' + encodeURIComponent(req.url)));
  app.get('/app', appShell);
  app.get('/app/*', appShell);
  const adminShell = (req, res) => {
    if (!req.user) return res.redirect('/login?password=1&next=' + encodeURIComponent(req.url));
    if (req.user.role !== 'admin') return html(res, notice('Admins only', 'This area is for admins', 'Log in with an admin account to open the Spyvoo admin panel.'), 403);
    html(res, view('admin.html'), 200, { 'X-Robots-Tag': 'noindex' });
  };
  app.get('/admin', adminShell);
  app.get('/admin/*', adminShell);

  // Shared board (read-only link).
  // One-click unsubscribe from marketing mail (weekly report, offers, news). The link in every bulk email is signed for
  // that address. Opening it shows a button (mail scanners open links); Gmail's one-click POST switches it off directly.
  const unsubscribe = (req, res, doIt) => {
    const email = require('../services/mailer').readUnsubscribe(req.params.token);
    if (!email) return html(res, notice('Link not valid', 'This unsubscribe link isn’t valid', 'Turn emails off from Account in your dashboard instead.'), 400);
    if (!doIt && db.one('SELECT marketing_opt_out FROM users WHERE email = ?', email)?.marketing_opt_out) return html(res, notice('Unsubscribed', 'You’re already unsubscribed', 'No weekly reports, offers or news go to this address. Turn them back on any time in Account.'));
    if (doIt) { db.run('UPDATE users SET marketing_opt_out = 1 WHERE email = ?', email); return html(res, notice('Unsubscribed', 'You’re unsubscribed', 'No more weekly reports, offers or news. Receipts, alerts you set up and security emails still arrive. Change it any time in Account.')); }
    html(res, page('Unsubscribe', '<div class="pg-card center"><h1>Stop marketing emails?</h1><p>No more weekly reports, offers or news to ' + esc(email) + '. Receipts and alerts you set up still arrive.</p><form method="post"><button class="btn" type="submit">Unsubscribe</button></form><a class="btn ghost" href="/app/account">Keep them</a></div>'));
  };
  app.get('/unsubscribe/:token', (req, res) => unsubscribe(req, res, false));
  app.post('/unsubscribe/:token', (req, res) => unsubscribe(req, res, true));

  app.get('/b/:token', (req, res) => {
    const b = library.sharedBoard(req.params.token);
    if (!b) return html(res, notice('Board not found', 'This board isn’t shared anymore', 'Ask the owner for a new link.'), 404);
    const cards = b.items.map(a => '<article class="sb-card"><div class="sb-img" style="background-image:url(\'' + esc(a.thumb) + '\')"><span class="sb-days">' + a.days + ' days</span></div><div class="sb-body"><b>' + esc(a.advertiser.name) + '</b><p>' + esc((a.text || a.headline).slice(0, 160)) + '</p>' + (a.note ? '<p class="sb-note">' + esc(a.note) + '</p>' : '') + '</div></article>').join('');
    html(res, page(b.name, '<div class="sb-head"><span class="tag">Shared board</span><h1>' + esc(b.emoji ? b.emoji + ' ' : '') + esc(b.name) + '</h1><p>' + b.items.length + ' winning ad' + (b.items.length === 1 ? '' : 's') + ' saved by ' + esc(b.owner) + ' on Spyvoo.</p><a class="btn" href="/signup">Spy on ads like these, free</a></div><div class="sb-grid">' + (cards || '<p>This board is empty.</p>') + '</div>', { wide: true }));
  });

  // Legal pages from content/legal/*.md, with company details filled in.
  app.get('/legal/:slug', (req, res) => {
    const slug = String(req.params.slug).replace(/[^a-z-]/g, '');
    const file = path.join(config.root, 'content', 'legal', slug + '.md');
    if (!slug || !fs.existsSync(file)) return html(res, notice('Not found', 'Page not found', 'This page doesn’t exist.'), 404);
    const c = settings.get('company');
    const src = fs.readFileSync(file, 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => c[k] || '');
    const { data, body } = md.frontMatter(src);
    html(res, page(data.title || slug, '<article class="legal"><span class="tag">Legal</span><h1>' + esc(data.title || slug) + '</h1><p class="muted">Last updated ' + esc(data.updated || '') + '</p>' + md.render(body).html + '</article>', { robots: 'index' }));
  });

  // Media saved on the local volume. Byte ranges are supported so videos seek and play on Safari.
  app.static('/media/', config.media.dir, { maxAge: 86400 * 30 }); // also after a switch to R2, for files saved before it
  app.get('/dl/*', (req, res) => {
    auth.needUser(req);
    let file;
    try { file = media.localPath(decodeURIComponent(req.path.slice(4))); } catch { return res.send('Not found', 404, 'text/plain'); }
    if (!fs.existsSync(file)) return res.send('Not found', 404, 'text/plain');
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(file).size, 'Content-Disposition': 'attachment; filename="spyvoo-' + path.basename(file) + '"' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });

  // Test checkout (PAYMENTS_DEMO only). Never available in production unless forced on.
  const demoOrder = req => (config.pay.demo && req.user ? db.one("SELECT * FROM orders WHERE ref = ? AND user_id = ? AND provider = 'demo'", String(req.params.ref), req.user.id) : null);
  app.get('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return html(res, notice('Not found', 'Checkout not found', 'This test checkout link is invalid.'), 404);
    if (o.status === 'paid') return res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
    html(res, page('Test checkout', '<div class="pg-card center"><span class="tag">Test checkout</span><h1>$' + o.amount_usd.toFixed(2) + '</h1><p>' + esc((require('../services/account').plan(o.plan_id) || {}).name || o.plan_id) + ' plan, ' + o.interval + 'ly. No money moves: this is a practice checkout for testing.</p><form method="post"><button class="btn" type="submit">Pay (test)</button></form><a class="btn ghost" href="/app/plan">Cancel</a></div>'));
  });
  app.post('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return html(res, notice('Not found', 'Checkout not found', 'This test checkout is not available.'), 404);
    if (o.status !== 'pending') return res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
    if (!sameOrigin(req)) return html(res, notice('Blocked', 'Blocked', 'Start the checkout again from your dashboard.'), 403);
    require('../services/payments').fulfill(o.ref, { via: 'demo' });
    res.redirect('/app/plan?order=' + encodeURIComponent(o.ref) + '&paid=1');
  });

  // Gatevoo sandbox (no keys + PAYMENTS_DEMO): the same flow as Gatevoo's hosted page, without real coins.
  const gvOrder = req => {
    const gv = require('../services/gatevoo');
    if (gv.mode() !== 'sandbox' || !req.user) return null;
    return db.one("SELECT * FROM orders WHERE ref = ? AND user_id = ? AND provider = 'gatevoo'", String(req.params.ref), req.user.id);
  };
  app.get('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return html(res, notice('Not found', 'Checkout not found', 'This crypto checkout link is invalid or has expired.'), 404);
    if (o.status !== 'pending') return res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
    const gv = require('../services/gatevoo');
    const m = o.method_id ? db.one('SELECT * FROM payment_methods WHERE id = ?', o.method_id) : null;
    const coins = gv.coins(m).map(c => gv.COINS[c]);
    const want = coins.some(c => c.id === req.query.coin) ? req.query.coin : (coins[0] || {}).id;
    const opts = coins.map(c => '<label class="coin"><input type="radio" name="coin" value="' + c.id + '"' + (c.id === want ? ' checked' : '') + '><span><b>' + esc(c.label) + '</b><small>' + esc(c.network) + '</small></span></label>').join('');
    html(res, page('Pay with crypto', '<div class="pg-card center"><span class="tag">Gatevoo · sandbox</span><h1>$' + o.amount_usd.toFixed(2) + '</h1><p>Pick a coin. This is the sandbox: no coins move, the payment is simulated.</p><form method="post" class="coins">' + opts + '<button class="btn" type="submit">I’ve paid (simulate)</button></form><a class="btn ghost" href="/app/plan">Cancel</a></div>'));
  });
  app.post('/pay/gatevoo/:ref', (req, res) => {
    const o = gvOrder(req);
    if (!o) return html(res, notice('Not found', 'Checkout not found', 'This crypto checkout is not available.'), 404);
    if (o.status !== 'pending') return res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
    if (!sameOrigin(req)) return html(res, notice('Blocked', 'Blocked', 'Start the checkout again from your dashboard.'), 403);
    require('../services/gatevoo').sandboxPay(o.ref, String((req.body || {}).coin || ''));
    res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
  });
  // Where Gatevoo sends the customer back after paying.
  app.get('/pay/callback', (req, res) => res.redirect('/app/plan?order=' + encodeURIComponent(String(req.query.ref || ''))));

  app.get('/robots.txt', (req, res) => res.send('User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\nSitemap: ' + config.appUrl + '/sitemap.xml\n', 200, 'text/plain; charset=utf-8'));
  app.get('/sitemap.xml', (req, res) => {
    const urls = ['/', '/pricing', '/signup', '/login', ...fs.readdirSync(path.join(config.root, 'content', 'legal')).filter(f => f.endsWith('.md')).map(f => '/legal/' + f.slice(0, -3))];
    res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(u => '<url><loc>' + config.appUrl + u + '</loc></url>').join('') + '</urlset>', 200, 'application/xml; charset=utf-8');
  });

  app.notFound = (req, res) => html(res, notice('Not found', 'Nothing to spy on here', 'This page doesn’t exist. It may have moved.', '404'), 404);
  app.errorPage = (req, res, status) => html(res, notice('Error', status === 401 ? 'Please log in' : 'Something went wrong', status === 401 ? 'Log in to see this page.' : 'Please try again in a moment.'), status);
};
