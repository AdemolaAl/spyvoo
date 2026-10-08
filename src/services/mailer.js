'use strict';
const longDate = d => new Date(d === undefined ? Date.now() : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
// Sends branded emails using the templates in /emails. Providers: log, resend, brevo, postmark.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const tpl = require('../lib/tpl');
const settings = require('./settings');

const DIR = path.join(config.root, 'emails');
const cache = new Map();

function load(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Bad template name');
  if (cache.has(name) && config.isProd) return cache.get(name);
  const src = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
  const subject = (src.match(/<!--\s*subject:\s*([\s\S]*?)-->/) || [])[1] || 'Spyvoo';
  const preheader = (src.match(/<!--\s*preheader:\s*([\s\S]*?)-->/) || [])[1] || '';
  const body = src.replace(/<!--\s*(subject|preheader):[\s\S]*?-->\s*/g, '');
  const t = { subject: subject.trim(), preheader: preheader.trim(), body };
  cache.set(name, t);
  return t;
}

function list() {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'base.html').map(f => {
    const name = f.replace(/\.html$/, '');
    let subject = load(name).subject;
    try { subject = build(name, SAMPLE).subject; } catch { /* keep the raw subject */ }
    return { name, subject };
  });
}

// "More from Zedapex" strip at the bottom of every email: the other Voo tools, from Admin → Voo family.
function familyHtml() {
  const { esc } = require('../lib/md');
  const list = settings.get('family').filter(f => f.on && f.key !== 'voosquare').slice(0, 4);
  if (!list.length) return '';
  const cell = f => '<td class="sv-stack" width="50%" valign="top" style="padding:6px;"><a href="' + esc(f.url) + '?utm_source=spyvoo&amp;utm_medium=email" target="_blank" style="display:block;text-decoration:none;background-color:' + esc(f.color) + ';border-radius:16px;padding:16px 16px 14px 16px;">' +
    (['joinvoo', 'replyvoo', 'castvoo', 'vooads', 'gatevoo', 'affleego'].includes(f.key) ? '<img src="' + config.appUrl + '/img/brands/' + f.key + '.png" width="30" height="30" alt="" style="display:block;width:30px;height:30px;border-radius:9px;margin:0 0 10px 0;">' : '') + '<span style="display:inline-block;font-family:Manrope,-apple-system,Segoe UI,Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:' + esc(f.accent || f.ink) + ';opacity:.85;">' + esc(f.tag) + '</span>' +
    '<span style="display:block;font-family:Manrope,-apple-system,Segoe UI,Arial,sans-serif;font-size:17px;line-height:22px;font-weight:800;color:' + esc(f.ink) + ';margin-top:4px;">' + esc(f.name) + '</span>' +
    '<span style="display:block;font-family:Manrope,-apple-system,Segoe UI,Arial,sans-serif;font-size:13px;line-height:18px;color:' + esc(f.ink) + ';opacity:.85;margin-top:4px;">' + esc(f.title) + '</span>' +
    '<span style="display:inline-block;margin-top:10px;font-family:Manrope,-apple-system,Segoe UI,Arial,sans-serif;font-size:12px;font-weight:800;color:' + esc(f.color) + ';background-color:' + esc(f.accent || f.ink) + ';border-radius:999px;padding:6px 11px;">' + esc(f.perk || 'Learn more') + ' &rarr;</span></a></td>';
  let rows = '';
  for (let i = 0; i < list.length; i += 2) rows += '<tr>' + cell(list[i]) + (list[i + 1] ? cell(list[i + 1]) : '<td class="sv-stack" width="50%"></td>') + '</tr>';
  return rows;
}

function baseData() {
  const c = settings.get('company');
  return { app_url: config.appUrl, logo_url: /^https?:/.test(c.logo_url) ? c.logo_url : config.appUrl + c.logo_url, company_name: c.legal_name, company_city: c.city, support_email: c.support_email, agent_name: (settings.get('support') || {}).agent_name || 'Leo', year: new Date().getFullYear(), family_html: familyHtml() };
}

function build(name, data = {}) {
  const t = load(name);
  const all = { ...baseData(), ...data };
  const content = tpl.render(t.body, all);
  const subject = decode(tpl.render(t.subject, all)).replace(/\s+/g, ' ').trim();
  const preheader = tpl.render(t.preheader, all);
  const base = load('base');
  const html = tpl.render(base.body, { ...all, content, preheader });
  return { subject, html, text: toText(html) };
}

// Plain-text part: readable on its own (multipart/alternative), no raw entities, cells and labels kept apart.
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rarr: '→', larr: '←', middot: '·', copy: '©', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', zwnj: '', zwj: '', shy: '' };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n === 8202 || n === 8203 || n === 8204 ? '' : String.fromCodePoint(n); }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
function toText(html) {
  return decode(html.replace(/<head[\s\S]*?<\/head>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<div class="sv-preheader"[\s\S]*?<\/div>/i, '')
    .replace(/<span\b[^>]*display:\s*(block|inline-block)[^>]*>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const label = inner.replace(/<[^>]+>/g, '').replace(/[ \t]*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
      const url = href.replace(/^mailto:/i, '');
      return !label ? '' : label === url || label === href ? label : label + ' (' + url + ')';
    })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<(p|h\d|tr|table|div)\b[^>]*>/gi, '\n').replace(/<\/(p|tr|h\d|div|table)>/gi, '\n')
    .replace(/<\/td>[ \t]*(<td\b[^>]*sv-stack)/gi, '\n\n$1').replace(/<\/td>[ \t]*<td\b/gi, ': <td').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function parseFrom(from) {
  const m = String(from).match(/^(.*)<(.+)>$/);
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: 'Spyvoo', email: from };
}

async function deliver(to, msg, opts = {}) {
  const replyTo = opts.replyTo || config.mail.replyTo;
  // Bulk mail (alerts, weekly report, offers, news) carries List-Unsubscribe so Gmail/Yahoo show their
  // "Unsubscribe" link instead of users pressing "Report spam".
  // One-click unsubscribe (Gmail/Yahoo bulk-sender rules): a signed link that switches off marketing mail for this address.
  const marketing = opts.bulk && MARKETING.has(opts.template || '');
  const unsub = marketing ? unsubscribeUrl(to) : '';
  const headers = marketing ? { 'List-Unsubscribe': '<' + unsub + '>, <mailto:' + (settings.get('company').support_email || replyTo) + '?subject=Unsubscribe>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : null;
  const p = config.mail.provider;
  const key = config.mail.key;
  if (p === 'log' || !key) {
    if (!process.env.SV_QUIET) {
      console.log('[mail:' + (p === 'log' ? 'log' : 'no-key') + '] to=' + to + ' subject="' + msg.subject + '"');
      // In development, print the links so verify/reset/invite flows can be tested without an email provider.
      if (!config.isProd) (msg.html.match(/href="(https?:\/\/[^"]+)"/g) || []).map(h => h.slice(6, -1)).filter(u => u.startsWith(config.appUrl) && !/\/(legal|blog)\b/.test(u)).slice(0, 3).forEach(u => console.log('    link: ' + u.replace(/&amp;/g, '&')));
    }
    return 'logged';
  }
  let res;
  if (p === 'resend') {
    res = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: [to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: replyTo || undefined, headers: headers || undefined }) });
  } else if (p === 'brevo') {
    const f = parseFrom(config.mail.from);
    res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: f, to: [{ email: to }], subject: msg.subject, htmlContent: msg.html, textContent: msg.text, replyTo: replyTo ? { email: replyTo } : undefined, headers: headers || undefined }) });
  } else if (p === 'postmark') {
    res = await fetch('https://api.postmarkapp.com/email', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'X-Postmark-Server-Token': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ From: config.mail.from, To: to, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text, ReplyTo: replyTo || undefined, MessageStream: opts.bulk ? (process.env.POSTMARK_BROADCAST_STREAM || 'outbound') : 'outbound', Headers: headers ? Object.entries(headers).map(([Name, Value]) => ({ Name, Value })) : undefined }) });
  } else throw new Error('Unknown MAIL_PROVIDER ' + p);
  if (!res.ok) { const e = new Error('Email provider ' + p + ' returned ' + res.status + ': ' + (await res.text()).slice(0, 300)); e.retry = res.status === 429 || res.status >= 500; throw e; }
  return 'sent';
}

// Every email goes through one paced queue (about 2 a second), so a broadcast never trips the provider's
// rate limit. Transactional emails (welcome, reset, receipts) jump ahead of bulk ones. 429/5xx are retried twice.
const queue = { now: [], bulk: [], busy: false };
const GAP_MS = 520;
function pump() {
  if (queue.busy) return;
  const job = queue.now.shift() || queue.bulk.shift();
  if (!job) return;
  queue.busy = true;
  const isLog = config.mail.provider === 'log' || !config.mail.key;
  deliver(job.to, job.msg, job.opts).then(status => {
    db.insert('email_log', { to_email: job.to, template: job.name, subject: job.msg.subject, status: status || 'sent', created_at: db.now() });
    job.done(status === 'sent');
  }).catch(e => {
    if (e.retry && job.tries < 2) { job.tries++; setTimeout(() => { queue.now.unshift(job); pump(); }, 3000 * job.tries).unref(); return; }
    console.error('[mail] send failed', job.name, job.to, e.message);
    db.insert('email_log', { to_email: job.to, template: job.name, subject: job.msg.subject, status: 'failed', error: String(e.message).slice(0, 500), created_at: db.now() });
    job.done(false);
  }).finally(() => { setTimeout(() => { queue.busy = false; pump(); }, isLog ? 0 : GAP_MS).unref?.(); });
}
// Returns a promise (true when sent) that tests and the admin "send test" can await. opts.bulk = true for mass mail.
function send(to, name, data = {}, opts = {}) {
  let msg;
  try { msg = build(name, data); } catch (e) { console.error('[mail] build failed', name, e.message); return Promise.resolve(false); }
  return new Promise(done => { (opts.bulk ? queue.bulk : queue.now).push({ to, name, msg, opts: { ...opts, template: name }, tries: 0, done }); pump(); });
}
function pending() { return queue.now.length + queue.bulk.length; }

// Marketing mail only: the one-click link switches these off (alerts are turned off on the follow / saved search).
const MARKETING = new Set(['weekly-report', 'offer', 'announcement']);
function unsubscribeToken(email) { const e = String(email || '').toLowerCase(); return Buffer.from(e).toString('base64url') + '.' + require('../lib/security').hmac('unsub:' + e).slice(0, 32); }
function unsubscribeUrl(email) { return config.appUrl + '/unsubscribe/' + unsubscribeToken(email); }
function readUnsubscribe(tok) {
  const m = /^([A-Za-z0-9_-]{4,400})\.([0-9a-f]{32})$/.exec(String(tok || ''));
  if (!m) return null;
  let email; try { email = Buffer.from(m[1], 'base64url').toString('utf8'); } catch { return null; }
  return require('../lib/security').safeEqual(unsubscribeToken(email).split('.')[1], m[2]) ? email : null;
}
const U = config.appUrl;
const SAMPLE = {
  name: 'Maya', dashboard_url: U + '/app', verify_url: U + '/verify?token=sample', reset_url: U + '/reset?token=sample', code: '482913',
  plan: 'Pro', amount: '79.00', currency: 'USD', reference: 'SV-SAMPLE-123', date: longDate(), interval: 'month', coin: 'USDT (TRON)',
  renew_date: longDate(Date.now() + 3 * 864e5), renew_url: U + '/app/plan', plan_url: U + '/app/plan',
  advertiser: 'TradeNest', count: '6', count_label: '6 new ads', ad_title: 'Start trading with $10. Copy top traders in one tap.', ad_url: U + '/app/ad/1', ad_image: U + '/img/ads/1.webp', ads_url: U + '/app/advertiser/1',
  search_name: 'Crypto in Brazil, 30+ days', count_label: '6 new ads', search_url: U + '/app/discover', niche: 'Crypto', summary: 'Low-risk entry offers (“start with $10”) and copy-trading angles keep winning this week.',
  inviter_name: 'Maya', team_name: 'Glow Lab', invite_url: U + '/invite?token=sample', budget: '5', spent: '5.02',
  offer_title: 'Launch offer', offer_text: 'Half price on your first month of Starter, Pro or Agency.', offer_code: 'SPYLAUNCH',
  subject: 'An update from Spyvoo', body_html: '<p>This is a sample announcement.</p>',
  reason: 'We couldn’t find a transfer with this reference. Please check the reference and try again.'
};

module.exports = { pending, send, build, list, SAMPLE, unsubscribeUrl, readUnsubscribe };
