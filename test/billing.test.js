'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env;
before(async () => { env = await h.boot(); });
after(async () => { await env.close(); });

test('free plan limits searches and answers 402 with an upgrade hint', async () => {
  const { client, user } = await h.signup();
  const db = require('../src/db');
  const account = require('../src/services/account');
  const lim = account.plan('free').searches_per_day;
  db.insert('usage', { user_id: user.id, day: account.today(), searches: lim });
  const r = await client.get('/api/app/search?q=crypto');
  assert.equal(r.status, 402);
  assert.equal(r.body.upgrade, true);
});

test('quote applies the launch coupon to a first monthly purchase', async () => {
  const { client } = await h.signup();
  const q = await client.post('/api/app/quote', { plan: 'pro', interval: 'month', coupon: 'SPYLAUNCH' });
  assert.equal(q.status, 200);
  assert.equal(q.body.list, 79);
  assert.equal(q.body.amount, 39.5);
  const y = await client.post('/api/app/quote', { plan: 'pro', interval: 'year', coupon: 'SPYLAUNCH' });
  assert.ok(y.body.coupon_error);
});

test('Gatevoo sandbox checkout: pay, plan switches on, receipt email sent', async () => {
  const { client, user, email } = await h.signup();
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month' });
  assert.equal(co.status, 200, co.text);
  assert.equal(co.body.provider, 'gatevoo');
  assert.match(co.body.checkout_url, /^\/pay\/gatevoo\//);
  const pay = await client.post(co.body.checkout_url, { coin: 'USDT_TRC20' }, { form: true, headers: { origin: 'http://localhost:3000' } });
  assert.ok([302, 303].includes(pay.status));
  const db = require('../src/db');
  const u = db.one('SELECT * FROM users WHERE id = ?', user.id);
  assert.equal(u.plan_id, 'starter');
  assert.ok(new Date(u.plan_renews_at) > new Date(Date.now() + 25 * 864e5));
  assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', co.body.ref).status, 'paid');
  await h.sleep(50);
  assert.equal(h.emails(email, 'payment-receipt').length, 1);
});

test('Gatevoo webhook rejects a bad signature and accepts a signed one', async () => {
  const gv = require('../src/services/gatevoo');
  const config = require('../src/config');
  config.gatevoo.webhookSecret = 'whsec_test_123';
  try {
    const raw = JSON.stringify({ type: 'invoice.paid', data: { reference: 'SV-NOPE' } });
    const bad = await h.client().req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-signature': 't=1,v1=00' } });
    assert.equal(bad.status, 401);
    const good = await h.client().req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-signature': gv.sign(raw) } });
    assert.equal(good.status, 200);
  } finally { config.gatevoo.webhookSecret = ''; }
});

test('underpaid invoices do not switch the plan on', async () => {
  const { client, user } = await h.signup();
  const co = await client.post('/api/app/checkout', { plan: 'pro', interval: 'month' });
  const gv = require('../src/services/gatevoo');
  const db = require('../src/db');
  const o = db.one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  const r = gv.settle({ id: o.provider_ref, reference: o.ref, status: 'paid', paid_usd: 10, payment: { coin: 'USDT_TRC20' } });
  assert.equal(r.ok, false);
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'free');
});

test('team seats: agency owner invites a member who shares the plan', async () => {
  const owner = await h.signup();
  h.setPlan(owner.user.id, 'agency');
  const r = await owner.client.post('/api/team/invite', { email: 'teammate-' + Date.now() + '@example.com' });
  assert.equal(r.status, 200, r.text);
  const list = await owner.client.get('/api/team');
  assert.equal(list.status, 200);
});
