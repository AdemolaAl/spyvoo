'use strict';
// Background jobs, run inside the web process (one Railway service is enough). Each job is guarded so a slow
// or failing job never blocks the others. Turn off with SCHEDULER=false if you run a separate worker
// (one service only: SQLite and the Railway volume belong to a single instance).
const db = require('../db');

const MIN = 60e3;
const JOBS = [
  { name: 'scrape', every: 5 * MIN, run: () => require('./ingest').tick() },
  { name: 'media', every: 1 * MIN, run: () => require('./media').work() },
  { name: 'refresh', every: 60 * MIN, run: () => require('./ads').refreshRecent() },
  { name: 'alerts', every: 30 * MIN, run: async () => ({ ...require('./library').advertiserAlerts(), ...require('./library').searchAlerts() }) },
  { name: 'billing', every: 60 * MIN, run: () => require('./payments').renewals() },
  { name: 'voosquare', every: 1 * MIN, run: () => require('./voosquare').flush() },
  { name: 'weekly', every: 30 * MIN, run: weekly },
  { name: 'cleanup', every: 24 * 60 * MIN, run: cleanup }
];

const state = {};
let timer = null;

async function weekly() {
  const d = new Date();
  if (d.getUTCDay() !== 1 || d.getUTCHours() < 8) return { skipped: true };
  const key = 'weekly-' + d.toISOString().slice(0, 10);
  if (db.one("SELECT id FROM audit_log WHERE action = 'weekly_report' AND detail = ?", key)) return { skipped: true };
  db.insert('audit_log', { action: 'weekly_report', detail: key, created_at: db.now() });
  return require('./library').weeklyReports();
}

function cleanup() {
  const now = db.now();
  db.run('DELETE FROM sessions WHERE expires_at < ?', now);
  db.run('DELETE FROM tokens WHERE expires_at < ?', new Date(Date.now() - 7 * 864e5).toISOString());
  db.run('DELETE FROM jobs WHERE created_at < ?', new Date(Date.now() - 60 * 864e5).toISOString());
  db.run('DELETE FROM notifications WHERE created_at < ? AND read_at IS NOT NULL', new Date(Date.now() - 90 * 864e5).toISOString());
  db.run("UPDATE orders SET status = 'failed' WHERE status = 'pending' AND created_at < ?", new Date(Date.now() - 3 * 864e5).toISOString());
  return { ok: true };
}

async function runJob(j) {
  const s = state[j.name] || (state[j.name] = { last: 0, busy: false });
  if (s.busy || Date.now() - s.last < j.every) return;
  s.busy = true; s.last = Date.now();
  try { s.result = await j.run(); s.error = ''; }
  catch (e) { s.error = e.message; console.error('[job:' + j.name + ']', e.message); }
  finally { s.busy = false; s.finished = new Date().toISOString(); }
}

function start() {
  if (timer) return;
  // Stagger the first runs so boot stays fast.
  JOBS.forEach((j, i) => { state[j.name] = { last: Date.now() - j.every + 20e3 + i * 5e3, busy: false }; });
  timer = setInterval(() => JOBS.forEach(j => runJob(j)), 10e3);
  timer.unref();
}
function stop() { clearInterval(timer); timer = null; }
function status() { return JOBS.map(j => ({ name: j.name, every_min: j.every / MIN, ...(state[j.name] || {}) })); }
async function runNow(name) { const j = JOBS.find(x => x.name === name); if (!j) throw new Error('Unknown job'); (state[j.name] || (state[j.name] = {})).last = 0; await runJob(j); return state[j.name]; }

module.exports = { start, stop, status, runNow, JOBS };
