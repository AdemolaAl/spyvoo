'use strict';
// VooSquare: the one account for every Zedapex tool, through the Voo Connect kit (./voo-connect, docs/VOOSQUARE.md).
// 1. Login: "Continue with Voo ID" (OAuth 2.0 code, state cookie, id_token check) next to the existing email login.
//    Users are found by voo_id. A Voo ID is linked to an existing Spyvoo account only when (a) that account is logged in
//    and presses "Connect", or (b) VooSquare says the email is verified and it matches (never for admins).
// 2. Affiliate hand-off: ref / vclick / coupon from landing URLs are kept in the voo_attr cookie and sent to /oauth/authorize.
// 3. Events: plan payments (spend + plan_started / plan_renewed), refunds, chargebacks, plan_cancelled, and activity
//    (search_run per user per hour, ad_saved, board_created). Stable event ids built from our row ids.
// 4. Summary card (searches, ads_saved, boards) for VooSquare's dashboard, checked with the API key.
// VooSquare never takes or moves money: payments stay inside Spyvoo (Gatevoo).
const config = require('../config');
const db = require('../db');
const voo = require('../lib/voo');
const { HttpError } = require('../lib/http');

const TOOL = 'spyvoo';
const enabled = () => voo.loginOn();
const eventsOn = () => voo.eventsOn();
const kit = () => voo.get();
const base = () => config.voo.base || 'https://voosquare.com';

// Tests and the admin check point this at a different VooSquare without a restart.
function setConfig(patch) { Object.assign(config.voo, patch); voo.reset(); }

function widget() { return config.voo.on && config.voo.widget && config.voo.base ? { src: config.voo.base + '/widget.js', product: TOOL } : null; }
function publicInfo() {
  return { enabled: enabled(), home_url: base(), app_url: base() + '/app', referrals_url: base() + '/app#referrals', widget: widget() };
}

/* ---------------- login ---------------- */
// Where a login may send people back to: the dashboard, the admin or an invite. VooSquare's launcher asks for /dashboard.
function safeReturn(r) {
  const s = String(r || '');
  if (s === '/dashboard' || s.startsWith('/dashboard?')) return '/app';
  return (/^\/app(\/|\?|$)/.test(s) || /^\/admin(\/|\?|$)/.test(s) || /^\/invite\?/.test(s)) && !s.startsWith('//') && !/[\\\u0000-\u001F]/.test(s) ? s.slice(0, 500) : '/app';
}
function startLogin(req, res, { returnTo, signup } = {}) {
  return kit().startLogin(req, res, { returnTo: safeReturn(returnTo), signup: !!signup });
}
// Checks state, exchanges the code, verifies the id_token. Throws HttpError with a plain message.
async function finishLogin(req, res) {
  try {
    const { user, returnTo } = await kit().handleCallback(req, res);
    return { vu: user, returnTo: safeReturn(returnTo) };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = e && e.code;
    const msg = {
      access_denied: 'Login was cancelled.',
      state_missing: 'This login took too long or was opened in another browser. Please log in again.',
      state_mismatch: 'This login link was opened in another browser. Please log in again.',
      state_expired: 'This login took too long. Please log in again.',
      invalid_grant: 'This login link was already used or has expired. Please log in again.',
      invalid_client: 'Spyvoo’s VooSquare settings are wrong. We’ve been told; please use email login for now.',
      invalid_id_token: 'VooSquare login could not be verified. Please try again.',
      network: 'VooSquare could not be reached. Please try again in a moment.'
    }[code];
    if (!msg) console.error('[voosquare] login', code || '', e && e.message);
    throw new HttpError(code === 'network' ? 502 : 400, msg || 'VooSquare login did not finish. Please try again.');
  }
}
function logoutUrl() { return enabled() ? kit().logoutUrl(config.appUrl + '/') : '/'; }

/* ---------------- users ---------------- */
const cleanCountry = c => (/^[A-Za-z]{2}$/.test(String(c || '')) ? String(c).toUpperCase() : '');

// Finds or creates the Spyvoo user for a Voo ID. current = the user already logged in here (the "Connect" button).
function linkOrCreate(vu, current) {
  const vooId = String(vu.voo_id || vu.sub || '').slice(0, 64);
  if (!vooId) throw new HttpError(400, 'VooSquare did not send a Voo ID.');
  const email = String(vu.email || '').trim().toLowerCase().slice(0, 200);
  const verified = vu.email_verified === true;
  const name = String(vu.name || '').trim().slice(0, 80) || (email ? email.split('@')[0] : 'there');
  const country = cleanCountry(vu.country);
  const ref = String(vu.voo_ref || '').trim().slice(0, 64);
  return db.tx(() => {
    let u = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    let isNew = false; let linked = false;
    if (!u && current) {
      // "Connect your VooSquare account" while logged in with email + password: link THIS account.
      const me = db.one('SELECT * FROM users WHERE id = ?', current.id);
      if (me.voo_id && me.voo_id !== vooId) throw new HttpError(409, 'This Spyvoo account is already connected to another Voo ID.');
      db.update('users', me.id, { voo_id: vooId, ...(verified && email === me.email && !me.email_verified ? { email_verified: 1 } : {}) });
      u = db.one('SELECT * FROM users WHERE id = ?', me.id); linked = true;
    }
    if (!u && email) {
      const legacy = db.one('SELECT * FROM users WHERE email = ?', email);
      if (legacy) {
        if (legacy.voo_id) throw new HttpError(409, 'This email is already connected to another Voo ID. Contact support and we’ll sort it out.');
        if (!verified) throw new HttpError(409, 'There’s already a Spyvoo account with this email. Confirm your email in VooSquare, or log in with your password and press “Connect VooSquare”.');
        if (legacy.role === 'admin') throw new HttpError(409, 'Admin accounts are never connected automatically. Log in with your password, then press “Connect VooSquare” in Account.');
        // VooSquare proved the email. If this Spyvoo account never proved it, someone else may have made it with this
        // email: drop its password and sessions so only the email's owner can get in from now on.
        const patch = { voo_id: vooId, email_verified: 1 };
        if (!legacy.email_verified) {
          patch.password_hash = '';
          db.run('DELETE FROM sessions WHERE user_id = ?', legacy.id);
          db.run("UPDATE tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL AND kind IN ('reset', 'verify')", db.now(), legacy.id);
        }
        db.update('users', legacy.id, patch);
        u = db.one('SELECT * FROM users WHERE id = ?', legacy.id); linked = true;
      }
    }
    if (!u) {
      if (!email) throw new HttpError(400, 'Your Voo ID has no email address. Add one in VooSquare and try again.');
      const id = db.insert('users', { email, name, email_verified: verified ? 1 : 0, voo_id: vooId, referred_by: ref, country, onboarding: JSON.stringify({ tour_seen: false }), created_at: db.now() });
      u = db.one('SELECT * FROM users WHERE id = ?', id); isNew = true;
    } else {
      const patch = {};
      // Follow an email change made in VooSquare (alerts go there), except when the account was connected just now with
      // another address (it keeps its own) and for admins (their break-glass password login uses that address).
      if (!linked && u.role !== 'admin' && email && verified && email !== u.email && !db.one('SELECT id FROM users WHERE email = ? AND id != ?', email, u.id)) patch.email = email;
      if (!u.name && name) patch.name = name;
      if (!u.country && country) patch.country = country;
      if (verified && (patch.email || email === u.email) && !u.email_verified) patch.email_verified = 1;
      if (ref && !u.referred_by) patch.referred_by = ref; // saved once, never changed
      if (Object.keys(patch).length) { db.update('users', u.id, patch); u = { ...u, ...patch }; }
    }
    return { user: u, isNew, linked };
  });
}

/* ---------------- summary card ---------------- */
const PERIODS = { '1d': 1, '7d': 7, '30d': 30 };
function summary(vooId, period) {
  const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
  if (!u || u.suspended) return null;
  const days = PERIODS[period] || 1;
  const span = days * 864e5; const now = Date.now();
  const d = t => new Date(t).toISOString().slice(0, 10);
  const iso = t => new Date(t).toISOString();
  const searches = (a, b) => db.one('SELECT COALESCE(SUM(searches), 0) n FROM usage WHERE user_id = ? AND day > ? AND day <= ?', u.id, d(a), d(b)).n;
  const saves = (a, b) => db.one('SELECT COUNT(*) n FROM board_items bi JOIN boards b ON b.id = bi.board_id WHERE b.user_id = ? AND bi.created_at >= ? AND bi.created_at < ?', u.id, iso(a), iso(b)).n;
  const pct = (cur, prev) => (prev ? Math.round((cur - prev) / prev * 1000) / 10 : (cur ? 100 : 0));
  const metric = (key, label, fn) => { const cur = fn(now - span, now); const prev = fn(now - 2 * span, now - span); return { key, label, value: cur, unit: 'count', change_pct: pct(cur, prev) }; };
  const boardsNow = db.one('SELECT COUNT(*) n FROM boards WHERE user_id = ?', u.id).n;
  const boardsBefore = db.one('SELECT COUNT(*) n FROM boards WHERE user_id = ? AND created_at < ?', u.id, iso(now - span)).n;
  const plan = require('./account').planFor(u);
  return {
    status: plan.id === 'free' ? 'trial' : 'active', open_url: config.appUrl + '/app',
    metrics: [
      metric('searches', 'Searches', searches),
      metric('ads_saved', 'Ads saved', saves),
      { key: 'boards', label: 'Boards', value: boardsNow, unit: 'count', change_pct: pct(boardsNow, boardsBefore) }
    ]
  };
}
// GET /api/voosquare/summary (VooSquare calls it with Authorization: Bearer <VOO_API_KEY>; the kit checks it).
function summaryHandler() {
  if (!eventsOn()) return (req, res) => res.json({ error: 'VooSquare is not connected' }, 404);
  return kit().summaryHandler(async (vooId, period) => summary(vooId, period));
}

/* ---------------- events ---------------- */
const EMAILISH = /[^\s@]+@[^\s@]+\.[a-z]{2,}/gi;
// Labels name the source, never a person: strip anything that looks like an email and control characters.
const label = s => String(s || '').replace(EMAILISH, '').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
// Queues an event. Never throws: a bad event is logged, a VooSquare outage only delays it (the kit retries).
function queue(fn) {
  if (!eventsOn()) return null;
  try { return fn(kit().events); } catch (e) { console.error('[voosquare] event not queued:', e.message); return null; }
}
const vooOf = userId => { const u = db.one('SELECT voo_id, country FROM users WHERE id = ?', userId); return u && u.voo_id ? u : null; };
const eid = (...parts) => kit().events.id(...parts);
const planName = id => ((require('./account').plan(id) || {}).name || String(id));
// Money event ids come from the order reference (SV-<time>-<random>): stable for the order, and never reused, even
// if the database is restored from a backup or rebuilt (row ids restart; VooSquare would drop a repeated id as a
// duplicate and the new payment would never be counted).
const payEventId = order => eid('pay', order.ref);

// A plan payment was fulfilled: spend (commissionable) + plan_started (first payment for this plan) or plan_renewed.
function paymentEvents(order) {
  const u = vooOf(order.user_id);
  if (!u || !eventsOn() || !(order.amount_usd > 0)) return null;
  const prev = db.one("SELECT plan_id FROM orders WHERE user_id = ? AND id != ? AND paid_at IS NOT NULL AND paid_at <= ? ORDER BY paid_at DESC, id DESC LIMIT 1", order.user_id, order.id, order.paid_at || db.now());
  const renewal = !!(prev && prev.plan_id === order.plan_id);
  const plan = planName(order.plan_id);
  const meta = db.json(order.meta, {});
  const signals = {};
  if (meta.payer) signals.payment_fingerprint = kit().hashSignal(meta.payer);
  if (cleanCountry(u.country)) signals.payment_country = cleanCountry(u.country);
  const out = queue(ev => {
    const spend = ev.spend({ eventId: payEventId(order), vooId: u.voo_id, valueUsd: order.amount_usd, plan, label: label('Spyvoo ' + plan + ', ' + (order.interval === 'year' ? 'yearly' : 'monthly')), occurredAt: order.paid_at || undefined, country: cleanCountry(u.country) || undefined, signals });
    const price = order.list_usd > 0 ? order.list_usd : order.amount_usd;
    if (renewal) ev.planRenewed({ eventId: eid('renew', order.ref), vooId: u.voo_id, plan, valueUsd: price, label: label('Spyvoo ' + plan), occurredAt: order.paid_at || undefined });
    else ev.planStarted({ eventId: eid('plan', order.ref), vooId: u.voo_id, plan, valueUsd: price, label: label('Spyvoo ' + plan), occurredAt: order.paid_at || undefined });
    return { spend: spend.event_id, renewal };
  });
  // Remember who VooSquare credited for this payment: a refund or chargeback later goes to the same Voo ID, even if
  // the account was deleted or unlinked since (otherwise a chargeback could never claw the commission back).
  if (out) {
    try {
      const cur = db.one('SELECT meta FROM orders WHERE id = ?', order.id);
      db.update('orders', order.id, { meta: JSON.stringify({ ...db.json(cur && cur.meta, {}), voo_id: u.voo_id, voo_spend: out.spend }) });
    } catch (e) { console.error('[voosquare] order meta', e.message); }
  }
  return out;
}
// The Voo ID that got the spend for this order, or null when VooSquare never heard of the payment (then a refund or
// chargeback has nothing to point at and is not sent).
const paidVoo = order => {
  const m = typeof order.meta === 'string' ? db.json(order.meta, {}) : (order.meta || {});
  return m.voo_id && m.voo_spend ? { voo_id: String(m.voo_id), spend: String(m.voo_spend) } : null;
};
// Money returned for a paid order. Logged by VooSquare; never reverses commission.
function refundEvent(order, valueUsd) {
  const p = paidVoo(order);
  if (!p) return null;
  return queue(ev => ev.refund({ eventId: eid('rf', order.ref), vooId: p.voo_id, valueUsd, plan: planName(order.plan_id), originalEventId: p.spend, label: label('Refund, Spyvoo ' + planName(order.plan_id)) }).event_id);
}
// A disputed payment: reverses the commission of that spend.
function chargebackEvent(order, valueUsd) {
  const p = paidVoo(order);
  if (!p) return null;
  return queue(ev => ev.chargeback({ eventId: eid('cb', order.ref), vooId: p.voo_id, valueUsd, plan: planName(order.plan_id), originalEventId: p.spend, label: label('Chargeback, Spyvoo ' + planName(order.plan_id)) }).event_id);
}
function planCancelled(userId, planId, key) {
  const u = vooOf(userId);
  if (!u) return null;
  return queue(ev => ev.planCancelled({ eventId: eid('cancel', u.voo_id, key), vooId: u.voo_id, plan: planName(planId), label: label('Spyvoo ' + planName(planId) + ' ended') }).event_id);
}
// ad_saved / board_created (one event per row; ids from our row ids).
function activity(userId, type, parts, text) {
  const u = vooOf(userId);
  if (!u) return null;
  return queue(ev => ev.activity(type, { eventId: eid(...parts), vooId: u.voo_id, label: label(text) || type }).event_id);
}
// Searches: counted per user per hour; the hour is sent once it is over (flushActivity).
const hourOf = t => new Date(t).toISOString().slice(0, 13);
function countSearch(user) {
  if (!eventsOn() || !user || !user.voo_id) return;
  try { db.run('INSERT INTO voo_activity (user_id, hour, searches) VALUES (?, ?, 1) ON CONFLICT(user_id, hour) DO UPDATE SET searches = searches + 1', user.id, hourOf(Date.now())); } catch (e) { console.error('[voosquare] search count', e.message); }
}
function flushActivity({ now = Date.now() } = {}) {
  if (!eventsOn()) return 0;
  let n = 0;
  for (const r of db.all('SELECT a.*, u.voo_id FROM voo_activity a JOIN users u ON u.id = a.user_id WHERE a.hour < ?', hourOf(now))) {
    if (r.voo_id && r.searches > 0) queue(ev => ev.activity('search_run', { eventId: eid('search', r.voo_id, r.hour), vooId: r.voo_id, label: r.searches + ' search' + (r.searches === 1 ? '' : 'es'), occurredAt: r.hour + ':59:59Z' }));
    db.run('DELETE FROM voo_activity WHERE user_id = ? AND hour = ?', r.user_id, r.hour);
    n++;
  }
  return n;
}
// Scheduler job: close finished hours, then send what is queued (the kit's own timer also sends every few seconds).
async function flush() {
  if (!eventsOn()) return { sent: 0 };
  const hours = flushActivity();
  const r = await kit().events.flush();
  db.run('DELETE FROM voo_failed WHERE created_at < ?', new Date(Date.now() - 90 * 864e5).toISOString());
  return { hours, stored: r.stored, pending: r.pending, rejected: r.rejected.length };
}
function status() {
  const k = eventsOn() ? kit() : null;
  return {
    login: enabled(), events: eventsOn(), widget: !!widget(), base: config.voo.base, client_id: config.voo.clientId, redirect_uri: config.voo.redirectUri,
    summary_url: config.appUrl + '/api/voosquare/summary', logout_uri: config.appUrl + '/', pending: k ? k.events.pending().length : 0,
    failed: db.all('SELECT event_id, type, error, created_at FROM voo_failed ORDER BY id DESC LIMIT 20')
  };
}

module.exports = {
  TOOL, enabled, eventsOn, setConfig, publicInfo, widget, safeReturn, startLogin, finishLogin, logoutUrl, linkOrCreate, cleanCountry,
  summary, summaryHandler, paymentEvents, refundEvent, chargebackEvent, planCancelled, activity, countSearch, flushActivity, flush, status, label, payEventId
};
