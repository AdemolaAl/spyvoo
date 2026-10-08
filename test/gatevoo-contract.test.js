'use strict';
// The exact invoice Gatevoo's API sends (src/invoices.js apiView), old and new, against Spyvoo's settle():
// a paid invoice switches the plan on, a short one never does, and orders stuck by the old contract bug heal on re-check.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, db, gv;
before(async () => { env = await h.boot(); db = require('../src/db'); gv = require('../src/services/gatevoo'); });
after(async () => { await env.close(); });

function order(userId, ref, amount, extra = {}) {
  db.insert('orders', { ref, user_id: userId, plan_id: 'pro', interval: 'month', amount_usd: amount, list_usd: amount, provider: 'gatevoo', provider_ref: 'inv_' + ref, status: 'pending', created_at: db.now(), meta: '{}', ...extra });
}
// What Gatevoo v2.0 (before this fix) sent: no paid_usd, no reference, method/txid names.
const oldInvoice = (ref, amount, status = 'paid') => ({ id: 'inv_' + ref, status, amount_usd: amount, order_id: ref, method: 'USDT_TRC20', mode: 'exact', pay_amount: (amount + 0.13).toFixed(2), received: status === 'paid' ? (amount + 0.13).toFixed(2) : null, txid: 'tx' + ref, checkout_url: 'https://gatevoo.com/pay/inv_' + ref });

test('old Gatevoo answer (no paid_usd): a paid invoice switches the plan on and records coin + tx', async () => {
  const { user } = await h.signup({ name: 'Old Contract' });
  order(user.id, 'SV-OLD-1', 79);
  const r = gv.settle(oldInvoice('SV-OLD-1', 79));
  assert.equal(r.ok, true, JSON.stringify(r));
  const o = db.one("SELECT * FROM orders WHERE ref = 'SV-OLD-1'");
  assert.equal(o.status, 'paid');
  const meta = db.json(o.meta, {});
  assert.equal(meta.coin, 'USDT_TRC20');
  assert.equal(meta.tx_hash, 'txSV-OLD-1');
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'pro');
});

test('new Gatevoo answer: paid_usd below the total is NOT credited; a full one is', async () => {
  const { user } = await h.signup({ name: 'New Contract' });
  order(user.id, 'SV-NEW-1', 199);
  const short = { ...oldInvoice('SV-NEW-1', 199), paid_usd: 149.51, reference: 'SV-NEW-1', coin: 'USDT_TRC20', payment: { coin: 'USDT_TRC20', amount: '149.51', tx_hash: 'abc', amount_usd: 149.51 } };
  const r = gv.settle(short);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Underpaid/);
  assert.equal(db.one("SELECT status FROM orders WHERE ref = 'SV-NEW-1'").status, 'pending');
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'free');
  // Topped up / fixed: full amount → plan on, and the old "underpaid" flag is cleared.
  gv.settle({ ...short, paid_usd: 199, payment: { ...short.payment, amount_usd: 199 } });
  const o = db.one("SELECT * FROM orders WHERE ref = 'SV-NEW-1'");
  assert.equal(o.status, 'paid');
  assert.equal(db.json(o.meta, {}).underpaid, undefined);
});

test('old Gatevoo, USDT short: the dollars received are used, so a short USDT payment is still caught', async () => {
  const { user } = await h.signup({ name: 'Short Usdt' });
  order(user.id, 'SV-OLD-2', 79);
  const r = gv.settle({ ...oldInvoice('SV-OLD-2', 79), received: '29.07' });
  assert.equal(r.ok, false);
  assert.equal(db.one("SELECT status FROM orders WHERE ref = 'SV-OLD-2'").status, 'pending');
});

test('an invoice for another order, or with a different id, never pays this order', async () => {
  const { user } = await h.signup({ name: 'Mixed Up' });
  order(user.id, 'SV-MIX-1', 29);
  assert.equal(gv.settle({ ...oldInvoice('SV-MIX-1', 29), id: 'inv_someone_else' }).ok, false);
  assert.equal(db.one("SELECT status FROM orders WHERE ref = 'SV-MIX-1'").status, 'pending');
});

test('re-check heals orders that were paid while the contract was broken (flagged underpaid, left pending or failed)', async () => {
  const { user } = await h.signup({ name: 'Stuck Customer' });
  order(user.id, 'SV-STUCK-1', 79, { meta: JSON.stringify({ underpaid: true, gv_status: 'paid' }) });
  order(user.id, 'SV-STUCK-2', 29, { status: 'failed' });
  const keep = { mode: gv.mode, getInvoice: gv.getInvoice };
  gv.mode = () => 'live';
  gv.getInvoice = async id => oldInvoice(id.replace(/^inv_/, ''), id.endsWith('STUCK-1') ? 79 : 29);
  try {
    const r = await gv.recheckAll();
    assert.ok(r.checked >= 2 && r.activated >= 2, JSON.stringify(r));
    for (const ref of ['SV-STUCK-1', 'SV-STUCK-2']) assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', ref).status, 'paid', ref);
    assert.equal(db.json(db.one("SELECT meta FROM orders WHERE ref = 'SV-STUCK-1'").meta, {}).underpaid, undefined);
    assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'pro', 'the bigger plan wins');
  } finally { Object.assign(gv, keep); }
});

test('admin button: Re-check unpaid crypto orders', async () => {
  const adm = await h.admin();
  const r = await adm.post('/api/admin/payments/gatevoo/recheck', {});
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.skipped, 'not live', 'sandbox in tests');
});
