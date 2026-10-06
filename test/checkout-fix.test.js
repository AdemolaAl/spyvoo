'use strict';
// Regression tests for the live checkout failure (Oct 2026): "Something went wrong. Please try again." on every crypto
// checkout, and the iPhone page zoom. Root causes covered here:
//  1. GATEVOO_API_URL defaulted to https://api.gatevoo.com/v1, a host that does not exist (Gatevoo is gatevoo.com/api/v1).
//  2. In production every 5xx was replaced by "Something went wrong", hiding the specific checkout message.
//  3. The exact reason only lived in the order's meta: the logs and the admin never showed it.
//  4. Text fields under 16px make iOS Safari zoom the page on focus.
delete process.env.GATEVOO_API_URL;
delete process.env.GATEVOO_URL;
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

let env, mock, mockBase, deadUrl;
const seen = [];
let mockMode = 'ok';
before(async () => {
  env = await h.boot();
  // Mock Gatevoo (Voo family contract: /api/v1/invoices, /api/v1/me).
  mock = http.createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      const body = b ? JSON.parse(b) : null;
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, idem: req.headers['idempotency-key'], body });
      const send = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer gv_live_test') return send(401, { error: 'Invalid API key' });
      if (!req.url.startsWith('/api/v1/')) return send(404, { error: 'Not found' });
      if (mockMode === '422') return send(422, { error: { message: 'amount_usd must be at least 20' } });
      if (mockMode === '500') return send(500, { error: 'db down' });
      if (req.url === '/api/v1/me') return send(200, { merchant: { name: 'Zedapex' } });
      if (req.url === '/api/v1/invoices' && req.method === 'POST') {
        if (mockMode === 'badurl') return send(201, { id: 'inv_x', checkout_url: 'http://insecure.example/pay' });
        return send(201, { id: 'inv_' + body.order_id, checkout_url: 'https://gatevoo.com/pay/inv_' + body.order_id, status: 'pending' });
      }
      send(404, { error: 'Not found' });
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  mockBase = 'http://127.0.0.1:' + mock.address().port;
  // An address where nothing listens (connection refused).
  const tmp = http.createServer(); await new Promise(r => tmp.listen(0, '127.0.0.1', r));
  deadUrl = 'http://127.0.0.1:' + tmp.address().port + '/api/v1'; await new Promise(r => tmp.close(r));
});
after(async () => { await new Promise(r => mock.close(r)); await env.close(); });

const config = () => require('../src/config');
// Gatevoo live against the mock (or another address), optionally with production error hiding on.
async function live(fn, { apiUrl = mockBase + '/api/v1', key = 'gv_live_test', prod = false } = {}) {
  if (apiUrl === 'DEAD') apiUrl = deadUrl;
  const c = config(); const prev = { ...c.gatevoo }; const prevProd = c.isProd;
  Object.assign(c.gatevoo, { apiUrl, apiKey: key, webhookSecret: 'whsec_test' });
  c.isProd = prod; mockMode = 'ok';
  try { return await fn(); } finally { Object.assign(c.gatevoo, prev); c.isProd = prevProd; mockMode = 'ok'; }
}
const cryptoMethodId = () => require('../src/db').one("SELECT id FROM payment_methods WHERE provider = 'gatevoo'").id;

test('Gatevoo API address: defaults to gatevoo.com/api/v1, never the non-existent api.gatevoo.com', () => {
  const c = config();
  assert.equal(c.gatevoo.apiUrl, 'https://gatevoo.com/api/v1');
  assert.doesNotMatch(c.gatevoo.apiUrl, /api\.gatevoo\.com/);
  assert.equal(c.gatevooApiUrl('https://gatevoo.com'), 'https://gatevoo.com/api/v1');
  assert.equal(c.gatevooApiUrl('https://gatevoo.com/ '), 'https://gatevoo.com/api/v1');
  assert.equal(c.gatevooApiUrl('https://gatevoo.com/api/v1/'), 'https://gatevoo.com/api/v1');
  assert.equal(c.gatevooApiUrl('https://pay.example.com/v1'), 'https://pay.example.com/v1');
});

test('live checkout with SPYLAUNCH: $14.50 (cents) works for USDT TRC20 and BTC, coupon applied once', async () => {
  await live(async () => {
    for (const coin of ['USDT_TRC20', 'BTC']) {
      const { client } = await h.signup({ country: 'NG' });
      seen.length = 0;
      const r = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: cryptoMethodId(), coupon: 'SPYLAUNCH', coin });
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.amount, 14.5);
      assert.match(r.body.checkout_url, /^https:\/\/gatevoo\.com\/pay\/inv_SV-/);
      const call = seen.find(s => s.url === '/api/v1/invoices');
      assert.ok(call, 'invoice created at /api/v1/invoices');
      assert.equal(call.body.amount_usd, 14.5);
      assert.equal(call.body.amount.value, '14.50');
      assert.equal(call.body.preferred_coin, coin);
      assert.deepEqual(call.body.assets, ['USDT_TRC20', 'BTC']);
      assert.equal(call.idem, 'spyvoo-' + r.body.ref);
      const o = require('../src/db').one('SELECT * FROM orders WHERE ref = ?', r.body.ref);
      assert.equal(o.list_usd, 29); assert.equal(o.amount_usd, 14.5); assert.equal(o.coupon, 'SPYLAUNCH');
      assert.equal(o.status, 'pending'); assert.equal(o.provider_ref, 'inv_' + r.body.ref);
    }
  });
});

test('production: an unreachable Gatevoo gives the customer a specific message, the admin the exact reason', async () => {
  await live(async () => {
    const { client } = await h.signup({ country: 'NG' });
    const r = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: cryptoMethodId(), coupon: 'SPYLAUNCH', coin: 'USDT_TRC20' });
    assert.equal(r.status, 502);
    assert.notEqual(r.body.error, 'Something went wrong. Please try again.');
    assert.match(r.body.error, /Couldn’t reach the payment provider/);
    assert.equal(r.body.code, 'gatevoo_unreachable');
    const gv = require('../src/services/gatevoo');
    const last = gv.lastError();
    assert.equal(last.code, 'unreachable');
    assert.ok(last.reason.startsWith('Gatevoo could not be reached at ' + deadUrl + '/invoices (ECONNREFUSED'), last.reason);
    assert.equal(last.resolved, false);
    assert.equal(gv.status().last_error.ref, last.ref);
    // The admin overview health card carries it too.
    const adm = await h.admin();
    const ov = await adm.get('/api/admin/overview');
    assert.equal(ov.body.gatevoo_error.code, 'unreachable');
  }, { apiUrl: 'DEAD', prod: true });
});

test('a later successful invoice marks the last Gatevoo error as resolved', async () => {
  await live(async () => {
    const { client } = await h.signup({ country: 'NG' });
    const r = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: cryptoMethodId() });
    assert.equal(r.status, 200, r.text);
    assert.equal(require('../src/services/gatevoo').lastError().resolved, true);
  });
});

test('production: bad key, wrong address, refused order, provider down and a bad answer each get their own reason', async () => {
  const cases = [
    { opts: { key: 'gv_live_WRONG' }, code: 'rejected_key', reason: /returned 401 .*Invalid API key.*check GATEVOO_API_KEY/, user: /isn’t available right now/ },
    { opts: { apiUrl: 'BASE/v2' }, code: 'wrong_url', reason: /returned 404 for POST .*\/v2\/invoices.*check GATEVOO_API_URL/, user: /isn’t available right now/ },
    { mode: '422', code: 'refused', reason: /returned 422 .*amount_usd must be at least 20/, user: /refused this order/ },
    { mode: '500', code: 'provider_down', reason: /returned 500/, user: /having trouble/ },
    { mode: 'badurl', code: 'bad_response', reason: /without an invoice id and an https checkout_url/, user: /unexpected answer/ }
  ];
  for (const c of cases) {
    const opts = { prod: true, ...c.opts };
    if (opts.apiUrl) opts.apiUrl = opts.apiUrl.replace('BASE', mockBase);
    await live(async () => {
      if (c.mode) mockMode = c.mode;
      const { client, user } = await h.signup({ country: 'NG' });
      const r = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: cryptoMethodId(), coin: 'BTC' });
      assert.equal(r.status, 502, c.code);
      assert.equal(r.body.code, 'gatevoo_' + c.code);
      assert.match(r.body.error, c.user);
      const o = require('../src/db').one('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 1', user.id);
      assert.equal(o.status, 'failed');
      const meta = JSON.parse(o.meta);
      assert.equal(meta.gv_error, c.code);
      assert.match(meta.error, c.reason);
    }, opts);
  }
});

test('error mapping: every Gatevoo failure has a specific customer message, never the generic one', () => {
  const gv = require('../src/services/gatevoo');
  const mk = (p) => Object.assign(new Error('x'), p);
  const map = [
    [mk({ notConfigured: true }), 'not_configured', /isn’t set up yet.*another payment method/],
    [mk({ unreachable: true, code: 'ENOTFOUND' }), 'unreachable', /Couldn’t reach the payment provider/],
    [mk({ status: 401 }), 'rejected_key', /isn’t available right now/],
    [mk({ status: 403 }), 'rejected_key', /isn’t available right now/],
    [mk({ status: 404 }), 'wrong_url', /isn’t available right now/],
    [mk({ status: 422 }), 'refused', /refused this order/],
    [mk({ status: 503 }), 'provider_down', /having trouble/],
    [mk({}), 'bad_response', /unexpected answer/]
  ];
  for (const [e, code, user] of map) {
    const x = gv.explain(e);
    assert.equal(x.code, code); assert.match(x.user, user); assert.ok(x.reason);
    assert.doesNotMatch(x.user, /Something went wrong/);
  }
  assert.match(gv.explain(mk({ unreachable: true, code: 'ENOTFOUND', message: 'Gatevoo could not be reached at https://api.gatevoo.com/v1/invoices (ENOTFOUND api.gatevoo.com)' })).reason, /host does not exist: check GATEVOO_API_URL/);
});

test('Gatevoo switched off: invoice creation says exactly which variable is missing', async () => {
  const c = config(); const gv = require('../src/services/gatevoo');
  const prev = { ...c.gatevoo }; const prevDemo = c.pay.demo;
  Object.assign(c.gatevoo, { apiKey: 'gv_live_test', webhookSecret: '' }); c.pay.demo = false;
  try {
    assert.equal(gv.mode(), 'off');
    assert.deepEqual(gv.status().missing, ['GATEVOO_WEBHOOK_SECRET missing']);
    await assert.rejects(gv.createInvoice({ ref: 'SV-X', amount_usd: 14.5, item_name: 'x' }, { email: 'a@b.c' }), e => e.notConfigured && /GATEVOO_WEBHOOK_SECRET missing/.test(e.message));
    const p = await gv.ping();
    assert.equal(p.ok, false); assert.equal(p.code, 'not_configured'); assert.match(p.message, /GATEVOO_WEBHOOK_SECRET missing/);
  } finally { Object.assign(c.gatevoo, prev); c.pay.demo = prevDemo; }
});

test('admin "Test payment connection": live ok with merchant name, 401 and wrong address explained', async () => {
  const adm = await h.admin();
  await live(async () => {
    const r = await adm.post('/api/admin/payments/gatevoo/ping');
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    assert.match(r.body.message, /as Zedapex.*API key accepted/);
    assert.equal(r.body.api_url, mockBase + '/api/v1');
  });
  await live(async () => {
    const r = await adm.post('/api/admin/payments/gatevoo/ping');
    assert.equal(r.body.ok, false); assert.equal(r.body.code, 'rejected_key'); assert.match(r.body.message, /401/);
  }, { key: 'gv_live_nope' });
  await live(async () => {
    const r = await adm.post('/api/admin/payments/gatevoo/ping');
    assert.equal(r.body.ok, false); assert.equal(r.body.code, 'unreachable'); assert.match(r.body.message, /ECONNREFUSED/);
  }, { apiUrl: 'DEAD' });
  const pay = await adm.get('/api/admin/payments');
  assert.ok('last_error' in pay.body.gatevoo && Array.isArray(pay.body.gatevoo.missing));
});

test('production still hides unexpected 5xx errors (only explicit, user-safe messages are shown)', async () => {
  const { createApp } = require('../src/lib/http');
  const c = config(); const prevProd = c.isProd; c.isProd = true;
  const app = createApp();
  app.get('/api/boom', () => { throw new Error('SQLITE internal detail'); });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  try {
    const r = await h.realFetch('http://127.0.0.1:' + srv.address().port + '/api/boom');
    assert.equal(r.status, 500);
    assert.equal((await r.json()).error, 'Something went wrong. Please try again.');
  } finally { c.isProd = prevProd; await new Promise(r => srv.close(r)); }
});

test('manual (bank transfer) checkout with the 50% code returns its instructions', async () => {
  const db = require('../src/db');
  const m = db.one("SELECT * FROM payment_methods WHERE provider = 'manual'");
  db.update('payment_methods', m.id, { active: 1, countries: 'NG' });
  try {
    const { client } = await h.signup({ country: 'NG' });
    const r = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: m.id, coupon: 'SPYLAUNCH' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.provider, 'manual'); assert.equal(r.body.amount, 14.5); assert.match(r.body.instructions, /order reference/);
  } finally { db.update('payment_methods', m.id, { active: m.active, countries: m.countries }); }
});

test('webhook accepts the X-Gatevoo-Timestamp + hex signature form, rejects a wrong or stale one', async () => {
  const crypto = require('node:crypto');
  await live(async () => {
    const raw = JSON.stringify({ type: 'invoice.paid', data: { reference: 'SV-NOPE' } });
    const t = Math.floor(Date.now() / 1000);
    const sig = (ts) => crypto.createHmac('sha256', 'whsec_test').update(ts + '.' + raw).digest('hex');
    const send = (hdrs) => h.client().req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', ...hdrs } });
    assert.equal((await send({ 'x-gatevoo-timestamp': String(t), 'x-gatevoo-signature': sig(t) })).status, 200);
    assert.equal((await send({ 'x-gatevoo-timestamp': String(t), 'x-gatevoo-signature': sig(t + 1) })).status, 401);
    assert.equal((await send({ 'x-gatevoo-timestamp': String(t - 900), 'x-gatevoo-signature': sig(t - 900) })).status, 401);
  });
});

test('iPhone zoom: every typing field is at least 16px and pinch-zoom is never disabled', () => {
  const root = path.join(__dirname, '..');
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const app = read('public/css/app.css');
  assert.match(app, /input:not\(\[type=checkbox\]\)[^{]*, select, textarea \{ font-size: max\(16px, 1em\); \}/);
  assert.match(app, /\.ask input \{[^}]*font-size: 16px/);
  for (const f of ['public/css/app.css', 'public/css/auth.css', 'public/css/admin.css', 'public/css/page.css', 'views/site/index.html', 'views/site/pricing.html']) {
    const css = read(f);
    for (const m of css.matchAll(/(?:^|[}\n])([^{}]*\b(?:input|select|textarea)\b[^{}]*)\{([^}]*)\}/g)) {
      const fs2 = /font(?:-size)?:\s*(?:\d+\s+)?(\d+(?:\.\d+)?)px/.exec(m[2]);
      // Only rules whose subject is the field itself (not "input:focus + label", not checkboxes, switches or ranges).
      const fields = m[1].split(',').map(x => x.trim()).filter(x => /(?:^|[\s>+~.#\w-])(input|select|textarea)(\[[^\]]*\]|:[\w-]+(\([^)]*\))?)*$/.test(x) && /(^|[\s>+~])(input|select|textarea)\b[^\s>+~]*$/.test(x) && !/checkbox|radio|range|\.sw input|\.chk input|::/.test(x));
      if (fs2 && fields.length) assert.ok(Number(fs2[1]) >= 16, f + ': ' + fields.join(', ') + ' is ' + fs2[1] + 'px');
    }
  }
  for (const f of ['views/app.html', 'views/admin.html', 'views/site/index.html', 'views/site/auth.html', 'views/site/pricing.html', 'src/views/layout.js']) {
    const v = /<meta name="viewport" content="([^"]+)"/.exec(read(f));
    assert.ok(v, f); assert.doesNotMatch(v[1], /user-scalable=no|maximum-scale=1/);
  }
});
