'use strict';
// Ads: saving what the provider found (deduplicated by Meta Library ID), the winner score, search and the card shape.
const db = require('../db');
const settings = require('./settings');
const countries = require('../lib/countries');
const media = require('./media');
const { httpUrl, mediaUrl } = require('../lib/urls');

const DAY = 864e5;

const CTA = {
  SIGN_UP: 'Sign up', LEARN_MORE: 'Learn more', INSTALL_MOBILE_APP: 'Install now', INSTALL_APP: 'Install now', USE_APP: 'Use app', SHOP_NOW: 'Shop now', ORDER_NOW: 'Order now',
  BUY_NOW: 'Buy now', DOWNLOAD: 'Download', CONTACT_US: 'Contact us', BOOK_TRAVEL: 'Book now', BOOK_NOW: 'Book now', APPLY_NOW: 'Apply now', GET_OFFER: 'Get offer',
  GET_QUOTE: 'Get quote', SUBSCRIBE: 'Subscribe', WATCH_MORE: 'Watch more', SEND_MESSAGE: 'Send message', WHATSAPP_MESSAGE: 'Send WhatsApp message', MESSAGE_PAGE: 'Send message',
  PLAY_GAME: 'Play game', OPEN_LINK: 'Open link', SEE_MORE: 'See more', REGISTER_NOW: 'Register', GET_STARTED: 'Get started', NO_BUTTON: 'No button', DONATE_NOW: 'Donate now',
  LISTEN_NOW: 'Listen now', CALL_NOW: 'Call now', SEE_MENU: 'See menu', REQUEST_TIME: 'Request time', GET_DIRECTIONS: 'Get directions', DOWNLOAD_APP: 'Download'
};
const CTA_FROM_TEXT = Object.fromEntries(Object.entries(CTA).map(([k, v]) => [v.toLowerCase(), k]));
const ctaLabel = t => CTA[t] || String(t || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

const PLATFORMS = ['facebook', 'instagram', 'messenger', 'audience_network', 'threads', 'tiktok'];
const csv = list => ',' + [...new Set((list || []).filter(Boolean))].join(',') + ',';
const uncsv = s => String(s || '').split(',').filter(Boolean);

// Guess a niche from the words in the ad, when the tracking rule did not set one.
const NICHE_WORDS = [
  ['Crypto', /\b(crypto\w*|bitcoin|btc|usdt|stablecoins?|blockchain|tokens?|web3|binance|wallets?)\b/i],
  ['Trading', /\b(trad(e|ing|er)|forex|stocks?|options|broker|invest(ing|ment)?|copy trad)/i],
  ['iGaming', /\b(casino|bet(ting)?|slots?|jackpot|poker|sportsbook|odds|spins?)\b/i],
  ['Fintech', /\b(bank|card|transfer|loan|credit|payments?|remit|cashback|fees)\b/i],
  ['Beauty', /\b(skin\w*|serums?|makeup|beauty|hair\w*|glow|lash\w*|cream|spf|cosmetic\w*)\b/i],
  ['Health', /\b(weight|fitness|workout|gym|diet|supplement|sleep|health|keto)\b/i],
  ['Education', /\b(course|masterclass|learn|class|bootcamp|certificat|webinar|academy)\b/i],
  ['Travel', /\b(flight|hotel|travel|trip|vacation|holiday|nights|resort|visa)\b/i],
  ['Food', /\b(coffee|pizza|burger|food|delivery|meal|restaurant|brew|snack)\b/i],
  ['Fashion', /\b(dress|shoes|sneakers|fashion|wear|outfit|bag|jewel)/i],
  ['Apps', /\b(app|install|download)\b/i],
  ['E-commerce', /\b(shop|order|% off|free shipping|sale|discount|store)\b/i]
];
function guessNiche(text) { for (const [n, re] of NICHE_WORDS) if (re.test(text)) return n; return ''; }

function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } }
const iso = v => { if (!v) return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };

function daysRunning(a) {
  if (!a.start_date) return 0;
  const end = a.status === 'active' ? Date.now() : new Date(a.end_date || a.last_seen_at || Date.now()).getTime();
  return Math.max(0, Math.round((end - new Date(a.start_date).getTime()) / DAY));
}

// Winner score 0–100. Weights and caps are edited in Admin → Winner score.
function score(a, w = settings.get('score')) {
  const total = (w.w_days + w.w_variations + w.w_countries + w.w_active) || 1;
  const nCountries = uncsv(a.countries).filter(c => c !== 'ALL').length || 1;
  const s = w.w_days * Math.min(1, (a.days_running || 0) / (w.days_cap || 90))
    + w.w_variations * Math.min(1, Math.max(0, (a.variation_count || 1) - 1) / Math.max(1, (w.variations_cap || 10) - 1))
    + w.w_countries * Math.min(1, Math.max(0, nCountries - 1) / Math.max(1, (w.countries_cap || 8) - 1))
    + w.w_active * (a.status === 'active' ? 1 : 0);
  return Math.max(0, Math.min(100, Math.round(s / total * 100)));
}

function ftsSync(id) {
  const a = db.one('SELECT a.*, v.name adv FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.id = ?', id);
  if (!a) return;
  const tr = db.one('SELECT transcript FROM ad_analysis WHERE ad_id = ?', id);
  db.run('DELETE FROM ads_fts WHERE rowid = ?', id);
  db.run('INSERT INTO ads_fts (rowid, primary_text, headline, advertiser, domain, transcript) VALUES (?, ?, ?, ?, ?, ?)', id, a.primary_text, a.headline + ' ' + a.description, a.adv, a.landing_domain, tr ? tr.transcript : '');
}

// Save one normalised ad (see providers/README for the shape). Returns { id, isNew }.
function upsert(n, { source = 'apify', niche = '' } = {}) {
  if (!n || !n.library_id || !(n.page_id || n.page_name)) return null;
  const now = db.now();
  return db.tx(() => {
    const pageId = String(n.page_id || 'name:' + n.page_name).slice(0, 80);
    let adv = db.one('SELECT * FROM advertisers WHERE page_id = ?', pageId);
    if (!adv) {
      const id = db.insert('advertisers', { page_id: pageId, name: String(n.page_name || 'Unknown advertiser').slice(0, 160), logo_url: httpUrl(n.page_logo), page_url: httpUrl(n.page_url) || (/^\d+$/.test(String(n.page_id || '')) ? 'https://www.facebook.com/' + n.page_id : ''), category: n.category || '', first_seen_at: now, last_seen_at: now });
      adv = db.one('SELECT * FROM advertisers WHERE id = ?', id);
    } else {
      db.update('advertisers', adv.id, { last_seen_at: now, ...(n.page_name ? { name: String(n.page_name).slice(0, 160) } : {}), ...(httpUrl(n.page_logo) && !/^\/media\//.test(adv.logo_url) ? { logo_url: httpUrl(n.page_logo) } : {}), ...(n.category ? { category: n.category } : {}) });
    }
    const text = [n.primary_text, n.headline, n.description].filter(Boolean).join(' ');
    const row = {
      advertiser_id: adv.id,
      platforms: csv((n.platforms || ['facebook']).map(p => String(p).toLowerCase())),
      countries: csv((n.countries || []).map(c => String(c).toUpperCase()).filter(c => countries.valid(c) || c === 'ALL')) === ',,' ? ',ALL,' : csv((n.countries || []).map(c => String(c).toUpperCase()).filter(c => countries.valid(c) || c === 'ALL')),
      status: n.is_active === false ? 'inactive' : 'active',
      start_date: iso(n.start_date), end_date: iso(n.end_date),
      last_seen_at: now,
      variation_count: Math.max(1, Number(n.variation_count) || 1),
      collation_id: String(n.collation_id || ''),
      cta_type: String(n.cta_type || CTA_FROM_TEXT[String(n.cta_text || '').toLowerCase()] || '').toUpperCase().slice(0, 40),
      cta_text: String(n.cta_text || ctaLabel(n.cta_type) || '').slice(0, 60),
      landing_url: httpUrl(n.landing_url, 1000), landing_domain: domainOf(httpUrl(n.landing_url, 1000)),
      primary_text: String(n.primary_text || '').slice(0, 5000), headline: String(n.headline || '').slice(0, 300), description: String(n.description || '').slice(0, 1000),
      language: String(n.language || '').slice(0, 10),
      media_type: n.media_type || ((n.media || []).some(m => m.type === 'video') ? 'video' : (n.media || []).length > 1 ? 'carousel' : 'image')
    };
    const prev = db.one('SELECT * FROM ads WHERE library_id = ?', String(n.library_id));
    let id; let isNew = false;
    if (prev) {
      id = prev.id;
      // Keep the earliest start date we have seen; a provider sometimes returns the latest variation's date.
      if (prev.start_date && row.start_date && prev.start_date < row.start_date) row.start_date = prev.start_date;
      db.update('ads', id, row);
    } else {
      id = db.insert('ads', { library_id: String(n.library_id).slice(0, 64), ...row, niche: niche || guessNiche(text), first_seen_at: now, source, created_at: now });
      isNew = true;
      (n.media || []).slice(0, 10).forEach((m, i) => db.insert('ad_media', {
        ad_id: id, type: m.type === 'video' ? 'video' : 'image', position: i, source_url: httpUrl(m.url), poster_source_url: httpUrl(m.poster),
        storage_key: safeKey(m.key), poster_key: safeKey(m.poster_key), width: m.width || null, height: m.height || null, duration_s: m.duration || null,
        status: safeKey(m.key) ? 'done' : httpUrl(m.url) ? 'pending' : 'failed', next_at: now
      }));
    }
    refresh(id);
    db.update('advertisers', adv.id, {
      ad_count: db.one('SELECT COUNT(*) n FROM ads WHERE advertiser_id = ?', adv.id).n,
      active_ads: db.one("SELECT COUNT(*) n FROM ads WHERE advertiser_id = ? AND status = 'active'", adv.id).n
    });
    ftsSync(id);
    return { id, isNew, advertiserId: adv.id };
  });
}

// Recompute days running, variation count (same creative, same advertiser) and the winner score.
function refresh(id, w) {
  const a = db.one('SELECT * FROM ads WHERE id = ?', id);
  if (!a) return;
  let variations = a.variation_count;
  if (a.collation_id) variations = Math.max(variations, db.one('SELECT COUNT(*) n FROM ads WHERE collation_id = ? AND advertiser_id = ?', a.collation_id, a.advertiser_id).n);
  const days = daysRunning(a);
  db.update('ads', id, { days_running: days, variation_count: variations, winner_score: score({ ...a, days_running: days, variation_count: variations }, w) });
}
function refreshAll() {
  const w = settings.get('score');
  const inactiveAfter = settings.get('provider').inactive_after_days || 3;
  const cut = new Date(Date.now() - inactiveAfter * DAY).toISOString();
  db.run("UPDATE ads SET status = 'inactive', end_date = COALESCE(end_date, last_seen_at) WHERE status = 'active' AND source != 'demo' AND last_seen_at < ?", cut);
  const ids = db.all('SELECT id FROM ads').map(r => r.id);
  db.tx(() => ids.forEach(id => refresh(id, w)));
  memo.clear();
  return ids.length;
}
// Hourly job: only ads that can still change (seen in the last 30 days), in batches so requests keep flowing.
async function refreshRecent() {
  const w = settings.get('score');
  const inactiveAfter = settings.get('provider').inactive_after_days || 3;
  db.run("UPDATE ads SET status = 'inactive', end_date = COALESCE(end_date, last_seen_at) WHERE status = 'active' AND source != 'demo' AND last_seen_at < ?", new Date(Date.now() - inactiveAfter * DAY).toISOString());
  const ids = db.all('SELECT id FROM ads WHERE last_seen_at >= ? OR status = ?', new Date(Date.now() - 30 * DAY).toISOString(), 'active').map(r => r.id);
  for (let i = 0; i < ids.length; i += 400) {
    db.tx(() => ids.slice(i, i + 400).forEach(id => refresh(id, w)));
    await new Promise(r => setImmediate(r));
  }
  memo.clear();
  return { refreshed: ids.length };
}
// Small time-based cache for the heavy dashboard numbers (stats, trending niches).
const memo = new Map();
function cached(key, ms, fn) { const hit = memo.get(key); if (hit && hit.until > Date.now()) return hit.value; const value = fn(); memo.set(key, { value, until: Date.now() + ms }); return value; }

/* ---------------- search ---------------- */
const SORTS = { score: 'a.winner_score DESC, a.days_running DESC', days: 'a.days_running DESC, a.winner_score DESC', new: 'a.start_date DESC, a.id DESC', variations: 'a.variation_count DESC, a.winner_score DESC' };
const arr = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean);

// FTS5 query from free text: every word must appear (prefix match), quotes and operators stripped.
function ftsQuery(q) {
  const words = countries.strip(q).replace(/["'*:^(){}[\]\\-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !/^(and|or|not|near)$/i.test(w)).slice(0, 8);
  return words.length ? words.map(w => '"' + w + '"*').join(' ') : '';
}

function buildWhere(p) {
  const where = ['a.hidden = 0']; const args = [];
  if (p.q) { const f = ftsQuery(p.q); if (f) { where.push('(a.id IN (SELECT rowid FROM ads_fts WHERE ads_fts MATCH ?) OR LOWER(a.niche) = ?)'); args.push(f, String(p.q).trim().toLowerCase()); } }
  const cc = arr(p.countries).map(c => c.toUpperCase()).filter(c => countries.valid(c));
  if (cc.length) { where.push('(' + cc.map(() => 'a.countries LIKE ?').join(' OR ') + " OR a.countries = ',ALL,')"); args.push(...cc.map(c => '%,' + c + ',%')); }
  const pl = arr(p.platforms).map(s => s.toLowerCase()).filter(s => PLATFORMS.includes(s));
  if (pl.length) { where.push('(' + pl.map(() => 'a.platforms LIKE ?').join(' OR ') + ')'); args.push(...pl.map(s => '%,' + s + ',%')); }
  const mt = arr(p.media).filter(m => ['video', 'image', 'carousel'].includes(m));
  if (mt.length) { where.push('a.media_type IN (' + mt.map(() => '?').join(',') + ')'); args.push(...mt); }
  if (Number(p.min_days) > 0) { where.push('a.days_running >= ?'); args.push(Number(p.min_days)); }
  if (Number(p.max_days) > 0) { where.push('a.days_running <= ?'); args.push(Number(p.max_days)); }
  if (Number(p.min_score) > 0) { where.push('a.winner_score >= ?'); args.push(Number(p.min_score)); }
  if (p.status === 'active' || p.status === 'inactive') { where.push('a.status = ?'); args.push(p.status); }
  const okDate = v => v && !isNaN(new Date(v).getTime());
  if (okDate(p.from)) { where.push('a.start_date >= ?'); args.push(new Date(p.from).toISOString()); }
  if (okDate(p.to)) { where.push('a.start_date <= ?'); args.push(new Date(new Date(p.to).getTime() + DAY - 1).toISOString()); }
  const ct = arr(p.cta).map(c => c.toUpperCase());
  if (ct.length) { where.push('a.cta_type IN (' + ct.map(() => '?').join(',') + ')'); args.push(...ct); }
  const ni = arr(p.niche);
  if (ni.length) { where.push('a.niche IN (' + ni.map(() => '?').join(',') + ')'); args.push(...ni); }
  if (p.language) { where.push('a.language = ?'); args.push(String(p.language).toLowerCase()); }
  if (p.domain) { where.push('a.landing_domain LIKE ?'); args.push('%' + String(p.domain).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[%_]/g, '') + '%'); }
  if (p.advertiser_id) { where.push('a.advertiser_id = ?'); args.push(Number(p.advertiser_id)); }
  if (p.since) { where.push('a.first_seen_at > ?'); args.push(p.since); }
  if (p.featured) where.push('a.featured = 1');
  if (p.ids) { const ids = arr(p.ids).map(Number).filter(Boolean).slice(0, 200); where.push('a.id IN (' + (ids.join(',') || '0') + ')'); }
  return { where: where.join(' AND '), args };
}

function search(p = {}) {
  const limit = Math.min(48, Math.max(1, Math.floor(Number(p.limit)) || 24));
  const offset = Math.min(100000, Math.max(0, Math.floor(Number(p.offset)) || 0));
  const { where, args } = buildWhere(p);
  const order = SORTS[p.sort] || SORTS.score;
  const rows = db.all('SELECT a.*, v.name adv_name, v.logo_url adv_logo, v.page_id adv_page FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE ' + where + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?', ...args, limit + 1, offset);
  const more = rows.length > limit;
  const total = offset === 0 ? db.one('SELECT COUNT(*) n FROM ads a WHERE ' + where, ...args).n : undefined;
  // Plain-English searches: if the keywords match nothing but other filters were understood, show those results.
  if (p.relax && !rows.length && offset === 0 && p.q) {
    const guess = guessNiche(p.q);
    const alt = { ...p, q: '', relax: false, ...(guess && !p.niche ? { niche: [guess] } : {}) };
    if (alt.niche || alt.countries || alt.cta || alt.min_days || alt.media) return { ...search(alt), relaxed: true };
  }
  return { items: rows.slice(0, limit).map(card), next: more ? offset + limit : null, total };
}
function count(p) { const { where, args } = buildWhere(p); return db.one('SELECT COUNT(*) n FROM ads a WHERE ' + where, ...args).n; }

// A provider may hand us files it already stored: our bundled /img/... samples or a storage key (never a URL or "..").
function safeKey(k) { const s = String(k || ''); return (/^\/img\/[A-Za-z0-9/_.-]+$/.test(s) || /^[A-Za-z0-9][A-Za-z0-9/_.-]*$/.test(s)) && !s.includes('..') ? s.slice(0, 300) : ''; }
// Every address shown to users is re-checked on the way out too (rows saved before this check existed).
const logoOut = l => (l ? mediaUrl(l.startsWith('key:') ? media.url(l.slice(4)) : l) : '');
function mediaFor(adId) {
  return db.all('SELECT * FROM ad_media WHERE ad_id = ? ORDER BY position', adId).map(m => ({
    id: m.id, type: m.type, url: mediaUrl(m.storage_key ? media.url(m.storage_key) : m.source_url), poster: mediaUrl(m.poster_key ? media.url(m.poster_key) : (m.poster_source_url || (m.type === 'image' ? (m.storage_key ? media.url(m.storage_key) : m.source_url) : ''))),
    stored: !!m.storage_key, status: m.status, duration: m.duration_s
  }));
}

function card(a) {
  const m = mediaFor(a.id);
  return {
    id: a.id, library_id: a.library_id, advertiser: { id: a.advertiser_id, name: a.adv_name, logo: logoOut(a.adv_logo) },
    text: a.primary_text, headline: a.headline, cta: a.cta_text || ctaLabel(a.cta_type), cta_type: a.cta_type,
    countries: uncsv(a.countries), platforms: uncsv(a.platforms), status: a.status, start_date: a.start_date, last_seen_at: a.last_seen_at,
    days: a.days_running, variations: a.variation_count, score: a.winner_score, niche: a.niche, media_type: a.media_type,
    domain: a.landing_domain, thumb: m[0] ? (m[0].poster || m[0].url) : '', video: (m.find(x => x.type === 'video') || {}).url || '', media_count: m.length,
    featured: !!a.featured, sample: a.source === 'demo'
  };
}

function get(id) {
  const a = db.one('SELECT a.*, v.name adv_name, v.logo_url adv_logo, v.page_id adv_page FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.id = ?', Number(id));
  return a && !a.hidden ? a : null;
}
function detail(id) {
  const a = get(id);
  if (!a) return null;
  const an = db.one('SELECT * FROM ad_analysis WHERE ad_id = ?', a.id);
  const siblings = a.collation_id ? db.all('SELECT a.*, v.name adv_name, v.logo_url adv_logo FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.collation_id = ? AND a.id != ? AND a.hidden = 0 ORDER BY a.start_date LIMIT 12', a.collation_id, a.id).map(card) : [];
  return {
    ...card(a), description: a.description, landing_url: httpUrl(a.landing_url, 1000), language: a.language, end_date: a.end_date, first_seen_at: a.first_seen_at,
    media: mediaFor(a.id), variations_list: siblings, countries_named: uncsv(a.countries).map(c => ({ code: c, name: countries.name(c), flag: countries.flag(c) })),
    library_url: /^\d+$/.test(a.library_id) ? 'https://www.facebook.com/ads/library/?id=' + a.library_id : '',
    analysis: an ? analysisOut(an) : null,
    advertiser: { ...card(a).advertiser, page_url: httpUrl((db.one('SELECT page_url FROM advertisers WHERE id = ?', a.advertiser_id) || {}).page_url) }
  };
}
function analysisOut(an) { return { hook: an.hook, angle: an.angle, offer: an.offer, audience: an.audience, triggers: db.json(an.triggers, []), format: an.format, transcript: an.transcript, why: an.why, how_to_adapt: an.how_to_adapt, model: an.model, created_at: an.created_at }; }

function advertiser(id) {
  const v = db.one('SELECT * FROM advertisers WHERE id = ?', Number(id));
  if (!v) return null;
  const top = db.all("SELECT countries FROM ads WHERE advertiser_id = ? AND hidden = 0", v.id).flatMap(r => uncsv(r.countries)).filter(c => c !== 'ALL')
    .reduce((m, c) => { m[c] = (m[c] || 0) + 1; return m; }, {});
  // Ads launched per week over the last 12 weeks.
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * DAY); const start = new Date(end.getTime() - 7 * DAY);
    weeks.push({ week: start.toISOString().slice(0, 10), launched: db.one('SELECT COUNT(*) n FROM ads WHERE advertiser_id = ? AND hidden = 0 AND start_date >= ? AND start_date < ?', v.id, start.toISOString(), end.toISOString()).n });
  }
  const best = db.one('SELECT MAX(winner_score) s, MAX(days_running) d FROM ads WHERE advertiser_id = ? AND hidden = 0', v.id);
  return {
    id: v.id, name: v.name, logo: logoOut(v.logo_url), page_url: httpUrl(v.page_url), category: v.category,
    ads: v.ad_count, active_ads: v.active_ads, first_seen_at: v.first_seen_at, best_score: best.s || 0, longest_days: best.d || 0,
    countries: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code, n]) => ({ code, name: countries.name(code), flag: countries.flag(code), ads: n })),
    weeks
  };
}

/* ---------------- plain-English search ("crypto ads in Brazil over 30 days with sign up") ---------------- */
const CTA_WORDS = [[/\b(sign[\s-]?ups?|register)\b/i, 'SIGN_UP'], [/\blearn more\b/i, 'LEARN_MORE'], [/\b(install|download (the )?app)\b/i, 'INSTALL_MOBILE_APP'], [/\bshop now\b/i, 'SHOP_NOW'], [/\border now\b/i, 'ORDER_NOW'], [/\bwhatsapp\b/i, 'WHATSAPP_MESSAGE'], [/\b(send message|dm)\b/i, 'SEND_MESSAGE'], [/\bbook now\b/i, 'BOOK_TRAVEL'], [/\bapply now\b/i, 'APPLY_NOW'], [/\bget offer\b/i, 'GET_OFFER'], [/\bsubscribe\b/i, 'SUBSCRIBE'], [/\bplay game\b/i, 'PLAY_GAME']];
const STOP = /\b(ads?|adverts?|advertisements?|show me|find|search|for|in|from|with|that|are|is|which|the|a|an|running|run|live|over|more than|at least|days?|weeks?|months?|plus|cta|button|videos?|images?|photos?|carousels?|active|still|of|on|and|by|any|all|me|deals?|offers?|campaigns?|winning|winners?|top|best|facebook|instagram|fb|ig|meta|\d+\+?)\b/gi;

function parseQuery(text) {
  let s = ' ' + String(text || '').slice(0, 300) + ' ';
  const out = { countries: [], cta: [], media: [], platforms: [] };
  let plain = countries.strip(s).replace(/[’']/g, '');
  for (const m of countries.MATCHERS) {
    if (m.w.length < 3 && !/^(uk|us|uae)$/.test(m.w)) continue;
    if (m.re.test(plain)) { if (!out.countries.includes(m.code)) out.countries.push(m.code); plain = plain.replace(m.re, '$1 '); }
  }
  const dm = plain.match(/(\d+)\s*\+?\s*(days?|d\b|weeks?|w\b|months?|m\b)/i) || plain.match(/(?:over|more than|at least|>)\s*(\d+)/i);
  if (dm) { const n = Number(dm[1]); const unit = (dm[2] || 'd')[0].toLowerCase(); out.min_days = unit === 'w' ? n * 7 : unit === 'm' ? n * 30 : n; }
  for (const [re, t] of CTA_WORDS) if (re.test(plain)) { out.cta.push(t); plain = plain.replace(re, ' '); }
  if (/\bvideos?\b/i.test(plain)) out.media.push('video');
  if (/\b(images?|photos?|static)\b/i.test(plain)) out.media.push('image');
  if (/\bcarousels?\b/i.test(plain)) out.media.push('carousel');
  if (/\binstagram|\big\b/i.test(plain)) out.platforms.push('instagram');
  if (/\bfacebook|\bfb\b/i.test(plain)) out.platforms.push('facebook');
  if (/\b(still )?active|live now|running now\b/i.test(plain)) out.status = 'active';
  if (/\b(winners?|winning|best|top)\b/i.test(plain)) out.sort = 'score';
  if (/\b(new|newest|latest|fresh)\b/i.test(plain)) out.sort = 'new';
  const niches = settings.get('niches');
  const nm = niches.find(n => new RegExp('\\b' + n.toLowerCase().replace(/[^a-z]/g, '.?') + '\\b', 'i').test(plain));
  if (nm) out.niche = [nm];
  else {
    // "skincare", "bitcoin", "forex"… → the niche those words belong to.
    const g = NICHE_WORDS.find(([, re]) => re.test(plain));
    if (g && niches.includes(g[0])) { out.niche = [g[0]]; plain = plain.replace(new RegExp(g[1].source, 'gi'), ' '); }
  }
  out.q = plain.replace(STOP, ' ').replace(/[^\p{L}\p{N}.\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (nm && out.q.toLowerCase().replace(/[^a-z]/g, '') === nm.toLowerCase().replace(/[^a-z]/g, '')) delete out.q;
  if (out.q === '') delete out.q;
  for (const k of ['countries', 'cta', 'media', 'platforms']) if (!out[k].length) delete out[k];
  return out;
}

function stats() { return cached('stats', 60e3, statsNow); }
function statsNow() {
  const day = new Date(Date.now() - DAY).toISOString();
  return {
    ads: db.one('SELECT COUNT(*) n FROM ads WHERE hidden = 0').n,
    active: db.one("SELECT COUNT(*) n FROM ads WHERE hidden = 0 AND status = 'active'").n,
    today: db.one('SELECT COUNT(*) n FROM ads WHERE hidden = 0 AND first_seen_at >= ?', day).n,
    advertisers: db.one('SELECT COUNT(*) n FROM advertisers').n,
    countries: new Set(db.all('SELECT countries FROM ads WHERE hidden = 0 LIMIT 5000').flatMap(r => uncsv(r.countries)).filter(c => c !== 'ALL')).size
  };
}

function trendingNiches(limit = 8) { return cached('niches:' + limit, 5 * 60e3, () => trendingNichesNow(limit)); }
function trendingNichesNow(limit) {
  const since = new Date(Date.now() - 14 * DAY).toISOString();
  return db.all("SELECT niche, COUNT(*) n, ROUND(AVG(winner_score)) score FROM ads WHERE hidden = 0 AND niche != '' AND last_seen_at >= ? GROUP BY niche ORDER BY n DESC LIMIT ?", since, limit)
    .map(r => ({
      niche: r.niche, ads: r.n, score: r.score,
      top_country: (db.one("SELECT countries FROM ads WHERE niche = ? AND hidden = 0 ORDER BY winner_score DESC LIMIT 1", r.niche) || {}).countries?.split(',').filter(c => c && c !== 'ALL')[0] || '',
      // Ads running in each of the last 9 weeks (oldest first): the little bar chart on the card.
      weeks: Array.from({ length: 9 }, (_, i) => {
        const end = new Date(Date.now() - (8 - i) * 7 * DAY).toISOString(); const start = new Date(Date.now() - (9 - i) * 7 * DAY).toISOString();
        return db.one('SELECT COUNT(*) n FROM ads WHERE niche = ? AND hidden = 0 AND COALESCE(start_date, first_seen_at) <= ? AND last_seen_at >= ?', r.niche, end, start).n;
      })
    }));
}

module.exports = { safeKey, logoOut, CTA, ctaLabel, PLATFORMS, csv, uncsv, guessNiche, domainOf, daysRunning, score, upsert, refresh, refreshAll, refreshRecent, ftsSync, search, count, card, get, detail, mediaFor, analysisOut, advertiser, parseQuery, ftsQuery, stats, trendingNiches, iso };
