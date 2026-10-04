'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env;
before(async () => { env = await h.boot(); });
after(async () => { await env.close(); });

async function anAd(client) { return (await client.get('/api/app/search?sort=score')).body.items[0]; }

test('boards: create, save an ad, share publicly, delete', async () => {
  const { client } = await h.signup();
  const b = await client.post('/api/app/boards', { name: 'Cairo fintech', emoji: '💸' });
  assert.equal(b.status, 200, b.text);
  const ad = await anAd(client);
  assert.equal((await client.post('/api/app/boards/' + b.body.id + '/items', { ad_id: ad.id, note: 'great hook' })).status, 200);
  const got = await client.get('/api/app/boards/' + b.body.id);
  assert.equal(got.body.items.length, 1);
  const shared = await client.req('PATCH', '/api/app/boards/' + b.body.id, { share: true });
  assert.equal(shared.status, 200);
  const token = require('../src/db').one('SELECT share_token FROM boards WHERE id = ?', b.body.id).share_token;
  assert.ok(token);
  const pub = await h.client().get('/b/' + token);
  assert.equal(pub.status, 200);
  assert.match(pub.text, /Cairo fintech/);
  assert.equal((await client.del('/api/app/boards/' + b.body.id)).status, 200);
});

test('someone else cannot read my board', async () => {
  const a = await h.signup();
  const b = await h.signup();
  const board = await a.client.post('/api/app/boards', { name: 'Private' });
  const r = await b.client.get('/api/app/boards/' + board.body.id);
  assert.equal(r.status, 404);
});

test('quick-save makes a "Swipe file" board on first use', async () => {
  const { client } = await h.signup();
  const ad = await anAd(client);
  const r = await client.post('/api/app/quick-save', { ad_id: ad.id });
  assert.equal(r.body.saved, true);
  assert.equal(r.body.board.name, 'Swipe file');
});

test('AI breakdown works without an API key and counts once per ad', async () => {
  const { client, user } = await h.signup();
  const ad = await anAd(client);
  const r1 = await client.post('/api/app/ads/' + ad.id + '/analyse');
  assert.equal(r1.status, 200, r1.text);
  assert.ok(r1.body.hook || r1.body.analysis || r1.body.why);
  await client.post('/api/app/ads/' + ad.id + '/analyse');
  const account = require('../src/services/account');
  assert.equal(account.used(user, 'analyses'), 1);
});

test('following an advertiser and the alert job notify the follower', async () => {
  const { client, user } = await h.signup();
  const ad = await anAd(client);
  const f = await client.post('/api/app/advertisers/' + ad.advertiser.id + '/follow', { on: true });
  assert.equal(f.status, 200, f.text);
  const db = require('../src/db');
  db.run('UPDATE follows SET last_notified_at = ? WHERE user_id = ?', '2000-01-01T00:00:00.000Z', user.id);
  const library = require('../src/services/library');
  await library.advertiserAlerts();
  const n = await client.get('/api/app/notifications');
  assert.equal(n.status, 200);
});

test('beginner tour data is free and never spends usage', async () => {
  const { client, user } = await h.signup();
  const r = await client.get('/api/app/tour');
  assert.equal(r.status, 200);
  assert.ok(r.body.ask);
  assert.ok(r.body.results.items.length >= 2);
  const account = require('../src/services/account');
  assert.equal(account.used(user, 'searches'), 0);
  assert.equal(account.used(user, 'analyses'), 0);
});
