'use strict';
// Helpers to run a real VooSquare (the voosquare-app repo, read-only) next to Spyvoo in tests and in the end-to-end
// script: boot it, sign people up with the dev login code, register the Spyvoo product and an approved affiliate.
// The VooSquare checkout is found at VOOSQUARE_DIR (default: a fresh copy of the current hub at /tmp/claude-0/sv/hub-src,
// then ../voosquare-app next to this repo, then the older snapshot /tmp/claude-0/snap2/app). It is only ever read, never edited.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function hubDir() {
  const tries = [process.env.VOOSQUARE_DIR, '/tmp/claude-0/sv/hub-src', path.resolve(__dirname, '..', '..', 'voosquare-app'), '/tmp/claude-0/snap2/app'].filter(Boolean);
  return tries.find(d => fs.existsSync(path.join(d, 'server.js')) && fs.existsSync(path.join(d, 'sdk', 'voo-connect'))) || '';
}
const portFree = port => new Promise(resolve => { const s = net.createServer(); s.once('error', () => resolve(false)); s.listen(port, '127.0.0.1', () => s.close(() => resolve(true))); });
async function freePorts(from, to, n) { const out = []; for (let p = from; p <= to && out.length < n; p++) if (await portFree(p)) out.push(p); return out; }
async function waitHttp(url, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* booting */ } await sleep(100); } return false; }

/** Browser-like cookie jar keyed by host name (browsers ignore ports), honouring Max-Age=0. */
class Jar {
  constructor() { this.c = []; }
  set(host, header) {
    const [kv, ...attrs] = header.split(';').map(s => s.trim());
    const i = kv.indexOf('='); const name = kv.slice(0, i); const value = kv.slice(i + 1);
    const at = Object.fromEntries(attrs.map(a => { const j = a.indexOf('='); return j < 0 ? [a.toLowerCase(), true] : [a.slice(0, j).toLowerCase(), a.slice(j + 1)]; }));
    const domain = at.domain ? String(at.domain).replace(/^\./, '').toLowerCase() : host;
    this.c = this.c.filter(x => !(x.name === name && x.domain === domain));
    if (value !== '' && at['max-age'] !== '0') this.c.push({ name, value, domain, raw: header });
  }
  header(host) { return this.c.filter(x => x.domain === host).map(x => x.name + '=' + x.value).join('; '); }
  get(name, host) { return this.c.find(x => x.name === name && (!host || x.domain === host)); }
  names(host) { return this.c.filter(x => !host || x.domain === host).map(x => x.name); }
  clear(host) { this.c = this.c.filter(x => x.domain !== host); }
}
let ipn = 0;
class Browser {
  constructor() { this.jar = new Jar(); this.ip = '10.88.' + Math.floor(++ipn / 250) + '.' + ((ipn % 250) + 1); }
  req(method, url, { body, form, headers = {} } = {}) {
    const u = new URL(url);
    const h = { host: u.host, 'user-agent': UA, 'x-forwarded-for': this.ip, 'x-vs': '1', 'x-sv': '1', ...headers };
    const ck = this.jar.header(u.hostname); if (ck) h.cookie = ck;
    let payload;
    if (form) { payload = new URLSearchParams(form).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; }
    else if (body !== undefined) { payload = JSON.stringify(body); h['content-type'] = 'application/json'; }
    if (payload) h['content-length'] = Buffer.byteLength(payload);
    return new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port: Number(u.port), method, path: u.pathname + u.search, headers: h }, res => {
        const set = [].concat(res.headers['set-cookie'] || []);
        for (const c of set) this.jar.set(u.hostname, c);
        let t = ''; res.on('data', d => { t += d; });
        res.on('end', () => { let data; try { data = JSON.parse(t); } catch { data = t; } resolve({ status: res.statusCode, data, location: res.headers.location || '', cookies: set, headers: res.headers }); });
      });
      r.on('error', reject); if (payload) r.write(payload); r.end();
    });
  }
  get(u, o) { return this.req('GET', u, o); }
  post(u, o) { return this.req('POST', u, o); }
  put(u, o) { return this.req('PUT', u, o); }
}

/** Boots VooSquare on port (BASE_URL http://127.0.0.1:<port>). Returns { base, proc, stop(), log(), sql }. */
async function startHub({ port, dir = hubDir(), data }) {
  if (!dir) throw new Error('VooSquare checkout not found (set VOOSQUARE_DIR)');
  fs.mkdirSync(data, { recursive: true });
  const db = path.join(data, 'hub.db');
  for (const f of [db, db + '-wal', db + '-shm']) fs.rmSync(f, { force: true });
  const base = 'http://127.0.0.1:' + port;
  let log = '';
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), BASE_URL: base, DATABASE_PATH: db, UPLOADS_DIR: path.join(data, 'uploads'), BACKUPS_DIR: path.join(data, 'backups'), VOICE_DIR: path.join(data, 'voice'), OWNER_EMAIL: 'owner@test.local', NODE_ENV: 'test', TRUST_PROXY: '1', EMAIL_PROVIDER: '', AFF_JOBS: 'off', AFFILIATE_URL: '', SCHOOL_EXTRA_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.on('data', d => { log += d; }); proc.stderr.on('data', d => { log += d; });
  if (!(await waitHttp(base + '/healthz'))) { proc.kill(); throw new Error('VooSquare did not boot: ' + log.slice(-600)); }
  const { DatabaseSync } = require('node:sqlite');
  const sql = new DatabaseSync(db); sql.exec('PRAGMA busy_timeout=5000');
  return { base, proc, dbFile: db, sql, log: () => log, q1: (s, ...a) => sql.prepare(s).get(...a), qa: (s, ...a) => sql.prepare(s).all(...a),
    async stop() { try { sql.close(); } catch { /* ignore */ } proc.kill('SIGTERM'); await new Promise(r => { proc.once('exit', r); setTimeout(r, 3000); }); } };
}

/** Voo ID sign-up / login with the dev code (NODE_ENV=test answers with it). */
async function hubLogin(b, base, email, name, product) {
  const s = await b.post(base + '/api/auth/start', { body: { email, name, product } });
  if (!s.data || !s.data.dev_code) throw new Error('no dev_code: ' + JSON.stringify(s.data).slice(0, 200));
  const v = await b.post(base + '/api/auth/verify', { body: { email, code: s.data.dev_code } });
  return v.data && v.data.user;
}

/** The owner registers Spyvoo (it is seeded as a product) for a local tool URL and reads the three credentials. */
async function setupSpyvoo(hub, toolUrl) {
  const owner = new Browser();
  const ownerUser = await hubLogin(owner, hub.base, 'owner@test.local', 'Owner');
  const list = await owner.get(hub.base + '/api/admin/products');
  const sp = (list.data.products || []).find(p => p.slug === 'spyvoo');
  const body = { ...(sp ? { id: sp.id } : { slug: 'spyvoo' }), name: 'Spyvoo', url: toolUrl, sso: true, status: 'live', visible: 1, stage: 'Research', tagline: 'Spy on winning ads', icon: 'spyvoo', color: '#3355F0',
    redirect_uris: [toolUrl + '/auth/voosquare/callback', toolUrl + '/'], summary_url: toolUrl + '/api/voosquare/summary' };
  const saved = await owner.post(hub.base + '/api/admin/products', { body });
  const prod = saved.data && saved.data.product;
  if (!prod || !prod.client_id) throw new Error('product save failed: ' + JSON.stringify(saved.data).slice(0, 300));
  return { owner, ownerUser, prod, cred: { clientId: prod.client_id, clientSecret: prod.client_secret, apiKey: prod.api_key } };
}

/** An approved, activated affiliate (earnings show at once). Returns the affiliate row. */
async function setupAffiliate(hub, owner, email = 'ama@test.local') {
  const aff = new Browser(); await hubLogin(aff, hub.base, email, 'Ama Affiliate');
  await aff.post(hub.base + '/api/aff/account', { body: {} });
  await aff.put(hub.base + '/api/aff/application/1', { body: { display_name: 'Ama', country: 'NG', telegram: '@ama_sv', kind: 'individual' } });
  await aff.put(hub.base + '/api/aff/application/2', { body: { sources: ['Meta ads'], geos: ['NG'], volume: '$10k–$50k', products: ['spyvoo'] } });
  await aff.put(hub.base + '/api/aff/application/3', { body: { years: '3–5', plan: 'Meta ads to Spyvoo for Nigerian media buyers, plus a Telegram channel with reviews.', links: ['https://t.me/x'] } });
  const acct = (await aff.put(hub.base + '/api/aff/application/4', { body: { accept_terms: true, no_income_claims: true, adult: true, usdt: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE' } })).data.account;
  const appr = await owner.post(hub.base + '/api/admin/aff/applications/' + acct.id + '/approve', { body: {} });
  if (appr.status !== 200) throw new Error('approve failed: ' + JSON.stringify(appr.data).slice(0, 200));
  hub.sql.prepare('UPDATE aff_affiliates SET activated_at=? WHERE id=?').run(Date.now() - 86400000, acct.id);
  return { browser: aff, row: hub.q1('SELECT * FROM aff_affiliates WHERE id=?', acct.id) };
}

module.exports = { hubDir, freePorts, waitHttp, Jar, Browser, startHub, hubLogin, setupSpyvoo, setupAffiliate, sleep };
