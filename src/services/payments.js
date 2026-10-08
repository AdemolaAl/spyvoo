'use strict';
const longDate = d => new Date(d === undefined ? Date.now() : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// Plans and checkout. One adapter per payment provider: gatevoo (crypto, live or sandbox), manual (bank transfer or
// any method you confirm by hand from Admin → Orders) and demo (test checkout, never in production).
// Which methods a customer sees depends on the country they picked at sign-up (Admin → Payment methods).
const config = require('../config');
const db = require('../db');
const account = require('./account');
const settings = require('./settings');
const { HttpError } = require('../lib/http');
const { orderRef } = require('../lib/security');

const DAY = 864e5;
const round2 = n => Math.round(n * 100) / 100;

// Custom methods (provider "manual"): bank transfer, mobile money, a USDT wallet address... The customer pays by hand
// using the instructions and account details, adds a reference or a screenshot, and an admin approves or rejects.
const ICONS = ['bank', 'phone', 'wallet', 'card', 'cash', 'globe'];
const PROOF_MODES = ['either', 'text', 'image', 'both', 'none'];
const MAX_DETAILS = 8;
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, n);
function manualConfig(c) {
  c = c || {};
  const rate = Number(c.rate);
  return {
    icon: ICONS.includes(c.icon) ? c.icon : 'bank',
    instructions: clean(c.instructions, 2000),
    details: (Array.isArray(c.details) ? c.details : []).map(d => ({ label: clean(d && d.label, 40), value: clean(d && d.value, 200) })).filter(d => d.label || d.value).slice(0, MAX_DETAILS),
    currency: /^[A-Z0-9]{2,10}$/.test(String(c.currency || '').toUpperCase()) ? String(c.currency).toUpperCase() : 'USD',
    rate: Number.isFinite(rate) && rate > 0 ? rate : 1,
    proof_mode: PROOF_MODES.includes(c.proof_mode) ? c.proof_mode : 'either'
  };
}
// What the customer pays in the method's currency: USD price × rate, rounded to cents (8 decimals for tiny rates like BTC).
function localAmount(usd, rate) { return rate < 0.01 ? Math.round(usd * rate * 1e8) / 1e8 : round2(usd * rate); }
// Problems an admin should fix, shown next to the method in Admin → Payments.
function methodWarnings(m) {
  const w = [];
  const cc = String(m.countries || '').split(',').filter(Boolean);
  if (m.scope === 'local' && !cc.length) w.push('Nobody sees this method: it is “only some countries” with no countries. Add country codes or make it global.');
  if (m.provider === 'manual') { const c = manualConfig(db.json(m.config, {})); if (!c.instructions && !c.details.length) w.push('Add instructions or account details so people know where to send the money.'); }
  return w;
}
function methodOut(m) {
  const c = db.json(m.config, {});
  const mc = m.provider === 'manual' ? manualConfig(c) : null;
  return { id: m.id, name: m.name, provider: m.provider, scope: m.scope, countries: String(m.countries || '').split(',').filter(Boolean), description: m.description, coins: m.provider === 'gatevoo' ? require('./gatevoo').coins(m).map(c => require('./gatevoo').COINS[c]).filter(Boolean) : undefined, ...(mc ? mc : {}), active: !!m.active };
}

function methodsFor(user) {
  const cc = String((user && user.country) || '').toUpperCase();
  const rows = db.all('SELECT * FROM payment_methods WHERE active = 1 ORDER BY sort, id').filter(m => m.scope === 'global' || (cc && ('' + m.countries).split(',').includes(cc)));
  const out = rows.filter(m => m.provider !== 'gatevoo' || require('./gatevoo').available()).map(methodOut);
  if (config.pay.demo) out.push({ id: 0, name: 'Test checkout', provider: 'demo', scope: 'global', countries: [], description: 'Demo mode: no money moves. Turned off in production.' });
  return out;
}

function coupon(code, { user, plan, interval } = {}) {
  const c = code ? db.one('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', String(code).trim()) : null;
  if (!c || !c.active) return { ok: false, reason: 'That code isn’t valid.' };
  if (c.ends_at && new Date(c.ends_at).getTime() < Date.now()) return { ok: false, reason: 'That code has expired.' };
  if (c.max_uses && c.uses >= c.max_uses) return { ok: false, reason: 'That code has been fully used.' };
  if (plan && c.plans && !c.plans.split(',').includes(plan)) return { ok: false, reason: 'That code doesn’t work on this plan.' };
  if (interval && c.intervals && !c.intervals.split(',').includes(interval)) return { ok: false, reason: 'That code is for ' + c.intervals.replace(',', ' or ') + 'ly plans only.' };
  if (user && c.first_purchase_only && db.one('SELECT id FROM orders WHERE user_id = ? AND paid_at IS NOT NULL', user.id)) return { ok: false, reason: 'That code is for your first purchase only.' };
  return { ok: true, coupon: c };
}

function quote(user, planId, interval = 'month', code = '') {
  const p = account.plan(planId);
  if (!p || p.id !== planId || !p.active || p.price_month <= 0) throw new HttpError(400, 'Pick a paid plan.');
  const iv = interval === 'year' ? 'year' : 'month';
  const list = iv === 'year' ? p.price_year : p.price_month;
  if (!(list > 0)) throw new HttpError(400, 'This plan has no ' + iv + 'ly price.');
  let discount = 0; let applied = null; let couponError = '';
  if (code) {
    const c = coupon(code, { user, plan: p.id, interval: iv });
    if (c.ok) { applied = c.coupon.code; discount = c.coupon.percent ? list * c.coupon.percent / 100 : Math.min(list, c.coupon.amount_off); }
    else couponError = c.reason;
  }
  return { plan: { id: p.id, name: p.name }, interval: iv, list: round2(list), discount: round2(discount), amount: round2(Math.max(0, list - discount)), coupon: applied, coupon_error: couponError };
}

async function checkout(user, { plan, interval, method_id: methodId, coupon: code, coin }) {
  if (user.team_owner_id) throw new HttpError(403, 'Your plan comes from your team owner (' + account.owner(user).email + '). Ask them to upgrade.');
  const q = quote(user, plan, interval, code);
  if (code && !q.coupon) throw new HttpError(400, q.coupon_error);
  const methods = methodsFor(user);
  const m = methods.find(x => String(x.id) === String(methodId ?? '')) || (methodId == null ? methods[0] : null);
  if (!m) throw new HttpError(400, 'Pick a payment method.');
  if (q.amount <= 0) throw new HttpError(400, 'This order is free. Contact support to apply it.');
  if (q.coupon) {
    // Codes with a use limit: count other people's unpaid checkouts from the last 2 days as taken.
    const c = db.one('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', q.coupon);
    const held = c && c.max_uses ? db.one("SELECT COUNT(*) n FROM orders WHERE coupon = ? COLLATE NOCASE AND status IN ('pending', 'review') AND user_id != ? AND created_at > ?", q.coupon, user.id, new Date(Date.now() - 2 * 864e5).toISOString()).n : 0;
    if (c && c.max_uses && c.uses + held >= c.max_uses) throw new HttpError(400, 'That code has been fully used.');
  }
  // A new checkout replaces any unpaid one (keeps billing history clean; a late payment on the old invoice still activates).
  db.run("UPDATE orders SET status = 'failed' WHERE user_id = ? AND status = 'pending'", user.id);
  const ref = orderRef();
  // Price lock: the amount (in USD and in the method's own currency) is fixed on the order now and never re-quoted.
  const mc = m.provider === 'manual' ? manualConfig(db.json((db.one('SELECT config FROM payment_methods WHERE id = ?', m.id) || {}).config, {})) : null;
  const payAmount = mc ? localAmount(q.amount, mc.rate) : q.amount;
  const payCurrency = mc ? mc.currency : 'USD';
  const id = db.insert('orders', { ref, user_id: user.id, plan_id: q.plan.id, interval: q.interval, amount_usd: q.amount, list_usd: q.list, coupon: q.coupon || '', provider: m.provider, method_id: m.id || null, status: 'pending', created_at: db.now(), pay_amount: payAmount, pay_currency: payCurrency,
    // A copy of what to pay and where, so a later edit or deletion of the method never changes an open order.
    meta: mc ? JSON.stringify({ pay: { name: m.name, icon: mc.icon, instructions: mc.instructions, details: mc.details, proof_mode: mc.proof_mode } }) : '{}' });
  const order = db.one('SELECT * FROM orders WHERE id = ?', id);
  let url = '';
  if (m.provider === 'gatevoo') {
    const gv = require('./gatevoo');
    const row = db.one('SELECT * FROM payment_methods WHERE id = ?', m.id);
    try {
      const inv = await gv.createInvoice({ ...order, item_name: q.plan.name + ' plan (' + q.interval + 'ly)', method: row }, user, coin);
      url = inv.checkout_url;
      db.update('orders', id, { provider_ref: inv.id, checkout_url: url, meta: JSON.stringify({ expires_at: inv.expires_at, coin: coin || null }) });
    } catch (e) {
      // The exact reason goes to the order (Admin → Payments shows it) and the server log; the customer gets a
      // specific, safe message instead of "Something went wrong".
      const x = gv.explain(e);
      db.update('orders', id, { status: 'failed', meta: JSON.stringify({ error: x.reason, gv_error: x.code }) });
      console.error('[gatevoo] checkout ' + ref + ' failed (' + x.code + '): ' + x.reason);
      const err = new HttpError(x.code === 'not_configured' ? 503 : 502, x.user, { code: 'gatevoo_' + x.code, other_methods: methods.some(o => o.provider !== 'gatevoo') });
      err.expose = true;
      throw err;
    }
  } else if (m.provider === 'demo') {
    url = '/pay/demo/' + encodeURIComponent(ref);
    db.update('orders', id, { checkout_url: url });
  }
  if (m.provider === 'manual') return { ref, amount: q.amount, provider: 'manual', checkout_url: '', instructions: mc.instructions, pay: payOut(db.one('SELECT * FROM orders WHERE id = ?', id)) };
  return { ref, amount: q.amount, provider: m.provider, checkout_url: url, instructions: m.instructions || '' };
}

function periodEnd(from, interval) {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + (interval === 'year' ? 12 : 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

// Mark an order paid and switch the plan on. Safe to call twice (webhook + return page).
function fulfill(ref, { via = 'manual', provider_ref: pref } = {}) {
  let result = null;
  db.tx(() => {
    const o = db.one('SELECT * FROM orders WHERE ref = ?', ref);
    if (!o || o.status === 'paid') { result = o; return; }
    const u = db.one('SELECT * FROM users WHERE id = ?', o.user_id);
    // Same plan still running: add the new period on top. Otherwise start now.
    const active = u.plan_renews_at && new Date(u.plan_renews_at).getTime() > Date.now();
    const running = u.plan_id === o.plan_id && active;
    // A late payment on an older, cheaper order never knocks someone off a bigger plan they already paid for:
    // it adds its time to the plan they're on instead.
    const cur = account.plan(u.plan_id), want = account.plan(o.plan_id);
    const keep = active && u.plan_id !== o.plan_id && cur && want && cur.price_month > want.price_month;
    const renews = periodEnd(running || keep ? u.plan_renews_at : db.now(), o.interval);
    db.update('users', u.id, keep ? { plan_renews_at: renews } : { plan_id: o.plan_id, plan_interval: o.interval, plan_renews_at: renews });
    db.update('orders', o.id, { status: 'paid', paid_at: db.now(), meta: JSON.stringify({ ...db.json(o.meta, {}), via }), ...(pref && !o.provider_ref ? { provider_ref: pref } : {}) });
    if (o.coupon) db.run('UPDATE coupons SET uses = uses + 1 WHERE code = ?', o.coupon);
    db.insert('notifications', { user_id: u.id, kind: 'billing', title: 'You’re on ' + account.plan(keep ? u.plan_id : o.plan_id).name + ' now', body: 'Paid $' + o.amount_usd.toFixed(2) + '. Renews ' + longDate(renews) + '.', url: '/app/plan', created_at: db.now() });
    result = { ...o, plan_id: keep ? u.plan_id : o.plan_id, status: 'paid', user: u, renews };
  });
  if (result && result.user) {
    const meta = db.json(db.one('SELECT meta FROM orders WHERE ref = ?', ref).meta, {});
    const gv = require('./gatevoo');
    require('./mailer').send(result.user.email, 'payment-receipt', {
      name: (result.user.name || '').split(' ')[0] || 'there', plan: account.plan(result.plan_id).name, interval: result.interval, amount: result.amount_usd.toFixed(2), currency: 'USD', reference: result.ref,
      date: longDate(), renew_date: longDate(result.renews), coin: meta.coin ? (gv.COINS[meta.coin] ? gv.COINS[meta.coin].label + ' (' + gv.COINS[meta.coin].network + ')' : String(meta.coin).slice(0, 30)) : '', dashboard_url: config.appUrl + '/app'
    });
    // VooSquare: spend (+ plan_started / plan_renewed) with a stable id built from the order id.
    try { require('./voosquare').paymentEvents(db.one('SELECT * FROM orders WHERE ref = ?', ref)); } catch (e) { console.error('[voosquare] payment events', e.message); }
  }
  return result;
}

function ordersFor(user) {
  return db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id).map(o => {
    const meta = db.json(o.meta, {});
    return { ref: o.ref, plan: (account.plan(o.plan_id) || {}).name, interval: o.interval, amount: o.amount_usd, list: o.list_usd, coupon: o.coupon, provider: o.provider, status: o.status, created_at: o.created_at, paid_at: o.paid_at, pay_url: o.status === 'pending' ? o.checkout_url : '', coin: meta.coin || null, tx_url: meta.tx_hash ? require('./gatevoo').txUrl(meta.coin, meta.tx_hash) : null, underpaid: !!meta.underpaid, pay: o.provider === 'manual' ? payOut(o) : undefined, review_note: o.status === 'rejected' ? o.review_note : undefined };
  });
}

// Daily job: renewal reminders, then downgrade accounts whose plan ran out (after the grace days).
function renewals() {
  const b = settings.get('billing');
  const mailer = require('./mailer');
  const soon = new Date(Date.now() + (b.renew_reminder_days || 3) * DAY).toISOString();
  let reminded = 0; let expired = 0;
  for (const u of db.all("SELECT * FROM users WHERE plan_id != 'free' AND plan_renews_at IS NOT NULL AND plan_renews_at <= ? AND plan_renews_at > ?", soon, db.now())) {
    const key = 'renew:' + u.id + ':' + u.plan_renews_at;
    if (db.one("SELECT id FROM audit_log WHERE action = 'renew_reminder' AND detail = ?", key)) continue;
    db.insert('audit_log', { user_id: u.id, action: 'renew_reminder', detail: key, created_at: db.now() });
    mailer.send(u.email, 'renewal-reminder', { name: (u.name || '').split(' ')[0] || 'there', plan: account.plan(u.plan_id).name, renew_date: longDate(u.plan_renews_at), renew_url: config.appUrl + '/app/plan?checkout=' + u.plan_id + '&interval=' + u.plan_interval });
    reminded++;
  }
  const cut = new Date(Date.now() - (b.grace_days || 0) * DAY).toISOString();
  for (const u of db.all("SELECT * FROM users WHERE plan_id != 'free' AND plan_renews_at IS NOT NULL AND plan_renews_at < ?", cut)) {
    const old = account.plan(u.plan_id).name;
    db.update('users', u.id, { plan_id: 'free', plan_renews_at: null });
    require('./voosquare').planCancelled(u.id, u.plan_id, String(u.plan_renews_at).slice(0, 10));
    db.run('UPDATE users SET team_owner_id = NULL WHERE team_owner_id = ?', u.id);
    db.insert('notifications', { user_id: u.id, kind: 'billing', title: 'Your ' + old + ' plan ended', body: 'You’re on Free now. Your boards and saved ads are safe.', url: '/app/plan', created_at: db.now() });
    mailer.send(u.email, 'plan-expired', { name: (u.name || '').split(' ')[0] || 'there', plan: old, plan_url: config.appUrl + '/app/plan' });
    expired++;
  }
  return { reminded, expired, stale: expireStale() };
}

// Admin: money went back to the customer (all or part of a paid order). VooSquare logs it; affiliate commission stays.
// endPlan: switch the customer to Free now when this order's plan is the one they are on.
function refund(ref, { amount, endPlan = true, by = '' } = {}) {
  return settleBack(ref, 'refunded', { amount, endPlan, by });
}
// Admin: the payment was disputed and charged back. The plan always ends; VooSquare reverses the commission.
function chargeback(ref, { amount, by = '' } = {}) {
  return settleBack(ref, 'charged_back', { amount, endPlan: true, by });
}
function settleBack(ref, status, { amount, endPlan, by }) {
  let out = null;
  db.tx(() => {
    const o = db.one('SELECT * FROM orders WHERE ref = ?', String(ref));
    if (!o) throw new HttpError(404, 'Order not found');
    const allowed = status === 'refunded' ? ['paid'] : ['paid', 'refunded'];
    if (!allowed.includes(o.status)) throw new HttpError(400, status === 'refunded' ? 'Only paid orders can be refunded (this one is ' + o.status + ').' : 'Only paid or refunded orders can be charged back (this one is ' + o.status + ').');
    const value = amount === undefined || amount === null || amount === '' ? o.amount_usd : round2(Number(amount));
    if (!(value >= 0.01) || value > o.amount_usd + 0.001) throw new HttpError(400, 'The amount must be between $0.01 and $' + o.amount_usd.toFixed(2) + '.');
    const meta = db.json(o.meta, {});
    meta[status === 'refunded' ? 'refund' : 'chargeback'] = { amount_usd: value, at: db.now(), by };
    db.update('orders', o.id, { status, meta: JSON.stringify(meta) });
    const u = db.one('SELECT * FROM users WHERE id = ?', o.user_id);
    let ended = false;
    if (endPlan && u && u.plan_id === o.plan_id && u.plan_id !== 'free') {
      // Only end the plan when no other paid order still covers it.
      const other = db.one("SELECT id FROM orders WHERE user_id = ? AND plan_id = ? AND status = 'paid' AND id != ? LIMIT 1", u.id, o.plan_id, o.id);
      if (!other) {
        db.update('users', u.id, { plan_id: 'free', plan_renews_at: null });
        db.run('UPDATE users SET team_owner_id = NULL WHERE team_owner_id = ?', u.id);
        ended = true;
      }
    }
    out = { order: { ...o, status, meta }, value, ended, user: u };
  });
  const vs = require('./voosquare');
  const ev = status === 'refunded' ? vs.refundEvent(out.order, out.value) : vs.chargebackEvent(out.order, out.value);
  if (out.ended) vs.planCancelled(out.user.id, out.order.plan_id, status + '-' + out.order.ref);
  return { ok: true, status, amount: out.value, plan_ended: out.ended, voo_event: ev || null };
}

// What the customer needs to pay a custom-method order by hand (from the copy saved on the order).
function payOut(o) {
  const p = db.json(o.meta, {}).pay || {};
  return { ref: o.ref, name: p.name || 'Payment', icon: p.icon || 'bank', instructions: p.instructions || '', details: p.details || [], proof_mode: p.proof_mode || 'either',
    amount: o.pay_amount != null ? o.pay_amount : o.amount_usd, currency: o.pay_currency || 'USD', amount_usd: o.amount_usd, list_usd: o.list_usd, coupon: o.coupon,
    status: o.status, proof: o.proof || '', has_screenshot: !!o.proof_file, proof_at: o.proof_at || null, review_note: o.status === 'rejected' ? o.review_note : '' };
}

// Screenshots are private: kept on the data volume (never on public media storage), served to admins only.
const PROOF_MAX = 4 * 1024 * 1024;
function proofDir() { return require('node:path').join(require('node:path').dirname(config.dbPath), 'proofs'); }
function decodeImage(dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'The screenshot must be a PNG, JPG or WebP image.');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > PROOF_MAX) throw new HttpError(413, 'That screenshot is too big. Keep it under 4 MB.');
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const webp = buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (!(png || jpg || webp)) throw new HttpError(400, 'That file isn’t a PNG, JPG or WebP image.');
  return { buf, ext: png ? 'png' : jpg ? 'jpg' : 'webp' };
}
function proofFile(o) {
  if (!o || !o.proof_file || !/^[A-Za-z0-9-]+\.(png|jpg|webp)$/.test(o.proof_file)) return null;
  const f = require('node:path').join(proofDir(), o.proof_file);
  return require('node:fs').existsSync(f) ? f : null;
}

// The customer says they paid: a reference and/or a screenshot, as the method asks. The order waits for review.
function submitProof(user, ref, { reference, image } = {}) {
  const o = db.one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', String(ref), user.id);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.provider !== 'manual') throw new HttpError(400, 'This order is paid through the provider’s own page.');
  if (o.status === 'paid') throw new HttpError(400, 'This order is already paid.');
  if (!['pending', 'review', 'expired'].includes(o.status)) throw new HttpError(400, o.status === 'rejected' ? 'This order was declined. Start a new checkout.' : 'This order can’t take a payment any more. Start a new checkout.');
  const mode = payOut(o).proof_mode;
  const text = clean(reference, 300);
  const hasText = text.length >= 3, hasImg = !!image;
  if (mode === 'text' && !hasText) throw new HttpError(400, 'Type your transfer reference or transaction ID.');
  if (mode === 'image' && !hasImg) throw new HttpError(400, 'Add a screenshot of your payment.');
  if (mode === 'both' && (!hasText || !hasImg)) throw new HttpError(400, 'Add your transfer reference and a screenshot of the payment.');
  if (mode !== 'none' && !hasText && !hasImg) throw new HttpError(400, 'Type your transfer reference, or add a screenshot of the payment.');
  let file = o.proof_file;
  if (hasImg) {
    const img = decodeImage(image);
    const fs = require('node:fs');
    fs.mkdirSync(proofDir(), { recursive: true });
    file = o.ref + '-' + require('node:crypto').randomBytes(6).toString('hex') + '.' + img.ext;
    fs.writeFileSync(require('node:path').join(proofDir(), file), img.buf);
    const old = proofFile(o); if (old) { try { fs.unlinkSync(old); } catch { /* keep going */ } }
  }
  db.update('orders', o.id, { status: 'review', proof: hasText ? text : o.proof, proof_file: file || '', proof_at: db.now() });
  db.insert('notifications', { user_id: user.id, kind: 'billing', title: 'Payment sent for review', body: 'We’ll check your ' + payOut(o).name + ' payment for order ' + o.ref + ' and switch your plan on. This usually takes a few hours.', url: '/app/plan', created_at: db.now() });
  return payOut(db.one('SELECT * FROM orders WHERE id = ?', o.id));
}

// Admin approves a custom-method payment: the plan switches on (receipt email + notice), at the locked price.
function approve(ref, { by = '', note = '' } = {}) {
  const o = db.one('SELECT * FROM orders WHERE ref = ?', String(ref));
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.status === 'paid') return { ok: true, already: true };
  if (['refunded', 'charged_back'].includes(o.status)) throw new HttpError(400, 'This order was ' + o.status.replace('_', ' ') + '.');
  fulfill(o.ref, { via: 'admin:' + by });
  db.update('orders', o.id, { reviewed_at: db.now(), reviewed_by: by, review_note: clean(note, 500) });
  return { ok: true };
}

// Admin rejects a custom-method payment with a reason the customer sees (in-app notice and email).
function reject(ref, { by = '', reason = '' } = {}) {
  const o = db.one('SELECT * FROM orders WHERE ref = ?', String(ref));
  if (!o) throw new HttpError(404, 'Order not found');
  const why = clean(reason, 500);
  if (why.length < 3) throw new HttpError(400, 'Say why, so the customer knows what to fix.');
  if (!['pending', 'review', 'expired'].includes(o.status)) throw new HttpError(400, 'Only unpaid orders can be rejected (this one is ' + o.status + ').');
  db.update('orders', o.id, { status: 'rejected', review_note: why, reviewed_at: db.now(), reviewed_by: by });
  const u = db.one('SELECT * FROM users WHERE id = ?', o.user_id);
  const plan = (account.plan(o.plan_id) || {}).name || o.plan_id;
  db.insert('notifications', { user_id: u.id, kind: 'billing', title: 'Payment not approved', body: 'Order ' + o.ref + ': ' + why, url: '/app/plan', created_at: db.now() });
  require('./mailer').send(u.email, 'payment-rejected', { name: (u.name || '').split(' ')[0] || 'there', plan, reference: o.ref, amount: Number(o.pay_amount != null ? o.pay_amount : o.amount_usd).toFixed(2), currency: o.pay_currency || 'USD', reason: why, plan_url: config.appUrl + '/app/plan' });
  return { ok: true };
}

// Unpaid orders left alone for N days (Admin → Settings → Billing) turn "expired". Nothing is deleted, and an admin can
// still approve one if the money turns up later.
function expireStale(at = Date.now()) {
  const days = Math.max(1, Math.floor(Number(settings.get('billing').pending_expire_days) || 7));
  const cut = new Date(at - days * DAY).toISOString();
  return db.run("UPDATE orders SET status = 'expired', review_note = ? WHERE status = 'pending' AND created_at < ?", 'Not paid within ' + days + (days === 1 ? ' day' : ' days'), cut).changes;
}

module.exports = { ICONS, PROOF_MODES, manualConfig, localAmount, methodWarnings, payOut, proofFile, submitProof, approve, reject, expireStale, methodsFor, methodOut, coupon, quote, checkout, fulfill, ordersFor, renewals, periodEnd, refund, chargeback };
