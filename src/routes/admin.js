'use strict';
// Admin API (/api/admin/*). Admins only. Everything Ejiro may change without touching code is here.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const ads = require('../services/ads');
const ai = require('../services/ai');
const llm = require('../services/llm');
const account = require('../services/account');
const ingest = require('../services/ingest');
const media = require('../services/media');
const payments = require('../services/payments');
const settings = require('../services/settings');
const scheduler = require('../services/scheduler');
const providers = require('../providers');
const mailer = require('../services/mailer');
const countries = require('../lib/countries');
const { HttpError } = require('../lib/http');
const { encrypt } = require('../lib/security');

const DAY = 864e5;
const audit = (req, action, detail = '') => db.insert('audit_log', { user_id: req.user.id, action, detail: String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1000), created_at: db.now() });
const csvList = (v, upper) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/)).map(s => String(s).trim()).filter(Boolean).map(s => (upper ? s.toUpperCase() : s.toLowerCase()));
const num = (v, d, min = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

function series(sql, days, ...args) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    out.push({ day: d, value: db.one(sql, ...args, d + 'T00:00:00.000Z', d + 'T23:59:59.999Z').n });
  }
  return out;
}

function ruleIn(b, prev = {}) {
  if (b.type !== undefined && !['keyword', 'advertiser', 'domain'].includes(b.type)) throw new HttpError(400, 'Type must be keyword, advertiser or domain.');
  const type = ['keyword', 'advertiser', 'domain'].includes(b.type) ? b.type : prev.type || 'keyword';
  const value = String(b.value ?? prev.value ?? '').trim().slice(0, 200);
  if (!value) throw new HttpError(400, 'Type a keyword, a Facebook page ID or a domain.');
  let cc = ads.uncsv(prev.countries);
  if (b.countries !== undefined) {
    const raw = csvList(b.countries, true);
    const bad = raw.filter(c => c !== 'ALL' && !countries.valid(c));
    if (bad.length) throw new HttpError(400, 'Unknown country code' + (bad.length > 1 ? 's' : '') + ': ' + bad.join(', ') + '. Use two-letter codes like BR, MX, EG.');
    cc = raw;
  }
  const pl = b.platforms !== undefined ? csvList(b.platforms).filter(p => ads.PLATFORMS.includes(p)) : ads.uncsv(prev.platforms);
  return {
    type, value, countries: ads.csv(cc.length ? cc : ['ALL']), platforms: ads.csv(pl.length ? pl : ['facebook', 'instagram']),
    niche: String(b.niche ?? prev.niche ?? '').slice(0, 40), results_limit: num(b.results_limit, prev.results_limit || 100, 10, 2000),
    interval_hours: num(b.interval_hours, prev.interval_hours || settings.get('provider').interval_hours, 1, 168), active: b.active === undefined ? (prev.active ?? 1) : (b.active ? 1 : 0)
  };
}

module.exports = function (app) {
  const A = req => auth.needAdmin(req);

  app.get('/api/admin/overview', req => {
    A(req);
    const p = settings.get('provider');
    const now = new Date();
    const d30 = new Date(now - 30 * DAY).toISOString();
    return {
      ads: ads.stats(), media: media.usage(),
      users: { total: db.one('SELECT COUNT(*) n FROM users').n, active7: db.one('SELECT COUNT(*) n FROM users WHERE last_login >= ?', new Date(now - 7 * DAY).toISOString()).n, paid: db.one("SELECT COUNT(*) n FROM users WHERE plan_id != 'free' AND role != 'admin' AND plan_renews_at > ?", db.now()).n, new7: db.one('SELECT COUNT(*) n FROM users WHERE created_at >= ?', new Date(now - 7 * DAY).toISOString()).n },
      revenue: { d30: db.one("SELECT COALESCE(SUM(amount_usd), 0) n FROM orders WHERE status = 'paid' AND paid_at >= ?", d30).n, all: db.one("SELECT COALESCE(SUM(amount_usd), 0) n FROM orders WHERE status = 'paid'").n, pending: db.one("SELECT COUNT(*) n FROM orders WHERE status = 'pending'").n, review: db.one("SELECT COUNT(*) n FROM orders WHERE status = 'review'").n },
      credits: { spent: ingest.spentToday(), budget: p.daily_budget_usd, left: ingest.budgetLeft() },
      provider: { active: p.active, configured: providers.get().configured(), label: providers.get().label },
      ai: ai.live(), mail: config.mail.provider !== 'log' && !!config.mail.key, gatevoo: require('../services/gatevoo').mode(), gatevoo_missing: require('../services/gatevoo').status().missing, gatevoo_error: require('../services/gatevoo').lastError(), demo_payments: config.pay.demo,
      plans: db.all("SELECT plan_id, COUNT(*) n FROM users WHERE plan_id = 'free' OR plan_renews_at > ? GROUP BY plan_id", db.now()),
      charts: {
        ads: series('SELECT COUNT(*) n FROM ads WHERE first_seen_at BETWEEN ? AND ?', 14),
        signups: series('SELECT COUNT(*) n FROM users WHERE created_at BETWEEN ? AND ?', 14),
        revenue: series("SELECT COALESCE(SUM(amount_usd), 0) n FROM orders WHERE status = 'paid' AND paid_at BETWEEN ? AND ?", 14)
      },
      failures: db.all("SELECT * FROM jobs WHERE status = 'failed' ORDER BY id DESC LIMIT 5"),
      scheduler: scheduler.status()
    };
  });

  /* ---------- tracking rules ---------- */
  app.get('/api/admin/rules', req => {
    A(req);
    return { items: db.all('SELECT * FROM tracking_rules ORDER BY active DESC, id DESC').map(r => ({ ...ingest.ruleOut(r), last_job: db.one("SELECT status, ads_found, ads_new, credits_used, error, finished_at FROM jobs WHERE rule_id = ? AND kind = 'scrape' ORDER BY id DESC LIMIT 1", r.id) })), niches: settings.get('niches'), countries: countries.list() };
  });
  app.post('/api/admin/rules', req => { A(req); const id = db.insert('tracking_rules', { ...ruleIn(req.body || {}), created_at: db.now() }); audit(req, 'rule_add', (req.body || {}).value); return { id }; });
  app.patch('/api/admin/rules/:id', req => {
    A(req);
    const r = db.one('SELECT * FROM tracking_rules WHERE id = ?', Number(req.params.id));
    if (!r) throw new HttpError(404, 'Rule not found');
    db.update('tracking_rules', r.id, ruleIn(req.body || {}, r));
    audit(req, 'rule_update', r.value + ' ' + JSON.stringify(req.body || {}));
    return { ok: true };
  });
  app.del('/api/admin/rules/:id', req => { A(req); db.run("DELETE FROM jobs WHERE rule_id = ? AND kind = 'scrape'", Number(req.params.id)); db.run('DELETE FROM tracking_rules WHERE id = ?', Number(req.params.id)); audit(req, 'rule_delete', req.params.id); return { ok: true }; });
  app.post('/api/admin/rules/:id/run', async req => {
    A(req);
    if (!db.one('SELECT id FROM tracking_rules WHERE id = ?', Number(req.params.id))) throw new HttpError(404, 'This rule was deleted.');
    audit(req, 'rule_run', req.params.id);
    try { const r = await ingest.runRule(Number(req.params.id), { manual: true }); return { ok: true, found: r.found, created: r.created, credits: r.credits }; }
    catch (e) { throw new HttpError(e.status || 400, e.message); }
  });
  // CSV: type,value,countries,niche,interval_hours   (countries separated by spaces or |)
  app.post('/api/admin/rules/import', req => {
    A(req);
    const lines = String((req.body || {}).csv || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let added = 0; const errors = [];
    db.tx(() => lines.forEach((line, i) => {
      const cols = []; let cur = '', q = false;
      for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { cols.push(cur.trim()); cur = ''; } else cur += ch; }
      cols.push(cur.trim());
      if (i === 0 && /^type$/i.test(cols[0])) return;
      try {
        const [type, value, cc, niche, interval] = cols;
        db.insert('tracking_rules', { ...ruleIn({ type: (type || 'keyword').toLowerCase(), value, countries: String(cc || 'ALL').split(/[|\s]+/).filter(Boolean), niche: niche || '', interval_hours: interval || undefined }), created_at: db.now() });
        added++;
      } catch (e) { errors.push('Line ' + (i + 1) + ': ' + e.message); }
    }));
    audit(req, 'rules_import', added + ' rules');
    return { added, errors: errors.slice(0, 20) };
  });

  /* ---------- provider ---------- */
  app.get('/api/admin/provider', req => {
    A(req);
    const p = { ...settings.get('provider') }; const hasToken = !!p.apify_token_enc || !!config.apify.token; delete p.apify_token_enc;
    return { settings: p, has_token: hasToken, token_from_env: !!config.apify.token, default_actor: config.apify.actor, providers: providers.list(), spent_today: ingest.spentToday(), budget_left: ingest.budgetLeft(), media: media.usage(), ai: { live: ai.live(), model: llm.resolve().model, transcripts: !!config.ai.transcribeKey, ...llm.publicInfo(), usage_today: llm.usageToday() } };
  });
  // AI provider, OpenRouter model, fallbacks and key. The key is stored encrypted, never sent back (only its last 4
  // characters), only used for the endpoint it was saved for, and has to be typed again when the provider changes.
  app.patch('/api/admin/ai', req => {
    A(req);
    let r;
    try { r = llm.update(req.body || {}); } catch (e) { throw new HttpError(e.status || 400, e.message); }
    audit(req, 'ai_update', [...r.patch, ...r.notes].join(', ') || 'no change');
    return { ok: true, key_cleared: r.key_cleared, ai: llm.publicInfo() };
  });
  app.post('/api/admin/ai/ping', async req => {
    A(req);
    const info = llm.publicInfo();
    if (!info.has_key) return { ok: false, message: info.label + ' has no API key yet.' };
    try { const x = await llm.complete({ system: 'Reply with the single word: ok', messages: [{ role: 'user', content: 'Say ok' }], maxTokens: 5, feature: 'admin_test' }); return { ok: true, message: info.label + ' answered using ' + x.model + '.' }; }
    catch (e) { return { ok: false, message: e.message }; }
  });
  app.patch('/api/admin/provider', req => {
    A(req);
    const b = req.body || {}; const patch = {};
    if (b.active !== undefined) { if (!providers.REGISTRY[b.active]) throw new HttpError(400, 'Unknown provider'); patch.active = b.active; }
    if (b.token !== undefined) patch.apify_token_enc = b.token ? encrypt(String(b.token).trim()) : '';
    if (b.actor !== undefined) patch.actor = String(b.actor).trim().slice(0, 120);
    for (const [k, min, max] of [['daily_budget_usd', 0, 10000], ['interval_hours', 1, 168], ['results_per_rule', 10, 2000], ['inactive_after_days', 1, 60]]) if (b[k] !== undefined) patch[k] = num(b[k], settings.get('provider')[k], min, max);
    for (const k of ['download_media', 'analyze_new']) if (b[k] !== undefined) patch[k] = !!b[k];
    settings.set('provider', patch);
    audit(req, 'provider_update', Object.keys(patch).join(','));
    return { ok: true };
  });
  app.post('/api/admin/provider/ping', async req => { A(req); const p = providers.get(); if (!p.configured()) return { ok: false, message: p.label + ' has no API token yet.' }; try { return { ok: true, message: await p.ping() }; } catch (e) { return { ok: false, message: e.message }; } });
  app.post('/api/admin/provider/test', async req => { A(req); try { return { ok: true, ...(await ingest.testScrape(req.body || {})) }; } catch (e) { throw new HttpError(400, e.message); } });

  /* ---------- jobs ---------- */
  app.get('/api/admin/jobs', req => {
    A(req);
    const where = []; const args = [];
    if (req.query.kind) { where.push('kind = ?'); args.push(req.query.kind); }
    if (req.query.status) { where.push('status = ?'); args.push(req.query.status); }
    return { items: db.all('SELECT * FROM jobs ' + (where.length ? 'WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC LIMIT 200', ...args), scheduler: scheduler.status(), media: media.usage() };
  });
  app.post('/api/admin/jobs/:id/retry', async req => {
    A(req);
    const j = db.one('SELECT * FROM jobs WHERE id = ?', Number(req.params.id));
    if (!j) throw new HttpError(404, 'Job not found');
    if (j.kind === 'scrape' && j.rule_id) {
      if (!db.one('SELECT id FROM tracking_rules WHERE id = ?', j.rule_id)) throw new HttpError(404, 'The rule behind this job was deleted.');
      try { const r = await ingest.runRule(j.rule_id, { manual: true }); return { ok: true, found: r.found, created: r.created }; } catch (e) { throw new HttpError(400, e.message); }
    }
    if (j.kind === 'media') { db.run("UPDATE ad_media SET status = 'pending', attempts = 0, next_at = ? WHERE status = 'failed'", db.now()); return { ok: true, ...(await media.work(30)) }; }
    throw new HttpError(400, 'This job can’t be retried. Run the rule again instead.');
  });
  app.post('/api/admin/media/retry', async req => { A(req); db.run("UPDATE ad_media SET status = 'pending', attempts = 0, next_at = ? WHERE status = 'failed'", db.now()); return media.work(30); });
  app.post('/api/admin/scheduler/:name', async req => { A(req); if (!scheduler.JOBS.some(j => j.name === req.params.name)) throw new HttpError(404, 'Unknown job'); return scheduler.runNow(req.params.name); });

  /* ---------- ads ---------- */
  app.get('/api/admin/ads', req => {
    A(req);
    const where = ['1=1']; const args = [];
    if (req.query.q) { const f = ads.ftsQuery(req.query.q); if (f) { where.push('a.id IN (SELECT rowid FROM ads_fts WHERE ads_fts MATCH ?)'); args.push(f); } }
    if (req.query.source) { where.push('a.source = ?'); args.push(req.query.source); }
    if (req.query.filter === 'hidden') where.push('a.hidden = 1');
    if (req.query.filter === 'featured') where.push('a.featured = 1');
    const off = Math.max(0, Number(req.query.offset) || 0);
    const rows = db.all('SELECT a.*, v.name adv_name, v.logo_url adv_logo FROM ads a JOIN advertisers v ON v.id = a.advertiser_id WHERE ' + where.join(' AND ') + ' ORDER BY a.id DESC LIMIT 51 OFFSET ?', ...args, off);
    return { items: rows.slice(0, 50).map(a => ({ ...ads.card(a), hidden: !!a.hidden, source: a.source, analysed: !!db.one('SELECT 1 x FROM ad_analysis WHERE ad_id = ?', a.id) })), next: rows.length > 50 ? off + 50 : null, total: db.one('SELECT COUNT(*) n FROM ads a WHERE ' + where.join(' AND '), ...args).n };
  });
  app.patch('/api/admin/ads/:id', req => {
    A(req);
    const b = req.body || {}; const patch = {};
    if (b.hidden !== undefined) patch.hidden = b.hidden ? 1 : 0;
    if (b.featured !== undefined) patch.featured = b.featured ? 1 : 0;
    if (b.niche !== undefined) patch.niche = String(b.niche).slice(0, 40);
    if (!db.one('SELECT id FROM ads WHERE id = ?', Number(req.params.id))) throw new HttpError(404, 'Ad not found');
    db.update('ads', Number(req.params.id), patch);
    audit(req, 'ad_update', req.params.id + ' ' + JSON.stringify(patch));
    return { ok: true };
  });
  app.del('/api/admin/ads/:id', async req => {
    A(req);
    const id = Number(req.params.id);
    if (!db.one('SELECT id FROM ads WHERE id = ?', id)) throw new HttpError(404, 'Ad not found');
    for (const m of db.all('SELECT * FROM ad_media WHERE ad_id = ?', id)) { await media.remove(m.storage_key); await media.remove(m.poster_key); }
    db.run('DELETE FROM ads_fts WHERE rowid = ?', id); db.run('DELETE FROM ads WHERE id = ?', id);
    audit(req, 'ad_delete', String(id));
    return { ok: true };
  });
  app.post('/api/admin/ads/:id/reanalyse', async req => { A(req); if (!db.one('SELECT id FROM ads WHERE id = ?', Number(req.params.id))) throw new HttpError(404, 'Ad not found'); audit(req, 'ad_reanalyse', req.params.id); try { return await ai.analyse(Number(req.params.id), { force: true }); } catch (e) { throw new HttpError(502, e.message); } });
  app.post('/api/admin/demo', req => {
    A(req);
    const action = (req.body || {}).action;
    if (action === 'clear') { const n = ingest.clearDemo(); audit(req, 'demo_clear', n + ' ads'); return { removed: n }; }
    if (action === 'seed') { const n = ingest.seedDemo({ force: true }); audit(req, 'demo_seed', n + ' ads'); return { added: n }; }
    throw new HttpError(400, 'Unknown action');
  });

  /* ---------- users ---------- */
  app.get('/api/admin/users', req => {
    A(req);
    const q = String(req.query.q || '').trim().toLowerCase();
    const off = Math.max(0, Number(req.query.offset) || 0);
    const rows = db.all('SELECT * FROM users ' + (q ? 'WHERE email LIKE ? OR name LIKE ? ' : '') + 'ORDER BY id DESC LIMIT 51 OFFSET ?', ...(q ? ['%' + q + '%', '%' + q + '%'] : []), off);
    return { items: rows.slice(0, 50).map(u => ({ id: u.id, email: u.email, name: u.name, country: u.country, role: u.role, plan: account.planFor(u).id, plan_id: u.plan_id, plan_renews_at: u.plan_renews_at, suspended: !!u.suspended, voo: !!u.voo_id, team_owner_id: u.team_owner_id, last_login: u.last_login, created_at: u.created_at })), next: rows.length > 50 ? off + 50 : null, total: db.one('SELECT COUNT(*) n FROM users ' + (q ? 'WHERE email LIKE ? OR name LIKE ?' : ''), ...(q ? ['%' + q + '%', '%' + q + '%'] : [])).n };
  });
  app.get('/api/admin/users/:id', req => {
    A(req);
    const u = db.one('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    return { user: { ...account.publicUser(u), suspended: !!u.suspended, plan_id: u.plan_id, plan_renews_at: u.plan_renews_at, last_login: u.last_login, marketing_opt_out: !!u.marketing_opt_out }, meter: account.meter(u), orders: payments.ordersFor(u), boards: db.one('SELECT COUNT(*) n FROM boards WHERE user_id = ?', u.id).n, follows: db.one('SELECT COUNT(*) n FROM follows WHERE user_id = ?', u.id).n };
  });
  app.patch('/api/admin/users/:id', req => {
    A(req);
    const u = db.one('SELECT * FROM users WHERE id = ?', Number(req.params.id));
    if (!u) throw new HttpError(404, 'User not found');
    const b = req.body || {}; const patch = {};
    if (b.plan_id !== undefined) {
      if (typeof b.plan_id !== 'string' || !db.one('SELECT id FROM plans WHERE id = ?', b.plan_id)) throw new HttpError(400, 'Unknown plan');
      patch.plan_id = b.plan_id;
      if (b.plan_renews_at && isNaN(new Date(b.plan_renews_at).getTime())) throw new HttpError(400, 'That date isn’t valid.');
      patch.plan_renews_at = b.plan_id === 'free' ? null : (b.plan_renews_at ? new Date(b.plan_renews_at).toISOString() : new Date(Date.now() + 30 * DAY).toISOString());
    } else if (b.plan_renews_at !== undefined) { if (b.plan_renews_at && isNaN(new Date(b.plan_renews_at).getTime())) throw new HttpError(400, 'That date isn’t valid.'); patch.plan_renews_at = b.plan_renews_at ? new Date(b.plan_renews_at).toISOString() : null; }
    if (b.role !== undefined) { if (u.id === req.user.id && b.role !== 'admin') throw new HttpError(400, 'You can’t remove your own admin rights.'); patch.role = b.role === 'admin' ? 'admin' : 'user'; }
    if (u.id === req.user.id && b.suspended === false) delete b.suspended;
    if (b.suspended !== undefined) { if (u.id === req.user.id) throw new HttpError(400, 'You can’t suspend yourself.'); patch.suspended = b.suspended ? 1 : 0; if (b.suspended) db.run('DELETE FROM sessions WHERE user_id = ?', u.id); }
    if (b.name !== undefined) patch.name = String(b.name).slice(0, 80);
    db.update('users', u.id, patch);
    audit(req, 'user_update', u.email + ' ' + JSON.stringify(patch));
    return { ok: true };
  });

  /* ---------- plans ---------- */
  app.get('/api/admin/plans', req => { A(req); return { items: account.plans({ all: true }).map(p => ({ ...p, users: db.one('SELECT COUNT(*) n FROM users WHERE plan_id = ?', p.id).n })) }; });
  app.put('/api/admin/plans/:id', req => {
    A(req);
    const id = String(req.params.id).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
    if (!id) throw new HttpError(400, 'Plan id: letters, numbers and dashes.');
    const b = req.body || {};
    const prev = db.one('SELECT * FROM plans WHERE id = ?', id) || {};
    if (b.create && prev.id) throw new HttpError(409, 'A plan with the id “' + id + '” already exists. Pick another id.');
    const lim = (k, d) => (b[k] === undefined ? (prev[k] ?? d) : Number(b[k]) < 0 ? -1 : Math.floor(num(b[k], d)));
    const row = {
      name: String(b.name ?? prev.name ?? id).slice(0, 40), tagline: String(b.tagline ?? prev.tagline ?? '').slice(0, 120),
      price_month: num(b.price_month, prev.price_month || 0), price_year: num(b.price_year, prev.price_year || 0),
      searches_per_day: lim('searches_per_day', 10), saves_limit: lim('saves_limit', 20), ai_per_month: lim('ai_per_month', 5), downloads_per_month: lim('downloads_per_month', 0), scripts_per_month: lim('scripts_per_month', 0), follows_limit: lim('follows_limit', 1), seats: Math.max(1, lim('seats', 1)),
      features: JSON.stringify(Array.isArray(b.features) ? b.features.map(String).filter(Boolean).slice(0, 12) : db.json(prev.features, [])),
      popular: b.popular === undefined ? (prev.popular || 0) : (b.popular ? 1 : 0), active: b.active === undefined ? (prev.active ?? 1) : (b.active ? 1 : 0), sort: num(b.sort, prev.sort || 0)
    };
    if (id === 'free' && (row.price_month || row.price_year)) throw new HttpError(400, 'The Free plan must stay free.');
    if (row.popular && !row.active) throw new HttpError(400, 'A hidden plan can’t be “Most popular”. Show it first.');
    if (row.popular) db.run('UPDATE plans SET popular = 0');
    if (prev.id) db.update('plans', id, row); else db.insert('plans', { id, currency: 'USD', ...row });
    audit(req, 'plan_save', id);
    return { ok: true };
  });
  app.del('/api/admin/plans/:id', req => {
    A(req);
    if (req.params.id === 'free') throw new HttpError(400, 'The Free plan can’t be deleted.');
    if (db.one('SELECT COUNT(*) n FROM users WHERE plan_id = ?', req.params.id).n) throw new HttpError(400, 'People are on this plan. Hide it instead (switch “Active” off).');
    db.run('DELETE FROM plans WHERE id = ?', req.params.id);
    audit(req, 'plan_delete', req.params.id);
    return { ok: true };
  });

  /* ---------- payment methods, orders, coupons ---------- */
  app.get('/api/admin/payments', req => {
    A(req);
    return { methods: db.all('SELECT * FROM payment_methods ORDER BY sort, id').map(m => ({ ...payments.methodOut(m), config: db.json(m.config, {}), sort: m.sort, warnings: payments.methodWarnings(m) })), icons: payments.ICONS, proof_modes: payments.PROOF_MODES, review: db.one("SELECT COUNT(*) n FROM orders WHERE status = 'review'").n, gatevoo: require('../services/gatevoo').status(), demo: config.pay.demo, coupons: db.all('SELECT * FROM coupons ORDER BY created_at DESC').map(c => ({ ...c, active: !!c.active, first_purchase_only: !!c.first_purchase_only })) };
  });
  const methodIn = (b, prev = {}) => {
    if (!String(b.name ?? prev.name ?? '').trim()) throw new HttpError(400, 'Give the payment method a name.');
    // A local method needs countries, or nobody would ever see it.
    const willBeOn = b.active === undefined ? (prev.active ?? 1) : !!b.active;
    if (willBeOn && (b.scope ?? prev.scope) === 'local' && !(b.countries !== undefined ? csvList(b.countries, true) : String(prev.countries || '').split(',')).filter(countries.valid).length) throw new HttpError(400, 'Pick at least one country for a local method (or make it global). Otherwise nobody sees it.');
    const provider = ['gatevoo', 'manual'].includes(b.provider) ? b.provider : prev.provider || 'manual';
    const cfg = { ...db.json(prev.config, {}) };
    if (b.coins !== undefined) cfg.coins = csvList(b.coins, true).filter(c => ['USDT_TRC20', 'BTC'].includes(c));
    if (b.instructions !== undefined) cfg.instructions = String(b.instructions).slice(0, 2000);
    if (provider === 'manual') {
      // Account details: an array of {label, value}, or "Label: value" lines from the admin form.
      if (b.details !== undefined) cfg.details = (Array.isArray(b.details) ? b.details : String(b.details).split(/\r?\n/).map(l => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i), value: l.slice(i + 1) } : { label: '', value: l }; }));
      if (b.icon !== undefined) cfg.icon = b.icon;
      if (b.currency !== undefined) { const cur = String(b.currency).trim().toUpperCase(); if (cur && !/^[A-Z0-9]{2,10}$/.test(cur)) throw new HttpError(400, 'Currency is a short code like USD, NGN, KES or USDT.'); cfg.currency = cur || 'USD'; }
      if (b.rate !== undefined && b.rate !== '') { const r = Number(b.rate); if (!(r > 0) || r > 1e9) throw new HttpError(400, 'Rate is how many of that currency one US dollar buys, e.g. 1600 for NGN. Use 1 for USD.'); cfg.rate = r; }
      if (b.proof_mode !== undefined) cfg.proof_mode = b.proof_mode;
      Object.assign(cfg, payments.manualConfig(cfg));
    }
    return {
      name: String(b.name ?? prev.name ?? '').trim().slice(0, 60) || 'Payment method', provider, scope: (b.scope ?? prev.scope) === 'local' ? 'local' : 'global',
      countries: b.countries !== undefined ? csvList(b.countries, true).filter(countries.valid).join(',') : prev.countries || '', description: String(b.description ?? prev.description ?? '').slice(0, 300),
      config: JSON.stringify(cfg), active: b.active === undefined ? (prev.active ?? 1) : (b.active ? 1 : 0), sort: num(b.sort, prev.sort || 0)
    };
  };
  app.post('/api/admin/payments/methods', req => { A(req); const id = db.insert('payment_methods', methodIn(req.body || {})); audit(req, 'method_add', (req.body || {}).name); return { id }; });
  app.patch('/api/admin/payments/methods/:id', req => { A(req); const m = db.one('SELECT * FROM payment_methods WHERE id = ?', Number(req.params.id)); if (!m) throw new HttpError(404, 'Not found'); db.update('payment_methods', m.id, methodIn(req.body || {}, m)); audit(req, 'method_update', m.name); return { ok: true }; });
  app.del('/api/admin/payments/methods/:id', req => { A(req); db.run('DELETE FROM payment_methods WHERE id = ?', Number(req.params.id)); audit(req, 'method_delete', req.params.id); return { ok: true }; });
  app.post('/api/admin/payments/gatevoo/ping', async req => { A(req); return require('../services/gatevoo').ping(); });
  // Reorder: move a method one place up (-1) or down (+1); sort numbers are rewritten 10, 20, 30...
  app.post('/api/admin/payments/methods/:id/move', req => {
    A(req);
    const list = db.all('SELECT id FROM payment_methods ORDER BY sort, id').map(r => r.id);
    const i = list.indexOf(Number(req.params.id));
    if (i < 0) throw new HttpError(404, 'Not found');
    const j = i + (Number((req.body || {}).dir) < 0 ? -1 : 1);
    if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
    db.tx(() => list.forEach((id, k) => db.update('payment_methods', id, { sort: (k + 1) * 10 })));
    audit(req, 'method_move', req.params.id);
    return { ok: true, order: list };
  });

  app.get('/api/admin/orders', req => {
    A(req);
    const st = req.query.status;
    return { items: db.all('SELECT o.*, u.email, u.name FROM orders o JOIN users u ON u.id = o.user_id ' + (st ? 'WHERE o.status = ? ' : '') + 'ORDER BY o.id DESC LIMIT 200', ...(st ? [st] : [])).map(o => ({ ...o, meta: db.json(o.meta, {}), plan: (account.plan(o.plan_id) || {}).name })) };
  });
  app.post('/api/admin/orders/:ref/paid', req => {
    A(req);
    const o = db.one('SELECT * FROM orders WHERE ref = ?', req.params.ref);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === 'paid') return { ok: true };
    payments.approve(o.ref, { by: req.user.email, note: (req.body || {}).note });
    audit(req, 'order_mark_paid', o.ref);
    return { ok: true };
  });
  // Custom methods: approve (plan switches on at the locked price) or reject with a reason the customer sees.
  app.post('/api/admin/orders/:ref/approve', req => { A(req); const r = payments.approve(req.params.ref, { by: req.user.email, note: (req.body || {}).note }); audit(req, 'order_approve', req.params.ref); return r; });
  app.post('/api/admin/orders/:ref/reject', req => { A(req); const r = payments.reject(req.params.ref, { by: req.user.email, reason: (req.body || {}).reason }); audit(req, 'order_reject', req.params.ref + ': ' + String((req.body || {}).reason || '').slice(0, 120)); return r; });
  // The customer's screenshot (private file, admins only).
  app.get('/api/admin/orders/:ref/proof', (req, res) => {
    A(req);
    const f = payments.proofFile(db.one('SELECT * FROM orders WHERE ref = ?', req.params.ref));
    if (!f) throw new HttpError(404, 'No screenshot');
    res.send(require('node:fs').readFileSync(f), 200, { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[f.split('.').pop()], { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' });
  });
  // Money back to the customer (VooSquare logs it, affiliate commission stays) and disputes (commission reversed).
  app.post('/api/admin/orders/:ref/refund', req => {
    A(req);
    const b = req.body || {};
    const r = payments.refund(req.params.ref, { amount: b.amount, endPlan: b.end_plan !== false, by: req.user.email });
    audit(req, 'order_refund', req.params.ref + ' $' + r.amount + (r.plan_ended ? ' (plan ended)' : ''));
    return r;
  });
  app.post('/api/admin/orders/:ref/chargeback', req => {
    A(req);
    const r = payments.chargeback(req.params.ref, { amount: (req.body || {}).amount, by: req.user.email });
    audit(req, 'order_chargeback', req.params.ref + ' $' + r.amount);
    return r;
  });
  app.get('/api/admin/voosquare', req => { A(req); return require('../services/voosquare').status(); });
  app.post('/api/admin/voosquare/flush', async req => { A(req); return require('../services/voosquare').flush(); });
  app.post('/api/admin/orders/:ref/check', async req => {
    A(req);
    const o = db.one('SELECT * FROM orders WHERE ref = ?', req.params.ref);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.provider !== 'gatevoo') throw new HttpError(400, 'Only crypto orders can be checked automatically.');
    try { return await require('../services/gatevoo').verify(o); } catch (e) { return { ok: false, reason: e.message }; }
  });

  const couponCheck = b => {
    if (b.percent !== undefined && (Number(b.percent) < 0 || Number(b.percent) > 100)) throw new HttpError(400, 'Percent off must be between 0 and 100.');
    if (b.plans !== undefined) { const bad = csvList(b.plans).filter(p => !db.one('SELECT id FROM plans WHERE id = ?', p)); if (bad.length) throw new HttpError(400, 'Unknown plan: ' + bad.join(', ') + '. Use plan ids like starter, pro, agency.'); }
  };
  const couponIn = (b, prev = {}) => (couponCheck(b), {
    percent: num(b.percent, prev.percent || 0, 0, 100), amount_off: num(b.amount_off, prev.amount_off || 0, 0, 100000),
    plans: b.plans !== undefined ? csvList(b.plans).join(',') : prev.plans || '', intervals: b.intervals !== undefined ? csvList(b.intervals).filter(x => ['month', 'year'].includes(x)).join(',') : prev.intervals || '',
    first_purchase_only: b.first_purchase_only === undefined ? (prev.first_purchase_only || 0) : (b.first_purchase_only ? 1 : 0), max_uses: Math.floor(num(b.max_uses, prev.max_uses || 0)),
    ends_at: b.ends_at !== undefined ? (b.ends_at ? (isNaN(new Date(b.ends_at).getTime()) ? (() => { throw new HttpError(400, 'That end date isn’t valid.'); })() : new Date(b.ends_at).toISOString()) : null) : prev.ends_at || null, active: b.active === undefined ? (prev.active ?? 1) : (b.active ? 1 : 0)
  });
  app.post('/api/admin/coupons', req => {
    A(req);
    const code = String((req.body || {}).code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30);
    if (!code) throw new HttpError(400, 'Type a code (letters and numbers).');
    if (db.one('SELECT code FROM coupons WHERE code = ?', code)) throw new HttpError(409, 'That code already exists.');
    const c = couponIn(req.body || {});
    if (!c.percent && !c.amount_off) throw new HttpError(400, 'Set a percent or an amount off.');
    db.insert('coupons', { code, ...c, uses: 0, created_at: db.now() });
    audit(req, 'coupon_add', code);
    return { ok: true };
  });
  app.patch('/api/admin/coupons/:code', req => { A(req); const c = db.one('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE', req.params.code); if (!c) throw new HttpError(404, 'Not found'); db.update('coupons', c.code, couponIn(req.body || {}, c), 'code'); audit(req, 'coupon_update', c.code); return { ok: true }; });
  app.del('/api/admin/coupons/:code', req => {
    A(req);
    const o = settings.get('offer');
    if (o && o.on && String(o.code || '').toUpperCase() === String(req.params.code).toUpperCase()) throw new HttpError(400, 'The live offer uses this code. Switch the offer off (or change its code) first.');
    if (!db.run('DELETE FROM coupons WHERE code = ? COLLATE NOCASE', req.params.code).changes) throw new HttpError(404, 'Not found');
    audit(req, 'coupon_delete', req.params.code);
    return { ok: true };
  });

  /* ---------- settings ---------- */
  const EDITABLE = ['platforms', 'score', 'announcement', 'offer', 'family', 'niches', 'company', 'billing', 'flags'];
  app.get('/api/admin/settings', req => { A(req); const s = settings.all(); return Object.fromEntries(EDITABLE.map(k => [k, s[k]])); });
  app.patch('/api/admin/settings/:group', req => {
    A(req);
    const g = req.params.group;
    if (!EDITABLE.includes(g)) throw new HttpError(400, 'Unknown settings group');
    let v = (req.body || {}).value;
    if (g === 'niches') v = (Array.isArray(v) ? v : String(v || '').split(',')).map(s => String(s).trim()).filter(Boolean).slice(0, 60);
    if (g === 'family') {
      if (!Array.isArray(v) || v.some(f => !f || typeof f !== 'object')) throw new HttpError(400, 'Expected a list of brands');
      const bad = v.find(f => !String(f.name || '').trim() || !String(f.title || '').trim() || !/^https?:\/\/[^\s/]+\.[^\s]+/.test(String(f.url || '')));
      if (bad) throw new HttpError(400, (String(bad.name || '').trim() || 'A new brand') + ' needs a name, a headline and a full link (https://…).');
      v = v.slice(0, 12).map(f => ({ key: String(f.key || f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30), name: String(f.name || '').slice(0, 30), tag: String(f.tag || '').slice(0, 20), title: String(f.title || '').slice(0, 80), text: String(f.text || '').slice(0, 240), perk: String(f.perk || '').slice(0, 40), url: /^https?:\/\//.test(f.url || '') ? String(f.url).slice(0, 200) : '#', color: /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#1F5BFF', ink: /^#[0-9a-f]{6}$/i.test(f.ink) ? f.ink : '#FFFFFF', accent: /^#[0-9a-f]{6}$/i.test(f.accent || '') ? f.accent : '', on: f.on !== false })); }
    if (g === 'score') { const cur = settings.get('score'); v = Object.fromEntries(Object.keys(cur).map(k => [k, num((v || {})[k], cur[k], 0, 1000)])); }
    if (g === 'billing') { const cur = settings.get('billing'); v = { renew_reminder_days: num((v || {}).renew_reminder_days, cur.renew_reminder_days, 0, 30), grace_days: num((v || {}).grace_days, cur.grace_days, 0, 30), pending_expire_days: Math.floor(num((v || {}).pending_expire_days, cur.pending_expire_days || 7, 1, 90)) }; }
    if (g === 'platforms') { v = Object.fromEntries(Object.entries(v || {}).filter(([, x]) => ['live', 'soon', 'off'].includes(x))); }
    if (g === 'offer' && v && v.code) { v.code = String(v.code).toUpperCase(); if (v.on && !db.one('SELECT code FROM coupons WHERE code = ?', v.code)) throw new HttpError(400, 'Create the coupon ' + v.code + ' first (Payments → Coupons), so the offer works at checkout.'); }
    if (typeof v !== 'object' || v === null) throw new HttpError(400, 'Expected an object');
    const out = settings.set(g, v);
    if (g === 'score') ads.refreshAll();
    audit(req, 'settings_' + g);
    return { ok: true, value: out };
  });

  /* ---------- emails ---------- */
  app.get('/api/admin/emails', req => { A(req); return { templates: mailer.list(), log: db.all('SELECT * FROM email_log ORDER BY id DESC LIMIT 100'), provider: config.mail.provider, from: config.mail.from, configured: config.mail.provider !== 'log' && !!config.mail.key }; });
  app.get('/api/admin/emails/:name/preview', (req, res) => { A(req); if (!mailer.list().some(t => t.name === req.params.name)) throw new HttpError(404, 'No such email'); const m = mailer.build(req.params.name, mailer.SAMPLE); res.send(m.html, 200, 'text/html; charset=utf-8'); });
  app.post('/api/admin/emails/test', async req => {
    A(req);
    const b = req.body || {}; const name = String(b.name || 'welcome'); const to = String(b.to || req.user.email).trim();
    if (!mailer.list().some(t => t.name === name)) throw new HttpError(404, 'No such email');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new HttpError(400, 'That email address isn’t valid.');
    const r = await mailer.send(to, name, mailer.SAMPLE);
    if (r === false) throw new HttpError(502, 'The email provider refused it. Check Admin → Emails → recent log.');
    return { ok: true, logged: config.mail.provider === 'log' || !config.mail.key };
  });
  // Send an announcement to everyone who hasn't opted out of news (uses the "announcement" template).
  app.post('/api/admin/emails/broadcast', async req => {
    A(req);
    const b = req.body || {};
    if (!b.subject || !b.body) throw new HttpError(400, 'Subject and message are required.');
    const { esc } = require('../lib/md');
    const html = String(b.body).split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');
    if (b.plan && typeof b.plan !== 'string') throw new HttpError(400, 'Unknown plan');
    const list = db.all('SELECT email, name FROM users WHERE marketing_opt_out = 0 AND suspended = 0' + (b.plan ? ' AND plan_id = ?' : ''), ...(b.plan ? [b.plan] : []));
    if (b.dry) return { recipients: list.length };
    list.forEach(u => mailer.send(u.email, 'announcement', { name: (u.name || '').split(' ')[0] || 'there', subject: String(b.subject).slice(0, 140), body_html: html, unsubscribe_url: config.appUrl + '/app/account' }, { bulk: true }));
    audit(req, 'broadcast', b.subject + ' → ' + list.length);
    return { sent: list.length };
  });

  // Email the live offer to free users who haven't opted out (uses the "offer" template).
  app.post('/api/admin/emails/offer', async req => {
    A(req);
    const o = settings.offer();
    if (!o) throw new HttpError(400, 'Switch the offer on first (Offer & Voo family).');
    const list = db.all("SELECT email, name FROM users WHERE marketing_opt_out = 0 AND suspended = 0 AND role != 'admin' AND (plan_id = 'free' OR plan_renews_at IS NULL OR plan_renews_at < ?)", db.now());
    if ((req.body || {}).dry) return { recipients: list.length };
    const planUrl = config.appUrl + '/app/plan?coupon=' + encodeURIComponent(o.code);
    list.forEach(u => mailer.send(u.email, 'offer', { name: (u.name || '').split(' ')[0] || 'there', offer_title: o.title, offer_text: o.text, offer_code: o.code, plan_url: planUrl }, { bulk: true }));
    audit(req, 'offer_email', o.code + ' → ' + list.length);
    return { sent: list.length };
  });

  app.get('/api/admin/audit', req => { A(req); return { items: db.all('SELECT l.*, u.email FROM audit_log l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 200') }; });
};
