'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, ads;
before(async () => { env = await h.boot(); ads = require('../src/services/ads'); });
after(async () => { await env.close(); });

test('plain English becomes filters', () => {
  const f = ads.parseQuery('crypto ads in Brazil over 30 days');
  assert.deepEqual(f.countries, ['BR']);
  assert.equal(f.min_days, 30);
  assert.deepEqual(f.niche, ['Crypto']);
  assert.equal(f.q, undefined);
});

test('weeks, video and sign-up CTA are understood', () => {
  const f = ads.parseQuery('skincare video ads in Mexico running 2 weeks sign up');
  assert.deepEqual(f.countries, ['MX']);
  assert.equal(f.min_days, 14);
  assert.deepEqual(f.media, ['video']);
  assert.ok(f.cta && f.cta.length >= 1);
});

test('several countries at once', () => {
  const f = ads.parseQuery('fintech apps in Egypt and UAE');
  assert.ok(f.countries.includes('EG'));
  assert.ok(f.countries.includes('AE'));
});

test('winner score rises with days, variations, countries and active status', () => {
  const base = { days_running: 5, variation_count: 1, countries: ',BR,', status: 'inactive' };
  const s0 = ads.score(base);
  assert.ok(ads.score({ ...base, days_running: 60 }) > s0);
  assert.ok(ads.score({ ...base, variation_count: 6 }) > s0);
  assert.ok(ads.score({ ...base, countries: ',BR,MX,EG,AE,' }) > s0);
  assert.ok(ads.score({ ...base, status: 'active' }) > s0);
  assert.equal(ads.score({ days_running: 999, variation_count: 99, countries: ',BR,MX,EG,AE,IN,TR,ID,PH,VN,', status: 'active' }), 100);
});

test('sample ads are searchable and the relax fallback never returns nothing', async () => {
  const { client } = await h.signup();
  const all = await client.get('/api/app/search?sort=score');
  assert.equal(all.status, 200);
  assert.ok(all.body.items.length > 5);
  const r = ads.search({ q: 'zzzz-no-such-ad', relax: true, limit: 5 });
  assert.ok(Array.isArray(r.items));
});

test('public try-it search shows a few results and locks the rest', async () => {
  const r = await h.client().get('/api/public/search?q=ads');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
  assert.ok(r.body.items.filter(x => !x.locked).length <= 6);
  assert.ok(r.body.items.filter(x => x.locked).every(x => !x.text && !x.advertiser));
});

test('public site data: plans, offer, family slides, no secrets', async () => {
  const r = await h.client().get('/api/public/site');
  assert.equal(r.status, 200);
  assert.equal(r.body.plans.length, 4);
  assert.equal(r.body.offer.code, 'SPYLAUNCH');
  assert.ok(r.body.family.length >= 5);
  assert.doesNotMatch(r.text, /apify_token|password_hash/);
  const full = await h.client().get('/api/public/plans-full');
  assert.equal(full.body.plans.find(p => p.id === 'pro').searches_per_day, -1);
});

test('pages render: home, pricing, legal, sitemap, robots, 404', async () => {
  const c = h.client();
  for (const p of ['/', '/pricing', '/login', '/signup', '/legal/terms', '/legal/privacy', '/legal/refunds', '/sitemap.xml', '/robots.txt', '/healthz']) {
    const r = await c.get(p);
    assert.equal(r.status, 200, p);
  }
  const terms = await c.get('/legal/terms');
  assert.match(terms.text, /Zedapex Limited/);
  assert.doesNotMatch(terms.text, /\{\{/);
  assert.equal((await c.get('/no-such-page')).status, 404);
});
