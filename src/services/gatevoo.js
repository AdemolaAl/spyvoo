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
  const url = cfg().apiUrl + path;
  const ctl = AbortSignal.timeout(15000);
  let res;
  try { res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctl }); }
  catch (err) {
    // Keep the low-level cause (ENOTFOUND <host>, ECONNREFUSED, timeout...) so the admin sees exactly what broke.
    const c = err && err.cause;
    const why = err && err.name === 'TimeoutError' ? 'timed out after 15s' : c && c.code ? c.code + (c.hostname ? ' ' + c.hostname : '') : (c && c.message) || (err && err.message) || 'network error';
    const e = new Error('Gatevoo could not be reached at ' + url + ' (' + why + ')'); e.unreachable = true; e.code = c && c.code; e.url = url; e.method = method; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && (data.error.message || (typeof data.error === 'string' ? data.error : ''))) || data.message || '';
    const e = new Error('Gatevoo returned ' + res.status + ' for ' + method + ' ' + url + (msg ? ': ' + String(msg).slice(0, 200) : ''));
    e.status = res.status; e.url = url; e.method = method; e.providerMessage = msg; throw e;
  }
  return data.data || data;
}

// Turn any Gatevoo failure into { code, reason (exact, for the admin and the logs), user (safe, for the customer) }.
const USER_MSG = {
  not_configured: 'Crypto checkout isn’t set up yet. Please choose another payment method.',
  unreachable: 'Couldn’t reach the payment provider. Please try again in a minute or choose another payment method.',
  rejected_key: 'Crypto checkout isn’t available right now. Please choose another payment method or try again later.',
  wrong_url: 'Crypto checkout isn’t available right now. Please choose another payment method or try again later.',
  refused: 'The payment provider refused this order. Please try again or choose another payment method.',
  provider_down: 'The payment provider is having trouble. Please try again in a minute.',
  bad_response: 'The payment provider sent an unexpected answer. Please try again in a minute.'
};
function explain(e) {
  let code, reason;
  if (e && e.notConfigured) { code = 'not_configured'; reason = e.message; }
  else if (e && e.unreachable) { code = 'unreachable'; reason = e.message + (e.code === 'ENOTFOUND' ? '. The host does not exist: check GATEVOO_API_URL (Gatevoo is https://gatevoo.com/api/v1).' : e.code === 'ECONNREFUSED' ? '. Nothing is listening there.' : '.'); }
  else if (e && (e.status === 401 || e.status === 403)) { code = 'rejected_key'; reason = e.message + '. Gatevoo rejected the API key: check GATEVOO_API_KEY (no spaces, the live key for Spyvoo).'; }
  else if (e && (e.status === 404 || e.status === 405)) { code = 'wrong_url'; reason = e.message + '. The API address is probably wrong: check GATEVOO_API_URL (Gatevoo is https://gatevoo.com/api/v1).'; }
  else if (e && e.status >= 400 && e.status < 500) { code = 'refused'; reason = e.message; }
  else if (e && e.status >= 500) { code = 'provider_down'; reason = e.message; }
  else { code = 'bad_response'; reason = (e && e.message) || 'Unknown Gatevoo error'; }
  return { code, reason, user: USER_MSG[code] };
}
function missing() {
  return [!cfg().apiKey && 'GATEVOO_API_KEY missing', !cfg().webhookSecret && 'GATEVOO_WEBHOOK_SECRET missing'].filter(Boolean);
}

// Last checkout failure, for Admin → Payments and the overview health card. Survives restarts: read from the orders.
function lastError() {
  const o = db.one("SELECT ref, created_at, meta FROM orders WHERE provider = 'gatevoo' AND status = 'failed' AND meta LIKE '%\"gv_error\"%' ORDER BY id DESC LIMIT 1");
  if (!o) return null;
  const ok = db.one("SELECT created_at FROM orders WHERE provider = 'gatevoo' AND provider_ref IS NOT NULL AND provider_ref != '' AND id > (SELECT id FROM orders WHERE ref = ?) LIMIT 1", o.ref);
  const m = db.json(o.meta, {});
  return { ref: o.ref, at: o.created_at, code: m.gv_error, reason: m.error, resolved: !!ok };
}

// Start a payment. Returns { id, checkout_url, expires_at }.
async function createInvoice(order, user, coin) {
  const list = coins(order.method);
  const preferred = list.includes(coin) ? coin : undefined;
  if (mode() === 'off') { const e = new Error('Gatevoo is off: ' + missing().join(', ')); e.notConfigured = true; throw e; }
  if (mode() === 'sandbox') return { id: 'gv_sbx_' + order.ref, checkout_url: '/pay/gatevoo/' + encodeURIComponent(order.ref) + (preferred ? '?coin=' + preferred : ''), expires_at: new Date(Date.now() + 3600e3).toISOString() };
  // Both Gatevoo contracts are sent: Spyvoo's (reference, amount{}, coins) and the Voo family one in VooSquare's
  // docs/GATEVOO.md (order_id, amount_usd, assets, customer_email). Gatevoo ignores the fields it does not know.
  const inv = await api('POST', '/invoices', {
    reference: order.ref, order_id: order.ref,
    amount: { value: order.amount_usd.toFixed(2), currency: 'USD' }, amount_usd: Number(order.amount_usd.toFixed(2)),
    coins: list, assets: list, preferred_coin: preferred,
    description: 'Spyvoo · ' + order.item_name,
    customer: { email: user.email, name: user.name || '' }, customer_email: user.email,
    success_url: config.appUrl + '/pay/callback?ref=' + encodeURIComponent(order.ref),
    cancel_url: config.appUrl + '/app/plan?cancelled=' + encodeURIComponent(order.ref),
    webhook_url: webhookUrl(),
    expires_in: 3600,
    metadata: { app: 'spyvoo', user_id: order.user_id, plan: order.plan_id, interval: order.interval }
  }, 'spyvoo-' + order.ref);
  const url = inv && (inv.checkout_url || inv.url);
  if (!inv || !inv.id || !/^https:\/\//.test(String(url || ''))) {
    const e = new Error('Gatevoo answered POST ' + cfg().apiUrl + '/invoices without an invoice id and an https checkout_url: ' + JSON.stringify(inv || null).slice(0, 200));
    e.badResponse = true; throw e;
  }
  return { id: String(inv.id), checkout_url: String(url), expires_at: inv.expires_at || null };
}

async function getInvoice(id) { return api('GET', '/invoices/' + encodeURIComponent(id)); }

// Signature header, either form:
//   "t=<unix seconds>,v1=<hex hmac-sha256 of `${t}.${raw body}`>"  (Spyvoo's docs/GATEVOO.md, replay window 5 minutes)
//   "<hex hmac-sha256 of the raw body>"                             (the Voo family contract, Voo Connect's verifyGatevooSignature)
//   "X-Gatevoo-Timestamp: <t>" + "X-Gatevoo-Signature: <hex hmac of `${t}.${raw body}`>" (as Joinvoo accepts it)
function signatureOk(raw, header, now = Date.now(), tsHeader) {
  const secret = cfg().webhookSecret;
  if (!secret || !header) return false;
  if (!/t=/.test(String(header)) && /^\d+$/.test(String(tsHeader || ''))) {
    const t = Number(tsHeader); const sig = String(header).trim().replace(/^sha256=/, '').toLowerCase();
    if (Math.abs(now / 1000 - t) <= SIG_WINDOW_S) {
      const want = crypto.createHmac('sha256', secret).update(t + '.').update(raw).digest('hex');
      if (want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return true;
    }
  }
  if (!/t=/.test(String(header))) return require(require('node:path').join(config.root, 'voo-connect')).verifyGatevooSignature(raw, header, secret);
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
  const ref = String(inv.reference || inv.order_id || '');
  const o = db.one('SELECT * FROM orders WHERE ref = ? AND provider = \'gatevoo\'', ref);
  if (!o) return { ok: false, reason: 'Order not found' };
  if (o.provider_ref && inv.id && String(inv.id) !== o.provider_ref) return { ok: false, reason: 'Invoice does not match this order' };
  const pay = inv.payment || {};
  const paidUsd = Number(inv.paid_usd != null ? inv.paid_usd : inv.paid_amount != null ? inv.paid_amount : pay.amount_usd);
  const coin = String(pay.coin || inv.coin || inv.asset || '');
  const info = {
    coin: COINS[coin] ? coin : (coin || null), tx_hash: pay.tx_hash || inv.tx_hash || null,
    paid_usd: isFinite(paidUsd) ? paidUsd : null, paid_amount: pay.amount != null ? String(pay.amount) : null,
    confirmations: pay.confirmations != null ? Number(pay.confirmations) : null, gv_status: String(inv.status || ''),
    // The paying wallet, when Gatevoo tells us: only ever sent to VooSquare as our own hash (fraud hint).
    payer: typeof (pay.from || pay.from_address || pay.sender) === 'string' ? String(pay.from || pay.from_address || pay.sender).slice(0, 120) : null
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

// Admin "Test payment connection": proves the address, the key and the webhook secret, and says exactly what is wrong.
async function ping() {
  const base = { api_url: cfg().apiUrl, webhook_url: webhookUrl() };
  if (mode() === 'sandbox') return { ok: true, mode: 'sandbox', ...base, message: 'Sandbox mode (PAYMENTS_DEMO is on, no keys): no real coins move. Add GATEVOO_API_KEY and GATEVOO_WEBHOOK_SECRET to take real payments.' };
  if (mode() === 'off') return { ok: false, mode: 'off', code: 'not_configured', ...base, message: missing().join(' and ') + ' on the server, so crypto checkout is hidden from customers.' };
  try {
    const me = await api('GET', '/me');
    const name = me && (me.name || (me.merchant && me.merchant.name));
    return { ok: true, mode: 'live', ...base, message: 'Connected to ' + cfg().apiUrl + (name ? ' as ' + name : '') + '. API key accepted.' };
  } catch (e) {
    const x = explain(e);
    return { ok: false, mode: 'live', code: x.code, ...base, message: x.reason };
  }
}

function status() {
  return { mode: mode(), available: available(), coins: coins().map(c => COINS[c]), api_url: cfg().apiUrl, webhook_url: webhookUrl(), has_key: !!cfg().apiKey, has_secret: !!cfg().webhookSecret, missing: missing(), last_error: lastError() };
}

function txUrl(coin, hash) { return hash && COINS[coin] && !/^sandbox_/.test(hash) ? COINS[coin].explorer + encodeURIComponent(hash) : null; }

module.exports = { COINS, USER_MSG, mode, available, coins, explain, lastError, createInvoice, getInvoice, settle, verify, signatureOk, sign, sandboxPay, ping, status, txUrl, webhookUrl };
