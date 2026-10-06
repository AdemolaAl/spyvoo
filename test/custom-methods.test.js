'use strict';
// Custom payment methods (bank transfer, mobile money, a USDT wallet address...): admin setup, country scope, checkout
// with the launch coupon at a locked price, proof upload, approve / reject, expiry, reorder, and the safe migration.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

let env, adm;
before(async () => { env = await h.boot(); adm = await h.admin(); });
after(async () => { await env.close(); });

const db = () => require('../src/db');
// A real 1×1 PNG, as the browser sends it (data URL).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function newMethod(body) {
  const r = await adm.post('/api/admin/payments/methods', { provider: 'manual', scope: 'local', countries: 'NG', active: true, ...body });
  assert.equal(r.status, 200, r.text);
  return r.body.id;
}

test('admin creates a custom method; only customers in its countries see it, next to crypto', async () => {
  const id = await newMethod({ name: 'Opay / bank (Nigeria)', icon: 'phone', currency: 'ngn', rate: 1600, proof_mode: 'either', description: 'Naira transfer',
    details: 'Bank: Opay\nAccount number: 8012345678\nAccount name: Zedapex Limited', instructions: 'Use the order reference as the narration.' });
  const m = db().one('SELECT * FROM payment_methods WHERE id = ?', id);
  const cfg = JSON.parse(m.config);
  assert.deepEqual(cfg.details[1], { label: 'Account number', value: '8012345678' });
  assert.equal(cfg.currency, 'NGN'); assert.equal(cfg.rate, 1600); assert.equal(cfg.icon, 'phone');

  const ng = await h.signup({ country: 'NG' });
  const br = await h.signup({ country: 'BR' });
  const ngMethods = (await ng.client.get('/api/app/plan')).body.methods;
  const brMethods = (await br.client.get('/api/app/plan')).body.methods;
  const mine = ngMethods.find(x => x.id === id);
  assert.ok(mine, 'NG customer sees the Nigerian method');
  assert.equal(mine.currency, 'NGN'); assert.equal(mine.details.length, 3); assert.equal(mine.icon, 'phone');
  assert.ok(ngMethods.some(x => x.provider === 'gatevoo'), 'crypto still shows alongside');
  assert.ok(!brMethods.some(x => x.id === id), 'BR customer does not see it');

  // A global custom method shows to everyone.
  const gid = await newMethod({ name: 'USDT wallet (manual)', scope: 'global', countries: '', icon: 'wallet', currency: 'USDT', rate: 1, details: 'USDT TRC20 address: TXYZabc123' });
  assert.ok((await br.client.get('/api/app/plan')).body.methods.some(x => x.id === gid));
  await adm.del('/api/admin/payments/methods/' + gid);
});

test('nothing shows to nobody: a switched-on local method needs countries, and old rows get a clear warning', async () => {
  const r = await adm.post('/api/admin/payments/methods', { name: 'Ghost', provider: 'manual', scope: 'local', countries: '', active: true, instructions: 'x' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Pick at least one country.*nobody sees it/);
  // Off is fine (an admin can prepare it), and the seeded Bank transfer (local, no countries) is flagged in the list.
  const off = await adm.post('/api/admin/payments/methods', { name: 'Draft', provider: 'manual', scope: 'local', countries: '', active: false, instructions: 'x' });
  assert.equal(off.status, 200, off.text);
  const list = (await adm.get('/api/admin/payments')).body.methods;
  const bank = list.find(x => x.name === 'Bank transfer');
  assert.ok(bank.warnings.some(w => /Nobody sees this method/.test(w)));
  // Switching the Bank transfer on without countries is refused; with countries it works.
  assert.equal((await adm.req('PATCH', '/api/admin/payments/methods/' + bank.id, { active: true })).status, 400);
  assert.equal((await adm.req('PATCH', '/api/admin/payments/methods/' + bank.id, { active: true, countries: 'GH' })).status, 200);
  assert.equal((await adm.req('PATCH', '/api/admin/payments/methods/' + bank.id, { active: false })).status, 200);
  await adm.del('/api/admin/payments/methods/' + off.body.id);
});

test('full flow: checkout with SPYLAUNCH at a locked price → proof → approve → plan active', async () => {
  const id = await newMethod({ name: 'Naira transfer', icon: 'bank', currency: 'NGN', rate: 1600, proof_mode: 'either', details: 'Account number: 0123456789', instructions: 'Narration = order ref' });
  const { client, user, email } = await h.signup({ country: 'NG' });
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: id, coupon: 'SPYLAUNCH' });
  assert.equal(co.status, 200, co.text);
  assert.equal(co.body.provider, 'manual');
  assert.equal(co.body.amount, 14.5);
  const pay = co.body.pay;
  assert.equal(pay.amount, 23200); assert.equal(pay.currency, 'NGN'); assert.equal(pay.amount_usd, 14.5); assert.equal(pay.list_usd, 29);
  assert.equal(pay.coupon, 'SPYLAUNCH'); assert.deepEqual(pay.details, [{ label: 'Account number', value: '0123456789' }]);
  assert.equal(pay.instructions, 'Narration = order ref');

  // Price lock: changing the method's rate or details later doesn't change this order.
  await adm.req('PATCH', '/api/admin/payments/methods/' + id, { rate: 2000, details: 'Account number: 999' });
  const listed = (await client.get('/api/app/plan')).body.orders.find(o => o.ref === co.body.ref);
  assert.equal(listed.pay.amount, 23200); assert.equal(listed.pay.details[0].value, '0123456789'); assert.equal(listed.status, 'pending');

  // Proof is required, belongs to the owner only, and must be a real image.
  assert.equal((await client.post('/api/app/orders/' + co.body.ref + '/proof', {})).status, 400);
  const other = await h.signup({ country: 'NG' });
  assert.equal((await other.client.post('/api/app/orders/' + co.body.ref + '/proof', { reference: 'FT123' })).status, 404);
  const fake = await client.post('/api/app/orders/' + co.body.ref + '/proof', { image: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') });
  assert.equal(fake.status, 400); assert.match(fake.body.error, /isn’t a PNG, JPG or WebP/);

  const pr = await client.post('/api/app/orders/' + co.body.ref + '/proof', { reference: 'FT24100612345', image: PNG });
  assert.equal(pr.status, 200, pr.text);
  assert.equal(pr.body.pay.status, 'review'); assert.equal(pr.body.pay.proof, 'FT24100612345'); assert.equal(pr.body.pay.has_screenshot, true);
  const o = db().one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  assert.equal(o.status, 'review');
  assert.ok(o.proof_file && !o.proof_file.includes('/'));
  assert.equal(db().one('SELECT u.plan_id FROM users u WHERE id = ?', user.id).plan_id, 'free', 'not active before approval');

  // The screenshot is private: admins only.
  assert.notEqual((await client.get('/api/admin/orders/' + co.body.ref + '/proof')).status, 200);
  const img = await adm.get('/api/admin/orders/' + co.body.ref + '/proof');
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal((await adm.get('/api/admin/payments')).body.review >= 1, true);

  const usesBefore = db().one("SELECT uses FROM coupons WHERE code = 'SPYLAUNCH'").uses;
  const ap = await adm.post('/api/admin/orders/' + co.body.ref + '/approve', {});
  assert.equal(ap.status, 200, ap.text);
  const u = db().one('SELECT * FROM users WHERE id = ?', user.id);
  assert.equal(u.plan_id, 'starter');
  assert.ok(new Date(u.plan_renews_at) > new Date(Date.now() + 25 * 864e5));
  const paid = db().one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  assert.equal(paid.status, 'paid'); assert.equal(paid.amount_usd, 14.5); assert.match(paid.reviewed_by, /^admin-/);
  assert.equal(db().one("SELECT uses FROM coupons WHERE code = 'SPYLAUNCH'").uses, usesBefore + 1);
  await h.sleep(50);
  assert.equal(h.emails(email, 'payment-receipt').length, 1);
  assert.ok(db().one("SELECT id FROM notifications WHERE user_id = ? AND title LIKE 'You’re on Starter%'", user.id));
  // Approving twice is harmless.
  assert.equal((await adm.post('/api/admin/orders/' + co.body.ref + '/approve', {})).body.already, true);
});

test('reject path: a reason is required, the customer is told by notice and email, the order stays (not deleted)', async () => {
  const id = await newMethod({ name: 'MTN MoMo', icon: 'phone', currency: 'GHS', rate: 15.5, proof_mode: 'text', scope: 'local', countries: 'GH', details: 'MoMo number: 0240000000' });
  const { client, user, email } = await h.signup({ country: 'GH' });
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: id, coupon: 'SPYLAUNCH' });
  assert.equal(co.status, 200, co.text);
  assert.equal(co.body.pay.amount, 224.75); // 14.50 × 15.5
  // proof_mode "text": a screenshot alone is not enough.
  const onlyImg = await client.post('/api/app/orders/' + co.body.ref + '/proof', { image: PNG });
  assert.equal(onlyImg.status, 400); assert.match(onlyImg.body.error, /reference or transaction ID/);
  assert.equal((await client.post('/api/app/orders/' + co.body.ref + '/proof', { reference: 'MOMO-99' })).status, 200);

  assert.equal((await adm.post('/api/admin/orders/' + co.body.ref + '/reject', { reason: '' })).status, 400);
  const rj = await adm.post('/api/admin/orders/' + co.body.ref + '/reject', { reason: 'No MoMo payment with reference MOMO-99 arrived.' });
  assert.equal(rj.status, 200, rj.text);
  const o = db().one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  assert.equal(o.status, 'rejected'); assert.equal(o.review_note, 'No MoMo payment with reference MOMO-99 arrived.');
  assert.equal(db().one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'free');
  assert.ok(db().one("SELECT id FROM notifications WHERE user_id = ? AND title = 'Payment not approved' AND body LIKE '%MOMO-99%'", user.id));
  await h.sleep(50);
  assert.equal(h.emails(email, 'payment-rejected').length, 1);
  const mine = (await client.get('/api/app/plan')).body.orders.find(x => x.ref === co.body.ref);
  assert.equal(mine.status, 'rejected'); assert.match(mine.review_note, /MOMO-99/);
  // No more proof on a rejected order; rejecting a paid order is refused.
  assert.equal((await client.post('/api/app/orders/' + co.body.ref + '/proof', { reference: 'again' })).status, 400);
});

test('abandoned pending orders expire after the setting (never deleted) and can still be approved later', async () => {
  const id = await newMethod({ name: 'Cash deposit', icon: 'cash', currency: 'USD', rate: 1, details: 'Branch: Lekki' });
  const { client, user } = await h.signup({ country: 'NG' });
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: id });
  assert.equal(co.status, 200, co.text);
  const r = await adm.req('PATCH', '/api/admin/settings/billing', { value: { pending_expire_days: 3 } });
  assert.equal(r.status, 200, r.text);
  const payments = require('../src/services/payments');
  db().run('UPDATE orders SET created_at = ? WHERE ref = ?', new Date(Date.now() - 2 * 864e5).toISOString(), co.body.ref);
  payments.expireStale();
  assert.equal(db().one('SELECT status FROM orders WHERE ref = ?', co.body.ref).status, 'pending', 'not yet: 2 of 3 days');
  db().run('UPDATE orders SET created_at = ? WHERE ref = ?', new Date(Date.now() - 4 * 864e5).toISOString(), co.body.ref);
  assert.ok(payments.renewals().stale >= 1, 'the hourly billing job runs the expiry');
  const o = db().one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  assert.equal(o.status, 'expired'); assert.match(o.review_note, /Not paid within 3 days/);
  // Late money: the customer can still send proof, and the admin can approve it.
  assert.equal((await client.post('/api/app/orders/' + co.body.ref + '/proof', { reference: 'late-deposit' })).status, 200);
  assert.equal((await adm.post('/api/admin/orders/' + co.body.ref + '/approve', {})).status, 200);
  assert.equal(db().one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'starter');
  await adm.req('PATCH', '/api/admin/settings/billing', { value: { pending_expire_days: 7 } });
});

test('admin reorders methods and checkout lists them in that order', async () => {
  const before = (await adm.get('/api/admin/payments')).body.methods.map(m => m.id);
  const last = before[before.length - 1];
  const r = await adm.post('/api/admin/payments/methods/' + last + '/move', { dir: -1 });
  assert.equal(r.status, 200, r.text);
  const after = (await adm.get('/api/admin/payments')).body.methods.map(m => m.id);
  assert.equal(after[after.length - 2], last);
  const sorts = db().all('SELECT sort FROM payment_methods ORDER BY sort').map(x => x.sort);
  assert.deepEqual(sorts, sorts.map((_, i) => (i + 1) * 10));
  const { client } = await h.signup({ country: 'NG' });
  const seen = (await client.get('/api/app/plan')).body.methods.map(m => m.id).filter(Boolean);
  assert.deepEqual(seen, after.filter(id => seen.includes(id)), 'checkout follows the admin order');
});

test('migration 005 keeps an existing Bank transfer (name, countries, instructions, on/off, order) and adds defaults', () => {
  const { DatabaseSync } = require('node:sqlite');
  const mem = new DatabaseSync(':memory:');
  const dir = path.join(__dirname, '..', 'migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (f === '005_custom_methods.sql') {
      mem.prepare("INSERT INTO payment_methods (name, provider, scope, countries, description, config, active, sort) VALUES ('Bank transfer', 'manual', 'local', 'NG,GH', 'Pay by bank', ?, 1, 3)").run(JSON.stringify({ instructions: 'GTBank 0123456789, narration = order ref' }));
      mem.prepare("INSERT INTO users (email, created_at) VALUES ('a@b.c', '2026-01-01')").run();
      mem.prepare("INSERT INTO orders (ref, user_id, plan_id, amount_usd, list_usd, provider, method_id, status, created_at) VALUES ('SV-OLD', 1, 'pro', 79, 79, 'manual', 1, 'pending', '2026-01-01')").run();
    }
    mem.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  const m = mem.prepare("SELECT * FROM payment_methods WHERE name = 'Bank transfer'").get();
  assert.equal(m.countries, 'NG,GH'); assert.equal(m.active, 1); assert.equal(m.sort, 3); assert.equal(m.description, 'Pay by bank');
  const c = JSON.parse(m.config);
  assert.equal(c.instructions, 'GTBank 0123456789, narration = order ref');
  assert.equal(c.icon, 'bank'); assert.equal(c.currency, 'USD'); assert.equal(c.rate, 1); assert.equal(c.proof_mode, 'either'); assert.deepEqual(c.details, []);
  const o = mem.prepare("SELECT * FROM orders WHERE ref = 'SV-OLD'").get();
  assert.equal(o.status, 'pending'); assert.equal(o.amount_usd, 79); assert.equal(o.pay_currency, 'USD'); assert.equal(o.proof, '');
  // An old order without a saved copy still shows a usable payment card (amount in USD).
  const p = require('../src/services/payments').payOut(o);
  assert.equal(p.amount, 79); assert.equal(p.currency, 'USD');
});
