'use strict';
// Bugs found by the QA team, pinned so they stay fixed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, adm;
before(async () => { env = await h.boot(); adm = await h.admin(); });
after(async () => { await env.close(); });

test('searches sent with offset=0 still count against the free limit', async () => {
  const { client, user } = await h.signup();
  await client.get('/api/app/search?q=crypto&offset=0');
  const account = require('../src/services/account');
  assert.equal(account.used(user, 'searches'), 1);
});

test('abandoning a checkout does not block the first-purchase coupon', async () => {
  const { client } = await h.signup();
  const a = await client.post('/api/app/checkout', { plan: 'pro', interval: 'month', coupon: 'SPYLAUNCH' });
  assert.equal(a.status, 200, a.text);
  const b = await client.post('/api/app/checkout', { plan: 'pro', interval: 'month', coupon: 'SPYLAUNCH' });
  assert.equal(b.status, 200, b.text);
  const db = require('../src/db');
  assert.equal(db.one('SELECT status FROM orders WHERE ref = ?', a.body.ref).status, 'failed');
});

test('a new plan cannot overwrite an existing one', async () => {
  const r = await adm.put('/api/admin/plans/starter', { name: 'Dup', create: true });
  assert.equal(r.status, 409);
});

test('Apify items without ids never become the string "undefined"', () => {
  const n = require('../src/providers/apify').normalise({ pageName: 'A' });
  assert.equal(n.library_id, '');
  assert.equal(n.page_id, '');
});

test('plain-English search maps product words to niches and keeps CTA words whole', () => {
  const ads = require('../src/services/ads');
  assert.deepEqual(ads.parseQuery('skincare video ads Mexico').niche, ['Beauty']);
  assert.equal(ads.parseQuery('shopify stores selling shoes').cta, undefined);
  assert.ok(ads.search({ q: 'crypto' }).total > 0);
});

test('unsafe landing links are dropped', () => {
  const ingest = require('../src/services/ingest');
  const db = require('../src/db');
  ingest.save([{ library_id: 'x-js-1', page_id: '42', page_name: 'Evil', landing_url: 'javascript:alert(1)', primary_text: 'hi', media: [] }], { source: 'apify' });
  assert.equal(db.one("SELECT landing_url FROM ads WHERE library_id = 'x-js-1'").landing_url, '');
});

test('admins cannot delete the coupon the live offer uses, and "Make it mine" needs a product', async () => {
  assert.equal((await adm.del('/api/admin/coupons/SPYLAUNCH')).status, 400);
  const { client } = await h.signup();
  const ad = (await client.get('/api/app/search')).body.items[0];
  assert.equal((await client.post('/api/app/ads/' + ad.id + '/mine', {})).status, 400);
});

test('legal pages render real text', async () => {
  const r = await h.client().get('/legal/terms');
  assert.doesNotMatch(r.text, /\[object Object\]/);
});

test('R2 download links are signed correctly (AWS Signature V4 reference example)', () => {
  const media = require('../src/services/media');
  const u = media.presign('test.txt', { expires: 86400, now: new Date('2013-05-24T00:00:00Z'), region: 'us-east-1', creds: { endpoint: 'https://examplebucket.s3.amazonaws.com', bucket: '', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' } });
  assert.ok(u.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
  assert.match(media.presign('ads/1/v.mp4', { filename: 'spyvoo-1.mp4', creds: { endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'spyvoo-media', accessKey: 'k', secretKey: 's' } }), /response-content-disposition=attachment%3B%20filename%3D%22spyvoo-1\.mp4%22/);
});
