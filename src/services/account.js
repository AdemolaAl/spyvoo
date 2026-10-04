'use strict';
// Plans, limits and usage. An Agency teammate (team_owner_id) uses the owner's plan and shares the owner's limits.
const db = require('../db');
const { HttpError } = require('../lib/http');

const UNLIMITED = -1;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date().toISOString().slice(0, 7) + '-01';

function plan(id) {
  id = typeof id === 'string' || typeof id === 'number' ? String(id) : '';
  const p = db.one('SELECT * FROM plans WHERE id = ?', id) || db.one("SELECT * FROM plans WHERE id = 'free'");
  return p ? { ...p, features: db.json(p.features, []), popular: !!p.popular, active: !!p.active } : null;
}
function plans({ all = false } = {}) {
  return db.all('SELECT * FROM plans ' + (all ? '' : 'WHERE active = 1 ') + 'ORDER BY sort, price_month').map(p => ({ ...p, features: db.json(p.features, []), popular: !!p.popular, active: !!p.active }));
}

// The account that owns the plan and the limits for this user.
function owner(user) {
  if (user && user.team_owner_id) { const o = db.one('SELECT * FROM users WHERE id = ?', user.team_owner_id); if (o && !o.suspended) return o; }
  return user;
}
function planFor(user) {
  const o = owner(user);
  // Paid plans keep working for the grace days set in Admin → Settings → Billing.
  const grace = ((require('./settings').get('billing') || {}).grace_days || 0) * 864e5;
  const expired = o.plan_id !== 'free' && o.plan_renews_at && new Date(o.plan_renews_at).getTime() + grace < Date.now();
  return plan(expired ? 'free' : o.plan_id);
}

const LIMIT_KEY = { searches: 'searches_per_day', analyses: 'ai_per_month', downloads: 'downloads_per_month', scripts: 'scripts_per_month' };
const DAILY = { searches: true };

function used(user, kind) {
  const o = owner(user);
  const ids = teamIds(o);
  const q = 'SELECT COALESCE(SUM(' + kind + '), 0) n FROM usage WHERE user_id IN (' + ids.map(() => '?').join(',') + ') AND day >= ?';
  return db.one(q, ...ids, DAILY[kind] ? today() : monthStart()).n;
}
function teamIds(o) { return [o.id, ...db.all('SELECT id FROM users WHERE team_owner_id = ?', o.id).map(r => r.id)]; }

function limit(user, kind) { return planFor(user)[LIMIT_KEY[kind]]; }

// Throws 402 with an upgrade hint when the plan's limit is reached; otherwise counts one use.
// Give back a use when the thing it paid for failed (e.g. the AI was down).
function refund(user, kind, n = 1) {
  db.run('UPDATE usage SET ' + kind + ' = MAX(0, ' + kind + ' - ?) WHERE user_id = ? AND day = ?', n, user.id, today());
}
function use(user, kind, n = 1) {
  const max = limit(user, kind);
  if (max !== UNLIMITED && used(user, kind) + n > max) {
    const per = DAILY[kind] ? 'today' : 'this month';
    const one = { searches: 'search', analyses: 'AI breakdown', downloads: 'video download', scripts: '“Make it mine” script' }[kind];
    const words = { searches: 'searches', analyses: 'AI breakdowns', downloads: 'video downloads', scripts: '“Make it mine” scripts' }[kind];
    throw new HttpError(402, max === 0 ? 'Your plan doesn’t include ' + words + '. Upgrade to unlock them.' : (max === 1 ? 'You’ve used your 1 ' + one + ' ' + per : 'You’ve used all ' + max + ' ' + words + ' ' + per) + '. Upgrade for more.', { upgrade: true, kind, limit: max });
  }
  db.run('INSERT INTO usage (user_id, day, ' + kind + ') VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET ' + kind + ' = ' + kind + ' + ?', user.id, today(), n, n);
}
function can(user, kind) { const max = limit(user, kind); return max === UNLIMITED || used(user, kind) < max; }

function meter(user) {
  const p = planFor(user);
  const row = kind => ({ used: used(user, kind), limit: p[LIMIT_KEY[kind]], period: DAILY[kind] ? 'day' : 'month' });
  const o = owner(user);
  const saves = db.one('SELECT COUNT(DISTINCT bi.ad_id) n FROM board_items bi JOIN boards b ON b.id = bi.board_id JOIN ads a ON a.id = bi.ad_id AND a.hidden = 0 WHERE b.user_id IN (' + teamIds(o).map(() => '?').join(',') + ')', ...teamIds(o)).n;
  return { searches: row('searches'), analyses: row('analyses'), downloads: row('downloads'), scripts: row('scripts'), saves: { used: saves, limit: p.saves_limit, period: 'total' }, follows: { used: db.one('SELECT COUNT(*) n FROM follows WHERE user_id = ?', user.id).n, limit: p.follows_limit, period: 'total' } };
}

function checkSaves(user) {
  const m = meter(user).saves;
  if (m.limit !== UNLIMITED && m.used >= m.limit) throw new HttpError(402, 'Your plan saves up to ' + m.limit + ' ads. Upgrade to save more.', { upgrade: true, kind: 'saves', limit: m.limit });
}
function checkFollows(user) {
  const m = meter(user).follows;
  if (m.limit !== UNLIMITED && m.used >= m.limit) throw new HttpError(402, 'Your plan follows up to ' + m.limit + ' advertiser' + (m.limit === 1 ? '' : 's') + '. Upgrade to follow more.', { upgrade: true, kind: 'follows', limit: m.limit });
}

function publicUser(u) {
  if (!u) return null;
  const p = planFor(u);
  const o = owner(u);
  return {
    id: u.id, email: u.email, name: u.name, country: u.country, role: u.role, email_verified: !!u.email_verified, voo: !!u.voo_id,
    plan: { id: p.id, name: p.name, interval: o.plan_interval, renews_at: p.id === 'free' ? null : o.plan_renews_at, team_owner: u.team_owner_id ? { name: o.name, email: o.email } : null, seats: p.seats },
    onboarding: db.json(u.onboarding, {}), created_at: u.created_at
  };
}

function setOnboarding(user, patch) {
  const cur = db.json(user.onboarding, {});
  const next = { ...cur, ...patch };
  db.update('users', user.id, { onboarding: JSON.stringify(next) });
  return next;
}

module.exports = { UNLIMITED, plan, plans, planFor, owner, used, limit, use, refund, can, meter, checkSaves, checkFollows, publicUser, setOnboarding, teamIds, today, monthStart };
