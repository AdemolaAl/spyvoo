'use strict';
// Boards (swipe files), followed advertisers, saved searches, notifications and the alert jobs that feed them.
const config = require('../config');
const db = require('../db');
const ads = require('./ads');
const account = require('./account');
const { HttpError } = require('../lib/http');
const { token } = require('../lib/security');

const first = n => String(n || '').trim().split(' ')[0] || 'there';

/* ---------- boards ---------- */
function boardOut(b) {
  const items = db.all('SELECT ad_id FROM board_items WHERE board_id = ? ORDER BY created_at DESC LIMIT 4', b.id).map(r => ads.get(r.ad_id)).filter(Boolean).map(a => ads.card(a).thumb);
  return { id: b.id, name: b.name, emoji: b.emoji, count: db.one('SELECT COUNT(*) n FROM board_items WHERE board_id = ?', b.id).n, covers: items, share_url: b.share_token ? config.appUrl + '/b/' + b.share_token : '', created_at: b.created_at };
}
function boards(user) { return db.all('SELECT * FROM boards WHERE user_id = ? ORDER BY created_at DESC', user.id).map(boardOut); }
function board(user, id) { const b = db.one('SELECT * FROM boards WHERE id = ? AND user_id = ?', Number(id), user.id); if (!b) throw new HttpError(404, 'Board not found'); return b; }
function createBoard(user, { name, emoji }) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) throw new HttpError(400, 'Give your board a name.');
  if (db.one('SELECT COUNT(*) n FROM boards WHERE user_id = ?', user.id).n >= 200) throw new HttpError(400, 'That’s a lot of boards. Delete a few first.');
  const at = db.now();
  const id = db.insert('boards', { user_id: user.id, name: n, emoji: String(emoji || '').slice(0, 8), created_at: at });
  // Event id from the row (id + creation time): stable, and a reused row id after a delete still gets a new one.
  require('./voosquare').activity(user.id, 'board_created', ['board', id, Date.parse(at).toString(36)], 'New board');
  return boardOut(db.one('SELECT * FROM boards WHERE id = ?', id));
}
function updateBoard(user, id, { name, emoji, share }) {
  const b = board(user, id);
  const patch = {};
  if (name !== undefined) { const n = String(name).trim().slice(0, 60); if (!n) throw new HttpError(400, 'Name can’t be empty.'); patch.name = n; }
  if (emoji !== undefined) patch.emoji = String(emoji).slice(0, 8);
  if (share === true && !b.share_token) patch.share_token = token(12);
  if (share === false) patch.share_token = null;
  db.update('boards', b.id, patch);
  return boardOut(db.one('SELECT * FROM boards WHERE id = ?', b.id));
}
function deleteBoard(user, id) { const b = board(user, id); db.run('DELETE FROM boards WHERE id = ?', b.id); }
function boardItems(b) {
  return db.all('SELECT * FROM board_items WHERE board_id = ? ORDER BY created_at DESC', b.id).map(it => { const a = ads.get(it.ad_id); return a ? { ...ads.card(a), note: it.note, saved_at: it.created_at } : null; }).filter(Boolean);
}
function save(user, boardId, adId, note = '') {
  const b = board(user, boardId);
  if (!ads.get(adId)) throw new HttpError(404, 'Ad not found');
  const already = db.one('SELECT 1 x FROM board_items bi JOIN boards b ON b.id = bi.board_id WHERE b.user_id = ? AND bi.ad_id = ?', user.id, Number(adId));
  if (!already) account.checkSaves(user);
  db.run('INSERT INTO board_items (board_id, ad_id, note, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(board_id, ad_id) DO UPDATE SET note = CASE WHEN excluded.note != \'\' THEN excluded.note ELSE note END', b.id, Number(adId), String(note).slice(0, 1000), db.now());
  if (!already) {
    const a = ads.get(adId);
    const row = db.one('SELECT created_at FROM board_items WHERE board_id = ? AND ad_id = ?', b.id, Number(adId));
    require('./voosquare').activity(user.id, 'ad_saved', ['save', b.id, Number(adId), Date.parse(row.created_at).toString(36)], 'Ad saved' + (a && a.adv_name ? ': ' + a.adv_name : ''));
  }
  return boardOut(b);
}
function unsave(user, boardId, adId) { const b = board(user, boardId); db.run('DELETE FROM board_items WHERE board_id = ? AND ad_id = ?', b.id, Number(adId)); }
function note(user, boardId, adId, text) { const b = board(user, boardId); db.run('UPDATE board_items SET note = ? WHERE board_id = ? AND ad_id = ?', String(text || '').slice(0, 1000), b.id, Number(adId)); }
function savedIn(user, adId) { return db.all('SELECT b.id FROM boards b JOIN board_items bi ON bi.board_id = b.id WHERE b.user_id = ? AND bi.ad_id = ?', user.id, Number(adId)).map(r => r.id); }
function savedIds(user) { return db.all('SELECT DISTINCT bi.ad_id FROM board_items bi JOIN boards b ON b.id = bi.board_id WHERE b.user_id = ?', user.id).map(r => r.ad_id); }
function sharedBoard(tok) {
  const b = tok ? db.one('SELECT b.*, u.name owner FROM boards b JOIN users u ON u.id = b.user_id WHERE b.share_token = ?', String(tok)) : null;
  if (!b) return null;
  return { name: b.name, emoji: b.emoji, owner: first(b.owner), items: boardItems(b) };
}

/* ---------- follows ---------- */
function follow(user, advertiserId, on = true) {
  const v = db.one('SELECT id FROM advertisers WHERE id = ?', Number(advertiserId));
  if (!v) throw new HttpError(404, 'Advertiser not found');
  if (!on) { db.run('DELETE FROM follows WHERE user_id = ? AND advertiser_id = ?', user.id, v.id); return { following: false }; }
  if (!db.one('SELECT 1 x FROM follows WHERE user_id = ? AND advertiser_id = ?', user.id, v.id)) {
    account.checkFollows(user);
    db.insert('follows', { user_id: user.id, advertiser_id: v.id, alert: 1, last_notified_at: db.now(), created_at: db.now() });
    // Instant confirmation in the alerts feed, with what they're running right now.
    const adv = db.one('SELECT name FROM advertisers WHERE id = ?', v.id);
    const live = db.all("SELECT a.*, v.name adv_name, v.logo_url adv_logo FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.advertiser_id = ? AND a.hidden = 0 AND a.status = 'active' ORDER BY a.winner_score DESC", v.id);
    const top = live[0] ? ads.card(live[0]) : null;
    if (!db.one("SELECT id FROM notifications WHERE user_id = ? AND url = ? AND title LIKE 'You’re watching%' AND created_at > ?", user.id, '/app/advertiser/' + v.id, new Date(Date.now() - 30 * 864e5).toISOString()))
    notify(user.id, { kind: 'advertiser', title: 'You’re watching ' + adv.name, body: live.length ? live.length + ' ad' + (live.length > 1 ? 's' : '') + ' running now. We’ll tell you the moment they launch a new one.' : 'We’ll tell you the moment they launch a new ad.', url: '/app/advertiser/' + v.id, image: top ? top.thumb : '' });
  }
  return { following: true };
}
function following(user) {
  return db.all('SELECT v.*, f.alert, f.created_at followed_at FROM follows f JOIN advertisers v ON v.id = f.advertiser_id WHERE f.user_id = ? ORDER BY f.created_at DESC', user.id).map(v => ({
    id: v.id, name: v.name, logo: ads.logoOut(v.logo_url), ads: v.ad_count, active_ads: v.active_ads, alert: !!v.alert, followed_at: v.followed_at,
    new_this_week: db.one('SELECT COUNT(*) n FROM ads WHERE advertiser_id = ? AND hidden = 0 AND first_seen_at >= ?', v.id, new Date(Date.now() - 7 * 864e5).toISOString()).n
  }));
}
const isFollowing = (user, advId) => !!db.one('SELECT 1 x FROM follows WHERE user_id = ? AND advertiser_id = ?', user.id, Number(advId));

/* ---------- saved searches ---------- */
function searches(user) { return db.all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', user.id).map(s => ({ id: s.id, name: s.name, query: db.json(s.query, {}), alert: !!s.alert, created_at: s.created_at })); }
function saveSearch(user, { name, query, alert = true }) {
  const n = String(name || '').trim().slice(0, 80) || 'My search';
  if (db.one('SELECT COUNT(*) n FROM saved_searches WHERE user_id = ?', user.id).n >= 50) throw new HttpError(400, 'You can keep up to 50 saved searches.');
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new HttpError(400, 'Nothing to save. Search for something first.');
  const q = {}; for (const [k, v] of Object.entries(query)) {
    if (['offset', 'limit'].includes(k) || v === '' || v == null) continue;
    if (Array.isArray(v)) { const list = v.filter(x => typeof x === 'string' || typeof x === 'number').map(x => String(x).slice(0, 60)).slice(0, 50); if (list.length) q[k] = list; }
    else if (typeof v !== 'object') q[k] = String(v).slice(0, 200);
  }
  if (!['q', 'countries', 'niche', 'domain', 'advertiser', 'cta', 'media', 'platforms', 'min_days'].some(k => q[k] && q[k].length)) throw new HttpError(400, 'Add a keyword or a filter before saving this search.');
  return db.insert('saved_searches', { user_id: user.id, name: n, query: JSON.stringify(q), alert: alert ? 1 : 0, last_checked_at: db.now(), created_at: db.now() });
}
function deleteSearch(user, id) { db.run('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', Number(id), user.id); }

/* ---------- notifications ---------- */
function notify(userId, { kind, title, body = '', url = '', image = '' }) { return db.insert('notifications', { user_id: userId, kind, title: String(title).slice(0, 160), body: String(body).slice(0, 400), url, image, created_at: db.now() }); }
function notifications(user) {
  return { items: db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id).map(n => ({ ...n, read: !!n.read_at })), unread: db.one('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL', user.id).n };
}
function markRead(user, id) { if (id) db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', db.now(), Number(id), user.id); else db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', db.now(), user.id); }

/* ---------- alert jobs ---------- */
// New ads from followed advertisers → in-app notification + one email per advertiser.
function advertiserAlerts() {
  const mailer = require('./mailer');
  let sent = 0;
  const rows = db.all('SELECT f.*, u.email, u.email_verified, u.name uname, v.name vname FROM follows f JOIN users u ON u.id = f.user_id JOIN advertisers v ON v.id = f.advertiser_id WHERE f.alert = 1 AND u.suspended = 0');
  for (const f of rows) {
    const since = f.last_notified_at || f.created_at;
    const fresh = db.all('SELECT a.*, v.name adv_name, v.logo_url adv_logo FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE a.advertiser_id = ? AND a.hidden = 0 AND a.first_seen_at > ? ORDER BY a.first_seen_at DESC', f.advertiser_id, since);
    if (!fresh.length) continue;
    db.run('UPDATE follows SET last_notified_at = ? WHERE user_id = ? AND advertiser_id = ?', db.now(), f.user_id, f.advertiser_id);
    const top = ads.card(fresh[0]);
    notify(f.user_id, { kind: 'advertiser', title: f.vname + ' launched ' + fresh.length + ' new ad' + (fresh.length > 1 ? 's' : ''), body: (top.text || top.headline).slice(0, 140), url: '/app/advertiser/' + f.advertiser_id, image: top.thumb });
    const img = top.thumb ? (/^https?:/.test(top.thumb) ? top.thumb : config.appUrl + top.thumb) : '';
    if (f.email_verified) mailer.send(f.email, 'advertiser-alert', { name: first(f.uname), advertiser: f.vname, count: String(fresh.length), count_label: fresh.length + ' new ad' + (fresh.length > 1 ? 's' : ''), ad_title: (top.text || top.headline).slice(0, 140), ad_image: img, ad_url: config.appUrl + '/app/ad/' + top.id, ads_url: config.appUrl + '/app/advertiser/' + f.advertiser_id }, { bulk: true });
    sent++;
  }
  return { sent };
}

// Saved searches with alerts on: new ads that match since the last check.
function searchAlerts() {
  const mailer = require('./mailer');
  let sent = 0;
  for (const s of db.all('SELECT s.*, u.email, u.email_verified, u.name uname FROM saved_searches s JOIN users u ON u.id = s.user_id WHERE s.alert = 1 AND u.suspended = 0')) {
    const q = { ...db.json(s.query, {}), since: s.last_checked_at || s.created_at };
    const n = ads.count(q);
    db.update('saved_searches', s.id, { last_checked_at: db.now() });
    if (!n) continue;
    const top = ads.search({ ...q, limit: 1, sort: 'score' }).items[0];
    notify(s.user_id, { kind: 'search', title: n + ' new ad' + (n > 1 ? 's' : '') + ' for “' + s.name + '”', body: top ? (top.text || top.headline).slice(0, 140) : '', url: '/app/discover?saved=' + s.id, image: top ? top.thumb : '' });
    if (s.email_verified) mailer.send(s.email, 'search-alert', { name: first(s.uname), search_name: s.name, count: String(n), count_label: n + ' new ad' + (n > 1 ? 's' : ''), search_url: config.appUrl + '/app/discover?saved=' + s.id, ad_title: top ? (top.text || top.headline).slice(0, 140) : '', ad_image: top && top.thumb ? (/^https?:/.test(top.thumb) ? top.thumb : config.appUrl + top.thumb) : '' }, { bulk: true });
    sent++;
  }
  return { sent };
}

// Monday: a short AI briefing on the user's niche (or the busiest niche) to everyone who hasn't opted out.
async function weeklyReports() {
  const ai = require('./ai');
  const mailer = require('./mailer');
  const cache = new Map();
  const busiest = (ads.trendingNiches(1)[0] || {}).niche;
  let sent = 0;
  for (const u of db.all('SELECT * FROM users WHERE marketing_opt_out = 0 AND suspended = 0 AND email_verified = 1')) {
    const niche = db.json(u.onboarding, {}).niche || busiest;
    if (!niche) continue;
    if (!cache.has(niche)) cache.set(niche, await ai.nicheReport(niche).catch(() => null));
    const r = cache.get(niche);
    if (!r) continue;
    const top = r.ads[0];
    mailer.send(u.email, 'weekly-report', { name: first(u.name), niche, summary: r.summary, ad_title: top ? (top.text || top.headline).slice(0, 140) : '', ad_image: top && top.thumb ? (/^https?:/.test(top.thumb) ? top.thumb : config.appUrl + top.thumb) : '', ad_url: top ? config.appUrl + '/app/ad/' + top.id : config.appUrl + '/app', search_url: config.appUrl + '/app/discover?niche=' + encodeURIComponent(niche) }, { bulk: true });
    sent++;
  }
  return { sent };
}

module.exports = { boards, board, boardOut, createBoard, updateBoard, deleteBoard, boardItems, save, unsave, note, savedIn, savedIds, sharedBoard, follow, following, isFollowing, searches, saveSearch, deleteSearch, notify, notifications, markRead, advertiserAlerts, searchAlerts, weeklyReports };
