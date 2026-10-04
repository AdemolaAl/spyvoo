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
const { esc } = md;

const VIEWS = path.join(config.root, 'views');
const cache = new Map();
function view(name) {
  if (config.isProd && cache.has(name)) return cache.get(name);
  const html = fs.readFileSync(path.join(VIEWS, name), 'utf8').replace(/\{\{APP_URL\}\}/g, config.appUrl);
  cache.set(name, html);
  return html;
}
const html = (res, body, status = 200, extra = {}) => res.send(body, status, 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache', ...extra });
const safeNext = n => (/^\/(app|admin|invite)(\/|\?|$)/.test(String(n || '')) && !String(n).startsWith('//') ? String(n).slice(0, 300) : '');

module.exports = function (app) {
  app.get('/', (req, res) => html(res, view('site/index.html')));
  app.get('/pricing', (req, res) => html(res, view('site/pricing.html')));

  // Login pages. With VooSquare on, they hand over to VooSquare (admins can still use /login?password=1).
  const authPage = mode => (req, res) => {
    const next = safeNext(req.query.next) || (req.query.plan ? '/app/plan?checkout=' + encodeURIComponent(req.query.plan) + '&interval=' + (req.query.interval === 'year' ? 'year' : 'month') : '');
    if (voo.enabled() && (mode === 'login' || mode === 'signup') && !req.query.password) {
      const q = new URLSearchParams(); if (next) q.set('return_to', next); if (mode === 'signup') q.set('signup', '1');
      return res.redirect('/auth/voosquare' + (q.toString() ? '?' + q : ''));
    }
    if (req.user && (mode === 'login' || mode === 'signup')) return res.redirect(next || '/app');
    html(res, view('site/auth.html').replace('data-mode="login"', 'data-mode="' + mode + '"'), 200, { 'X-Robots-Tag': mode === 'login' || mode === 'signup' ? 'index' : 'noindex' });
  };
  for (const m of ['login', 'signup', 'forgot', 'reset', 'verify', 'invite']) app.get('/' + m, authPage(m));

  // Dashboard and admin (single-page apps).
  app.get('/app', (req, res) => (req.user ? html(res, view('app.html'), 200, { 'X-Robots-Tag': 'noindex' }) : res.redirect('/login?next=' + encodeURIComponent(req.url))));
  app.get('/app/*', (req, res) => (req.user ? html(res, view('app.html'), 200, { 'X-Robots-Tag': 'noindex' }) : res.redirect('/login?next=' + encodeURIComponent(req.url))));
  const adminShell = (req, res) => {
    if (!req.user) return res.redirect('/login?password=1&next=' + encodeURIComponent(req.url));
    if (req.user.role !== 'admin') return html(res, notice('Admins only', 'This area is for admins', 'Log in with an admin account to open the Spyvoo admin panel.'), 403);
    html(res, view('admin.html'), 200, { 'X-Robots-Tag': 'noindex' });
  };
  app.get('/admin', adminShell);
  app.get('/admin/*', adminShell);

  // Shared board (read-only link).
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
    html(res, page('Test checkout', '<div class="pg-card center"><span class="tag">Test checkout</span><h1>$' + o.amount_usd.toFixed(2) + '</h1><p>' + esc((require('../services/account').plan(o.plan_id) || {}).name || o.plan_id) + ' plan, ' + o.interval + 'ly. No money moves: this page only exists while PAYMENTS_DEMO is on.</p><form method="post"><button class="btn" type="submit">Pay (test)</button></form><a class="btn ghost" href="/app/plan">Cancel</a></div>'));
  });
  app.post('/pay/demo/:ref', (req, res) => {
    const o = demoOrder(req);
    if (!o) return html(res, notice('Not found', 'Checkout not found', 'This test checkout is not available.'), 404);
    if (o.status !== 'pending') return res.redirect('/app/plan?order=' + encodeURIComponent(o.ref));
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
    const origin = req.headers.origin || req.headers.referer || '';
    if (origin && !origin.startsWith(config.appUrl) && !origin.includes('//' + req.headers.host)) return html(res, notice('Blocked', 'Blocked', 'Start the checkout again from your dashboard.'), 403);
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
