'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env;
before(async () => { env = await h.boot(); });
after(async () => { await env.close(); });

test('signup needs a name, a valid email, 8+ char password and a country', async () => {
  const c = h.client();
  assert.equal((await c.post('/api/auth/signup', { email: 'a@b.co', password: 'password123', country: 'BR' })).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'A', email: 'nope', password: 'password123', country: 'BR' })).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'A', email: 'a@b.co', password: 'short', country: 'BR' })).status, 400);
  assert.equal((await c.post('/api/auth/signup', { name: 'A', email: 'a@b.co', password: 'password123', country: 'XX' })).status, 400);
});

test('signup starts a session and sends the welcome email', async () => {
  const { client, email } = await h.signup({ country: 'EG' });
  const me = await client.get('/api/auth/me');
  assert.equal(me.body.user.email, email);
  assert.equal(me.body.user.country, 'EG');
  assert.equal(me.body.user.plan.id, 'free');
  await h.sleep(50);
  assert.equal(h.emails(email, 'welcome').length, 1);
});

test('duplicate email is refused', async () => {
  const { email } = await h.signup();
  const r = await h.client().post('/api/auth/signup', { name: 'B', email, password: 'password123', country: 'BR' });
  assert.equal(r.status, 409);
});

test('login works, wrong password does not', async () => {
  const { email } = await h.signup();
  assert.equal((await h.client().post('/api/auth/login', { email, password: 'wrong-password' })).status, 401);
  const c = await h.login(email, 'password123');
  assert.equal((await c.get('/api/app/bootstrap')).status, 200);
});

test('API calls without the CSRF header are refused', async () => {
  const { client } = await h.signup();
  const r = await client.post('/api/app/boards', { name: 'X' }, { csrf: false });
  assert.equal(r.status, 403);
});

test('logout ends the session', async () => {
  const { client } = await h.signup();
  await client.post('/api/auth/logout');
  assert.equal((await client.get('/api/app/bootstrap')).status, 401);
});

test('forgot password always answers ok and emails a reset link to real accounts', async () => {
  const { email } = await h.signup();
  assert.equal((await h.client().post('/api/auth/forgot', { email: 'nobody@example.com' })).status, 200);
  assert.equal((await h.client().post('/api/auth/forgot', { email })).status, 200);
  await h.sleep(50);
  assert.equal(h.emails(email, 'password-reset').length, 1);
});

test('the dashboard and admin shells need a login', async () => {
  const anon = h.client();
  const app = await anon.get('/app');
  assert.ok([302, 303].includes(app.status));
  assert.match(app.location, /\/login/);
  const { client } = await h.signup();
  const adm = await client.get('/admin');
  assert.ok([302, 303, 403, 404].includes(adm.status));
});
