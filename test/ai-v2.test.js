'use strict';
// AI breakdown v2: the new expert fields (hook type, awareness, funnel, compliance risk, scores, test ideas), how model
// output is cleaned, how they are stored in ad_analysis.extra and returned by analysisOut, and the refresh rules.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { startMockAi } = require('./mock-ai');

const OR_KEY = 'sk-or-v1-test-v2-key-5678';
let env, mock, ai, ads, config, settings;

before(async () => {
  mock = await startMockAi();
  Object.assign(process.env, { AI_PROVIDER: 'openrouter', OPENROUTER_API_KEY: OR_KEY, OPENROUTER_BASE_URL: mock.base + '/api/v1', OPENROUTER_MODEL: 'anthropic/claude-sonnet-4.5', AI_RETRY_BASE_MS: '20' });
  delete process.env.OPENROUTER_FALLBACK_MODELS;
  env = await h.boot();
  ai = require('../src/services/ai'); ads = require('../src/services/ads'); config = require('../src/config'); settings = require('../src/services/settings');
});
after(async () => { await env.close(); await mock.close(); });
beforeEach(() => {
  mock.reset();
  settings.set('ai', { provider: '', openrouter_model: '', fallback_models: '', key_enc: '', key_for: '' });
  config.ai.provider = 'openrouter'; config.ai.openrouter.key = OR_KEY; config.ai.key = ''; config.ai.openai.key = '';
});

const fake = extra => ({
  id: 1, adv_name: 'Acme Trade', niche: 'Trading', days_running: 45, variation_count: 6, countries: ',NG,KE,ZA,', platforms: ',facebook,',
  media_type: 'video', cta_type: 'SIGN_UP', cta_text: '', landing_domain: 'acmetrade.com', landing_url: 'https://acmetrade.com/start', status: 'active',
  headline: 'Start with a free demo account', primary_text: 'Why do most beginners lose on their first trade? Practice first with a free demo account. No fees to start.', description: '', ...extra
});
const firstAd = (n = 0) => ads.search({ limit: n + 1, sort: 'new' }).items[n].id;

test('basic() fills every new field with sensible values', () => {
  const b = ai.basic(fake());
  assert.equal(b.model, 'spyvoo-basic');
  assert.equal(b.hook_type, 'Question');
  assert.ok(['Unaware', 'Problem aware', 'Solution aware', 'Product aware', 'Most aware'].includes(b.awareness_stage));
  assert.match(b.persona, /trading/i);
  assert.match(b.funnel, /Direct to site \(acmetrade\.com\)/);
  assert.ok(b.offer_mechanics.includes('Risk reversal'));
  assert.ok(b.offer_mechanics.includes('Low entry'));
  assert.equal(b.compliance_risk.level, 'medium', 'trading is a restricted category even with clean copy');
  for (const k of ['hook', 'offer', 'creative', 'overall']) assert.ok(Number.isInteger(b.scores[k]) && b.scores[k] >= 1 && b.scores[k] <= 10, k);
  assert.equal(b.test_ideas.length, 4);
  assert.match(b.test_ideas[3], /^Angle test:/);
  assert.ok(!b.test_ideas.slice(0, 3).some(t => t.startsWith('Question hook')), 'suggests hook types other than the one the ad uses');
  // the old keys are all still there
  for (const k of ['hook', 'angle', 'offer', 'audience', 'triggers', 'format', 'transcript', 'why', 'how_to_adapt']) assert.ok(k in b, k);
});

test('basic() funnel: Telegram, WhatsApp, app install, lead form', () => {
  assert.equal(ai.basic(fake({ landing_domain: 't.me', landing_url: 'https://t.me/acmesignals' })).funnel, 'Telegram');
  assert.equal(ai.basic(fake({ landing_domain: 'wa.me', landing_url: 'https://wa.me/2348000000000' })).funnel, 'WhatsApp');
  assert.equal(ai.basic(fake({ landing_domain: '', landing_url: '', cta_type: 'WHATSAPP_MESSAGE' })).funnel, 'WhatsApp');
  assert.equal(ai.basic(fake({ landing_domain: 'play.google.com', landing_url: 'https://play.google.com/store/apps/details?id=x' })).funnel, 'App install');
  assert.equal(ai.basic(fake({ landing_domain: '', landing_url: '', cta_type: 'SIGN_UP' })).funnel, 'Lead form');
});

test('compliance risk: income claims are high, clean e-commerce copy is low', () => {
  const claim = ai.basic(fake({ primary_text: 'Guaranteed profit every day! Earn 5% per day with our bot. I made $2,000 last week.', headline: 'Never lose a trade again' }));
  assert.equal(claim.compliance_risk.level, 'high');
  assert.match(claim.compliance_risk.notes, /Guaranteed income or profit/);
  assert.equal(ai.complianceOf('Earn 3%/day on autopilot', 'Crypto').level, 'high');
  assert.equal(ai.complianceOf('Are you broke? Fix it today', 'Coaching').level, 'medium');
  const shop = ai.basic(fake({ niche: 'Fashion', primary_text: 'New sneakers just dropped. Free delivery in Lagos.', headline: 'Shop the drop', cta_type: 'SHOP_NOW' }));
  assert.equal(shop.compliance_risk.level, 'low');
  assert.ok(shop.offer_mechanics.includes('Free shipping'));
});

test('cleanBreakdown: garbage, oversized and missing fields are clamped safely', () => {
  const base = ai.basic(fake({ primary_text: 'Guaranteed returns of 10% daily.' }));
  const out = ai.cleanBreakdown({
    hook: 'x'.repeat(5000), angle: { evil: true }, offer: 42, audience: null, triggers: ['A', 7, { x: 1 }, 'A', 'B', 'C', 'D', 'E', 'F'],
    hook_type: '<img src=x onerror=alert(1)>' + 'y'.repeat(200), awareness_stage: 'problem-aware', sophistication: 9,
    persona: ['not', 'a', 'string'], funnel: '', offer_mechanics: 'Bonus', test_ideas: Array.from({ length: 50 }, (_, i) => 'Idea ' + i + ' ' + 'z'.repeat(1000)),
    compliance_risk: { level: 'LOW', notes: 'fine' }, scores: { hook: '8', offer: 11, creative: 'great', overall: -3 }, why: '\u0000Line\n\n  two  '
  }, base, { model: 'test-model' });
  assert.equal(out.hook.length, 500);
  assert.equal(out.angle, base.angle, 'non-string falls back');
  assert.equal(out.offer, '42');
  assert.equal(out.audience, base.audience);
  assert.deepEqual(out.triggers, ['A', '7', 'B', 'C', 'D']);
  assert.ok(out.hook_type.length <= 40);
  assert.equal(out.awareness_stage, 'Problem aware');
  assert.equal(out.sophistication, undefined, 'out of 1-5 is dropped');
  assert.equal(out.persona, base.persona);
  assert.equal(out.funnel, base.funnel);
  assert.deepEqual(out.offer_mechanics, base.offer_mechanics, 'non-array falls back');
  assert.equal(out.test_ideas.length, 5);
  assert.ok(out.test_ideas.every(t => t.length <= 280));
  assert.equal(out.compliance_risk.level, 'high', 'the model cannot lower a hard-rule high risk');
  assert.match(out.compliance_risk.notes, /fine/);
  assert.deepEqual(out.scores, { hook: 8, overall: 8 }, 'only valid 1-10 numbers survive; overall falls back to the average');
  assert.equal(out.why, 'Line two');
  assert.equal(out.model, 'test-model');
  // a non-object answer keeps the rule-based breakdown
  const none = ai.cleanBreakdown(['nope'], base);
  assert.equal(none.hook, base.hook);
  assert.deepEqual(none.scores, base.scores);
  assert.deepEqual(none.compliance_risk, base.compliance_risk);
});

test('AI breakdown stores the new fields in extra and analysisOut returns them', async () => {
  const id = firstAd(0);
  mock.text = JSON.stringify({
    hook: 'Stop scrolling', hook_type: 'Pattern interrupt', awareness_stage: 'Solution aware', sophistication: 3, angle: 'Copy the pros', offer: 'Free demo',
    offer_mechanics: ['Risk reversal', 'Low entry'], audience: 'Beginners', persona: 'Lagos office worker, 28, wants a side income', triggers: ['Curiosity'],
    format: 'UGC video', pacing: 'Fast cuts', funnel: 'Telegram', why: 'Ran 40 days across 6 variations.', how_to_adapt: 'Do your own.',
    compliance_risk: { level: 'medium', notes: 'Avoid income claims.' }, scores: { hook: 9, offer: 6, creative: 7, overall: 8 },
    test_ideas: ['Question hook: Why do traders copy?', 'UGC confession hook: I almost quit.', 'Demo hook: watch the app.', 'Angle test: safety first.']
  });
  const r = await ai.analyse(id, { force: true });
  assert.equal(r.analysis.hook_type, 'Pattern interrupt');
  assert.equal(r.analysis.extra.funnel, 'Telegram');
  assert.deepEqual(r.analysis.scores, { hook: 9, offer: 6, creative: 7, overall: 8 });
  assert.match(mock.last('openrouter').body.messages[0].content, /senior media buyer/);
  const row = env.db.one('SELECT * FROM ad_analysis WHERE ad_id = ?', id);
  const extra = JSON.parse(row.extra);
  assert.equal(extra.v, ai.BREAKDOWN_VERSION);
  assert.equal(extra.compliance_risk.level, 'medium');
  const out = ads.analysisOut(row);
  assert.equal(out.extra.persona, 'Lagos office worker, 28, wants a side income');
  assert.equal(out.sophistication, 3);
  assert.equal(out.hook, 'Stop scrolling');
  assert.equal(ads.detail(id).analysis.test_ideas.length, 4);
  // cached now: no second AI call
  mock.reset();
  const again = await ai.analyse(id);
  assert.equal(again.cached, true);
  assert.equal(mock.calls.length, 0);
});

test('analysisOut copes with old rows (no or broken extra)', () => {
  const out = ads.analysisOut({ hook: 'h', angle: 'a', offer: 'o', audience: 'u', triggers: '["T"]', format: 'f', transcript: '', why: 'w', how_to_adapt: 'x', model: 'm', created_at: 'now' });
  assert.deepEqual(out.extra, {});
  assert.deepEqual(out.triggers, ['T']);
  assert.deepEqual(ads.analysisOut({ triggers: '[]', extra: 'not json' }).extra, {});
  assert.deepEqual(ads.analysisOut({ triggers: '[]', extra: '[1,2]' }).extra, {});
});

test('refresh rules: old AI rows are redone once when live, kept when the AI fails; old basic rows are redone for free', async () => {
  const id = firstAd(1);
  const old = { hook: 'Old AI hook', angle: 'a', offer: 'o', audience: 'u', triggers: '[]', format: 'f', transcript: '', why: 'w', how_to_adapt: 'x', extra: '{}', model: 'old-model', created_at: env.db.now() };
  env.db.run('DELETE FROM ad_analysis WHERE ad_id = ?', id);
  env.db.insert('ad_analysis', { ad_id: id, ...old });
  // AI fails: the paid breakdown is kept
  mock.queue.push({ status: 400, body: { error: { code: 400, message: 'bad' } } });
  let r = await ai.analyse(id);
  assert.equal(r.analysis.hook, 'Old AI hook');
  // AI works: redone with v2 fields (the default mock answer has only old keys, so the rules fill the rest)
  mock.reset();
  r = await ai.analyse(id);
  assert.equal(r.cached, false);
  assert.equal(r.analysis.hook, 'Mock hook');
  assert.ok(r.analysis.hook_type && r.analysis.funnel && r.analysis.compliance_risk.level && r.analysis.test_ideas.length);
  // no AI key: an old rule-based row is rebuilt by the rules, no AI call
  config.ai.openrouter.key = '';
  env.db.update('ad_analysis', id, { ...old, model: 'spyvoo-basic' }, 'ad_id');
  mock.reset();
  r = await ai.analyse(id);
  assert.equal(r.analysis.model, 'spyvoo-basic');
  assert.ok(r.analysis.hook_type);
  assert.equal(mock.calls.length, 0);
  // and once fresh it stays cached
  assert.equal((await ai.analyse(id)).cached, true);
});

test('Make it mine: new expert prompt, extra script fields cleaned, old shape kept', async () => {
  const id = firstAd(0);
  const { user } = await h.signup();
  mock.text = JSON.stringify({ scripts: [
    { title: 'One', hook_type: 'Question', hook: 'Why?', first_3s: 'Close-up of phone', on_screen_text: 'Why?', body: 'Body', cta: 'Sign up' },
    { title: '', hook: '', body: '' }, 'junk',
    { title: 'Two', hook: 'h'.repeat(900), body: 'b', cta: 'Go', on_screen_text: { x: 1 } }
  ], headlines: [] });
  const m = await ai.makeItMine(id, user, { product: 'hair oil' });
  assert.match(mock.last('openrouter').body.messages[0].content, /copywriter/);
  assert.equal(m.scripts.length, 2);
  assert.equal(m.scripts[0].first_3s, 'Close-up of phone');
  assert.equal(m.scripts[1].hook.length, 240);
  assert.equal(m.scripts[1].on_screen_text, undefined);
  assert.equal(m.headlines.length, 5, 'empty headlines fall back to the rule-based ones');
  for (const s of m.scripts) for (const k of ['title', 'hook', 'body', 'cta']) assert.equal(typeof s[k], 'string');
  const basic = ai.makeItMineBasic(ads.get(id));
  assert.equal(basic.scripts.length, 3);
  assert.ok(basic.scripts.every(s => s.hook_type && s.first_3s && s.on_screen_text));
});
