'use strict';
// Dashboard API (/api/app/*). Every route needs a logged-in user.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const ads = require('../services/ads');
const ai = require('../services/ai');
const account = require('../services/account');
const library = require('../services/library');
const payments = require('../services/payments');
const settings = require('../services/settings');
const media = require('../services/media');
const countries = require('../lib/countries');
const { HttpError, rateLimit, rateLimitUser } = require('../lib/http');
const { hashPassword, verifyPassword } = require('../lib/security');

const DAY = 864e5;
const withSaved = (user, items) => { const s = new Set(library.savedIds(user)); return items.map(a => ({ ...a, saved: s.has(a.id) })); };
const filtersOf = q => {
  const out = {};
  for (const k of ['q', 'countries', 'platforms', 'media', 'min_days', 'max_days', 'min_score', 'status', 'from', 'to', 'cta', 'niche', 'language', 'domain', 'advertiser_id', 'sort', 'offset', 'limit', 'relax']) if (q[k] !== undefined && q[k] !== '') out[k] = q[k];
  return out;
};
const lastSearch = new Map();
const isSearch = f => !!(f.q || f.countries || f.cta || f.niche || f.domain || f.min_days || f.media || f.platforms);

function familySlides() { return settings.get('family').filter(f => f.on); }
function offerOut(user) {
  const o = settings.offer();
  if (!o) return null;
  const paidBefore = user && db.one("SELECT id FROM orders WHERE user_id = ? AND status = 'paid' LIMIT 1", user.id);
  return { badge: o.badge, title: o.title, text: o.text, code: o.code, ends_at: o.ends_at || null, plans: o.plans, eligible: !paidBefore };
}

module.exports = function (app) {
  const aiLimit = rateLimit('ai', 30, 60e3);
  // Plain-English search calls Claude without using a plan quota: cap it per account per day as well.
  const aiSearchDay = rateLimitUser('ai-search-day', 200, 864e5);
  // Browsing the library is free within a search, so cap the pace per account: a person scrolls, a script copies.
  const browseLimit = rateLimitUser('browse', 120, 60e3);
  const deepLimit = rateLimitUser('browse-day', 3000, 864e5);

  app.get('/api/app/bootstrap', req => {
    auth.needUser(req);
    const p = settings.get('platforms');
    const unread = db.one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user.id).n;
    return {
      user: account.publicUser(req.user), meter: account.meter(req.user), unread,
      offer: offerOut(req.user), announcement: settings.get('announcement').on ? settings.get('announcement') : null,
      family: familySlides(), niches: settings.get('niches'), platforms: p,
      ctas: Object.entries(ads.CTA).filter(([k]) => ['SIGN_UP', 'LEARN_MORE', 'INSTALL_MOBILE_APP', 'SHOP_NOW', 'ORDER_NOW', 'DOWNLOAD', 'WHATSAPP_MESSAGE', 'SEND_MESSAGE', 'BOOK_TRAVEL', 'APPLY_NOW', 'GET_OFFER', 'SUBSCRIBE', 'PLAY_GAME', 'CONTACT_US'].includes(k)).map(([k, v]) => ({ id: k, label: v })),
      countries: countries.list(), stats: ads.stats(), ai: ai.live(), voosquare: require('../services/voosquare').publicInfo(),
      support_email: settings.get('company').support_email,
      ...(req.user.role === 'admin' ? { admin: { maintenance: !!settings.get('flags').maintenance, signups: settings.get('flags').signups !== false } } : {})
    };
  });

  app.get('/api/app/home', req => {
    auth.needUser(req);
    const u = req.user;
    const niche = db.json(u.onboarding, {}).niche;
    const winners = ads.search({ sort: 'score', status: 'active', limit: 12, ...(niche && ads.count({ niche }) >= 4 ? { niche } : {}) }).items;
    const fresh = ads.search({ sort: 'new', limit: 12 }).items;
    const followedIds = db.all('SELECT advertiser_id FROM follows WHERE user_id = ?', u.id).map(r => r.advertiser_id);
    const followed = followedIds.length ? db.all('SELECT a.*, v.name adv_name, v.logo_url adv_logo FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.hidden = 0 AND a.advertiser_id IN (' + followedIds.join(',') + ') ORDER BY a.first_seen_at DESC LIMIT 12').map(ads.card) : [];
    const recent = db.all('SELECT ad_id FROM views WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 8', u.id).map(r => ads.get(r.ad_id)).filter(Boolean).map(ads.card);
    // Each strip shows different ads when there are enough to go round.
    const shown = new Set(winners.slice(0, 8).map(a => a.id));
    const pick = (list, n) => { const fresh = list.filter(a => !shown.has(a.id)); const out = (fresh.length >= Math.min(4, n) ? fresh : list).slice(0, n); out.forEach(a => shown.add(a.id)); return out; };
    const longest = pick(ads.search({ sort: 'days', status: 'active', limit: 24 }).items, 6);
    return { winners: withSaved(u, winners), fresh: withSaved(u, pick(fresh, 12)), followed: withSaved(u, pick(followed, 12)), recent, longest: withSaved(u, longest), niches: ads.trendingNiches(10), stats: ads.stats(), boards: library.boards(u).slice(0, 4), following: library.following(u).slice(0, 6) };
  });

  app.get('/api/app/search', req => {
    auth.needUser(req); browseLimit(req); deepLimit(req);
    const f = filtersOf(req.query);
    f.offset = Math.max(0, Math.floor(Number(f.offset) || 0));
    // One search = one new question (keywords, countries, niche, website). Refining it with other filters, sorting
    // or scrolling to more results within 30 minutes doesn't use another search.
    if (isSearch(f)) {
      const k = JSON.stringify([String(f.q || '').toLowerCase().trim(), f.countries || '', f.niche || '', f.domain || '']);
      const prev = lastSearch.get(req.user.id);
      if (!prev || prev.k !== k || Date.now() - prev.t > 30 * 60e3) {
        account.use(req.user, 'searches');
        require('../services/voosquare').countSearch(req.user);
        if (lastSearch.size > 20000) lastSearch.clear();
        lastSearch.set(req.user.id, { k, t: Date.now() });
      }
    }
    const r = ads.search(f);
    return { ...r, items: withSaved(req.user, r.items) };
  });

  app.post('/api/app/ai-search', aiLimit, async req => {
    auth.needUser(req); aiSearchDay(req);
    const text = String((req.body || {}).text || '').trim();
    if (!text) throw new HttpError(400, 'Type what you’re looking for.');
    return { filters: await ai.parseSearch(text) };
  });

  app.get('/api/app/ads/:id', req => {
    auth.needUser(req); browseLimit(req); deepLimit(req);
    const d = ads.detail(req.params.id);
    if (!d) throw new HttpError(404, 'This ad is no longer available.');
    db.run('INSERT INTO views (user_id, ad_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, ad_id) DO UPDATE SET viewed_at = excluded.viewed_at', req.user.id, d.id, db.now());
    const unlocked = !!db.one('SELECT 1 x FROM unlocks WHERE user_id = ? AND ad_id = ?', req.user.id, d.id);
    const more = ads.search({ advertiser_id: d.advertiser.id, limit: 7, sort: 'score' }).items.filter(a => a.id !== d.id).slice(0, 6);
    const similar = d.niche ? ads.search({ niche: d.niche, limit: 9, sort: 'score' }).items.filter(a => a.id !== d.id && a.advertiser.id !== d.advertiser.id).slice(0, 6) : [];
    return { ad: { ...d, analysis: unlocked ? d.analysis : null, analysis_ready: !!d.analysis }, unlocked, saved_in: library.savedIn(req.user, d.id), following: library.isFollowing(req.user, d.advertiser.id), more, similar, can_download: account.limit(req.user, 'downloads') !== 0 };
  });

  // Opens the AI breakdown. Counts once per ad per user; generating it the first time is cached for everyone.
  app.post('/api/app/ads/:id/analyse', aiLimit, async req => {
    auth.needUser(req);
    const a = ads.get(req.params.id);
    if (!a) throw new HttpError(404, 'Ad not found');
    if (!db.one('SELECT 1 x FROM unlocks WHERE user_id = ? AND ad_id = ?', req.user.id, a.id)) {
      account.use(req.user, 'analyses');
      db.insert('unlocks', { user_id: req.user.id, ad_id: a.id, created_at: db.now() });
    }
    try { return await ai.analyse(a.id); }
    catch (e) { db.run('DELETE FROM unlocks WHERE user_id = ? AND ad_id = ?', req.user.id, a.id); account.refund(req.user, 'analyses'); throw new HttpError(502, 'The AI is busy right now. Try again in a moment. (' + e.message.slice(0, 80) + ')'); }
  });

  app.post('/api/app/ads/:id/mine', aiLimit, async req => {
    auth.needUser(req);
    if (!ads.get(req.params.id)) throw new HttpError(404, 'Ad not found');
    if (!String((req.body || {}).product || '').trim()) throw new HttpError(400, 'Tell us what you sell first, e.g. “organic hair oil”.');
    account.use(req.user, 'scripts');
    try { return await ai.makeItMine(req.params.id, req.user, req.body || {}); }
    catch (e) { account.refund(req.user, 'scripts'); throw new HttpError(502, 'The AI is busy right now. Try again in a moment.'); }
  });
  app.get('/api/app/scripts', req => {
    auth.needUser(req);
    const seen = new Set();
    return { items: db.all('SELECT s.*, a.headline, a.primary_text FROM ad_scripts s JOIN ads a ON a.id = s.ad_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 60', req.user.id).filter(s => { const k = s.ad_id + '|' + s.product.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30).map(s => ({ id: s.id, ad_id: s.ad_id, product: s.product, ad: (s.headline || s.primary_text).slice(0, 80), created_at: s.created_at, ...db.json(s.data, {}) })) };
  });

  // Download: counts against the plan, then hands back a link to the stored file.
  app.post('/api/app/ads/:id/download', req => {
    auth.needUser(req);
    const a = ads.get(req.params.id);
    if (!a) throw new HttpError(404, 'Ad not found');
    const m = db.one("SELECT * FROM ad_media WHERE ad_id = ? AND (? = 0 OR id = ?) ORDER BY CASE type WHEN 'video' THEN 0 ELSE 1 END, position LIMIT 1", a.id, Number((req.body || {}).media_id) || 0, Number((req.body || {}).media_id) || 0);
    const remote = require('../lib/urls').httpUrl(m && m.source_url);
    if (!m || !(m.storage_key || remote)) throw new HttpError(404, 'This file isn’t saved yet. Try again in a few minutes.');
    account.use(req.user, 'downloads');
    const src = m.storage_key || remote;
    const filename = 'spyvoo-' + a.library_id + '-' + m.id + ((/\.(mp4|webm|mov|jpe?g|png|webp|gif)$/i.exec(String(src).split('?')[0]) || [])[0] || (m.type === 'video' ? '.mp4' : '.jpg'));
    return { url: m.storage_key ? require('../lib/urls').mediaUrl(media.downloadUrl(m.storage_key, filename)) : remote, filename };
  });

  app.get('/api/app/advertisers/:id', req => {
    auth.needUser(req); browseLimit(req);
    const v = ads.advertiser(req.params.id);
    if (!v) throw new HttpError(404, 'Advertiser not found');
    return { advertiser: v, following: library.isFollowing(req.user, v.id) };
  });
  app.post('/api/app/advertisers/:id/follow', req => { auth.needUser(req); return library.follow(req.user, req.params.id, (req.body || {}).on !== false); });
  app.get('/api/app/following', req => { auth.needUser(req); return { items: library.following(req.user) }; });

  // Boards
  app.get('/api/app/boards', req => { auth.needUser(req); return { items: library.boards(req.user) }; });
  app.post('/api/app/boards', req => { auth.needUser(req); return library.createBoard(req.user, req.body || {}); });
  app.get('/api/app/boards/:id', req => { auth.needUser(req); const b = library.board(req.user, req.params.id); return { board: library.boardOut(b), items: withSaved(req.user, library.boardItems(b)) }; });
  app.patch('/api/app/boards/:id', req => { auth.needUser(req); return library.updateBoard(req.user, req.params.id, req.body || {}); });
  app.del('/api/app/boards/:id', req => { auth.needUser(req); library.deleteBoard(req.user, req.params.id); return { ok: true }; });
  app.post('/api/app/boards/:id/items', req => { auth.needUser(req); return library.save(req.user, req.params.id, (req.body || {}).ad_id, (req.body || {}).note); });
  app.patch('/api/app/boards/:id/items/:ad', req => { auth.needUser(req); library.note(req.user, req.params.id, req.params.ad, (req.body || {}).note); return { ok: true }; });
  app.del('/api/app/boards/:id/items/:ad', req => { auth.needUser(req); library.unsave(req.user, req.params.id, req.params.ad); return { ok: true }; });
  // One-tap save: the first board (created on the fly as "Swipe file").
  app.post('/api/app/quick-save', req => {
    auth.needUser(req);
    let b = db.one('SELECT * FROM boards WHERE user_id = ? ORDER BY created_at LIMIT 1', req.user.id);
    if (!b) b = { id: library.createBoard(req.user, { name: 'Swipe file', emoji: '⭐' }).id };
    const adId = (req.body || {}).ad_id;
    if ((req.body || {}).on === false) { db.run('DELETE FROM board_items WHERE ad_id = ? AND board_id IN (SELECT id FROM boards WHERE user_id = ?)', Number(adId), req.user.id); return { saved: false }; }
    library.save(req.user, b.id, adId);
    return { saved: true, board: library.boardOut(db.one('SELECT * FROM boards WHERE id = ?', b.id)) };
  });

  // Saved searches
  app.get('/api/app/searches', req => { auth.needUser(req); return { items: library.searches(req.user) }; });
  app.post('/api/app/searches', req => { auth.needUser(req); return { id: library.saveSearch(req.user, req.body || {}) }; });
  app.patch('/api/app/searches/:id', req => { auth.needUser(req); db.run('UPDATE saved_searches SET alert = ? WHERE id = ? AND user_id = ?', (req.body || {}).alert ? 1 : 0, Number(req.params.id), req.user.id); return { ok: true }; });
  app.del('/api/app/searches/:id', req => { auth.needUser(req); library.deleteSearch(req.user, req.params.id); return { ok: true }; });

  // Notifications
  app.get('/api/app/notifications', req => { auth.needUser(req); return library.notifications(req.user); });
  app.post('/api/app/notifications/read', req => { auth.needUser(req); library.markRead(req.user, (req.body || {}).id); return { ok: true }; });

  // Plan and billing
  app.get('/api/app/plan', req => {
    auth.needUser(req);
    return { plans: account.plans(), current: account.publicUser(req.user).plan, meter: account.meter(req.user), methods: payments.methodsFor(req.user), orders: payments.ordersFor(req.user), offer: offerOut(req.user), country: req.user.country };
  });
  app.post('/api/app/quote', rateLimitUser('quote', 60, 600e3), req => { auth.needUser(req); const b = req.body || {}; return payments.quote(req.user, b.plan, b.interval, b.coupon); });
  app.post('/api/app/checkout', rateLimit('checkout', 20, 3600e3), async req => { auth.needUser(req); return payments.checkout(req.user, req.body || {}); });
  app.get('/api/app/orders/:ref', async req => {
    auth.needUser(req);
    let o = db.one('SELECT * FROM orders WHERE ref = ? AND user_id = ?', req.params.ref, req.user.id);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === 'pending' && o.provider === 'gatevoo') { try { await require('../services/gatevoo').verify(o); } catch { /* keep waiting */ } o = db.one('SELECT * FROM orders WHERE id = ?', o.id); }
    return { order: payments.ordersFor(req.user).find(x => x.ref === o.ref), user: account.publicUser(db.one('SELECT * FROM users WHERE id = ?', req.user.id)) };
  });

  // Account
  app.patch('/api/app/me', req => {
    auth.needUser(req);
    const b = req.body || {}; const patch = {};
    if (b.name !== undefined) { const n = String(b.name).trim().slice(0, 80); if (!n) throw new HttpError(400, 'Name can’t be empty.'); patch.name = n; }
    if (b.country !== undefined) { if (!countries.valid(b.country)) throw new HttpError(400, 'Pick a country from the list.'); patch.country = String(b.country).toUpperCase(); }
    if (b.marketing_opt_out !== undefined) patch.marketing_opt_out = b.marketing_opt_out ? 1 : 0;
    if (b.new_password !== undefined) {
      if (req.user.password_hash && !String(b.password || '')) throw new HttpError(400, 'Type your current password first.');
      if (req.user.password_hash && !verifyPassword(String(b.password || ''), req.user.password_hash)) throw new HttpError(400, 'Your current password is wrong.');
      if (String(b.new_password).length < 8) throw new HttpError(400, 'Your new password needs at least 8 characters.');
      patch.password_hash = hashPassword(b.new_password);
    }
    db.update('users', req.user.id, patch);
    // A new password signs out every other device.
    if (patch.password_hash && req.session) db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', req.user.id, req.session.id);
    if (patch.password_hash) db.run("UPDATE tokens SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", db.now(), req.user.id);
    return { user: account.publicUser(db.one('SELECT * FROM users WHERE id = ?', req.user.id)), marketing_opt_out: !!(patch.marketing_opt_out ?? req.user.marketing_opt_out) };
  });
  app.get('/api/app/me', req => { auth.needUser(req); return { user: account.publicUser(req.user), marketing_opt_out: !!req.user.marketing_opt_out, has_password: !!req.user.password_hash }; });
  app.post('/api/app/onboarding', req => {
    auth.needUser(req);
    const b = req.body || {}; const patch = {};
    for (const k of ['tour_seen', 'checklist_hidden', 'welcome_done']) if (b[k] !== undefined) patch[k] = !!b[k];
    for (const k of ['niche', 'goal', 'level']) if (b[k] !== undefined) patch[k] = String(b[k]).slice(0, 40);
    return { onboarding: account.setOnboarding(req.user, patch) };
  });
  app.post('/api/app/delete-account', (req, res) => {
    auth.needUser(req);
    if (req.user.role === 'admin') throw new HttpError(400, 'Admins can’t delete themselves here. Remove admin rights first.');
    if (req.user.password_hash && !verifyPassword(String((req.body || {}).password || ''), req.user.password_hash)) throw new HttpError(400, 'Type your password to confirm.');
    const id = req.user.id;
    if (db.one("SELECT id FROM orders WHERE user_id = ? AND status = 'paid' LIMIT 1", id)) {
      // Paid orders are financial records, so they stay. Everything personal goes and the account is closed.
      db.tx(() => {
        db.run('UPDATE users SET team_owner_id = NULL WHERE team_owner_id = ?', id);
        for (const t of ['sessions', 'tokens', 'ad_scripts', 'boards', 'follows', 'saved_searches', 'notifications', 'usage', 'unlocks', 'views']) db.run('DELETE FROM ' + t + ' WHERE user_id = ?', id);
        db.run("DELETE FROM orders WHERE user_id = ? AND status != 'paid'", id);
        db.update('users', id, { email: 'deleted-' + id + '@deleted.invalid', name: 'Deleted account', password_hash: '', country: '', voo_id: null, suspended: 1, marketing_opt_out: 1, plan_id: 'free', plan_renews_at: null });
      });
    } else db.run('DELETE FROM users WHERE id = ?', id);
    auth.endSession(req, res);
    return { ok: true };
  });

  // The guided tour plays on real data but never spends the user's searches or AI breakdowns.
  app.get('/api/app/tour', req => {
    auth.needUser(req);
    const asks = ['crypto ads in Brazil over 30 days', 'skincare ads in Mexico running 30+ days', 'fintech video ads in Egypt', 'winning ads running over 30 days'];
    let pick = null;
    for (const t of asks) {
      const f = ads.parseQuery(t);
      const r = ads.search({ ...f, sort: 'score', limit: 12, relax: true });
      if (r.items.length >= 2) { pick = { ask: t, filters: f, results: r }; break; }
    }
    if (!pick) pick = { ask: 'winning ads', filters: { sort: 'score' }, results: ads.search({ sort: 'score', limit: 12 }) };
    const top = pick.results.items[0];
    const d = top ? ads.detail(top.id) : null;
    const row = top ? ads.get(top.id) : null;
    return {
      ask: pick.ask, filters: pick.filters, results: { ...pick.results, items: withSaved(req.user, pick.results.items) },
      ad: d ? { ad: { ...d, analysis: d.analysis || ai.basic(row) }, unlocked: true, saved_in: [], following: false, more: [], similar: [], can_download: true } : null,
      script: row ? ai.makeItMineBasic(row) : null
    };
  });

  // Getting-started checklist on Home.
  app.get('/api/app/checklist', req => {
    auth.needUser(req);
    const u = req.user;
    const searched = db.one('SELECT COALESCE(SUM(searches), 0) n FROM usage WHERE user_id = ?', u.id).n > 0;
    return { steps: [
      { id: 'tour', label: 'Watch the 60-second tour', done: !!db.json(u.onboarding, {}).tour_seen },
      { id: 'search', label: 'Run your first search', done: searched },
      { id: 'open', label: 'Open a winning ad', done: !!db.one('SELECT 1 x FROM views WHERE user_id = ?', u.id) },
      { id: 'ai', label: 'Read an AI breakdown', done: !!db.one('SELECT 1 x FROM unlocks WHERE user_id = ?', u.id) },
      { id: 'save', label: 'Save an ad to a board', done: library.savedIds(u).length > 0 },
      { id: 'follow', label: 'Follow a competitor', done: !!db.one('SELECT 1 x FROM follows WHERE user_id = ?', u.id) }
    ] };
  });
};

module.exports.offerOut = offerOut;
