'use strict';
// AI providers: OpenRouter (and OpenAI) next to the original Claude path, against a local mock (test/mock-ai.js).
// Covers provider selection, request shape, parsing, retries, missing keys, fallbacks, admin key handling and caps.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const h = require('./helpers');
const { startMockAi } = require('./mock-ai');

const OR_KEY = 'sk-or-v1-test-env-key-1234';
let env, mock, llm, ai, config, settings, ads, prevFetch;

before(async () => {
  mock = await startMockAi();
  Object.assign(process.env, {
    AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: OR_KEY, OPENROUTER_BASE_URL: mock.base + '/api/v1',
    OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5', OPENAI_BASE_URL: mock.base + '/v1', AI_RETRY_BASE_MS: '20'
  });
  delete process.env.OPENROUTER_FALLBACK_MODELS;
  delete process.env.OPENAI_API_KEY;
  env = await h.boot();
  llm = require('../src/services/llm'); ai = require('../src/services/ai'); config = require('../src/config');
  settings = require('../src/services/settings'); ads = require('../src/services/ads');
  // The real Claude address is kept in the code; in tests its calls are answered by the mock.
  prevFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return prevFetch(url.startsWith('https://api.anthropic.com/') ? mock.base + url.slice('https://api.anthropic.com'.length) : input, init);
  };
});
after(async () => { globalThis.fetch = prevFetch; await env.close(); await mock.close(); });
beforeEach(() => {
  mock.reset();
  settings.set('ai', { provider: '', openrouter_model: '', fallback_models: '', key_enc: '', key_for: '' });
  config.ai.provider = 'openrouter'; config.ai.openrouter.key = OR_KEY; config.ai.openrouter.fallbacks = ''; config.ai.key = ''; config.ai.openai.key = '';
});

test('AI_PROVIDER picks the provider; unset keeps Claude (anthropic)', () => {
  const read = extra => execFileSync(process.execPath, ['-e', 'process.stdout.write(require("./src/config").ai.provider)'], { cwd: path.join(__dirname, '..'), env: { ...process.env, AI_PROVIDER: '', ...extra } }).toString();
  assert.equal(read({}), 'anthropic');
  assert.equal(read({ AI_PROVIDER: 'OpenRouter' }), 'openrouter');
  assert.equal(llm.resolve().provider, 'openrouter');
  config.ai.provider = 'nonsense';
  assert.equal(llm.resolve().provider, 'anthropic', 'an unknown value falls back to Claude');
  config.ai.provider = 'anthropic';
  settings.set('ai', { provider: 'openrouter' });
  assert.equal(llm.resolve().provider, 'openrouter', 'Admin choice wins over the env default');
});

test('OPENROUTER_BASE_URL is ignored in production', () => {
  const out = execFileSync(process.execPath, ['-e', 'const c=require("./src/config");process.stdout.write(c.ai.openrouter.baseUrl+" "+c.ai.openai.baseUrl)'], { cwd: path.join(__dirname, '..'), env: { ...process.env, NODE_ENV: 'production', PAYMENTS_DEMO: 'false', APP_SECRET: 'x'.repeat(40) } }).toString();
  assert.equal(out, 'https://openrouter.ai/api/v1 https://api.openai.com/v1');
  const { checkApiUrl } = require('../src/lib/netguard');
  assert.equal(checkApiUrl('https://openrouter.ai/api/v1').hostname, 'openrouter.ai');
  assert.throws(() => checkApiUrl('https://evil.example/api/v1'), /may only go to/);
  assert.throws(() => checkApiUrl('http://openrouter.ai/api/v1'), /may only go to/);
  assert.throws(() => checkApiUrl('http://127.0.0.1:4971/api/v1'), /may only go to/);
});

test('request shape: Bearer key, referer/title headers, model, system role, JSON mode', async () => {
  const r = await llm.complete({ system: 'Be brief.', messages: [{ role: 'user', content: 'Hi' }], maxTokens: 123, temperature: 0.2, json: true, feature: 'test' });
  const c = mock.last('openrouter');
  assert.equal(c.path, '/api/v1/chat/completions');
  assert.equal(c.headers.authorization, 'Bearer ' + OR_KEY);
  assert.equal(c.headers['http-referer'], config.appUrl);
  assert.equal(c.headers['x-title'], 'Spyvoo');
  assert.equal(c.body.model, 'anthropic/claude-sonnet-4.5');
  assert.deepEqual(c.body.messages, [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }]);
  assert.equal(c.body.max_tokens, 123);
  assert.equal(c.body.temperature, 0.2);
  assert.deepEqual(c.body.response_format, { type: 'json_object' });
  assert.equal(c.body.models, undefined, 'no fallbacks configured');
  assert.equal(c.body.system, undefined, 'no Anthropic-style system field');
  assert.deepEqual(r.usage, { input_tokens: 50, output_tokens: 20, cost: 0.00042 });
  assert.equal(r.provider, 'openrouter');
  assert.equal(r.model, 'anthropic/claude-sonnet-4.5');
});

test('plain-English search parses the OpenRouter answer and records tokens and cost', async () => {
  const { client } = await h.signup();
  const r = await client.post('/api/app/ai-search', { text: 'crypto ads in Brazil running a month' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.filters.via, 'ai');
  assert.deepEqual(r.body.filters.countries, ['BR']);
  assert.equal(r.body.filters.min_days, 30);
  assert.ok(/ad-spy search/.test(mock.last('openrouter').body.messages[0].content));
  const u = env.db.one("SELECT * FROM ai_usage WHERE feature = 'search' ORDER BY id DESC LIMIT 1");
  assert.equal(u.provider, 'openrouter');
  assert.equal(u.input_tokens, 50);
  assert.equal(u.output_tokens, 20);
  assert.equal(u.cost_usd, 0.00042);
});

test('AI breakdown and "Make it mine" work through OpenRouter', async () => {
  const id = ads.search({ limit: 1, sort: 'new' }).items[0].id;
  const a = await ai.analyse(id, { force: true });
  assert.equal(a.analysis.hook, 'Mock hook');
  assert.equal(env.db.one('SELECT model FROM ad_analysis WHERE ad_id = ?', id).model, 'anthropic/claude-sonnet-4.5');
  const { user } = await h.signup();
  const m = await ai.makeItMine(id, user, { product: 'hair oil' });
  assert.equal(m.scripts[0].title, 'Mock script');
});

test('retries 429 and 5xx with backoff; never retries a 400', async () => {
  mock.queue.push({ status: 429, headers: { 'retry-after': '0' } }, { status: 502 });
  const r = await llm.complete({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.text, 'ok');
  assert.equal(mock.calls.length, 3);
  mock.reset();
  mock.queue.push({ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 });
  await assert.rejects(llm.complete({ messages: [{ role: 'user', content: 'x' }] }), e => e.status === 429 && /OpenRouter/.test(e.message));
  assert.equal(mock.calls.length, 1 + config.ai.retries);
  mock.reset();
  mock.queue.push({ status: 400, body: { error: { code: 400, message: 'bad model' } } });
  await assert.rejects(llm.complete({ messages: [{ role: 'user', content: 'x' }] }), /bad model/);
  assert.equal(mock.calls.length, 1);
});

test('an error inside a 200 answer is an error, and error text never carries the key', async () => {
  mock.queue.push({ status: 200, body: { error: { code: 400, message: 'Provider rejected key ' + OR_KEY } } });
  await assert.rejects(llm.complete({ messages: [{ role: 'user', content: 'x' }] }), e => !e.message.includes(OR_KEY) && /\[key\]/.test(e.message));
});

test('missing key: clear error, basic mode, search still works by rules', async () => {
  config.ai.openrouter.key = '';
  await assert.rejects(llm.complete({ messages: [{ role: 'user', content: 'x' }] }), /OpenRouter is selected .* OPENROUTER_API_KEY/);
  assert.equal(ai.live(), false);
  const { client } = await h.signup();
  const r = await client.post('/api/app/ai-search', { text: 'crypto ads in Brazil over 30 days' });
  assert.equal(r.body.filters.via, 'rules');
  assert.equal(mock.calls.length, 0);
});

test('fallback models are passed through as "models", main model first', async () => {
  config.ai.openrouter.fallbacks = 'openai/gpt-4o-mini, anthropic/claude-sonnet-4.5';
  await llm.complete({ messages: [{ role: 'user', content: 'x' }] });
  let b = mock.last('openrouter').body;
  assert.equal(b.model, 'anthropic/claude-sonnet-4.5');
  assert.deepEqual(b.models, ['anthropic/claude-sonnet-4.5', 'openai/gpt-4o-mini'], 'the main model is not repeated');
  settings.set('ai', { openrouter_model: 'openai/gpt-4o-mini', fallback_models: 'anthropic/claude-sonnet-4.5' });
  await llm.complete({ messages: [{ role: 'user', content: 'x' }] });
  b = mock.last('openrouter').body;
  assert.deepEqual(b.models, ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5']);
});

test('the Claude path is unchanged: x-api-key, separate system, no response_format, cached breakdown model', async () => {
  config.ai.provider = 'anthropic'; config.ai.key = 'sk-ant-test-key';
  const id = ads.search({ limit: 2, sort: 'new' }).items[1].id;
  const a = await ai.analyse(id, { force: true });
  assert.equal(a.analysis.hook, 'Mock hook');
  const c = mock.last('anthropic');
  assert.equal(c.path, '/v1/messages');
  assert.equal(c.headers['x-api-key'], 'sk-ant-test-key');
  assert.equal(c.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.headers.authorization, undefined);
  assert.deepEqual(Object.keys(c.body).sort(), ['max_tokens', 'messages', 'model', 'system']);
  assert.equal(c.body.model, 'claude-haiku-4-5-20251001');
  assert.match(c.body.system, /senior media buyer/);
  assert.equal(c.body.messages.length, 1);
  assert.equal(c.body.messages[0].role, 'user');
  assert.equal(mock.calls.filter(x => x.kind !== 'anthropic').length, 0);
  assert.equal(env.db.one("SELECT provider FROM ai_usage ORDER BY id DESC LIMIT 1").provider, 'anthropic');
  // One try only, as before (no retries added to the Claude path).
  mock.queue.push({ status: 529, body: { error: { message: 'Overloaded' } } });
  await assert.rejects(llm.complete({ messages: [{ role: 'user', content: 'x' }] }), /Claude: Overloaded/);
  assert.equal(mock.calls.filter(x => x.kind === 'anthropic').length, 2);
});

test('plain OpenAI shares the same path', async () => {
  settings.set('ai', { provider: 'openai' }); config.ai.openai.key = 'sk-openai-test';
  await llm.complete({ system: 'S', messages: [{ role: 'user', content: 'x' }] });
  const c = mock.last();
  assert.equal(c.kind, 'openai');
  assert.equal(c.body.model, 'gpt-4o-mini');
  assert.equal(c.headers['http-referer'], undefined);
  assert.equal(c.body.messages[0].role, 'system');
});

test('admin: provider, model and key are saved; the key is never sent back and is re-entered when the endpoint changes', async () => {
  const adm = await h.admin();
  const KEY = 'sk-or-v1-admin-saved-key-9876';
  let r = await adm.req('PATCH', '/api/admin/ai', { provider: 'openrouter', openrouter_model: 'openai/gpt-4o-mini', fallback_models: 'anthropic/claude-sonnet-4.5', key: KEY });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.ai.key_source, 'admin');
  assert.equal(r.body.ai.key_hint, '…9876');
  const g = await adm.get('/api/admin/provider');
  assert.equal(g.status, 200);
  assert.ok(!g.text.includes(KEY) && !g.text.includes('key_enc'), 'no key and no ciphertext in the admin API');
  assert.equal(g.body.ai.model, 'openai/gpt-4o-mini');
  assert.ok(!(await adm.get('/api/admin/settings')).text.includes('key_enc'));
  await llm.complete({ messages: [{ role: 'user', content: 'x' }] });
  assert.equal(mock.last().headers.authorization, 'Bearer ' + KEY, 'the saved key wins over the env key');
  const log = env.db.all("SELECT detail FROM audit_log WHERE action = 'ai_update'");
  assert.ok(log.length && log.every(l => !l.detail.includes(KEY) && !l.detail.includes('v1:')));
  assert.match(log[log.length - 1].detail, /key saved for openrouter/);

  // A different OpenRouter address (env change) never receives the saved key.
  const realBase = config.ai.openrouter.baseUrl;
  config.ai.openrouter.baseUrl = 'http://127.0.0.1:1/api/v1';
  assert.equal(llm.resolve().key, OR_KEY, 'falls back to the env key, not the saved one');
  config.ai.openrouter.baseUrl = realBase;

  // Switching provider clears the saved key, so it has to be typed again.
  r = await adm.req('PATCH', '/api/admin/ai', { provider: 'openai' });
  assert.equal(r.body.key_cleared, true);
  assert.equal(r.body.ai.has_key, false);
  assert.equal(settings.get('ai').key_enc, '');
  assert.match(env.db.one("SELECT detail FROM audit_log WHERE action = 'ai_update' ORDER BY id DESC LIMIT 1").detail, /key cleared/);

  for (const bad of [{ provider: 'skynet' }, { openrouter_model: 'not a model' }, { fallback_models: 'a/b,c/d,e/f,g/h,i/j,k/l' }]) assert.equal((await adm.req('PATCH', '/api/admin/ai', bad)).status, 400);
  const { client } = await h.signup();
  assert.equal((await client.req('PATCH', '/api/admin/ai', { provider: 'openrouter' })).status, 403);
});

test('caps still apply with OpenRouter: 200 AI searches a day per account, and the plan’s AI breakdowns', async () => {
  const { client, user } = await h.signup();
  // The same account from a new address every 25 calls, so the per-address pace limit (30 a minute) never kicks in first.
  let okN = 0, last, cur;
  const sameUser = () => { const c = h.client(); for (const [k, v] of client.jar) c.jar.set(k, v); return c; };
  for (let i = 0; i < 201; i++) {
    if (i % 25 === 0) cur = sameUser();
    last = await cur.post('/api/app/ai-search', { text: 'crypto ads in Brazil running a month ' + i });
    if (last.status === 200) okN++;
  }
  assert.equal(okN, 200);
  assert.equal(last.status, 429);
  assert.equal(mock.calls.filter(c => c.kind === 'openrouter').length, 200, 'the 201st never reached the AI');

  const max = require('../src/services/account').limit(user, 'analyses');
  const ids = ads.search({ limit: max + 1, sort: 'score' }).items.map(a => a.id);
  assert.ok(ids.length > max);
  const res = [];
  cur = sameUser();
  for (const id of ids) res.push((await cur.post('/api/app/ads/' + id + '/analyse')).status);
  assert.deepEqual(res.slice(0, max), Array(max).fill(200));
  assert.equal(res[max], 402);
});
