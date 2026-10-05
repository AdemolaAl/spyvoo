'use strict';
// Launch readiness check. Prints what works, what is optional and what blocks a real launch.
// Usage: npm run check          (exit code 1 if something blocks launch)
//        npm run check -- --ping (also calls Apify, Claude and Gatevoo to prove the keys work)
const fs = require('node:fs');
const config = require('../src/config');
const db = require('../src/db');

const ping = process.argv.includes('--ping');
const rows = [];
const ok = (t, d) => rows.push(['ok', t, d || '']);
const warn = (t, d) => rows.push(['warn', t, d || '']);
const bad = (t, d) => rows.push(['bad', t, d || '']);

(async () => {
  // Core
  process.versions.node.split('.').map(Number)[0] >= 22 ? ok('Node ' + process.versions.node) : bad('Node ' + process.versions.node, 'Node 22.13 or newer is needed.');
  config.secret && !/dev-only/.test(config.secret) && config.secret.length >= 32 ? ok('APP_SECRET set') : (config.isProd ? bad : warn)('APP_SECRET', 'Set a random APP_SECRET of 32+ characters (openssl rand -hex 32).');
  /^https:\/\//.test(config.appUrl) ? ok('APP_URL ' + config.appUrl) : (config.isProd ? bad : warn)('APP_URL ' + config.appUrl, 'Use your https:// domain, e.g. https://spyvoo.com.');
  try { db.open(); ok('Database ' + config.dbPath, db.one('SELECT COUNT(*) n FROM users').n + ' users, ' + db.one('SELECT COUNT(*) n FROM ads').n + ' ads'); }
  catch (e) { bad('Database', e.message); }
  if (config.isProd && !/^\/app\/data\//.test(config.dbPath) && !process.env.RAILWAY_VOLUME_MOUNT_PATH) warn('Database location', 'On Railway, mount a volume at /app/data so data survives deploys.');
  const admins = (() => { try { return db.one("SELECT COUNT(*) n FROM users WHERE role = 'admin'").n; } catch { return 0; } })();
  admins ? ok(admins + ' admin account(s)') : bad('No admin account', 'Set ADMIN_EMAIL + ADMIN_PASSWORD before first boot, or run: npm run create-admin -- you@mail.com "password"');

  // Ad data
  const providers = require('../src/providers');
  const p = providers.get();
  if (p.configured()) {
    ok('Ad data: ' + p.label);
    if (ping) { try { ok('Apify ping', await p.ping()); } catch (e) { bad('Apify ping', e.message); } }
  } else bad('Ad data provider not connected', 'Add APIFY_TOKEN (or save the token in Admin → Ad data & AI). Until then users see sample ads.');
  const demoAds = (() => { try { return db.one("SELECT COUNT(*) n FROM ads WHERE source = 'demo'").n; } catch { return 0; } })();
  if (demoAds && p.configured()) warn(demoAds + ' sample ads are live', 'Remove them in Admin → Ads manager once real ads arrive.');

  // AI
  if (config.ai.key) {
    ok('AI: Claude (' + config.ai.model + ')');
    if (ping) {
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': config.ai.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: config.ai.model, max_tokens: 5, messages: [{ role: 'user', content: 'Say ok' }] }) });
        r.ok ? ok('Claude ping') : bad('Claude ping', 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 160));
      } catch (e) { bad('Claude ping', e.message); }
    }
  } else warn('AI: basic mode', 'Set ANTHROPIC_API_KEY for real AI breakdowns, scripts and plain-English search.');
  config.ai.transcribeKey ? ok('Video transcripts on') : warn('Video transcripts off', 'Optional: TRANSCRIBE_API_KEY (OpenAI Whisper).');

  // Media
  if (config.media.driver === 'r2') {
    const r = config.media.r2;
    r.bucket && r.accessKey && r.secretKey && r.endpoint && r.publicUrl ? ok('Media on Cloudflare R2: ' + r.bucket) : bad('R2 incomplete', 'Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_URL.');
  } else {
    try { fs.mkdirSync(config.media.dir, { recursive: true }); fs.accessSync(config.media.dir, fs.constants.W_OK); (config.isProd ? warn : ok)('Media on disk: ' + config.media.dir, config.isProd ? 'Videos should live in Cloudflare R2: set MEDIA_DRIVER=r2 and the R2_* variables (zero egress fees).' : ''); }
    catch (e) { bad('Media folder not writable', e.message); }
  }

  // Email
  if (config.mail.provider !== 'log' && config.mail.key) ok('Email: ' + config.mail.provider, 'From ' + config.mail.from);
  else (config.isProd ? bad : warn)('Email is only logged', 'Set MAIL_PROVIDER (resend, brevo or postmark) and MAIL_API_KEY. Verify spyvoo.com with the provider first.');

  // Payments
  const gv = require('../src/services/gatevoo');
  if (gv.mode() === 'live') {
    ok('Payments: Gatevoo live', 'Webhook: ' + gv.webhookUrl());
    if (ping) { const r = await gv.ping(); (r.ok ? ok : bad)('Gatevoo ping', r.message); }
  } else if (gv.mode() === 'sandbox') (config.isProd ? bad : warn)('Payments: Gatevoo sandbox', 'Set GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to take real money.');
  else bad('No way to take payments', 'Set GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET.');
  if (config.pay.demo) (config.isProd ? bad : warn)('PAYMENTS_DEMO is on', 'Anyone can get a paid plan free. Set PAYMENTS_DEMO=false.');

  // VooSquare
  const voo = require('../src/services/voosquare');
  if (!config.voo.on) warn('VooSquare switched off (VOO_CONNECT=off)', 'Remove VOO_CONNECT or set it to on to use Voo ID login and events.');
  else {
    voo.enabled() ? ok('VooSquare: Continue with Voo ID on', config.voo.base + ' · callback ' + config.voo.redirectUri) : warn('VooSquare login off', 'Set VOO_BASE, VOO_CLIENT_ID and VOO_CLIENT_SECRET (Admin → Products → Spyvoo → Credentials in VooSquare). Email login works without it.');
    voo.eventsOn() ? ok('VooSquare events and summary card on') : warn('VooSquare events off', 'Set VOO_API_KEY so plan payments reach VooSquare (affiliate commissions) and the dashboard card works.');
    if (voo.eventsOn() && !config.voo.signalSecret) warn('VOO_SIGNAL_SECRET not set', 'Optional: a long random string (openssl rand -hex 32), set once and never changed. It hashes fraud hints.');
    if (voo.enabled() && config.isProd && !/^https:\/\//.test(config.voo.redirectUri)) bad('VOO_REDIRECT_URI is not https', config.voo.redirectUri);
  }
  if (process.env.VOO_ISSUER || process.env.VOO_SERVICE_KEY || process.env.VOO_WEBHOOK_SECRET) warn('Old VooSquare variables found', 'VOO_ISSUER, VOO_SERVICE_KEY, VOO_WEBHOOK_SECRET and VOO_EVENTS_URL are no longer used. Use VOO_BASE, VOO_CLIENT_ID, VOO_CLIENT_SECRET, VOO_API_KEY (docs/VOOSQUARE.md).');
  if (voo.enabled() && voo.eventsOn() && ping) {
    // The kit's own self-test against VooSquare (changes nothing there).
    const { execFileSync } = require('node:child_process');
    try {
      execFileSync(process.execPath, [require('node:path').join(config.root, 'voo-connect', 'check.js'), '--redirect-uri', config.voo.redirectUri, '--logout-uri', config.appUrl + '/', '--summary-url', config.appUrl + '/api/voosquare/summary'], { env: { ...process.env, VOO_BASE: config.voo.base }, stdio: 'pipe', timeout: 60000 });
      ok('VooSquare self-test (voo-connect/check.js) passed');
    } catch (e) { bad('VooSquare self-test failed', String(e.stdout || e.message).split('\n').filter(l => /FAIL/.test(l)).join('\n     ') || e.message); }
  }

  const icon = { ok: '\x1b[32m✓\x1b[0m', warn: '\x1b[33m!\x1b[0m', bad: '\x1b[31m✗\x1b[0m' };
  console.log('\nSpyvoo launch check (' + config.env + ')\n');
  for (const [s, t, d] of rows) console.log(' ' + icon[s] + ' ' + t + (d ? '\n     ' + d : ''));
  const blockers = rows.filter(r => r[0] === 'bad').length;
  console.log('\n' + (blockers ? blockers + ' thing(s) to fix before launch.' : 'Ready to launch.') + '\n');
  process.exit(blockers && config.isProd ? 1 : 0);
})();
