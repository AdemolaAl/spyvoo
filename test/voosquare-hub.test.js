'use strict';
// End-to-end connection test against a REAL VooSquare (the voosquare-app checkout, started here on a free port in
// 4853–4859) and a real Spyvoo process: check.js all PASS, affiliate link → Spyvoo landing → Start free → Voo ID
// sign-up → logged in → plan payment → commission → renewal → refund (no clawback) → chargeback (clawback) → activity
// events → summary card → logout everywhere; plus account linking by verified email and the "Connect" button.
// Skipped (not failed) when no VooSquare checkout is found: set VOOSQUARE_DIR to run it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const H = require('./hub-helpers');

const ROOT = path.join(__dirname, '..');
const DIR = H.hubDir();
const RUN = path.join(os.tmpdir(), 'claude-0', 'sv', 'hubtest-' + process.pid);

test('Spyvoo ↔ VooSquare end to end (real hub)', { skip: DIR ? false : 'no VooSquare checkout (set VOOSQUARE_DIR)', timeout: 180000 }, async t => {
  const ports = await H.freePorts(4853, 4859, 2);
  assert.equal(ports.length, 2, 'two free ports in 4853–4859');
  const [HUB_PORT, SV_PORT] = ports;
  fs.rmSync(RUN, { recursive: true, force: true }); fs.mkdirSync(RUN, { recursive: true });
  const hub = await H.startHub({ port: HUB_PORT, dir: DIR, data: path.join(RUN, 'hub') });
  const SV = 'http://localhost:' + SV_PORT;
  const VS = hub.base;
  let sv = null; let svLog = '';
  const { DatabaseSync } = require('node:sqlite');
  let sdb = null;
  t.after(async () => {
    if (sv) { sv.kill('SIGTERM'); await new Promise(r => { sv.once('exit', r); setTimeout(r, 4000); }); }
    try { sdb && sdb.close(); } catch { /* ignore */ }
    await hub.stop();
    if (!process.env.SV_KEEP_RUN) fs.rmSync(RUN, { recursive: true, force: true });
  });

  const { owner, ownerUser, prod, cred } = await H.setupSpyvoo(hub, SV);
  const { row: aff } = await H.setupAffiliate(hub, owner);
  assert.equal(aff.status, 'approved');

  const dbFile = path.join(RUN, 'spyvoo.db');
  sv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', PORT: String(SV_PORT), APP_URL: SV, DATABASE_PATH: dbFile, MEDIA_DIR: path.join(RUN, 'media'), ADMIN_EMAIL: 'admin@spy.test', ADMIN_PASSWORD: 'admin-pass-123', PAYMENTS_DEMO: 'true', MAIL_PROVIDER: 'log',
      APIFY_TOKEN: '', ANTHROPIC_API_KEY: '', AI_PROVIDER: '', OPENROUTER_API_KEY: '', OPENAI_API_KEY: '', GATEVOO_API_KEY: '', GATEVOO_WEBHOOK_SECRET: '', DEMO_ADS: 'true', SCHEDULER: 'true', TRUST_PROXY: 'true',
      VOO_BASE: VS, VOO_CLIENT_ID: cred.clientId, VOO_CLIENT_SECRET: cred.clientSecret, VOO_API_KEY: cred.apiKey, VOO_SIGNAL_SECRET: 'test-signal-secret-0123456789', VOO_FLUSH_MS: '100', VOO_BACKOFF_MS: '50', VOO_CONNECT: 'on' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  sv.stdout.on('data', d => { svLog += d; }); sv.stderr.on('data', d => { svLog += d; });
  assert.ok(await H.waitHttp('http://127.0.0.1:' + SV_PORT + '/healthz'), 'Spyvoo boots: ' + svLog.slice(-400));
  sdb = new DatabaseSync(dbFile); sdb.exec('PRAGMA busy_timeout=5000');
  const s1 = (q, ...a) => sdb.prepare(q).get(...a);
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await H.sleep(60); } return fn(); };
  const evRow = ext => hub.q1('SELECT * FROM events WHERE product_id=? AND ext_id=?', prod.id, ext);
  const evLike = pre => hub.q1("SELECT * FROM events WHERE product_id=? AND substr(ext_id, 1, ?)=? ORDER BY id DESC LIMIT 1", prod.id, pre.length, pre);

  await t.test('check.js: every line PASS', async () => {
    const out = await new Promise(resolve => execFile(process.execPath, [path.join(ROOT, 'voo-connect', 'check.js'), '--base', VS, '--client-id', cred.clientId, '--client-secret', cred.clientSecret, '--api-key', cred.apiKey,
      '--redirect-uri', SV + '/auth/voosquare/callback', '--logout-uri', SV + '/', '--summary-url', SV + '/api/voosquare/summary', '--voo-id', ownerUser.voo_id], { timeout: 30000 }, (err, so, se) => resolve({ code: err ? err.code : 0, text: String(so) + String(se) })));
    assert.equal(out.code, 0, out.text);
    assert.match(out.text, /0 failed/);
    assert.doesNotMatch(out.text, /FAIL/);
  });

  const buyer = new H.Browser();
  let member; let me;
  await t.test('affiliate link → landing keeps ref/vclick → Start free → Voo ID sign-up → logged in', async () => {
    const click = await buyer.get(VS + '/a/' + aff.code + '?p=spyvoo&sub1=fb_ng&click_id=CLK-SV1');
    const land = new URL(click.location);
    assert.equal(click.status, 302);
    assert.equal(land.origin, SV);
    assert.equal(land.searchParams.get('ref'), aff.code);
    const vclick = land.searchParams.get('vclick');
    assert.ok(vclick);
    const page = await buyer.get(land.toString());
    assert.equal(page.status, 200);
    assert.ok(String(page.data).includes('<script src="/voo-connect-browser.js" defer>'), 'landing has the browser snippet');
    assert.ok(String(page.data).includes(VS + '/widget.js" data-product="spyvoo"'), 'landing has the support widget');
    assert.ok(String(page.headers['content-security-policy']).includes(VS), 'CSP allows the VooSquare widget');
    const kept = buyer.jar.get('voo_attr', 'localhost');
    assert.ok(kept && decodeURIComponent(kept.value).includes('ref=' + aff.code) && decodeURIComponent(kept.value).includes('vclick=' + vclick), 'voo_attr cookie keeps the click');
    assert.ok((await buyer.get(SV + '/voo-connect-browser.js')).data.includes('w.VooConnect = {'));
    // VooSquare's own click cookie is lost (in-app browser, other domain): only Spyvoo's hand-off can attribute now.
    buyer.jar.clear('127.0.0.1');
    const su = await buyer.get(SV + '/signup');
    assert.equal(su.location, '/auth/voosquare?signup=1');
    const start = await buyer.get(SV + su.location);
    const az = new URL(start.location);
    assert.equal(az.origin + az.pathname, VS + '/oauth/authorize');
    assert.equal(az.searchParams.get('client_id'), cred.clientId);
    assert.equal(az.searchParams.get('redirect_uri'), SV + '/auth/voosquare/callback');
    assert.equal(az.searchParams.get('prompt'), 'signup');
    assert.equal(az.searchParams.get('ref'), aff.code);
    assert.equal(az.searchParams.get('vclick'), vclick);
    const a1 = await buyer.get(az.toString());
    assert.match(a1.location, /^\/login\?product=spyvoo&mode=signup&next=/);
    member = await H.hubLogin(buyer, VS, 'buyer@test.local', 'Bola Buyer', 'spyvoo');
    const a2 = await buyer.get(VS + new URLSearchParams(a1.location.split('?')[1]).get('next'));
    const back = new URL(a2.location);
    assert.equal(back.origin + back.pathname, SV + '/auth/voosquare/callback');
    const cb = await buyer.get(back.toString());
    assert.equal(cb.status, 302, String(cb.data).slice(0, 300));
    assert.equal(cb.location, '/app?welcome=1');
    assert.ok(buyer.jar.get('sv_s', 'localhost'), 'Spyvoo session started');
    assert.ok(!buyer.jar.get('voo_attr', 'localhost') && !buyer.jar.get('voo_state', 'localhost'), 'hand-off and state cookies cleared');
    me = (await buyer.get(SV + '/api/auth/me')).data.user;
    assert.equal(me.email, 'buyer@test.local');
    assert.equal(me.voo, true);
    const at = hub.q1('SELECT t.*, f.code FROM aff_attributions t JOIN aff_affiliates f ON f.id=t.affiliate_id WHERE t.customer_user_id=(SELECT id FROM users WHERE voo_id=?)', member.voo_id);
    assert.equal(at && at.code, aff.code, 'VooSquare attributed the new Voo ID to the affiliate');
    assert.equal(at.sub1, 'fb_ng');
    const local = s1('SELECT * FROM users WHERE voo_id = ?', member.voo_id);
    assert.equal(local.referred_by, hub.q1('SELECT ref_code FROM users WHERE id=?', aff.user_id).ref_code, 'voo_ref saved as referred_by');
    // No cookie of VooSquare's leaks onto Spyvoo's host and the other way round.
    assert.deepEqual(buyer.jar.names('localhost').filter(n => /^vs_/.test(n)), []);
    assert.deepEqual(buyer.jar.names('127.0.0.1').filter(n => /^(sv_|voo_)/.test(n)), []);
  });

  const custId = () => hub.q1('SELECT id FROM users WHERE voo_id=?', member.voo_id).id;
  const coms = () => hub.qa('SELECT * FROM aff_commissions WHERE customer_user_id=? ORDER BY id', custId());
  const pay = async plan => {
    const co = await buyer.post(SV + '/api/app/checkout', { body: { plan, interval: 'month', method_id: 0 } });
    assert.equal(co.status, 200, JSON.stringify(co.data));
    const ref = co.data.ref;
    const r = await buyer.post(SV + co.data.checkout_url, { form: {}, headers: { origin: SV } });
    assert.equal(r.status, 302);
    return s1('SELECT * FROM orders WHERE ref = ?', ref);
  };
  let o1; let o2;
  await t.test('plan payment → spend + plan_started → commission available at once', async () => {
    o1 = await pay('pro');
    assert.equal(o1.status, 'paid');
    const sp = await until(() => evRow('sv_pay_' + o1.ref));
    assert.ok(sp, 'spend reached VooSquare: ' + svLog.slice(-500));
    assert.equal(sp.type, 'spend');
    assert.equal(sp.value_usd, o1.amount_usd);
    assert.equal(sp.plan, 'Pro');
    const ps = await until(() => evRow('sv_plan_' + o1.ref));
    assert.equal(ps.type, 'plan_started');
    const rs = await until(() => coms().find(c => c.type === 'revshare'));
    assert.ok(rs, 'RevShare commission: ' + JSON.stringify(coms()));
    assert.equal(rs.status, 'available');
    assert.equal(rs.product_key, 'spyvoo');
  });
  await t.test('renewal → spend + plan_renewed', async () => {
    o2 = await pay('pro');
    assert.ok(await until(() => evRow('sv_pay_' + o2.ref)));
    assert.equal((await until(() => evRow('sv_renew_' + o2.ref))).type, 'plan_renewed');
    assert.ok(await until(() => coms().filter(c => c.type === 'revshare').length === 2), JSON.stringify(coms()));
  });
  const admin = new H.Browser();
  await t.test('refund → logged with original_event_id, commission stays', async () => {
    const lg = await admin.post(SV + '/api/auth/login', { body: { email: 'admin@spy.test', password: 'admin-pass-123' } });
    assert.equal(lg.status, 200);
    const rf = await admin.post(SV + '/api/admin/orders/' + o1.ref + '/refund', { body: {} });
    assert.equal(rf.status, 200, JSON.stringify(rf.data));
    assert.equal(rf.data.voo_event, 'sv_rf_' + o1.ref);
    const ev = await until(() => evRow('sv_rf_' + o1.ref));
    assert.equal(ev.type, 'refund');
    assert.equal(ev.ref_event, 'sv_pay_' + o1.ref);
    await H.sleep(300);
    assert.ok(!coms().some(c => c.type === 'clawback'), 'no clawback on refund');
    assert.ok(coms().filter(c => c.type === 'revshare').every(c => c.status === 'available'));
    assert.equal((await admin.post(SV + '/api/admin/orders/' + o1.ref + '/refund', { body: {} })).status, 400, 'a second refund is refused');
  });
  await t.test('chargeback → clawback of that payment', async () => {
    const cb = await admin.post(SV + '/api/admin/orders/' + o2.ref + '/chargeback', { body: {} });
    assert.equal(cb.status, 200, JSON.stringify(cb.data));
    const ev = await until(() => evRow('sv_cb_' + o2.ref));
    assert.equal(ev.type, 'chargeback');
    assert.equal(ev.ref_event, 'sv_pay_' + o2.ref);
    const claw = await until(() => coms().find(c => c.type === 'clawback'));
    assert.ok(claw, JSON.stringify(coms()));
    const orig = coms().filter(c => c.type === 'revshare')[1];
    assert.equal(claw.amount_cents, -orig.amount_cents);
    assert.equal(s1('SELECT plan_id FROM users WHERE voo_id = ?', member.voo_id).plan_id, 'free', 'plan ended');
    const pc = await until(() => evRow('sv_cancel_' + member.voo_id + '_charged_back-' + o2.ref));
    assert.equal(pc && pc.type, 'plan_cancelled');
  });
  await t.test('activity: board_created, ad_saved, search_run (one per user per hour)', async () => {
    const b = await buyer.post(SV + '/api/app/boards', { body: { name: 'Winners ada@x.com' } });
    assert.equal(b.status, 200);
    const ad = (await buyer.get(SV + '/api/app/search?sort=score')).data.items[0];
    assert.equal((await buyer.post(SV + '/api/app/boards/' + b.data.id + '/items', { body: { ad_id: ad.id } })).status, 200);
    assert.equal((await buyer.get(SV + '/api/app/search?q=crypto')).status, 200);
    assert.equal((await buyer.get(SV + '/api/app/search?q=skincare')).status, 200);
    assert.ok(await until(() => evLike('sv_board_' + b.data.id + '_')));
    const saved = await until(() => evLike('sv_save_' + b.data.id + '_' + ad.id + '_'));
    assert.equal(saved.type, 'ad_saved');
    assert.doesNotMatch(String(saved.label), /@/);
    // Close the hour (as if it were over) and let the job send it.
    const row = s1('SELECT * FROM voo_activity WHERE user_id = ?', s1('SELECT id FROM users WHERE voo_id = ?', member.voo_id).id);
    assert.equal(row.searches, 2);
    sdb.prepare("UPDATE voo_activity SET hour = '2026-01-01T10' WHERE user_id = ?").run(row.user_id);
    assert.equal((await admin.post(SV + '/api/admin/voosquare/flush', { body: {} })).status, 200);
    const sr = await until(() => evRow('sv_search_' + member.voo_id + '_2026-01-01T10'));
    assert.equal(sr.type, 'search_run');
    assert.equal(sr.label, '2 searches');
  });
  await t.test('summary card on the member’s VooSquare home', async () => {
    const home = await buyer.get(VS + '/api/me/home');
    const card = home.data.tools.find(x => x.slug === 'spyvoo');
    assert.ok(card && card.summary, JSON.stringify(home.data.tools && home.data.tools.map(x => x.slug)));
    const m = Object.fromEntries(card.summary.metrics.map(x => [x.key, x.value]));
    assert.equal(m.searches, 2, 'browsing without a question is not a search');
    assert.equal(m.ads_saved, 1);
    assert.equal(m.boards, 1);
    assert.equal(card.summary.status, 'trial');
    const nokey = await buyer.get(SV + '/api/voosquare/summary?voo_id=' + member.voo_id);
    assert.equal(nokey.status, 401);
  });
  await t.test('logout everywhere comes back to Spyvoo’s home page', async () => {
    const lo = await buyer.get(SV + '/logout');
    const u = new URL(lo.location);
    assert.equal(u.origin + u.pathname, VS + '/oauth/logout');
    assert.equal(u.searchParams.get('redirect_uri'), SV + '/');
    assert.ok(!buyer.jar.get('sv_s', 'localhost'));
    const lo2 = await buyer.get(lo.location);
    assert.equal(lo2.location, SV + '/');
    assert.equal((await buyer.get(VS + '/api/me')).data.user, null);
    assert.equal((await buyer.get(SV + '/api/auth/me')).data.user, null);
  });
  const vooLogin = async (b, email, name, returnTo = '/app') => {
    const st = await b.get(SV + '/auth/voosquare?return_to=' + encodeURIComponent(returnTo));
    const a1 = await b.get(st.location);
    let loc = a1.location;
    if (loc.startsWith('/login')) { await H.hubLogin(b, VS, email, name, 'spyvoo'); loc = (await b.get(VS + new URLSearchParams(loc.split('?')[1]).get('next'))).location; }
    return b.get(loc);
  };
  await t.test('existing email + password account: kept, and linked by VooSquare-verified email', async () => {
    const { hashPassword } = require('../src/lib/security');
    sdb.prepare("INSERT INTO users (email, name, password_hash, email_verified, country, created_at) VALUES ('legacy@test.local', 'Legacy', ?, 1, 'NG', ?)").run(hashPassword('legacy-pass-1'), new Date().toISOString());
    const legacyId = s1("SELECT id FROM users WHERE email = 'legacy@test.local'").id;
    const pw = new H.Browser();
    assert.equal((await pw.post(SV + '/api/auth/login', { body: { email: 'legacy@test.local', password: 'legacy-pass-1' } })).status, 200, 'email login still works with VooSquare on');
    const b = new H.Browser();
    const cb = await vooLogin(b, 'legacy@test.local', 'Legacy');
    assert.equal(cb.status, 302);
    assert.equal(cb.location, '/app?voo=linked');
    const u = s1('SELECT * FROM users WHERE id = ?', legacyId);
    assert.ok(u.voo_id, 'linked to the existing account, not a new one');
    assert.equal(u.password_hash.length > 0, true, 'a verified account keeps its password');
    assert.equal(s1("SELECT COUNT(*) n FROM users WHERE email = 'legacy@test.local'").n, 1);
  });
  await t.test('unverified look-alike account: linked only after its password and sessions are dropped', async () => {
    const { hashPassword } = require('../src/lib/security');
    sdb.prepare("INSERT INTO users (email, name, password_hash, email_verified, created_at) VALUES ('victim@test.local', 'Squatter', ?, 0, ?)").run(hashPassword('squatter-pass'), new Date().toISOString());
    const squatter = new H.Browser();
    assert.equal((await squatter.post(SV + '/api/auth/login', { body: { email: 'victim@test.local', password: 'squatter-pass' } })).status, 200);
    const b = new H.Browser();
    assert.equal((await vooLogin(b, 'victim@test.local', 'Victim')).status, 302);
    const u = s1("SELECT * FROM users WHERE email = 'victim@test.local'");
    assert.ok(u.voo_id && u.password_hash === '' && u.email_verified === 1);
    assert.equal((await squatter.get(SV + '/api/auth/me')).data.user, null, 'the squatter’s session is gone');
    assert.equal((await squatter.post(SV + '/api/auth/login', { body: { email: 'victim@test.local', password: 'squatter-pass' } })).status, 401);
  });
  await t.test('“Connect VooSquare” while logged in links that account (any email); admins are never auto-linked', async () => {
    const { hashPassword } = require('../src/lib/security');
    sdb.prepare("INSERT INTO users (email, name, password_hash, email_verified, created_at) VALUES ('old-address@test.local', 'Mover', ?, 1, ?)").run(hashPassword('mover-pass-1'), new Date().toISOString());
    const b = new H.Browser();
    assert.equal((await b.post(SV + '/api/auth/login', { body: { email: 'old-address@test.local', password: 'mover-pass-1' } })).status, 200);
    const cb = await vooLogin(b, 'new-address@test.local', 'Mover', '/app/account');
    assert.equal(cb.location, '/app/account?voo=linked');
    const u = s1("SELECT * FROM users WHERE name = 'Mover'");
    assert.ok(u.voo_id);
    assert.equal(s1("SELECT COUNT(*) n FROM users WHERE email = 'new-address@test.local' AND id != ?", u.id).n, 0);
    const adm = new H.Browser();
    const r = await vooLogin(adm, 'admin@spy.test', 'Admin');
    assert.equal(r.status, 409);
    assert.match(String(r.data), /Admin accounts are never connected automatically/);
    assert.equal(s1("SELECT voo_id FROM users WHERE email = 'admin@spy.test'").voo_id, null);
  });
  await t.test('the outbox is empty and nothing was refused', async () => {
    const st = (await admin.get(SV + '/api/admin/voosquare')).data;
    assert.equal(st.pending, 0, JSON.stringify(st));
    assert.deepEqual(st.failed, []);
  });
});
