'use strict';
// Spyvoo server: website, dashboard, admin panel, API and background jobs in one zero-dependency Node.js process.
const path = require('node:path');
const config = require('./config');
const db = require('./db');
const { createApp } = require('./lib/http');

function build({ dbFile, scheduler = config.scheduler } = {}) {
  db.open(dbFile);
  // First boot on a fresh database (e.g. a new Railway volume): plans, payment methods, admin and sample ads.
  if (process.env.AUTO_SEED !== 'false' && !db.one('SELECT id FROM plans LIMIT 1')) {
    console.log('Fresh database: seeding plans, settings, admin and sample ads…');
    require('../scripts/seed').seed({});
  }
  const auth = require('./lib/auth');
  const settings = require('./services/settings');
  settings.reset();
  const app = createApp();

  app.use(req => { auth.load(req); });
  app.use(req => { auth.csrf(req); });
  // Affiliate hand-off (Voo Connect): keep ?ref=&vclick=&coupon= from any landing URL in the voo_attr cookie until login.
  const voo = require('./lib/voo');
  app.use((req, res) => {
    if (req.method !== 'GET' || !voo.loginOn() || !/[?&](ref|vclick|coupon)=/.test(req.url)) return;
    voo.get().captureAttribution()(req, res);
  });
  app.use((req, res) => {
    if (!settings.get('flags').maintenance) return;
    if (req.user && req.user.role === 'admin') return;
    const p = req.path;
    if (p.startsWith('/admin') || p.startsWith('/api/admin') || p.startsWith('/api/auth/') || p === '/login' || p.startsWith('/auth/voosquare') || p === '/api/voosquare/summary' || p.startsWith('/webhooks/') || p === '/healthz' || /\.(css|js|svg|png|jpg|webp|ico|woff2)$/.test(p)) return;
    if (p.startsWith('/api/')) { res.json({ error: 'Spyvoo is getting an upgrade. Back in a few minutes.' }, 503); return; }
    res.send(require('./views/layout').notice('Back soon', 'We’re upgrading Spyvoo.', 'The spies are getting new binoculars. Please check back in a few minutes.'), 503, 'text/html; charset=utf-8', { 'Retry-After': '600' });
  });

  app.static('/', path.join(config.root, 'public'), { maxAge: config.isProd ? 3600 : 0 });

  require('./routes/voosquare')(app);
  require('./routes/auth')(app);
  require('./routes/app')(app);
  require('./routes/admin')(app);
  require('./routes/public')(app);
  require('./routes/webhooks')(app);
  require('./routes/pages')(app);

  app.get('/healthz', () => { db.one('SELECT 1 x'); return { ok: true, time: db.now() }; });

  // Jobs that were running when the last process stopped will never finish: close them.
  db.run("UPDATE jobs SET status = 'failed', error = 'Interrupted by a restart', finished_at = ? WHERE status = 'running'", db.now());
  if (scheduler) { require('./services/scheduler').start(); voo.start(); }
  return app;
}

if (require.main === module) {
  const app = build();
  const server = app.listen(config.port, () => {
    const providers = require('./providers');
    console.log('Spyvoo running on ' + config.appUrl + ' (port ' + config.port + ', ' + config.env + ')');
    if (!providers.get().configured()) console.log('  Ads: provider not connected yet. Sample ads are shown. Add APIFY_TOKEN (or save it in Admin → Ad data & AI).');
    if (!config.ai.key) console.log('  AI: basic breakdowns (set ANTHROPIC_API_KEY for Claude)');
    if (config.mail.provider === 'log') console.log('  Email: printed to the console (set MAIL_PROVIDER + MAIL_API_KEY to send)');
    const vs = require('./services/voosquare');
    console.log('  VooSquare: ' + (vs.enabled() ? 'Voo ID login on' : 'login off') + ', events ' + (vs.eventsOn() ? 'on' : 'off') + (config.voo.on ? '' : ' (VOO_CONNECT=off)'));
    if (config.pay.demo) console.log('  Payments: TEST checkout is ON');
    else if (require('./services/gatevoo').mode() === 'off') console.log('  Payments: OFF. Set GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to take money.');
  });
  server.headersTimeout = 30000;
  server.requestTimeout = 120000;
  // On stop: finish open requests, send queued VooSquare events (up to 5 s), then close the database.
  const shutdown = () => {
    console.log('Shutting down…');
    server.close(async () => { await require('./lib/voo').stop({ timeoutMs: 5000 }); try { db.raw.close(); } catch { /* ignore */ } process.exit(0); });
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', e => console.error('[unhandled]', e));
}

module.exports = { build };
