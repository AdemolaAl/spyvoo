'use strict';
// AI features: ad breakdown, video transcript, "Make it mine" scripts, plain-English search and niche reports.
// Uses Claude (ANTHROPIC_API_KEY). Without a key, a rule-based "basic" breakdown keeps every screen working.
// Every breakdown is cached in ad_analysis, so the same ad is never analysed twice.
const config = require('../config');
const db = require('../db');
const ads = require('./ads');
const countries = require('../lib/countries');
const media = require('./media');
const fs = require('node:fs');

const live = () => !!config.ai.key;

async function claude({ system, user, maxTokens = 900, model = config.ai.model }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.ai.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Claude: ' + ((data.error && data.error.message) || res.status));
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}
function json(text) {
  const s = String(text || ''); const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI returned no JSON');
  return JSON.parse(s.slice(a, b + 1));
}
const adBrief = (a, transcript) => [
  'Advertiser: ' + a.adv_name, 'Niche: ' + (a.niche || 'unknown'), 'Days running: ' + a.days_running, 'Variations: ' + a.variation_count,
  'Countries: ' + ads.uncsv(a.countries).join(', '), 'Format: ' + a.media_type, 'Call to action: ' + (a.cta_text || ads.ctaLabel(a.cta_type)),
  'Landing page: ' + (a.landing_domain || 'none'), 'Headline: ' + (a.headline || '-'), 'Primary text: ' + (a.primary_text || '-'), a.description ? 'Description: ' + a.description : '',
  transcript ? 'Video transcript: ' + transcript.slice(0, 4000) : ''
].filter(Boolean).join('\n');

/* ---------- transcript ---------- */
async function transcribe(a) {
  if (!config.ai.transcribeKey || a.media_type !== 'video') return '';
  const m = db.one("SELECT * FROM ad_media WHERE ad_id = ? AND type = 'video' AND status = 'done' AND storage_key != '' ORDER BY position LIMIT 1", a.id);
  if (!m || /^\//.test(m.storage_key)) return '';
  let buf;
  if (media.driver() === 'local') buf = fs.readFileSync(media.localPath(m.storage_key));
  else { const r = await fetch(media.url(m.storage_key), { signal: AbortSignal.timeout(60000) }); if (!r.ok) return ''; buf = Buffer.from(await r.arrayBuffer()); }
  if (buf.length > 24 * 1024 * 1024) return '';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'video/mp4' }), 'ad.mp4');
  fd.append('model', config.ai.transcribeModel);
  const res = await fetch(config.ai.transcribeUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + config.ai.transcribeKey }, body: fd, signal: AbortSignal.timeout(120000) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? String(data.text || '').slice(0, 20000) : '';
}

/* ---------- breakdown ---------- */
const TRIGGERS = [
  ['Urgency', /today only|ends|last chance|only \d+|left|hurry|now\b|limited/i], ['Social proof', /sold out|thousands|customers|reviews|people|copied|top traders|bestseller/i],
  ['Low risk', /free|\$0|no fees|money back|trial|demo|cancel anytime|withdraw anytime|no experience/i], ['Transformation', /i was|i lost|now i|before|after|in \d+ days/i],
  ['Curiosity', /here’s|here's|this is|secret|the exact|what i use|why/i], ['Savings', /% off|save|deal|cheaper|discount|bonus|get \$|free shipping/i],
  ['Speed', /in \d+ (minutes?|seconds?)|instant|fast|tomorrow|same-day|one tap|one click/i], ['Status', /luxury|villa|premium|exclusive|dubai|maldives/i]
];
const clean = t => String(t || '').replace(/\s+/g, ' ').trim();
const noEnd = t => clean(t).replace(/[\s.!?,;:…]+$/, '');
const cap = t => { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
function basic(a) {
  const text = [a.primary_text, a.headline, a.description].filter(Boolean).join(' ');
  const sentences = clean(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstLine = clean(String(a.primary_text || a.headline || '').split(/(?<=[.!?])\s|\n/)[0]);
  const trig = TRIGGERS.filter(([, re]) => re.test(text)).map(([t]) => t).slice(0, 4);
  // The offer is the sentence that promises something (free, % off, a price, a bonus), and never the hook again.
  const offerRe = /(free|% off|\$\d+|bonus|trial|no fees|\d+%|cashback|discount|money back|guarantee)/i;
  const offerLine = sentences.find(x => offerRe.test(x) && noEnd(x) !== noEnd(firstLine)) || (a.headline && offerRe.test(a.headline) && noEnd(a.headline) !== noEnd(firstLine) ? a.headline : '');
  const hookIsOffer = !offerLine && offerRe.test(firstLine);
  const cta = a.cta_text || ads.ctaLabel(a.cta_type);
  const longRun = a.days_running >= 30;
  const where = ads.uncsv(a.countries).filter(c => c !== 'ALL').slice(0, 3).map(c => countries.name(c) || c);
  return {
    hook: firstLine || 'The opening visual carries the hook',
    angle: trig.includes('Transformation') ? 'Before and after: a relatable person shows the result' : trig.includes('Low risk') ? 'Low risk: make the first step feel free and safe' : trig.includes('Social proof') ? 'Social proof: other people already trust it' : trig.includes('Savings') ? 'Deal-driven: a clear saving with a reason to act now' : 'Simple promise tied to one clear benefit',
    offer: offerLine ? noEnd(offerLine).slice(0, 200) : hookIsOffer ? 'Built into the hook: “' + noEnd(firstLine).slice(0, 120) + '”' : 'No discount: the promise in the hook is the offer',
    audience: (a.niche ? a.niche + ' buyers' : 'A broad audience') + (where.length ? ' in ' + where.join(', ') : '') + ', mostly on mobile',
    triggers: trig.length ? trig : ['Clarity'],
    format: (a.media_type === 'video' ? 'Short video' : a.media_type === 'carousel' ? 'Carousel' : 'Single image') + ' with a “' + cta + '” button',
    transcript: '',
    why: (longRun ? 'It has run for ' + a.days_running + ' days' + (a.variation_count > 1 ? ' across ' + a.variation_count + ' variations' : '') + ', so it is almost certainly profitable. ' : 'It is still new, so watch it for a few more days before copying the angle. ') +
      'The first line states one concrete benefit' + (trig.length ? ' and leans on ' + trig.slice(0, 2).join(' and ').toLowerCase() : '') + ', and the button asks for one small step: “' + cta + '”.',
    how_to_adapt: 'Keep the structure, not the words. Open with your own version of “' + noEnd(firstLine || a.headline).slice(0, 80) + '”, show your product doing the same job, and keep the first step just as small (' + cta.toLowerCase() + ').',
    model: 'spyvoo-basic'
  };
}

const SYSTEM_BREAKDOWN = 'You are a senior media buyer who studies winning Facebook and Instagram ads. You explain why an ad works in plain English a beginner understands. Never invent numbers you were not given. Reply with JSON only.';
async function analyse(id, { force = false } = {}) {
  const a = ads.get(id);
  if (!a) return null;
  const cached = db.one('SELECT * FROM ad_analysis WHERE ad_id = ?', a.id);
  if (cached && !force && (cached.model !== 'spyvoo-basic' || !live())) return { analysis: ads.analysisOut(cached), cached: true };
  let out = basic(a);
  if (live()) {
    let transcript = '';
    try { transcript = await transcribe(a); } catch (e) { console.error('[ai] transcript', e.message); }
    const raw = await claude({
      system: SYSTEM_BREAKDOWN,
      user: 'Break down this ad.\n\n' + adBrief(a, transcript) + '\n\nReturn JSON with keys: hook (the first line or first 3 seconds, quoted), angle (one sentence), offer, audience (who it targets, one sentence), triggers (array of 2-4 short emotional triggers), format (one short phrase), why (2-3 sentences: why it works), how_to_adapt (2 sentences: how to make your own version without copying).'
    });
    const j = json(raw);
    out = { hook: String(j.hook || out.hook), angle: String(j.angle || out.angle), offer: String(j.offer || out.offer), audience: String(j.audience || out.audience), triggers: Array.isArray(j.triggers) ? j.triggers.map(String).slice(0, 5) : out.triggers, format: String(j.format || out.format), transcript, why: String(j.why || out.why), how_to_adapt: String(j.how_to_adapt || out.how_to_adapt), model: config.ai.model };
  }
  const row = { hook: out.hook.slice(0, 500), angle: out.angle.slice(0, 500), offer: out.offer.slice(0, 500), audience: out.audience.slice(0, 500), triggers: JSON.stringify(out.triggers), format: out.format.slice(0, 200), transcript: out.transcript || '', why: out.why.slice(0, 2000), how_to_adapt: out.how_to_adapt.slice(0, 2000), model: out.model, created_at: db.now() };
  if (cached || db.one('SELECT ad_id FROM ad_analysis WHERE ad_id = ?', a.id)) db.update('ad_analysis', a.id, row, 'ad_id'); else { try { db.insert('ad_analysis', { ad_id: a.id, ...row }); } catch { db.update('ad_analysis', a.id, row, 'ad_id'); } }
  if (out.transcript) ads.ftsSync(a.id);
  return { analysis: ads.analysisOut(row), cached: false };
}

async function queueNew(ids) {
  for (const id of ids.slice(0, 50)) {
    try { await analyse(id); } catch (e) { db.insert('jobs', { kind: 'analysis', ref: 'ad ' + id, status: 'failed', error: String(e.message).slice(0, 300), created_at: db.now(), finished_at: db.now() }); }
  }
}

/* ---------- Make it mine ---------- */
function basicScripts(a, product) {
  const p = noEnd(product) || 'your product';
  const cta = (a.cta_text || ads.ctaLabel(a.cta_type) || 'Learn more');
  const an = basic(a);
  const country = ads.uncsv(a.countries).filter(c => c !== 'ALL').map(c => countries.name(c))[0];
  const hasOffer = !/^(No discount|Built into)/.test(an.offer);
  return {
    scripts: [
      { title: 'Steal the structure', hook: 'Your version of “' + noEnd(an.hook).replace(/[“”"]/g, '').slice(0, 90) + '”', body: 'This opening has kept the ad alive for ' + a.days_running + ' days. Keep its rhythm and length, but make the promise about ' + p + '. Show the result on screen within 3 seconds, then one proof shot, then the button.', cta },
      { title: 'The honest confession', hook: 'I didn’t think ' + p + ' would work for me. I was wrong.', body: 'Open on the problem your buyer feels, in their own words. Cut to ' + p + ' fixing it in one simple step. End on the result in big on-screen text.', cta },
      { title: 'The side-by-side', hook: 'Same budget. Two choices. Watch what happens.', body: 'Split screen: the old way on the left, ' + p + ' on the right. Let the difference speak. Close with your offer' + (hasOffer ? ', the way this ad does (“' + an.offer.slice(0, 70) + '”)' : '') + '.', cta }
    ],
    headlines: ['Stop overpaying. Try ' + p + '.', cap(p) + ': results you can see in days', 'Start small. See it work.', '3 reasons people are switching to ' + p, country ? 'Why ' + country + ' is switching to ' + p : 'The smarter way to start with ' + p]
  };
}
async function makeItMine(id, user, { product = '' } = {}) {
  const a = ads.get(id);
  if (!a) return null;
  let out = basicScripts(a, String(product).trim().slice(0, 120));
  let model = 'spyvoo-basic';
  if (live()) {
    const raw = await claude({
      system: 'You are a direct-response ad copywriter. You write fresh ads inspired by the angle of a winning ad, never copying its words. Plain, punchy English. Reply with JSON only.',
      user: 'Winning ad:\n' + adBrief(a) + '\n\nMy product: ' + (product || 'same category as the ad; keep it generic') + '\n\nReturn JSON: {"scripts":[{"title","hook","body","cta"} x3 — each a short video ad script, body under 70 words, written as scene directions and lines], "headlines":[5 short headlines]}',
      maxTokens: 1200
    });
    const j = json(raw);
    if (Array.isArray(j.scripts) && j.scripts.length) { out = { scripts: j.scripts.slice(0, 3).map(s => ({ title: String(s.title || ''), hook: String(s.hook || ''), body: String(s.body || ''), cta: String(s.cta || '') })), headlines: (j.headlines || []).map(String).slice(0, 5) }; model = config.ai.model; }
  }
  db.insert('ad_scripts', { ad_id: a.id, user_id: user.id, product: String(product).slice(0, 120), data: JSON.stringify(out), model, created_at: db.now() });
  return { ...out, model };
}

/* ---------- plain-English search ---------- */
async function parseSearch(text) {
  const base = ads.parseQuery(text);
  if (!live() || String(text).length < 12) return { ...base, via: 'rules' };
  try {
    const raw = await claude({
      system: 'Convert an ad-spy search request into filters. Reply with JSON only.',
      user: 'Request: ' + String(text).slice(0, 300) + '\n\nJSON keys (omit unknown): q (keywords only, short), countries (ISO-2 codes), min_days (number), cta (array of Meta CTA types like SIGN_UP, LEARN_MORE, SHOP_NOW, INSTALL_MOBILE_APP, ORDER_NOW, WHATSAPP_MESSAGE, SEND_MESSAGE), media (array of video,image,carousel), platforms (facebook,instagram), status (active|inactive), sort (score|days|new|variations), niche (array from: ' + require('./settings').get('niches').join(', ') + ').',
      maxTokens: 300
    });
    const j = json(raw);
    const out = { ...base };
    for (const k of ['q', 'countries', 'min_days', 'cta', 'media', 'platforms', 'status', 'sort', 'niche']) if (j[k] !== undefined && j[k] !== '' && !(Array.isArray(j[k]) && !j[k].length)) out[k] = j[k];
    return { ...out, via: 'ai' };
  } catch (e) { return { ...base, via: 'rules' }; }
}

/* ---------- weekly niche report ---------- */
async function nicheReport(niche) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const top = db.all('SELECT a.*, v.name adv_name FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.hidden = 0 AND a.niche = ? AND a.last_seen_at >= ? ORDER BY a.winner_score DESC LIMIT 8', niche, since);
  if (!top.length) return null;
  let summary = 'The top ' + niche.toLowerCase() + ' ads this week lean on ' + [...new Set(top.flatMap(a => basic(a).triggers))].slice(0, 3).join(', ').toLowerCase() + '. The longest runner is ' + top[0].adv_name + ' at ' + top[0].days_running + ' days.';
  if (live()) {
    try { summary = (await claude({ system: 'You write a short weekly briefing for media buyers. 3 sentences, plain English, no hype.', user: 'Niche: ' + niche + '\nTop ads this week:\n' + top.map(a => '- ' + a.adv_name + ' (' + a.days_running + ' days, score ' + a.winner_score + '): ' + (a.primary_text || a.headline).slice(0, 160)).join('\n') + '\n\nSummarise the winning angles and hooks.', maxTokens: 300 })).trim(); } catch { /* keep the basic summary */ }
  }
  return { niche, summary, ads: top.map(a => ads.card({ ...a, adv_logo: '' })) };
}

module.exports = { live, claude, analyse, basic, queueNew, makeItMine, makeItMineBasic: a => basicScripts(a, 'your product'), parseSearch, nicheReport, transcribe };
