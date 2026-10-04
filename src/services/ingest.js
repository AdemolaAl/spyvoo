'use strict';
// The data pipeline: tracking rules → provider → deduplicated ads → media downloads → (optional) AI analysis.
// Runs from the scheduler; admins can also run a rule or a test scrape by hand. Every run is logged in jobs.
const db = require('../db');
const settings = require('./settings');
const ads = require('./ads');
const providers = require('../providers');

const DAY = 864e5;
let running = false;

const startOfDay = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString();
function spentToday() { return db.one("SELECT COALESCE(SUM(credits_used), 0) n FROM jobs WHERE kind = 'scrape' AND created_at >= ?", startOfDay()).n; }
function budgetLeft() { return Math.max(0, (Number(settings.get('provider').daily_budget_usd) || 0) - spentToday()); }

function ruleOut(r) { return { ...r, countries: ads.uncsv(r.countries), platforms: ads.uncsv(r.platforms), active: !!r.active }; }

// Save what a provider returned. Returns { found, created, ids }.
function save(list, { source, niche = '', platformsAllowed } = {}) {
  let created = 0; const ids = [];
  for (const n of list) {
    if (platformsAllowed && n.platforms && n.platforms.length && !n.platforms.some(p => platformsAllowed.includes(p))) continue;
    const r = ads.upsert(n, { source, niche: niche || n.niche || '' });
    if (!r) continue;
    ids.push(r.id); if (r.isNew) created++;
  }
  return { found: list.length, created, ids };
}

async function runRule(rule, { manual = false } = {}) {
  const r = typeof rule === 'object' ? rule : db.one('SELECT * FROM tracking_rules WHERE id = ?', rule);
  if (!r) throw new Error('Rule not found');
  const p = settings.get('provider');
  const provider = providers.get();
  const job = db.insert('jobs', { kind: 'scrape', rule_id: r.id, ref: r.type + ': ' + r.value, provider: provider.id, status: 'running', started_at: db.now(), created_at: db.now() });
  db.update('tracking_rules', r.id, { last_run_at: db.now() });
  try {
    if (!provider.configured()) throw new Error(provider.label + ' is not connected. Add the API token in Admin → Ad data & AI.');
    if (provider.id !== 'demo' && budgetLeft() <= 0) throw Object.assign(new Error('Daily credit budget reached ($' + p.daily_budget_usd + '). Scraping resumes tomorrow, or raise the budget in Admin → Ad data & AI.'), { budget: true });
    const out = await provider.search({ type: r.type, value: r.value, countries: ads.uncsv(r.countries), limit: r.results_limit || p.results_per_rule, activeOnly: true });
    const res = save(out.ads, { source: provider.id, niche: r.niche, platformsAllowed: ads.uncsv(r.platforms) });
    db.update('jobs', job, { status: 'done', ads_found: res.found, ads_new: res.created, credits_used: out.credits || 0, detail: (out.runs || []).join(', '), finished_at: db.now() });
    if (p.analyze_new && res.created) require('./ai').queueNew(res.ids.slice(-res.created)).catch(() => {});
    return { job, ...res, credits: out.credits || 0 };
  } catch (e) {
    db.update('jobs', job, { status: 'failed', error: String(e.message).slice(0, 500), finished_at: db.now() });
    if (e.budget) notifyBudget();
    if (manual) throw e;
    return { job, error: e.message };
  }
}

// Tells admins once a day that the budget stopped scraping.
function notifyBudget() {
  const key = 'budget-' + new Date().toISOString().slice(0, 10);
  if (db.one("SELECT id FROM audit_log WHERE action = 'budget_alert' AND detail = ?", key)) return;
  db.insert('audit_log', { action: 'budget_alert', detail: key, created_at: db.now() });
  const mailer = require('./mailer');
  for (const a of db.all("SELECT email, name FROM users WHERE role = 'admin' AND suspended = 0")) mailer.send(a.email, 'admin-budget', { name: (a.name || '').split(' ')[0] || 'there', budget: settings.get('provider').daily_budget_usd, spent: spentToday().toFixed(2) });
}

// Scheduler: run every rule whose interval has passed, one at a time, until the budget runs out.
async function tick() {
  if (running) return { skipped: 'busy' };
  if (!providers.get().configured()) return { skipped: 'provider not connected' };
  running = true;
  try {
    const due = db.all('SELECT * FROM tracking_rules WHERE active = 1 ORDER BY COALESCE(last_run_at, \'\') LIMIT 50')
      .filter(r => !r.last_run_at || new Date(r.last_run_at).getTime() + (r.interval_hours || 6) * 3600e3 <= Date.now());
    let ran = 0;
    for (const r of due) {
      if (providers.get().id !== 'demo' && budgetLeft() <= 0) { notifyBudget(); break; }
      await runRule(r);
      ran++;
    }
    return { ran };
  } finally { running = false; }
}

async function testScrape({ value, country = 'ALL', type = 'keyword' }) {
  if (!value) throw new Error('Type a keyword or a Facebook page ID to test.');
  const provider = providers.get();
  const job = db.insert('jobs', { kind: 'scrape', ref: 'Test: ' + value, provider: provider.id, status: 'running', started_at: db.now(), created_at: db.now() });
  try {
    if (!provider.configured()) throw new Error(provider.label + ' is not connected yet.');
    const out = await provider.search({ type, value, countries: [country], limit: 10, activeOnly: true });
    const res = save(out.ads.slice(0, 10), { source: provider.id });
    db.update('jobs', job, { status: 'done', ads_found: res.found, ads_new: res.created, credits_used: out.credits || 0, finished_at: db.now() });
    return { ...res, credits: out.credits || 0, sample: res.ids.slice(0, 6).map(id => ads.card(ads.get(id))).filter(Boolean) };
  } catch (e) {
    db.update('jobs', job, { status: 'failed', error: String(e.message).slice(0, 500), finished_at: db.now() });
    throw e;
  }
}

// First boot: sample ads so the dashboard and landing page are never empty.
function seedDemo({ force = false } = {}) {
  if (!force && db.one('SELECT id FROM ads LIMIT 1')) return 0;
  const { sampleAds } = require('../providers/demo');
  const res = save(sampleAds(), { source: 'demo' });
  db.run("UPDATE ads SET featured = 1 WHERE source = 'demo' AND winner_score >= 80");
  return res.created;
}
function clearDemo() {
  const n = db.one("SELECT COUNT(*) n FROM ads WHERE source = 'demo'").n;
  db.run("DELETE FROM ads_fts WHERE rowid IN (SELECT id FROM ads WHERE source = 'demo')");
  db.run("DELETE FROM ads WHERE source = 'demo'");
  db.run('DELETE FROM advertisers WHERE id NOT IN (SELECT DISTINCT advertiser_id FROM ads)');
  return n;
}

module.exports = { runRule, tick, testScrape, seedDemo, clearDemo, save, spentToday, budgetLeft, ruleOut, startOfDay, DAY };
