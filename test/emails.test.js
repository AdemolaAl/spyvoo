'use strict';
// Every email template builds cleanly: subject + preheader, no leftover placeholders, balanced HTML,
// a readable plain-text part, and only the variables its callers really pass.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers');

let env, mailer, config;
before(async () => { env = await h.boot(); mailer = require('../src/services/mailer'); config = require('../src/config'); });
after(async () => { await env.close(); });

const DIR = path.join(__dirname, '..', 'emails');
const BASE_VARS = ['app_url', 'logo_url', 'company_name', 'company_city', 'support_email', 'agent_name', 'year', 'family_html'];
// What each mailer.send(...) caller passes (grep "mailer.send" / "require('./mailer').send" in src/).
const CALLERS = {
  welcome: ['name', 'dashboard_url', 'verify_url'],
  'verify-email': ['name', 'verify_url'],
  'password-reset': ['name', 'reset_url'],
  'team-invite': ['inviter_name', 'team_name', 'invite_url'],
  'payment-receipt': ['name', 'plan', 'interval', 'amount', 'currency', 'reference', 'date', 'renew_date', 'coin', 'dashboard_url'],
  'payment-rejected': ['name', 'plan', 'reference', 'amount', 'currency', 'reason', 'plan_url'],
  'renewal-reminder': ['name', 'plan', 'renew_date', 'renew_url'],
  'plan-expired': ['name', 'plan', 'plan_url'],
  'advertiser-alert': ['name', 'advertiser', 'count', 'count_label', 'ad_title', 'ad_image', 'ad_url', 'ads_url'],
  'search-alert': ['name', 'search_name', 'count', 'count_label', 'search_url', 'ad_title', 'ad_image'],
  'weekly-report': ['name', 'niche', 'summary', 'ad_title', 'ad_image', 'ad_url', 'search_url'],
  offer: ['name', 'offer_title', 'offer_text', 'offer_code', 'plan_url'],
  announcement: ['name', 'subject', 'body_html', 'unsubscribe_url'],
  'admin-budget': ['name', 'budget', 'spent']
};
const templates = () => fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'base.html').map(f => f.replace(/\.html$/, ''));

function balanced(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  for (const tag of ['table', 'tr', 'td', 'a', 'p', 'h1', 'span', 'div', 'b']) {
    const open = (body.match(new RegExp('<' + tag + '\\b', 'gi')) || []).length;
    const close = (body.match(new RegExp('</' + tag + '>', 'gi')) || []).length;
    if (open !== close) return tag + ': ' + open + ' open, ' + close + ' closed';
  }
  return '';
}

test('every template has a caller map entry and the admin list shows them all', () => {
  assert.deepEqual(templates().sort(), Object.keys(CALLERS).sort());
  assert.equal(mailer.list().length, templates().length);
});

for (const name of Object.keys(CALLERS)) {
  test('email "' + name + '" builds cleanly with sample data', () => {
    const src = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
    assert.match(src, /^<!--\s*subject:\s*\S[\s\S]*?-->/, 'subject comment on line 1');
    assert.match(src, /<!--\s*preheader:\s*\S[\s\S]*?-->/, 'preheader comment');
    const m = mailer.build(name, mailer.SAMPLE);
    assert.ok(m.subject && m.subject !== 'Spyvoo', 'has its own subject');
    assert.ok(m.subject.length <= 50, 'subject under 50 chars with sample data: ' + m.subject);
    assert.doesNotMatch(m.subject, /!{2,}|\b(FREE|URGENT|ACT NOW)\b/, 'no spammy subject');
    assert.doesNotMatch(m.html + m.subject + m.text, /\{\{|\}\}/, 'no leftover placeholders');
    assert.match(m.html, /class="sv-preheader"[^>]*>\s*\S/, 'preheader rendered');
    assert.equal(balanced(m.html), '', 'balanced HTML');
    assert.match(m.html, /<a [^>]*href="http[^"]+"[^>]*>[^<]*&nbsp;&rarr;<\/a>/, 'one bulletproof CTA button');
    assert.equal((m.html.match(/class="sv-btn"/g) || []).length, 1, 'exactly one main button');
    assert.doesNotMatch(m.html, /<img(?![^>]*\balt=)[^>]*>/, 'every image has alt');
    assert.doesNotMatch(m.text, /&[a-z#0-9]+;/i, 'plain text has no raw entities');
    assert.doesNotMatch(m.text, /\(\s*\)|undefined|null/, 'no empty links or missing values in text');
    assert.ok(m.html.length < 90 * 1024, 'under Gmail clipping size');
  });

  test('email "' + name + '" only uses variables its callers pass', () => {
    const src = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
    const used = new Set([...src.matchAll(/\{\{\{?\s*(?:#if\s+|#unless\s+)?([\w.]+)\s*\}?\}\}/g)].map(x => x[1]));
    const ok = new Set([...BASE_VARS, ...CALLERS[name]]);
    for (const v of used) assert.ok(ok.has(v), name + ' uses {{' + v + '}} but no caller passes it');
  });
}

test('optional blocks hide cleanly when data is missing', () => {
  const w = mailer.build('welcome', { name: 'Ada', dashboard_url: 'https://x.test/app', verify_url: '' });
  assert.doesNotMatch(w.html, /confirm your email/i);
  const s = mailer.build('search-alert', { name: 'Ada', search_name: 'Shoes', count: '2', count_label: '2 new ads', search_url: 'https://x.test/s', ad_title: '', ad_image: '' });
  assert.doesNotMatch(s.html, /<img [^>]*src=""|&ldquo;&rdquo;/);
  const a = mailer.build('advertiser-alert', { ...mailer.SAMPLE, ad_image: '' });
  assert.match(a.html, /Start trading with \$10/);
  assert.doesNotMatch(a.html, /<img [^>]*src=""/);
  const r = mailer.build('payment-receipt', { ...mailer.SAMPLE, coin: '' });
  assert.doesNotMatch(r.html, /Paid with/);
  assert.match(r.subject, /Pro/);
  assert.match(r.text, /Amount paid: \$79\.00 USD/);
});

test('names and subjects are escaped; subject decodes entities back to plain text', () => {
  const m = mailer.build('advertiser-alert', { ...mailer.SAMPLE, advertiser: 'Tom & Jerry <Ltd>' });
  assert.equal(m.subject, 'Tom & Jerry <Ltd> just launched 6 new ads');
  assert.match(m.html, /Tom &amp; Jerry &lt;Ltd&gt;/);
  assert.doesNotMatch(m.html, /<Ltd>/);
});

test('bulk mail carries List-Unsubscribe, transactional mail does not', async () => {
  const saved = { ...config.mail };
  Object.assign(config.mail, { provider: 'resend', key: 'test-key' });
  try {
    const before = h.outbound.length;
    await mailer.send('a@example.com', 'weekly-report', mailer.SAMPLE, { bulk: true });
    await mailer.send('b@example.com', 'password-reset', mailer.SAMPLE);
    const sent = h.outbound.slice(before).filter(o => /resend/.test(o.url)).map(o => JSON.parse(o.body));
    const bulk = sent.find(b => b.to[0] === 'a@example.com');
    const tx = sent.find(b => b.to[0] === 'b@example.com');
    assert.match(bulk.headers['List-Unsubscribe'], /^<https?:\/\/[^>]+\/unsubscribe\/[A-Za-z0-9_-]+\.[0-9a-f]{32}>, <mailto:[^>]+>$/);
    assert.equal(bulk.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.equal(tx.headers, undefined);
    assert.ok(bulk.text && bulk.html && bulk.subject);
  } finally { Object.assign(config.mail, saved); }
});

test('one-click unsubscribe: signed link turns marketing mail off; forged links do nothing', async () => {
  const { email, user } = await h.signup({ name: 'Unsub Me' });
  const db = require('../src/db');
  const url = mailer.unsubscribeUrl(email);
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  const c = h.client();
  const view = await c.get(path);
  assert.equal(view.status, 200);
  assert.match(view.text, /Stop marketing emails/);
  assert.equal(db.one('SELECT marketing_opt_out FROM users WHERE id = ?', user.id).marketing_opt_out, 0, 'opening the link alone changes nothing');
  const done = await c.req('POST', path, '', { raw: true, csrf: false });
  assert.equal(done.status, 200);
  assert.equal(db.one('SELECT marketing_opt_out FROM users WHERE id = ?', user.id).marketing_opt_out, 1);
  const forged = path.replace(/\.[0-9a-f]{32}$/, '.' + '0'.repeat(32));
  assert.equal((await c.req('POST', forged, '', { raw: true, csrf: false })).status, 400);
  const other = mailer.unsubscribeUrl('someone-else@example.com').replace(/^https?:\/\/[^/]+/, '').split('.')[0] + '.' + path.split('.').pop();
  assert.equal((await c.req('POST', other, '', { raw: true, csrf: false })).status, 400, 'a token for one address never works for another');
});

test('admins show as Owner, paying customers get the member badge data', async () => {
  const adm = await h.admin();
  const b = (await adm.get('/api/app/bootstrap')).body;
  assert.equal(b.user.plan.name, 'Owner');
  assert.equal(b.user.plan.owner, true);
  assert.equal(b.user.plan.paid, false);
  const { client, user } = await h.signup({ name: 'Paying One' });
  h.setPlan(user.id, 'pro');
  const p = (await client.get('/api/app/bootstrap')).body.user.plan;
  assert.deepEqual([p.name, p.paid, p.owner], ['Pro', true, false]);
  const { client: f } = await h.signup({ name: 'Free One' });
  assert.equal((await f.get('/api/app/bootstrap')).body.user.plan.paid, false);
});
