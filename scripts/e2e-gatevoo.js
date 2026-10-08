'use strict';
// End-to-end: real Gatevoo (simulated chain) + real Spyvoo, talking over HTTP like production.
// Usage (from the spyvoo folder, with gatevoo next to it): npm run e2e:gatevoo
// or: node scripts/e2e-gatevoo.js <spyvoo dir> <gatevoo dir>
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const SPY = path.resolve(process.argv[2]);
const GATE = path.resolve(process.argv[3]);
const GP = 4911, SP = 4912;
const GBASE = `http://localhost:${GP}`, SBASE = `http://localhost:${SP}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'voo-e2e-'));
const OWNER = { email: 'owner@zedapex.test', password: 'Gold-Gate-2026!xq' };
const ZPUB = 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const USDT = 'TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy';
const procs = [];
let pass = 0, fail = 0;
async function step(name, fn) {
  try { await fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}
function start(cwd, env, port, logName) {
  const log = fs.openSync(path.join(TMP, logName), 'w');
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd, env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', log, log] });
  procs.push(p);
  return waitUp(`http://localhost:${port}/healthz`);
}
async function waitUp(url) {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise(r => setTimeout(r, 150)); }
  throw new Error('did not start: ' + url);
}
function jar(base, extra = {}) {
  const cookies = new Map();
  return async (method, p, body, headers = {}) => {
    const h = { ...extra, ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (cookies.size) h.cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
    const r = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const sc of r.headers.getSetCookie()) { const [pair] = sc.split(';'); const i = pair.indexOf('='); const v = pair.slice(i + 1); if (v) cookies.set(pair.slice(0, i), v); else cookies.delete(pair.slice(0, i)); }
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j, text: t, location: r.headers.get('location') };
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { last = await fn(); if (last) return last; await sleep(300); } return last; }

(async () => {
  // 1. Gatevoo
  await start(GATE, { PORT: String(GP), BASE_URL: GBASE, APP_SECRET: 'g'.repeat(40), OWNER_EMAIL: OWNER.email, OWNER_PASSWORD: OWNER.password, OWNER_NAME: 'Ejiro',
    USDT_TRC20_ADDRESS: USDT, BTC_MODE: 'fresh', BTC_ZPUB: ZPUB, MOCK_CHAIN: '1', ALLOW_PRIVATE_WEBHOOKS: '1', DATA_FILE: path.join(TMP, 'gate.json'), GATEVOO_ENV_FILE: '/nonexistent', POLL_SECONDS: '5' }, GP, 'gate.log');
  const g = jar(GBASE, { origin: GBASE });
  let r = await g('POST', '/api/auth/login', { email: OWNER.email, password: OWNER.password });
  assert.equal(r.status, 200, r.text);
  const me = (await g('GET', '/api/me')).json;
  const wid = me.workspaces[0].id;
  r = await g('POST', `/api/w/${wid}/apps`, { name: 'Spyvoo', webhook_url: SBASE + '/webhooks/gatevoo' });
  assert.equal(r.status, 201, r.text);
  const KEY = r.json.api_key, SECRET = r.json.webhook_secret;

  // 2. Spyvoo pointed at Gatevoo
  await start(SPY, { PORT: String(SP), APP_URL: SBASE, NODE_ENV: 'development', PAYMENTS_DEMO: 'false', GATEVOO_API_URL: GBASE, GATEVOO_API_KEY: KEY, GATEVOO_WEBHOOK_SECRET: SECRET,
    DATABASE_PATH: path.join(TMP, 'spy.db'), ADMIN_EMAIL: 'admin@spyvoo.test', ADMIN_PASSWORD: 'admin-pass-12345', SCHEDULER: 'false', DEMO_ADS: 'true', MAIL_PROVIDER: 'log', VOO_CONNECT: 'off' }, SP, 'spy.log');
  const s = jar(SBASE, { 'x-sv': '1' });
  let under = null;
  const adm = jar(SBASE, { 'x-sv': '1' });

  console.log('\nSpyvoo ↔ Gatevoo end-to-end');
  await step('Admin "Test payment connection" says connected', async () => {
    r = await adm('POST', '/api/auth/login', { email: 'admin@spyvoo.test', password: 'admin-pass-12345' });
    assert.equal(r.status, 200, r.text);
    r = await adm('POST', '/api/admin/payments/gatevoo/ping', {});
    assert.equal(r.json.ok, true, JSON.stringify(r.json));
  });

  r = await s('POST', '/api/auth/signup', { email: 'buyer@example.com', password: 'password123', name: 'Tunde Bakare', country: 'NG' });
  assert.equal(r.status, 200, r.text);

  for (const coin of ['USDT_TRC20', 'BTC']) {
    let co, invId;
    await step(`[${coin}] Checkout creates a Gatevoo invoice and returns its checkout link`, async () => {
      const plan = (await s('GET', '/api/app/plan')).json;
      const method = plan.methods.find(m => m.provider === 'gatevoo');
      assert.ok(method, 'crypto method shown to customer: ' + JSON.stringify(plan.methods));
      r = await s('POST', '/api/app/checkout', { plan: coin === 'BTC' ? 'pro' : 'starter', interval: 'month', method_id: method.id, coin });
      assert.equal(r.status, 200, r.text);
      co = r.json;
      assert.ok(co.checkout_url.startsWith(GBASE + '/pay/inv_'), co.checkout_url);
      invId = co.checkout_url.split('/pay/')[1];
    });
    await step(`[${coin}] Customer opens the Gatevoo page and picks ${coin}`, async () => {
      r = await fetch(`${GBASE}/api/pay/${invId}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: coin }) });
      const q = await r.json();
      assert.equal(r.status, 200, JSON.stringify(q));
      assert.ok(q.address && q.pay_amount, JSON.stringify(q));
      co.quote = q;
    });
    await step(`[${coin}] Coins land → Gatevoo marks paid → signed webhook → Spyvoo plan switches on`, async () => {
      r = await g('POST', '/api/dev/mock-transfer', { method: coin, address: co.quote.address, amount: co.quote.pay_amount, confirmations: 6 });
      assert.equal(r.status, 200, r.text);
      const o = await until(async () => { const x = (await s('GET', '/api/app/orders/' + co.ref)).json; return x && x.order && x.order.status === 'paid' ? x : null; });
      assert.ok(o, 'order never became paid: ' + JSON.stringify((await s('GET', '/api/app/orders/' + co.ref)).json));
      assert.equal(o.user.plan.id, coin === 'BTC' ? 'pro' : 'starter');
      assert.equal(o.order.coin, coin);
      assert.ok(o.order.tx_url === null || typeof o.order.tx_url === 'string');
    });
    await step(`[${coin}] Gatevoo's webhook delivery shows "delivered" (no 401/404)`, async () => {
      const job = await until(async () => { const ov = (await g('GET', `/api/w/${wid}/overview`)).json; const j = ov.webhooks.find(x => x.invoice_id === invId); return j && j.status !== 'pending' ? j : null; }, 20000)
        || (await g('GET', `/api/w/${wid}/overview`)).json.webhooks.find(x => x.invoice_id === invId);
      assert.ok(job, 'no webhook job');
      assert.equal(job.status, 'delivered', JSON.stringify(job));
    });
    await step(`[${coin}] After paying, Gatevoo sends the customer back to Spyvoo`, async () => {
      const pv = await (await fetch(`${GBASE}/api/pay/${invId}`)).json();
      assert.ok(pv.redirect_url && pv.redirect_url.startsWith(SBASE + '/pay/callback?ref='), 'redirect_url=' + pv.redirect_url);
    });
  }

  await step('Replayed webhook does not extend the plan twice', async () => {
    const before = (await s('GET', '/api/app/plan')).json.current;
    const ov = (await g('GET', `/api/w/${wid}/overview`)).json;
    const a = ov.apps[0];
    await g('POST', `/api/w/${wid}/apps/${a.id}/test-webhook`, {});
    const after = (await s('GET', '/api/app/plan')).json.current;
    assert.deepEqual(after, before);
  });

  await step('Forged webhook (wrong secret) is refused with 401', async () => {
    const body = JSON.stringify({ type: 'invoice.paid', data: { id: 'inv_x', order_id: 'SV-FAKE', status: 'paid' } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = require('node:crypto').createHmac('sha256', 'whsec_wrong').update(ts + '.' + body).digest('hex');
    const x = await fetch(SBASE + '/webhooks/gatevoo', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gatevoo-timestamp': String(ts), 'x-gatevoo-signature': sig }, body });
    assert.equal(x.status, 401);
  });

  await step('Underpayment is NOT credited', async () => {
    const plan = (await s('GET', '/api/app/plan')).json;
    const method = plan.methods.find(m => m.provider === 'gatevoo');
    const c2 = (await s('POST', '/api/app/checkout', { plan: 'agency', interval: 'month', method_id: method.id, coin: 'USDT_TRC20' })).json;
    const id2 = c2.checkout_url.split('/pay/')[1];
    const q = await (await fetch(`${GBASE}/api/pay/${id2}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'USDT_TRC20' }) })).json();
    await g('POST', '/api/dev/mock-transfer', { method: 'USDT_TRC20', address: q.address, amount: (Number(q.pay_amount) - 50).toFixed(2), confirmations: 6 });
    await sleep(2500);
    const o = (await s('GET', '/api/app/orders/' + c2.ref)).json;
    assert.notEqual(o.order.status, 'paid');
    assert.notEqual(o.user.plan.id, 'agency');
    under = { ref: c2.ref, inv: id2 };
  });

  await step('A Gatevoo teammate assigns that short payment from Review → Spyvoo still does NOT give the plan (flags underpaid)', async () => {
    const ov = (await g('GET', `/api/w/${wid}/overview`)).json;
    const u = ov.unmatched[0];
    assert.ok(u, 'short payment waiting in Review');
    const r2 = await g('POST', `/api/w/${wid}/unmatched/${encodeURIComponent(u.key)}/assign`, { invoice_id: under.inv });
    assert.equal(r2.status, 200, r2.text);
    const inv = (await fetch(`${GBASE}/api/v1/invoices/${under.inv}`, { headers: { authorization: 'Bearer ' + KEY } }).then(x => x.json()));
    assert.equal(inv.status, 'paid');
    assert.ok(inv.paid_usd < inv.amount_usd, 'Gatevoo reports what arrived: ' + inv.paid_usd);
    await sleep(2500);
    const o = (await s('GET', '/api/app/orders/' + under.ref)).json;
    assert.notEqual(o.user.plan.id, 'agency');
    assert.equal(o.order.underpaid, true);
  });

  await step('Paid after the checkout expired (late) still switches the plan on', async () => {
    const plan = (await s('GET', '/api/app/plan')).json;
    const method = plan.methods.find(m => m.provider === 'gatevoo');
    const c3 = (await s('POST', '/api/app/checkout', { plan: 'agency', interval: 'year', method_id: method.id, coin: 'USDT_TRC20' })).json;
    const id3 = c3.checkout_url.split('/pay/')[1];
    const q = await (await fetch(`${GBASE}/api/pay/${id3}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method: 'USDT_TRC20' }) })).json();
    // A newer checkout replaces this one in Spyvoo (old order → failed), then the customer pays the old one anyway.
    await s('POST', '/api/app/checkout', { plan: 'starter', interval: 'month', method_id: method.id, coin: 'USDT_TRC20' });
    await g('POST', '/api/dev/mock-transfer', { method: 'USDT_TRC20', address: q.address, amount: q.pay_amount, confirmations: 6 });
    const o = await until(async () => { const x = (await s('GET', '/api/app/plan')).json; return x.current && x.current.id === 'agency' ? x : null; });
    assert.ok(o, 'plan switched on from the late payment');
  });

  console.log(`\n${pass} passed, ${fail} failed   (logs: ${TMP})`);
  procs.forEach(p => p.kill());
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1); });
