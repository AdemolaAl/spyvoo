'use strict';
// Voo Connect inside Spyvoo, against a small fake VooSquare (always runs; the real hub is in voosquare-hub.test.js):
// feature flag, login start/callback, linking rules, money and activity event shapes, summary auth, widget and CSP.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

const SECRET = 'vss_test_secret_0123456789';
const KEY = 'vsk_test_key_0123456789';
const fake = { events: [], codes: new Map(), next: null };
let hubUrl; let hubServer;
const jwt = (payload, secret) => {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const hd = b({ alg: 'HS256', typ: 'JWT' }); const p = b(payload);
  return hd + '.' + p + '.' + crypto.createHmac('sha256', secret).update(hd + '.' + p).digest('base64url');
};

test.before(async () => {
  hubServer = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = ''; req.on('data', d => { body += d; });
    req.on('end', () => {
      if (u.pathname === '/oauth/token') {
        const f = new URLSearchParams(body);
        const who = fake.codes.get(f.get('code'));
        if (f.get('client_secret') !== SECRET) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_client"}'); }
        if (!who) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
        fake.codes.delete(f.get('code'));
        const now = Math.floor(Date.now() / 1000);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ access_token: 'vsat_x', token_type: 'Bearer', expires_in: 3600, id_token: jwt({ sub: who.voo_id, voo_id: who.voo_id, aud: 'vsc_test', iss: hubUrl, iat: now, exp: now + 600, email: who.email, email_verified: who.email_verified !== false }, who.secret || SECRET), user: { email_verified: true, country: 'NG', voo_ref: 'refx1', ...who, sub: who.voo_id } }));
      }
      if (u.pathname === '/api/v1/events') {
        if (req.headers.authorization !== 'Bearer ' + KEY) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":"Unknown API key"}'); }
        const all = JSON.parse(body).events;
        // Like the live hub: a malformed event is answered in `rejected` (kept for good), the rest is stored.
        const bad = all.filter(e => /^sv_reject/.test(e.event_id)); const evs = all.filter(e => !bad.includes(e));
        fake.events.push(...evs);
        res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, stored: evs.length, rejected: bad.map(e => ({ event_id: e.event_id, error: 'refused by the test hub' })) }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise(r => hubServer.listen(0, '127.0.0.1', r));
  hubUrl = 'http://127.0.0.1:' + hubServer.address().port;
  await h.boot();
});
test.after(async () => { await (await h.boot()).close(); hubServer.close(); });

const voo = () => require('../src/services/voosquare');
function on(extra = {}) { voo().setConfig({ on: true, base: hubUrl, clientId: 'vsc_test', clientSecret: SECRET, apiKey: KEY, redirectUri: 'http://localhost:3000/auth/voosquare/callback', widget: true, ...extra }); }
function off() { voo().setConfig({ on: true, base: '', clientId: '', clientSecret: '', apiKey: '' }); }
// An email + password account made while VooSquare is off (an account from before Voo ID).
async function plainSignup(x) { const was = voo().enabled(); off(); try { return await h.signup(x); } finally { if (was) on(); } }
// One full login through Spyvoo's routes: start (state cookie) → fake code → callback.
async function vooLogin(c, who, { start = '/auth/voosquare' } = {}) {
  const s = await c.get(start);
  assert.equal(s.status, 302, s.text);
  const az = new URL(s.location);
  const code = 'code_' + crypto.randomBytes(6).toString('hex');
  fake.codes.set(code, who);
  return c.get('/auth/voosquare/callback?code=' + code + '&state=' + encodeURIComponent(az.searchParams.get('state')));
}
const flush = () => require('../src/lib/voo').get().events.flush();

test('VooSquare off (default): email sign-up as before, no Voo routes, no widget', async () => {
  off();
  const c = h.client();
  assert.equal((await c.get('/auth/voosquare')).location, '/login');
  assert.equal((await c.get('/signup')).status, 200);
  const home = await c.get('/');
  assert.ok(!home.text.includes('/widget.js'));
  assert.ok(!home.text.includes('voo-connect-browser.js'));
  assert.match(home.headers.get('content-security-policy'), /script-src 'self' 'sha256-/);
  assert.equal((await c.get('/api/voosquare/summary?voo_id=x')).status, 404);
  await h.signup();
});

test('VOO_CONNECT=off is a kill switch even with credentials', async () => {
  on({ on: false });
  assert.equal(voo().enabled(), false);
  assert.equal(voo().eventsOn(), false);
  assert.equal((await h.client().get('/auth/voosquare')).location, '/login');
  off();
});

test('login start: state cookie, prompt=signup, ref/vclick hand-off, return_to kept on site', async () => {
  on();
  const c = h.client();
  const land = await c.get('/?ref=amaref1&vclick=Click00001&sub1=x');
  assert.ok(c.jar.get('voo_attr'), 'landing keeps the click');
  assert.ok(land.text.includes('<script src="/voo-connect-browser.js" defer></script>'));
  // Spyvoo's own support agent owns the chat corner while it is on; the VooSquare widget shows when it is off.
  assert.ok(land.text.includes('/js/support-chat.js') && !land.text.includes('/widget.js'), 'one chat bubble: Spyvoo support');
  require('../src/services/settings').set('support', { on: false });
  const land2 = await c.get('/?ref=amaref1&vclick=Click00001&sub1=x');
  require('../src/services/settings').set('support', { on: true });
  assert.ok(land2.text.includes(hubUrl + '/widget.js" data-product="spyvoo"'));
  assert.ok(land.headers.get('content-security-policy').includes(hubUrl), 'CSP lets the widget load and call VooSquare');
  const s = await c.get('/signup?next=/app/plan');
  assert.equal(s.location, '/auth/voosquare?signup=1&return_to=%2Fapp%2Fplan');
  const st = await c.get(s.location);
  const az = new URL(st.location);
  assert.equal(az.origin + az.pathname, hubUrl + '/oauth/authorize');
  assert.equal(az.searchParams.get('prompt'), 'signup');
  assert.equal(az.searchParams.get('ref'), 'amaref1');
  assert.equal(az.searchParams.get('vclick'), 'Click00001');
  assert.equal(az.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/voosquare/callback');
  for (const evil of ['//evil.example/x', 'https://evil.example', '/\\evil.example', '/legal/terms']) assert.equal(voo().safeReturn(evil), '/app', evil);
  assert.equal(voo().safeReturn('/dashboard'), '/app');
  assert.equal(voo().safeReturn('/invite?token=abc'), '/invite?token=abc');
  // Log in page shows both ways in; email login is never turned off.
  assert.equal((await h.client().get('/login')).status, 200);
});

test('callback: new Voo ID → new user (country, voo_ref), welcome; bad state / reused code / wrong secret → "Login did not finish"', async () => {
  on();
  const c = h.client();
  const r = await vooLogin(c, { voo_id: 'vs_new1', email: 'newbie@example.com', name: 'New Bie' });
  assert.equal(r.status, 302, r.text);
  assert.equal(r.location, '/app?welcome=1');
  const u = h.boot && require('../src/db').one("SELECT * FROM users WHERE voo_id = 'vs_new1'");
  assert.equal(u.email, 'newbie@example.com');
  assert.equal(u.country, 'NG');
  assert.equal(u.referred_by, 'refx1');
  assert.equal(u.email_verified, 1);
  assert.equal(h.emails('newbie@example.com', 'welcome').length, 1);
  const again = await vooLogin(h.client(), { voo_id: 'vs_new1', email: 'newbie@example.com', name: 'Changed', voo_ref: 'other' });
  assert.equal(again.location, '/app');
  assert.equal(require('../src/db').one("SELECT referred_by FROM users WHERE voo_id = 'vs_new1'").referred_by, 'refx1', 'voo_ref saved once');
  const bad = await h.client().get('/auth/voosquare/callback?code=x&state=y');
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Login did not finish/);
  const wrong = await vooLogin(h.client(), { voo_id: 'vs_forged', email: 'forged@example.com', secret: 'not-the-secret' });
  assert.equal(wrong.status, 400);
  assert.equal(require('../src/db').one("SELECT id FROM users WHERE voo_id = 'vs_forged'"), null, 'a forged id_token never logs in');
});

test('linking: verified email links a normal account; unverified VooSquare email or an admin never does', async () => {
  on();
  const db = require('../src/db');
  const { user } = await plainSignup({ email: 'keeper@example.com' });
  db.update('users', user.id, { email_verified: 1 });
  const r = await vooLogin(h.client(), { voo_id: 'vs_keeper', email: 'keeper@example.com', name: 'Keeper' });
  assert.equal(r.location, '/app?voo=linked');
  assert.equal(db.one('SELECT voo_id FROM users WHERE id = ?', user.id).voo_id, 'vs_keeper');
  assert.ok(db.one('SELECT password_hash FROM users WHERE id = ?', user.id).password_hash, 'verified account keeps its password');
  const { user: u2 } = await plainSignup({ email: 'unproven@example.com' });
  const r2 = await vooLogin(h.client(), { voo_id: 'vs_unproven', email: 'unproven@example.com', email_verified: false });
  assert.equal(r2.status, 409);
  assert.equal(db.one('SELECT voo_id FROM users WHERE id = ?', u2.id).voo_id, null);
  const adm = await h.admin();
  const aEmail = (await adm.get('/api/auth/me')).body.user.email;
  const r3 = await vooLogin(h.client(), { voo_id: 'vs_admin_try', email: aEmail });
  assert.equal(r3.status, 409);
  // The admin connects deliberately while logged in.
  const r4 = await vooLogin(adm, { voo_id: 'vs_admin', email: 'someone-else@example.com' });
  assert.equal(r4.status, 302);
  assert.equal(db.one('SELECT voo_id FROM users WHERE email = ?', aEmail).voo_id, 'vs_admin');
  // A Voo ID already used by one account cannot be attached to another one.
  const other = (await plainSignup()).client;
  const r5 = await vooLogin(other, { voo_id: 'vs_admin', email: 'x@example.com' });
  assert.equal(r5.status, 302, 'logs into the account that owns the Voo ID instead');
  assert.equal((await other.get('/api/auth/me')).body.user.email, aEmail);
});

test('with VooSquare on: new accounts come from Voo ID; password login, forgot and reset keep working', async () => {
  on();
  const c = h.client();
  const s = await c.post('/api/auth/signup', { email: 'late@example.com', password: 'password123', name: 'L', country: 'BR' });
  assert.equal(s.status, 403);
  assert.equal(s.body.login_url, '/auth/voosquare?signup=1');
  const { email } = await plainSignup();
  assert.equal((await h.client().post('/api/auth/login', { email, password: 'password123' })).status, 200);
  assert.equal((await h.client().post('/api/auth/forgot', { email })).status, 200);
  assert.equal(h.emails(email, 'password-reset').length, 1);
});

test('money events: spend + plan_started, renewal, refund and chargeback with original_event_id, plan_cancelled', async () => {
  on();
  fake.events.length = 0;
  const db = require('../src/db');
  const c = h.client();
  await vooLogin(c, { voo_id: 'vs_payer', email: 'payer@example.com', name: 'Payer' });
  const payOnce = async () => {
    const co = await c.post('/api/app/checkout', { plan: 'pro', interval: 'month', method_id: 0 });
    assert.equal(co.status, 200, co.text);
    await c.req('POST', co.body.checkout_url, {}, { form: true, headers: { origin: 'http://localhost:3000' } });
    return db.one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  };
  const o1 = await payOnce();
  const o2 = await payOnce();
  assert.equal(o1.status, 'paid');
  const adm = await h.admin();
  assert.equal((await adm.post('/api/admin/orders/' + o1.ref + '/refund', { amount: 10 })).status, 200);
  assert.equal((await adm.post('/api/admin/orders/' + o2.ref + '/chargeback', {})).status, 200);
  assert.equal((await adm.post('/api/admin/orders/' + o2.ref + '/refund', {})).status, 400, 'a charged-back order cannot be refunded');
  await flush();
  const by = id => fake.events.find(e => e.event_id === id);
  const sp = by('sv_pay_' + o1.ref);
  assert.equal(sp.type, 'spend'); assert.equal(sp.voo_id, 'vs_payer'); assert.equal(sp.value_usd, o1.amount_usd); assert.equal(sp.plan, 'Pro');
  assert.equal(sp.label, 'Spyvoo Pro, monthly'); assert.equal(sp.country, 'NG'); assert.equal(sp.signals.payment_country, 'NG');
  assert.equal(by('sv_plan_' + o1.ref).type, 'plan_started');
  assert.equal(by('sv_pay_' + o2.ref).type, 'spend');
  assert.equal(by('sv_renew_' + o2.ref).type, 'plan_renewed');
  assert.ok(!by('sv_plan_' + o2.ref), 'a renewal is not a new plan');
  const rf = by('sv_rf_' + o1.ref);
  assert.equal(rf.type, 'refund'); assert.equal(rf.value_usd, 10); assert.equal(rf.original_event_id, 'sv_pay_' + o1.ref);
  const cb = by('sv_cb_' + o2.ref);
  assert.equal(cb.type, 'chargeback'); assert.equal(cb.value_usd, o2.amount_usd); assert.equal(cb.original_event_id, 'sv_pay_' + o2.ref);
  assert.ok(fake.events.some(e => e.type === 'plan_cancelled' && e.voo_id === 'vs_payer'));
  assert.equal(db.one("SELECT plan_id FROM users WHERE voo_id = 'vs_payer'").plan_id, 'free');
  for (const e of fake.events) { assert.ok(!('email' in e) && !('name' in e)); assert.ok(!(e.value_usd < 0)); }
  // Stable ids: queuing the same payment again sends nothing new (VooSquare would ignore it too).
  const n = fake.events.length;
  voo().paymentEvents(db.one('SELECT * FROM orders WHERE id = ?', o1.id));
  await flush();
  assert.ok(fake.events.slice(n).every(e => e.event_id === 'sv_pay_' + o1.ref || e.event_id === 'sv_plan_' + o1.ref || e.event_id === 'sv_renew_' + o1.ref));
  // A user without a Voo ID pays: nothing is sent.
  const plain = await plainSignup();
  const co = await plain.client.post('/api/app/checkout', { plan: 'starter', interval: 'month', method_id: 0 });
  await plain.client.req('POST', co.body.checkout_url, {}, { form: true, headers: { origin: 'http://localhost:3000' } });
  const before = fake.events.length; await flush();
  assert.equal(fake.events.length, before);
});

test('refund and chargeback need an admin; amounts are checked', async () => {
  on();
  const { client } = await plainSignup();
  assert.equal((await client.post('/api/admin/orders/SV-NOPE/refund', {})).status, 403);
  const adm = await h.admin();
  assert.equal((await adm.post('/api/admin/orders/SV-NOPE/refund', {})).status, 404);
  const db = require('../src/db');
  const o = db.one("SELECT * FROM orders WHERE status = 'paid' ORDER BY id DESC LIMIT 1");
  assert.equal((await adm.post('/api/admin/orders/' + o.ref + '/refund', { amount: o.amount_usd + 1 })).status, 400);
  assert.equal((await adm.post('/api/admin/orders/' + o.ref + '/refund', { amount: -5 })).status, 400);
});

test('activity events: board_created, ad_saved, and one search_run per user per hour; labels never carry an email', async () => {
  on();
  fake.events.length = 0;
  const db = require('../src/db');
  const c = h.client();
  await vooLogin(c, { voo_id: 'vs_active', email: 'active@example.com' });
  const b = await c.post('/api/app/boards', { name: 'Mine — me@me.com' });
  const ad = (await c.get('/api/app/search?sort=score')).body.items[0];
  await c.post('/api/app/boards/' + b.body.id + '/items', { ad_id: ad.id });
  await c.post('/api/app/boards/' + b.body.id + '/items', { ad_id: ad.id, note: 'again' });
  await c.get('/api/app/search?q=crypto');
  await c.get('/api/app/search?q=crypto&sort=new'); // a refinement, not a new search
  await c.get('/api/app/search?q=bitcoin');
  await flush();
  assert.ok(fake.events.find(e => e.event_id.startsWith('sv_board_' + b.body.id + '_') && e.type === 'board_created'));
  assert.equal(fake.events.filter(e => e.type === 'ad_saved').length, 1);
  assert.ok(fake.events.every(e => !/@/.test(e.label || '')));
  const uid = db.one("SELECT id FROM users WHERE voo_id = 'vs_active'").id;
  assert.equal(db.one('SELECT searches FROM voo_activity WHERE user_id = ?', uid).searches, 2);
  assert.equal(voo().flushActivity(), 0, 'the current hour is not sent yet');
  assert.equal(voo().flushActivity({ now: Date.now() + 3600e3 }), 1);
  await flush();
  const sr = fake.events.find(e => e.type === 'search_run' && e.voo_id === 'vs_active');
  assert.equal(sr.label, '2 searches');
  assert.match(sr.event_id, /^sv_search_vs_active_\d{4}-\d{2}-\d{2}T\d{2}$/);
});

test('summary card: API key required, unknown Voo ID → linked:false, metrics searches / ads_saved / boards', async () => {
  on();
  const c = h.client();
  assert.equal((await c.get('/api/voosquare/summary?voo_id=vs_active&period=7d')).status, 401);
  assert.equal((await c.get('/api/voosquare/summary?voo_id=vs_active', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const unk = await c.get('/api/voosquare/summary?voo_id=vs_nobody', { headers: { authorization: 'Bearer ' + KEY } });
  assert.deepEqual(unk.body, { linked: false });
  const r = await c.get('/api/voosquare/summary?voo_id=vs_active&period=7d', { headers: { authorization: 'Bearer ' + KEY } });
  assert.equal(r.status, 200);
  assert.equal(r.body.linked, true);
  assert.deepEqual(r.body.metrics.map(m => m.key), ['searches', 'ads_saved', 'boards']);
  const m = Object.fromEntries(r.body.metrics.map(x => [x.key, x.value]));
  assert.equal(m.searches, 2); assert.equal(m.ads_saved, 1); assert.equal(m.boards, 1);
  assert.equal(r.body.status, 'trial');
  assert.equal(r.body.open_url, 'http://localhost:3000/app');
});

test('logout everywhere: Voo users go through VooSquare and back home; password users just go home', async () => {
  on();
  const c = h.client();
  await vooLogin(c, { voo_id: 'vs_bye', email: 'bye@example.com' });
  const lo = await c.get('/logout');
  const u = new URL(lo.location);
  assert.equal(u.origin + u.pathname, hubUrl + '/oauth/logout');
  assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:3000/');
  assert.equal((await c.get('/api/auth/me')).body.user, null);
  const { client } = await plainSignup();
  assert.equal((await client.get('/logout')).location, '/');
});

test('dashboard: widget with the member’s email and name; "Part of VooSquare"; admin pages have no widget', async () => {
  on();
  const c = h.client();
  await vooLogin(c, { voo_id: 'vs_widget', email: 'wid@example.com', name: 'Wid "Quote" <b>' });
  assert.ok((await c.get('/app')).text.includes('/js/support-chat.js'), 'Spyvoo support chat in the dashboard');
  require('../src/services/settings').set('support', { on: false });
  const app = await c.get('/app');
  require('../src/services/settings').set('support', { on: true });
  assert.ok(app.text.includes('data-email="wid@example.com" data-name="Wid &quot;Quote&quot; &lt;b&gt;"'), 'escaped data-name');
  const boot = (await c.get('/api/app/bootstrap')).body;
  assert.equal(boot.voosquare.app_url, hubUrl + '/app');
  const adm = await h.admin();
  assert.ok(!(await adm.get('/admin')).text.includes('/widget.js'));
  const st = await adm.get('/api/admin/voosquare');
  assert.equal(st.body.login, true);
  assert.equal(st.body.summary_url, 'http://localhost:3000/api/voosquare/summary');
});

test('refund / chargeback go to the Voo ID that got the spend: still sent after the account is deleted, never for a payment VooSquare never saw', async () => {
  on();
  fake.events.length = 0;
  const db = require('../src/db');
  const adm = await h.admin();
  const pay = async (c, plan) => {
    const co = await c.post('/api/app/checkout', { plan, interval: 'month', method_id: 0 });
    assert.equal(co.status, 200, co.text);
    await c.req('POST', co.body.checkout_url, {}, { form: true, headers: { origin: 'http://localhost:3000' } });
    return db.one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  };
  // Paid with a Voo ID, then the customer deletes the Spyvoo account (voo_id is cleared), then disputes the payment.
  const c = h.client();
  await vooLogin(c, { voo_id: 'vs_gone', email: 'gone@example.com' });
  const o = await pay(c, 'pro');
  assert.equal(db.json(o.meta, {}).voo_id, 'vs_gone');
  assert.equal((await c.post('/api/app/delete-account', {})).status, 200);
  assert.equal(db.one('SELECT voo_id FROM users WHERE id = ?', o.user_id).voo_id, null);
  const cb = await adm.post('/api/admin/orders/' + o.ref + '/chargeback', {});
  assert.equal(cb.status, 200, cb.text);
  assert.equal(cb.body.voo_event, 'sv_cb_' + o.ref);
  await flush();
  const ev = fake.events.find(e => e.event_id === 'sv_cb_' + o.ref);
  assert.equal(ev.voo_id, 'vs_gone'); assert.equal(ev.original_event_id, 'sv_pay_' + o.ref);
  // Paid before the account was connected to VooSquare: no spend was sent, so no refund is sent either.
  const plain = await plainSignup();
  const o2 = await pay(plain.client, 'starter');
  await vooLogin(plain.client, { voo_id: 'vs_late', email: 'late-link@example.com' });
  assert.ok(db.one("SELECT id FROM users WHERE voo_id = 'vs_late' AND id = ?", plain.user.id), 'connected');
  const rf = await adm.post('/api/admin/orders/' + o2.ref + '/refund', {});
  assert.equal(rf.status, 200, rf.text);
  assert.equal(rf.body.voo_event, null);
  await flush();
  assert.ok(!fake.events.some(e => e.event_id === 'sv_rf_' + o2.ref));
});

test('an event VooSquare refuses for good is kept in voo_failed, shown to admins, and not retried', async () => {
  on();
  const db = require('../src/db');
  const k = require('../src/lib/voo').get();
  k.events.activity('board_created', { eventId: 'sv_reject_me_1', vooId: 'vs_x', label: 'x' });
  const r = await flush();
  assert.equal(r.rejected.length, 1);
  assert.equal(k.events.pending().length, 0, 'not queued again');
  assert.ok(db.one("SELECT * FROM voo_failed WHERE event_id = 'sv_reject_me_1'"));
  const adm = await h.admin();
  const st = (await adm.get('/api/admin/voosquare')).body;
  assert.ok(st.failed.some(f => f.event_id === 'sv_reject_me_1' && /refused/.test(f.error)));
});
