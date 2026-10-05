'use strict';
// Security audit findings, pinned: third-party ad content never executes (URLs, CSS), media downloads cannot reach
// private networks (SSRF), every page has a CSP, the library cannot be copied at script speed, form posts need our
// origin, and Gatevoo's family webhook format is accepted.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const h = require('./helpers');

let env;
before(async () => { env = await h.boot(); });
after(async () => { await env.close(); });

const EVIL = {
  library_id: 'evil-' + crypto.randomBytes(3).toString('hex'), page_id: '9988776655', page_name: '<img src=x onerror=alert(1)>Evil Co',
  page_logo: "https://cdn.example.com/a.png');background:url('https://attacker.example/steal", page_url: 'javascript:alert(document.cookie)',
  landing_url: 'javascript:alert(1)//https://shop.example', primary_text: '<script>alert(1)</script> Buy now', headline: '"><svg onload=alert(1)>',
  countries: ['BR'], start_date: '2026-07-01', media: [
    { type: 'image', url: 'javascript:alert(1)' },
    { type: 'video', url: "https://video.example/v.mp4'onerror='alert(1)", poster: 'data:image/svg+xml,<svg onload=alert(1)>' },
    { type: 'image', url: 'https://img.example/ok.jpg', key: 'http://169.254.169.254/latest/meta-data' }
  ]
};

test('scraped ad content: only http(s) links and media reach the pages, with CSS breakers encoded', async () => {
  const ads = require('../src/services/ads');
  const db = require('../src/db');
  const r = ads.upsert(EVIL, { source: 'apify' });
  const adv = db.one('SELECT * FROM advertisers WHERE id = ?', r.advertiserId);
  assert.equal(adv.page_url, 'https://www.facebook.com/9988776655', 'a javascript: page link is replaced by the Facebook page');
  assert.ok(!/['()]/.test(adv.logo_url), adv.logo_url);
  const row = db.one('SELECT * FROM ads WHERE id = ?', r.id);
  assert.equal(row.landing_url, '');
  const m = db.all('SELECT * FROM ad_media WHERE ad_id = ? ORDER BY position', r.id);
  assert.equal(m[0].source_url, '');
  assert.equal(m[0].status, 'failed');
  assert.ok(!/['"()]/.test(m[1].source_url) && m[1].poster_source_url === '');
  assert.equal(m[2].storage_key, '', 'a provider cannot plant a URL as a stored file');
  // Rows saved before the check (or written by hand) are cleaned on the way out too.
  db.run("UPDATE ad_media SET source_url = 'javascript:alert(1)', status = 'failed' WHERE id = ?", m[0].id);
  db.run("UPDATE advertisers SET page_url = 'javascript:alert(2)', logo_url = 'https://x.example/a.png'')' WHERE id = ?", adv.id);
  const { client } = await h.signup();
  const d = (await client.get('/api/app/ads/' + r.id)).body;
  const all = JSON.stringify(d);
  assert.ok(!/javascript:|data:image\/svg/i.test(all), 'no script URL in the API answer');
  for (const x of d.ad.media) { assert.ok(x.url === '' || /^(https?:\/\/|\/)/.test(x.url)); assert.ok(!/['"()\s]/.test(x.url + x.poster)); }
  assert.ok(!/['()]/.test(d.ad.advertiser.logo));
  const v = (await client.get('/api/app/advertisers/' + adv.id)).body.advertiser;
  assert.equal(v.page_url, '');
  // Download never hands a script URL to the browser.
  const dl = await client.post('/api/app/ads/' + r.id + '/download', { media_id: m[0].id });
  assert.ok(dl.status === 404 || dl.status === 402, dl.text);
});

test('a shared board escapes scraped text and cannot break out of url() with a thumbnail', async () => {
  const ads = require('../src/services/ads');
  const db = require('../src/db');
  const a = ads.upsert({ ...EVIL, library_id: 'evil2-' + Date.now(), media: [{ type: 'image', url: "https://img.example/x.jpg');}body{background:red" }] });
  db.run("UPDATE ad_media SET storage_key = '', status = 'failed' WHERE ad_id = ?", a.id);
  const { client } = await h.signup();
  const b = (await client.post('/api/app/boards', { name: '<b>x</b>' })).body;
  await client.post('/api/app/boards/' + b.id + '/items', { ad_id: a.id, note: '<script>alert(1)</script>' });
  const sh = (await client.req('PATCH', '/api/app/boards/' + b.id, { share: true })).body;
  const page = await h.client().get(new URL(sh.share_url).pathname);
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('<script>alert(1)'));
  assert.ok(!page.text.includes('<img src=x onerror'));
  assert.ok(!page.text.includes("');}body{background:red"));
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
});

test('every HTML page sends a CSP with hashed inline scripts only, no unsafe-inline scripts, no framing by others', async () => {
  const c = h.client();
  for (const p of ['/', '/pricing', '/login', '/legal/terms']) {
    const r = await c.get(p);
    const csp = r.headers.get('content-security-policy') || '';
    assert.match(csp, /default-src 'self'/, p);
    assert.match(csp, /frame-ancestors 'self'/, p);
    assert.match(csp, /base-uri 'self'/, p);
    const script = csp.split(';').find(x => x.trim().startsWith('script-src'));
    assert.ok(!/unsafe-inline|unsafe-eval/.test(script), p + ': ' + script);
    // Every inline script on the page is covered by a hash.
    const { inlineHashes } = require('../src/lib/csp');
    for (const hsh of inlineHashes(r.text)) assert.ok(script.includes(hsh), p + ' misses ' + hsh);
  }
  const { client } = await h.signup();
  assert.match((await client.get('/app')).headers.get('content-security-policy'), /script-src 'self'/);
});

test('SSRF: media downloads refuse private, loopback, metadata and non-http addresses, also through a redirect', async () => {
  const ng = require('../src/lib/netguard');
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:169.254.169.254']) assert.equal(ng.privateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '157.240.1.35', '2a03:2880:f12f:83:face:b00c:0:25de']) assert.equal(ng.privateIp(ip), false, ip);
  for (const u of ['http://127.0.0.1/x', 'http://localhost/x', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'gopher://x', 'http://user:pw@cdn.example/x', 'https://cdn.example:22/x', 'http://metadata.google.internal/']) {
    await assert.rejects(ng.safeGet(u), e => e.blocked === true, u);
  }
  // A public-looking host that redirects into the private network is refused at the hop.
  const inner = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.end('secret'); });
  await new Promise(r => inner.listen(0, '127.0.0.1', r));
  const hop = http.createServer((req, res) => { res.writeHead(302, { location: 'http://127.0.0.1:' + inner.address().port + '/admin' }); res.end(); });
  await new Promise(r => hop.listen(0, '127.0.0.1', r));
  try {
    // allowPrivate lets the first hop reach our local test server; the redirect target is checked like any address.
    const ok = await ng.safeGet('http://127.0.0.1:' + inner.address().port + '/a.png', { allowPrivate: true });
    assert.equal(ok.buf.toString(), 'secret');
    const hopUrl = 'http://127.0.0.1:' + hop.address().port + '/r';
    await assert.rejects(ng.safeGet(hopUrl, { allowPrivate: u => u === hopUrl }), e => e.blocked === true);
    let innerHits = 0; inner.on('request', () => { innerHits++; });
    await assert.rejects(ng.safeGet(hopUrl, { allowPrivate: u => u === hopUrl }));
    assert.equal(innerHits, 0, 'the private target behind the redirect is never contacted');
    // The media job marks a private address failed at once (no retries against internal hosts).
    const db = require('../src/db');
    const media = require('../src/services/media');
    const ad = db.one('SELECT id FROM ads LIMIT 1');
    const id = db.insert('ad_media', { ad_id: ad.id, type: 'image', position: 9, source_url: 'http://169.254.169.254/latest/meta-data/', status: 'pending', next_at: db.now() });
    await media.download(db.one('SELECT * FROM ad_media WHERE id = ?', id));
    const row = db.one('SELECT * FROM ad_media WHERE id = ?', id);
    assert.equal(row.status, 'failed');
    assert.match(row.error, /Private addresses/);
  } finally { inner.close(); hop.close(); }
});

test('the library cannot be copied at script speed (per-account pace limit on browse endpoints)', async () => {
  const { client } = await h.signup();
  let limited = 0;
  for (let i = 0; i < 130; i++) { const r = await client.get('/api/app/search?sort=new&offset=' + (i % 3) * 24); if (r.status === 429) { limited++; break; } }
  assert.equal(limited, 1);
  // Another account is not slowed down by it.
  const other = await h.signup();
  assert.equal((await other.client.get('/api/app/search?sort=new')).status, 200);
});

test('test checkout form posts from another site are refused (no cross-site plan activation)', async () => {
  const { client, user } = await h.signup();
  const co = await client.post('/api/app/checkout', { plan: 'pro', interval: 'month', method_id: 0 });
  assert.equal(co.status, 200, co.text);
  const evil = await client.req('POST', co.body.checkout_url, {}, { form: true, headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const db = require('../src/db');
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'free');
  const ok = await client.req('POST', co.body.checkout_url, {}, { form: true, headers: { origin: 'http://localhost:3000' } });
  assert.equal(ok.status, 302);
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'pro');
});

test('Gatevoo webhook also accepts the Voo family format (plain hex HMAC, {invoice:{order_id}})', async () => {
  const config = require('../src/config');
  config.gatevoo.webhookSecret = 'whsec_family_1';
  try {
    const raw = JSON.stringify({ type: 'invoice.paid', invoice: { id: 'inv_1', order_id: 'SV-NOPE', status: 'paid', paid_amount: 20 } });
    const sig = crypto.createHmac('sha256', 'whsec_family_1').update(raw).digest('hex');
    const good = await h.client().req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-signature': sig } });
    assert.equal(good.status, 200);
    const bad = await h.client().req('POST', '/webhooks/gatevoo', raw, { raw: true, csrf: false, headers: { 'content-type': 'application/json', 'x-gatevoo-signature': sig.replace(/^./, c => (c === 'a' ? 'b' : 'a')) } });
    assert.equal(bad.status, 401);
  } finally { config.gatevoo.webhookSecret = ''; }
  // settle() reads the family invoice shape (order_id, paid_amount, asset).
  const { client, user } = await h.signup();
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month' });
  const db = require('../src/db');
  const o = db.one('SELECT * FROM orders WHERE ref = ?', co.body.ref);
  const r = require('../src/services/gatevoo').settle({ id: o.provider_ref, order_id: o.ref, status: 'paid', paid_amount: o.amount_usd, asset: 'USDT_TRC20', tx_hash: 'abc' });
  assert.equal(r.ok, true);
  assert.equal(db.one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'starter');
});

test('session cookie is HttpOnly + SameSite and API writes need the x-sv header (CSRF)', async () => {
  const c = h.client();
  const email = 'cookie-' + Date.now() + '@example.com';
  const r = await c.post('/api/auth/signup', { email, password: 'password123', name: 'C', country: 'BR' });
  const sc = r.headers.getSetCookie().find(x => x.startsWith('sv_s='));
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Lax/);
  assert.equal((await c.post('/api/app/boards', { name: 'x' }, { csrf: false })).status, 403);
});

test('rate limits key on the proxy-appended address: a visitor-written X-Real-IP or leading X-Forwarded-For entry changes nothing', async () => {
  const c = h.client();
  let last;
  for (let i = 0; i < 31; i++) last = await c.get('/api/public/coupon?code=GUESS' + i, { headers: { 'x-forwarded-for': '6.6.6.' + i + ', ' + c.ip, 'x-real-ip': '7.7.7.' + i } });
  assert.equal(last.status, 429, 'coupon guessing is capped per visitor');
  assert.equal((await h.client().get('/api/public/coupon?code=X')).status, 200, 'another visitor is not affected');
  // Outside Railway, X-Forwarded-For is ignored unless TRUST_PROXY is set (the tests set it).
  const src = require('node:fs').readFileSync(require.resolve('../src/config'), 'utf8');
  assert.match(src, /trustProxy: bool\('TRUST_PROXY', !!env\('RAILWAY_ENVIRONMENT'/);
});

test('plain-English AI search is capped per account per day, whatever address it comes from', async () => {
  const { client } = await h.signup();
  let r;
  for (let i = 0; i < 201; i++) { client.ip = '10.77.' + Math.floor(i / 250) + '.' + (i % 250 + 1); r = await client.post('/api/app/ai-search', { text: 'crypto ads in Brazil ' + i }); if (r.status !== 200) break; }
  assert.equal(r.status, 429, r.text);
});
