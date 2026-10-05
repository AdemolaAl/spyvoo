'use strict';
// Shared test helpers: boots one app per test file (src/db.js keeps a single module-level
// connection), simulated users with cookie jars, and direct DB access for assertions.
process.env.NODE_ENV = 'test';
process.env.PAYMENTS_DEMO = 'true';
process.env.SV_QUIET = '1';
process.env.MAIL_PROVIDER = 'log';
process.env.APP_URL = 'http://localhost:3000';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TRANSCRIBE_API_KEY;
delete process.env.APIFY_TOKEN;
delete process.env.GATEVOO_API_KEY;
delete process.env.GATEVOO_WEBHOOK_SECRET;
delete process.env.VOO_ISSUER;
delete process.env.VOO_CLIENT_ID;
process.env.DEMO_ADS = 'true';
process.env.TRUST_PROXY = 'true'; // the test clients act as different visitors behind a proxy (x-forwarded-for)
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Outbound network is never available in tests: every non-local fetch fails fast and is recorded.
const realFetch = globalThis.fetch;
const outbound = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const host = new URL(url).hostname;
  if (host === '127.0.0.1' || host === 'localhost') return realFetch(input, init);
  outbound.push({ url, body: init && init.body });
  throw new TypeError('fetch failed (network disabled in tests): ' + host);
};

// Quiet the expected noise (mail log, provider failures) unless SV_TEST_VERBOSE is set.
if (!process.env.SV_TEST_VERBOSE) {
  for (const k of ['log', 'warn', 'error']) {
    const orig = console[k];
    console[k] = (...a) => { if (process.env.SV_TEST_VERBOSE) orig(...a); };
  }
}

let booted = null;

async function boot({ seed = true, demo = true } = {}) {
  if (booted) return booted;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
  const dbFile = path.join(dir, 'test.db');
  const { build } = require('../src/server');
  const app = build({ dbFile, scheduler: false });
  if (seed) require('../scripts/seed').seed({ demo });
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const db = require('../src/db');
  booted = {
    app, server, base, db, dbFile,
    async close() {
      await new Promise(r => { server.close(() => r()); server.closeAllConnections(); });
      try { db.raw.close(); } catch { /* ignore */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
      booted = null;
    }
  };
  return booted;
}

let ipSeq = 0;
// A simulated browser: own cookie jar and own IP (so per-IP rate limits don't collide).
function client(base = booted && booted.base) {
  const jar = new Map();
  const ip = '10.' + ((process.pid >> 8) & 255) + '.' + ((process.pid) & 255) + '.' + (++ipSeq % 250 + 1);
  const c = {
    jar, ip,
    cookie() { return [...jar].map(([k, v]) => k + '=' + v).join('; '); },
    async req(method, p, body, opts = {}) {
      const headers = { 'x-forwarded-for': c.ip, ...(opts.headers || {}) };
      if (opts.csrf !== false && !['GET', 'HEAD'].includes(method)) headers['x-sv'] = '1';
      if (jar.size) headers.cookie = c.cookie();
      let payload;
      if (body !== undefined) {
        if (opts.raw) payload = body;
        else if (opts.form) { payload = new URLSearchParams(body).toString(); headers['content-type'] = 'application/x-www-form-urlencoded'; }
        else { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
      }
      const res = await realFetch(base + p, { method, headers, body: payload, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie()) {
        const [pair, ...attrs] = sc.split(';');
        const i = pair.indexOf('=');
        const k = pair.slice(0, i).trim(); const v = pair.slice(i + 1).trim();
        const maxAge = attrs.map(a => a.trim()).find(a => /^max-age=/i.test(a));
        if (v === '' || (maxAge && Number(maxAge.split('=')[1]) <= 0)) jar.delete(k); else jar.set(k, v);
      }
      const text = await res.text();
      let json = null;
      if ((res.headers.get('content-type') || '').includes('application/json')) { try { json = JSON.parse(text); } catch { /* not json */ } }
      return { status: res.status, headers: res.headers, text, body: json, location: res.headers.get('location') };
    },
    get(p, o) { return c.req('GET', p, undefined, o); },
    post(p, b = {}, o) { return c.req('POST', p, b, o); },
    put(p, b = {}, o) { return c.req('PUT', p, b, o); },
    del(p, o) { return c.req('DELETE', p, undefined, o); }
  };
  return c;
}

async function login(email, password) {
  const c = client();
  const r = await c.post('/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error('login failed for ' + email + ': ' + r.status + ' ' + r.text);
  return c;
}

let signupSeq = 0;
async function signup(extra = {}, c = client()) {
  const email = extra.email || ('user' + (++signupSeq) + '-' + crypto.randomBytes(3).toString('hex') + '@example.com');
  const r = await c.post('/api/auth/signup', { email, password: 'password123', name: 'Test User', country: 'BR', ...extra });
  if (r.status !== 200) throw new Error('signup failed: ' + r.status + ' ' + r.text);
  const db = require('../src/db');
  const user = db.one('SELECT * FROM users WHERE email = ?', email.toLowerCase());
  return { client: c, email, user };
}

// An admin made straight in the database.
async function admin() {
  const db = require('../src/db');
  const { hashPassword } = require('../src/lib/security');
  const email = 'admin-' + crypto.randomBytes(3).toString('hex') + '@example.com';
  db.insert('users', { email, name: 'Admin', password_hash: hashPassword('admin12345'), email_verified: 1, role: 'admin', plan_id: 'agency', plan_renews_at: '2099-12-31T00:00:00.000Z', created_at: db.now() });
  return login(email, 'admin12345');
}

function setPlan(userId, plan) {
  const db = require('../src/db');
  db.update('users', userId, { plan_id: plan, plan_renews_at: plan === 'free' ? null : new Date(Date.now() + 30 * 864e5).toISOString() });
}

function emails(to, template) {
  const db = require('../src/db');
  return db.all('SELECT * FROM email_log WHERE to_email = ?' + (template ? ' AND template = ?' : '') + ' ORDER BY id', ...(template ? [to, template] : [to]));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { boot, client, login, signup, admin, setPlan, emails, sleep, outbound, realFetch };
