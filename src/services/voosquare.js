'use strict';
// VooSquare: the one account for every Zedapex tool.
// 1. Login: OpenID Connect (Authorization Code + PKCE) against VOO_ISSUER. Users are keyed by voo_id, never by email.
// 2. Summary: GET /api/voosquare/summary gives VooSquare the headline numbers for its dashboard card.
// 3. Events: key moments are queued in voo_outbox and posted (HMAC signed) by a background job, retried for 24 hours.
// 4. Referrals and links: voo_ref is stored once; links to other tools work only while the user keeps them switched on.
// VooSquare never takes or moves money. Payments stay inside Spyvoo.
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');
const { token, hmac, safeEqual } = require('../lib/security');
const { HttpError } = require('../lib/http');

const TOOL = 'spyvoo';
const HOUR = 3600e3;
const cfg = { ...config.voo };
let disco = null; let jwks = null;

const enabled = () => !!(cfg.issuer && cfg.clientId);
const eventsOn = () => !!(cfg.webhookSecret && cfg.eventsUrl);
// Tests and the admin check point this at a different issuer without a restart.
function setConfig(patch) { Object.assign(cfg, patch); disco = null; jwks = null; }
function publicInfo() {
  return { enabled: enabled(), home_url: cfg.homeUrl, dashboard_url: cfg.homeUrl + '/#dashboard', referrals_url: cfg.homeUrl + '/#referrals', connected_url: cfg.homeUrl + '/#connected-tools' };
}

/* ---------------- OIDC ---------------- */
const b64u = buf => Buffer.from(buf).toString('base64url');

async function getJson(url, init) {
  let res;
  try { res = await fetch(url, init); } catch (e) { throw new HttpError(502, 'VooSquare could not be reached. Please try again in a moment.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, 'VooSquare login failed: ' + (data.error_description || data.error || res.status));
  return data;
}

async function discovery() {
  if (disco && disco.at > Date.now() - HOUR) return disco.doc;
  const doc = await getJson(cfg.issuer + '/.well-known/openid-configuration');
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new HttpError(502, 'VooSquare login is not set up correctly (discovery document incomplete).');
  disco = { at: Date.now(), doc };
  return doc;
}

async function keyFor(kid) {
  const find = () => jwks && jwks.keys.find(k => !kid || k.kid === kid);
  if (!jwks || jwks.at < Date.now() - HOUR || !find()) {
    const d = await discovery();
    jwks = { at: Date.now(), keys: (await getJson(d.jwks_uri)).keys || [] };
  }
  const k = find();
  if (!k) throw new HttpError(401, 'VooSquare login could not be verified (unknown signing key).');
  return crypto.createPublicKey({ key: k, format: 'jwk' });
}

// Verifies an ID token's signature, issuer, audience, expiry and nonce. Returns its claims.
async function verifyIdToken(idToken, nonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new HttpError(401, 'VooSquare login could not be verified.');
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url')); claims = JSON.parse(Buffer.from(parts[1], 'base64url')); } catch { throw new HttpError(401, 'VooSquare login could not be verified.'); }
  const algs = { RS256: ['sha256', {}], RS384: ['sha384', {}], RS512: ['sha512', {}], PS256: ['sha256', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }], ES256: ['sha256', { dsaEncoding: 'ieee-p1363' }], ES384: ['sha384', { dsaEncoding: 'ieee-p1363' }] };
  const alg = algs[header.alg];
  if (!alg) throw new HttpError(401, 'VooSquare login uses an unsupported signature (' + header.alg + ').');
  const key = await keyFor(header.kid);
  const ok = crypto.verify(alg[0], Buffer.from(parts[0] + '.' + parts[1]), { key, ...alg[1] }, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new HttpError(401, 'VooSquare login could not be verified (bad signature).');
  const d = await discovery();
  const now = Math.floor(Date.now() / 1000);
  const aud = [].concat(claims.aud || []);
  if (claims.iss !== (d.issuer || cfg.issuer)) throw new HttpError(401, 'VooSquare login came from the wrong issuer.');
  if (!aud.includes(cfg.clientId) || (aud.length > 1 && claims.azp && claims.azp !== cfg.clientId)) throw new HttpError(401, 'VooSquare login was not meant for Spyvoo.');
  if (!claims.exp || claims.exp < now - 60) throw new HttpError(401, 'VooSquare login expired. Please try again.');
  if (claims.iat && claims.iat > now + 300) throw new HttpError(401, 'VooSquare login could not be verified (clock).');
  if (!nonce || !safeEqual(claims.nonce || '', nonce)) throw new HttpError(401, 'VooSquare login could not be verified (nonce).');
  if (!claims.sub) throw new HttpError(401, 'VooSquare login had no Voo ID.');
  return claims;
}

// Login state lives in a short-lived signed cookie, so nothing is stored before the user comes back.
const STATE_COOKIE = 'sv_voo';
const sign = v => v + '.' + hmac('voo-state:' + v).slice(0, 43);
function readState(raw) {
  const s = String(raw || ''); const i = s.lastIndexOf('.');
  if (i < 1 || !safeEqual(sign(s.slice(0, i)), s)) return null;
  try { const o = JSON.parse(Buffer.from(s.slice(0, i), 'base64url')); return o.t > Date.now() - 15 * 60e3 ? o : null; } catch { return null; }
}
const safeReturn = r => ((/^\/app(\/|\?|$)/.test(String(r || '')) || /^\/admin(\/|\?|$)/.test(String(r || '')) || /^\/invite\?/.test(String(r || ''))) && !String(r).startsWith('//') ? String(r).slice(0, 500) : '/app');

async function startLogin(req, res, { returnTo, signup } = {}) {
  const d = await discovery();
  const st = { s: token(18), n: token(18), v: token(32), r: safeReturn(returnTo), t: Date.now() };
  res.cookie(STATE_COOKIE, sign(b64u(JSON.stringify(st))), { maxAge: 900, path: '/auth/voosquare' });
  const q = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId, redirect_uri: cfg.redirectUri, scope: 'openid email profile', state: st.s, nonce: st.n, code_challenge: b64u(crypto.createHash('sha256').update(st.v).digest()), code_challenge_method: 'S256' });
  if (signup) { q.set('screen_hint', 'signup'); q.set('prompt', 'login'); }
  return d.authorization_endpoint + (d.authorization_endpoint.includes('?') ? '&' : '?') + q.toString();
}

async function finishLogin(req, res) {
  const st = readState(req.cookies[STATE_COOKIE]);
  res.cookie(STATE_COOKIE, '', { maxAge: 0, path: '/auth/voosquare' });
  if (req.query.error) throw new HttpError(400, req.query.error === 'access_denied' ? 'Login was cancelled.' : 'VooSquare login failed: ' + String(req.query.error_description || req.query.error).slice(0, 160));
  if (!st || !req.query.code || !safeEqual(String(req.query.state || ''), st.s)) throw new HttpError(400, 'This login link expired or was opened in another browser. Please log in again.');
  const d = await discovery();
  const form = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: cfg.redirectUri, code_verifier: st.v, client_id: cfg.clientId });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const methods = d.token_endpoint_auth_methods_supported || ['client_secret_basic'];
  if (cfg.clientSecret) {
    if (methods.includes('client_secret_basic')) headers.Authorization = 'Basic ' + Buffer.from(encodeURIComponent(cfg.clientId) + ':' + encodeURIComponent(cfg.clientSecret)).toString('base64');
    else form.set('client_secret', cfg.clientSecret);
  }
  const tok = await getJson(d.token_endpoint, { method: 'POST', headers, body: form.toString() });
  const claims = await verifyIdToken(tok.id_token, st.n);
  return { claims, idToken: tok.id_token, returnTo: st.r };
}

async function endSessionUrl(idToken) {
  if (!enabled()) return '/';
  try {
    const d = await discovery();
    if (!d.end_session_endpoint) return '/';
    const q = new URLSearchParams({ client_id: cfg.clientId, post_logout_redirect_uri: config.appUrl + '/' });
    if (idToken) q.set('id_token_hint', idToken);
    return d.end_session_endpoint + (d.end_session_endpoint.includes('?') ? '&' : '?') + q.toString();
  } catch { return '/'; }
}

/* ---------------- users ---------------- */
const cleanCountry = c => (/^[A-Za-z]{2}$/.test(String(c || '')) ? String(c).toUpperCase() : '');

// Finds the user for a Voo ID, or creates one on first login. Accounts made before VooSquare (e.g. the seeded
// admin) are linked once, only when VooSquare says the email is verified. After that, voo_id is the only key.
function userFromClaims(claims) {
  const vooId = String(claims.sub).slice(0, 200);
  const email = String(claims.email || '').trim().toLowerCase().slice(0, 200);
  const name = String(claims.name || claims.given_name || '').trim().slice(0, 80) || (email ? email.split('@')[0] : 'there');
  const country = cleanCountry(claims.country);
  const ref = String(claims.voo_ref || '').trim().slice(0, 64);
  return db.tx(() => {
    let u = db.one('SELECT * FROM users WHERE voo_id = ?', vooId);
    let isNew = false;
    if (!u && email && claims.email_verified === true) {
      // Only link a verified VooSquare email to an existing account, and never auto-link an admin.
      const legacy = db.one("SELECT * FROM users WHERE email = ? AND voo_id IS NULL AND role != 'admin'", email);
      if (legacy) { db.update('users', legacy.id, { voo_id: vooId }); u = db.one('SELECT * FROM users WHERE id = ?', legacy.id); }
    }
    if (!u) {
      if (!email) throw new HttpError(400, 'Your Voo ID has no email address. Add one in VooSquare and try again.');
      if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'This email is already linked to another Voo ID. Contact support and we’ll sort it out.');
      const id = db.insert('users', { email, name, email_verified: claims.email_verified === false ? 0 : 1, voo_id: vooId, referred_by: ref, country, created_at: db.now() });
      u = db.one('SELECT * FROM users WHERE id = ?', id); isNew = true;
    } else {
      const patch = {};
      if (email && email !== u.email && !db.one('SELECT id FROM users WHERE email = ? AND id != ?', email, u.id)) patch.email = email;
      if (claims.name && name !== u.name) patch.name = name;
      if (country && country !== u.country) patch.country = country;
      if (claims.email_verified === true && !u.email_verified) patch.email_verified = 1;
      if (ref && !u.referred_by) patch.referred_by = ref;
      if (Object.keys(patch).length) { db.update('users', u.id, patch); u = { ...u, ...patch }; }
    }
    return { user: u, isNew };
  });
}

/* ---------------- summary ---------------- */
const PERIODS = { '1d': 1, '7d': 7, '30d': 30 };
function summary(vooId, period) {
  const days = PERIODS[period] || 1;
  const p = PERIODS[period] ? period : '1d';
  const u = vooId ? db.one('SELECT * FROM users WHERE voo_id = ?', String(vooId)) : null;
  if (!u) return { tool: TOOL, linked: false };
  const span = days * 864e5; const now = Date.now();
  const d = t => new Date(t).toISOString().slice(0, 10);
  const sum = (col, a, b) => db.one('SELECT COALESCE(SUM(' + col + '), 0) n FROM usage WHERE user_id = ? AND day >= ? AND day < ?', u.id, d(a), d(b)).n;
  const saves = (a, b) => db.one('SELECT COUNT(*) n FROM board_items bi JOIN boards b ON b.id = bi.board_id WHERE b.user_id = ? AND bi.created_at >= ? AND bi.created_at < ?', u.id, new Date(a).toISOString(), new Date(b).toISOString()).n;
  const metric = (key, label, fn) => { const cur = fn(now - span, now + 864e5); const prev = fn(now - 2 * span, now - span); return { key, label, value: cur, unit: 'count', change_pct: prev ? Math.round((cur - prev) / prev * 1000) / 10 : (cur ? 100 : 0) }; };
  const account = require('./account');
  const plan = account.planFor(u);
  return {
    tool: TOOL, linked: true, period: p, open_url: config.appUrl + '/app', status: plan.id === 'free' ? 'trial' : 'active',
    metrics: [
      metric('searches', 'Searches', (a, b) => sum('searches', a, b)),
      metric('ads_saved', 'Ads saved', saves),
      metric('ai_breakdowns', 'AI breakdowns', (a, b) => sum('analyses', a, b)),
      { key: 'advertisers_followed', label: 'Advertisers followed', value: db.one('SELECT COUNT(*) n FROM follows WHERE user_id = ?', u.id).n, unit: 'count', change_pct: 0 }
    ]
  };
}

function checkServiceKey(req) {
  const h = String(req.headers.authorization || '');
  const got = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!cfg.serviceKey || !got || !safeEqual(got, cfg.serviceKey)) throw new HttpError(401, 'Invalid service key');
}

/* ---------------- events ---------------- */
// Queues an event for the user's Voo ID (posted, signed, by the scheduler; retried for 24 hours).
function emit(userId, type, { label, valueUsd } = {}) {
  if (!eventsOn()) return null;
  const u = db.one('SELECT voo_id FROM users WHERE id = ?', userId);
  if (!u || !u.voo_id) return null;
  const body = { event_id: 'sv_' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex'), tool: TOOL, voo_id: u.voo_id, type, occurred_at: new Date().toISOString(), label: String(label || type).slice(0, 120) };
  if (valueUsd != null && Number(valueUsd) > 0) body.value_usd = Math.round(Number(valueUsd) * 100) / 100;
  db.insert('voo_outbox', { event_id: body.event_id, body: JSON.stringify(body), next_at: db.now(), created_at: db.now() });
  return body;
}
function safeEmit(...a) { try { return emit(...a); } catch (e) { console.error('[voosquare] emit', e.message); return null; } }
const signBody = raw => crypto.createHmac('sha256', cfg.webhookSecret).update(raw).digest('hex');

async function flush() {
  if (!eventsOn()) return { sent: 0 };
  const rows = db.all('SELECT * FROM voo_outbox WHERE sent_at IS NULL AND failed_at IS NULL AND next_at <= ? ORDER BY id LIMIT 100', db.now());
  if (!rows.length) return { sent: 0 };
  const events = rows.map(r => { try { return JSON.parse(r.body); } catch { return null; } }).filter(Boolean);
  const raw = JSON.stringify(events.length === 1 ? events[0] : { events });
  let error = '';
  try {
    const res = await fetch(cfg.eventsUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Voo-Signature': signBody(raw) }, body: raw, signal: AbortSignal.timeout(10000) });
    if (!res.ok) error = 'HTTP ' + res.status;
  } catch (e) { error = String(e.message || e).slice(0, 200); }
  const now = Date.now();
  db.tx(() => rows.forEach(r => {
    if (!error) return db.update('voo_outbox', r.id, { sent_at: db.now(), attempts: r.attempts + 1, last_error: '' });
    const attempts = r.attempts + 1;
    db.update('voo_outbox', r.id, { attempts, last_error: error, next_at: new Date(now + Math.min(HOUR, 30e3 * 2 ** Math.min(attempts, 7))).toISOString(), failed_at: now - new Date(r.created_at).getTime() > 24 * HOUR ? db.now() : null });
  }));
  db.run('DELETE FROM voo_outbox WHERE COALESCE(sent_at, failed_at) < ?', new Date(now - 7 * 24 * HOUR).toISOString());
  return error ? { sent: 0, error } : { sent: rows.length };
}

module.exports = { TOOL, enabled, eventsOn, setConfig, publicInfo, discovery, verifyIdToken, startLogin, finishLogin, endSessionUrl, safeReturn, userFromClaims, summary, checkServiceKey, emit, safeEmit, flush, signBody, STATE_COOKIE, cleanCountry };
