'use strict';
// Gatevoo: Zedapex's own crypto checkout. Spyvoo creates an invoice, the customer pays USDT (TRON) or Bitcoin
// on Gatevoo's hosted page, and Gatevoo tells us by signed webhook when the money has landed in our wallet.
// Contract: docs/GATEVOO.md. Without keys (and with PAYMENTS_DEMO on) a local sandbox checkout stands in.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');

const COINS = {
  USDT_TRC20: { id: 'USDT_TRC20', label: 'USDT', network: 'TRON (TRC20)', explorer: 'https://tronscan.org/#/transaction/' },
  BTC: { id: 'BTC', label: 'Bitcoin', network: 'BTC mainnet', explorer: 'https://mempool.space/tx/' }
};
const PAID = ['paid', 'confirmed', 'completed'];
const DEAD = ['expired', 'cancelled', 'canceled', 'failed'];
const TOLERANCE_USD = 0.01;
const SIG_WINDOW_S = 300;

const cfg = () => config.gatevoo;
const live = () => !!(cfg().apiKey && cfg().webhookSecret);
const sandbox = () => !live() && !!config.pay.demo;
function mode() { return live() ? 'live' : sandbox() ? 'sandbox' : 'off'; }

// Coins are switched on per payment method (Admin → Payment methods → Gatevoo → coins).
function coins(method) {
  const m = method || db.one("SELECT * FROM payment_methods WHERE provider = 'gatevoo' AND active = 1 ORDER BY sort LIMIT 1");
  const c = m ? db.json(m.config, {}).coins : null;
  const list = Array.isArray(c) && c.length ? c.filter(x => COINS[x]) : ['USDT_TRC20', 'BTC'];
  return list.length ? list : ['USDT_TRC20'];
}
function available() { return mode() !== 'off'; }

function webhookUrl() { return config.appUrl + '/webhooks/gatevoo'; }

async function api(method, path, body, idem) {
  const headers = { Authorization: 'Bearer ' + cfg().apiKey, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (idem) headers['Idempotency-Key'] = idem;
  const ctl = AbortSignal.timeout(15000);
  let res;
  try { res = await fetch(cfg().apiUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl }); }
  catch { const e = new Error('Gatevoo could not be reached'); e.unreachable = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data.error && (data.error.message || data.error)) || data.message || ('Gatevoo error ' + res.status)); e.status = res.status; throw e; }
  return data.data || data;
}

// Start a payment. Returns { id, checkout_url, expires_at }.
async function createInvoice(order, user, coin) {
  const list = coins(order.method);
  const preferred = list.includes(coin) ? coin : undefined;
  if (mode() === 'sandbox') return { id: 'gv_sbx_' + order.ref, checkout_url: '/pay/gatevoo/' + encodeURIComponent(order.ref) + (preferred ? '?coin=' + preferred : ''), expires_at: new Date(Date.now() + 3600e3).toISOString() };
  const inv = await api('POST', '/invoices', {
    reference: order.ref,
    amount: { value: order.amount_usd.toFixed(2), currency: 'USD' },
    coins: list, preferred_coin: preferred,
    description: 'Spyvoo · ' + order.item_name,
    customer: { email: user.email, name: user.name || '' },
    success_url: config.appUrl + '/pay/callback?ref=' + encodeURIComponent(order.ref),
    cancel_url: config.appUrl + '/app/plan?cancelled=' + encodeURIComponent(order.ref),
    webhook_url: webhookUrl(),
    expires_in: 3600,
    metadata: { app: 'spyvoo', user_id: order.user_id, plan: order.plan_id, interval: order.interval }
  }, 'spyvoo-' + order.ref);
  if (!inv || !inv.id || !/^https:\/\//.test(String(inv.checkout_url || ''))) throw new Error('Gatevoo returned an invalid invoice');
  return { id: String(inv.id), checkout_url: String(inv.checkout_url), expires_at: inv.expires_at || null };
}

async function getInvoice(id) { return api('GET', '/invoices/' + encodeURIComponent(id)); }

// Signature header: "t=<unix seconds>,v1=<hex hmac-sha256 of `${t}.${raw body}`>".
function signatureOk(raw, header, now = Date.now()) {
  const secret = cfg().webhookSecret;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map(x => x.trim().split('=')).filter(x => x.length === 2));
  const t = Number(parts.t); const v1 = String(parts.v1 || '');
  if (!t || !v1 || Math.abs(now / 1000 - t) > SIG_WINDOW_S) return false;
  const want = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex');
  return want.length === v1.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(v1));
}
function sign(raw, t = Math.floor(Date.now() / 1000), secret = cfg().webhookSecret) {
  return 't=' + t + ',v1=' + crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex');
}

// Apply an invoice's state to its order. Safe to call many times (webhook, return page, "Check payment").
function settle(inv, via = 'gatevoo') {
  if (!inv) return { ok: false, reason: 'No invoice' };
  const ref = String(inv.reference || '');
  const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', ref);
  if (!o) return { ok: false, reason: 'Order not found' };
  if (o.provider_ref && inv.id && String(inv.id) !== o.provider_ref) return { ok: false, reason: 'Invoice does not match this order' };
  const pay = inv.payment || {};
  const paidUsd = Number(inv.paid_usd != null ? inv.paid_usd : pay.amount_usd);
  const coin = String(pay.coin || inv.coin || '');
  const info = {
    coin: COINS[coin] ? coin : (coin || null), tx_hash: pay.tx_hash || inv.tx_hash || null,
    paid_usd: isFinite(paidUsd) ? paidUsd : null, paid_amount: pay.amount != null ? String(pay.amount) : null,
    confirmations: pay.confirmations != null ? Number(pay.confirmations) : null, gv_status: String(inv.status || '')
  };
  const meta = { ...db.json(o.meta, {}), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v != null && v !== '')) };
  if (o.status === 'paid') return { ok: true, order: o };
  const status = String(inv.status || '').toLowerCase();
  if (PAID.includes(status)) {
    if (!(info.paid_usd >= o.amount_usd - TOLERANCE_USD)) {
      meta.underpaid = true;
      db.update('orders', o.id, { meta: JSON.stringify(meta) });
      return { ok: false, reason: 'Underpaid: received $' + (info.paid_usd || 0).toFixed(2) + ' of $' + o.amount_usd.toFixed(2) };
    }
    db.update('orders', o.id, { meta: JSON.stringify(meta) });
    require('./payments').fulfill(ref, { via, provider_ref: o.provider_ref || String(inv.id || '') });
    return { ok: true };
  }
  if (status === 'underpaid') { meta.underpaid = true; db.update('orders', o.id, { meta: JSON.stringify(meta) }); return { ok: false, reason: 'Underpaid' }; }
  if (DEAD.includes(status)) {
    db.run('UPDATE orders SET status = \'failed\', meta = ? WHERE id = ? AND status = \'pending\'', JSON.stringify(meta), o.id);
    return { ok: false, reason: 'Payment ' + status };
  }
  db.update('orders', o.id, { meta: JSON.stringify(meta) });
  return { ok: false, reason: status === 'confirming' ? 'Payment seen, waiting for confirmations' : 'Waiting for payment' };
}

async function verify(o) {
  if (!o.provider_ref || mode() !== 'live') return { ok: false, reason: 'Waiting for payment' };
  return settle(await getInvoice(o.provider_ref));
}

// Sandbox only: pretend Gatevoo saw the coins land.
function sandboxPay(ref, coin) {
  const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', ref);
  if (!o) return { ok: false };
  const c = COINS[coin] ? coin : coins()[0];
  return settle({ id: o.provider_ref, reference: ref, status: 'paid', paid_usd: o.amount_usd, payment: { coin: c, tx_hash: 'sandbox_' + crypto.randomBytes(16).toString('hex'), amount: c === 'BTC' ? (o.amount_usd / 65000).toFixed(8) : o.amount_usd.toFixed(2), confirmations: c === 'BTC' ? 2 : 20 } }, 'gatevoo-sandbox');
}

async function ping() {
  if (mode() === 'sandbox') return { ok: true, mode: 'sandbox', message: 'Sandbox mode: add GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to take real payments.' };
  if (mode() === 'off') return { ok: false, mode: 'off', message: 'GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET are not set on the server.' };
  try { const me = await api('GET', '/me'); return { ok: true, mode: 'live', message: 'Connected' + (me && me.name ? ' as ' + me.name : '') + '.' }; }
  catch (e) { return { ok: false, mode: 'live', message: e.status === 401 ? 'Gatevoo rejected the API key.' : e.message }; }
}

function status() {
  return { mode: mode(), available: available(), coins: coins().map(c => COINS[c]), api_url: cfg().apiUrl, webhook_url: webhookUrl(), has_key: !!cfg().apiKey, has_secret: !!cfg().webhookSecret };
}

function txUrl(coin, hash) { return hash && COINS[coin] && !/^sandbox_/.test(hash) ? COINS[coin].explorer + encodeURIComponent(hash) : null; }

module.exports = { COINS, mode, available, coins, createInvoice, getInvoice, settle, verify, signatureOk, sign, sandboxPay, ping, status, txUrl, webhookUrl };
