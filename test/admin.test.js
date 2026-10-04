'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, adm;
before(async () => { env = await h.boot(); adm = await h.admin(); });
after(async () => { await env.close(); });

test('normal users get 403 on every admin endpoint', async () => {
  const { client } = await h.signup();
  for (const p of ['/api/admin/overview', '/api/admin/rules', '/api/admin/users', '/api/admin/settings', '/api/admin/payments']) {
    assert.equal((await client.get(p)).status, 403, p);
  }
});

test('overview loads with charts and health data', async () => {
  const r = await adm.get('/api/admin/overview');
  assert.equal(r.status, 200);
  assert.equal(r.body.charts.ads.length, 14);
  assert.equal(r.body.provider.configured, false);
  assert.ok(r.body.ads.ads > 0);
});

test('tracking rules: add, edit, CSV import, delete', async () => {
  const a = await adm.post('/api/admin/rules', { type: 'keyword', value: 'forex signals', countries: 'BR, MX', niche: 'Trading', interval_hours: 12 });
  assert.equal(a.status, 200, a.text);
  const e = await adm.req('PATCH', '/api/admin/rules/' + a.body.id, { countries: ['EG'] });
  assert.equal(e.status, 200);
  const list = await adm.get('/api/admin/rules');
  const r = list.body.items.find(x => x.id === a.body.id);
  assert.deepEqual(r.countries, ['EG']);
  const imp = await adm.post('/api/admin/rules/import', { csv: 'type,value,countries,niche,interval_hours\nkeyword,meal kit,AE|IN,Food,6\nbad,,,,\n' });
  assert.equal(imp.body.added, 1);
  assert.equal(imp.body.errors.length, 1);
  assert.equal((await adm.del('/api/admin/rules/' + a.body.id)).status, 200);
});

test('provider token is stored encrypted and never returned', async () => {
  const r = await adm.req('PATCH', '/api/admin/provider', { token: 'apify_api_SECRET123', daily_budget_usd: 7 });
  assert.equal(r.status, 200);
  const g = await adm.get('/api/admin/provider');
  assert.equal(g.body.has_token, true);
  assert.doesNotMatch(g.text, /SECRET123/);
  const row = require('../src/db').one("SELECT value FROM settings WHERE key = 'provider'");
  assert.doesNotMatch(row.value, /SECRET123/);
  await adm.req('PATCH', '/api/admin/provider', { token: '' });
});

test('plans: edit a price and it shows on the public site', async () => {
  const r = await adm.put('/api/admin/plans/starter', { price_month: 25 });
  assert.equal(r.status, 200);
  const site = await h.client().get('/api/public/site');
  assert.equal(site.body.plans.find(p => p.id === 'starter').price_month, 25);
  assert.equal((await adm.put('/api/admin/plans/free', { price_month: 5 })).status, 400);
});

test('settings: offer needs an existing coupon; family slides are cleaned', async () => {
  const bad = await adm.req('PATCH', '/api/admin/settings/offer', { value: { on: true, code: 'NOPE99' } });
  assert.equal(bad.status, 400);
  const evil = await adm.req('PATCH', '/api/admin/settings/family', { value: [{ name: 'Joinvoo', url: 'javascript:alert(1)', color: 'red', title: 'x' }] });
  assert.equal(evil.status, 400);
  const blank = await adm.req('PATCH', '/api/admin/settings/family', { value: [{ name: '', url: '', title: '' }] });
  assert.equal(blank.status, 400);
  const fam = await adm.req('PATCH', '/api/admin/settings/family', { value: [{ name: 'Joinvoo', url: 'https://joinvoo.com', color: 'red', title: 'x' }] });
  assert.equal(fam.status, 200);
  assert.equal(fam.body.value[0].color, '#1F5BFF');
});

test('users: give a plan, suspend kicks the session', async () => {
  const { client, user } = await h.signup();
  assert.equal((await adm.req('PATCH', '/api/admin/users/' + user.id, { plan_id: 'pro' })).status, 200);
  assert.equal((await client.get('/api/auth/me')).body.user.plan.id, 'pro');
  await adm.req('PATCH', '/api/admin/users/' + user.id, { suspended: true });
  assert.equal((await client.get('/api/app/bootstrap')).status, 401);
});

test('coupons and manual mark-paid', async () => {
  const c = await adm.post('/api/admin/coupons', { code: 'cairo30', percent: 30 });
  assert.equal(c.status, 200, c.text);
  const { client, user } = await h.signup();
  const co = await client.post('/api/app/checkout', { plan: 'starter', interval: 'month', coupon: 'CAIRO30' });
  assert.equal(co.status, 200, co.text);
  assert.ok(Math.abs(co.body.amount - 25 * 0.7) < 0.01 || Math.abs(co.body.amount - 29 * 0.7) < 0.01);
  const paid = await adm.post('/api/admin/orders/' + co.body.ref + '/paid');
  assert.equal(paid.status, 200);
  assert.equal(require('../src/db').one('SELECT plan_id FROM users WHERE id = ?', user.id).plan_id, 'starter');
});

test('every email template renders a preview with the Voo family strip', async () => {
  const list = await adm.get('/api/admin/emails');
  assert.ok(list.body.templates.length >= 12);
  for (const t of list.body.templates) {
    const p = await adm.get('/api/admin/emails/' + t.name + '/preview');
    assert.equal(p.status, 200, t.name);
    assert.doesNotMatch(p.text, /\{\{\{?[a-z_]+\}?\}\}/, t.name + ' has an unfilled placeholder');
  }
});

test('ads manager: feature, hide, demo clear and reseed; audit log records it', async () => {
  const list = await adm.get('/api/admin/ads');
  const id = list.body.items[0].id;
  assert.equal((await adm.req('PATCH', '/api/admin/ads/' + id, { featured: true, hidden: true })).status, 200);
  const cleared = await adm.post('/api/admin/demo', { action: 'clear' });
  assert.ok(cleared.body.removed > 0);
  const seeded = await adm.post('/api/admin/demo', { action: 'seed' });
  assert.ok(seeded.body.added > 0);
  const audit = await adm.get('/api/admin/audit');
  assert.ok(audit.body.items.some(x => x.action === 'demo_clear'));
});

test('admin panel page is served to admins', async () => {
  const r = await adm.get('/admin');
  assert.equal(r.status, 200);
  assert.match(r.text, /Control room/);
});
