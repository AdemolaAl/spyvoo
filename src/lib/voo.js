'use strict';
// The one Voo Connect instance (kit in ./voo-connect, copied unchanged from the VooSquare repo; never edit it).
// Built lazily from config.voo so tests and the admin check can switch settings without a restart (reset()).
const path = require('node:path');
const config = require('../config');
const db = require('../db');

const KIT = require(path.join(config.root, 'voo-connect'));
let inst = null;
let started = false;

// Outbox on our own database (one row), so queued events survive restarts and deploys.
const dbStore = {
  load() { try { const r = db.one('SELECT queue FROM voo_queue WHERE id = 1'); return r ? JSON.parse(r.queue) : []; } catch { return []; } },
  save(list) { db.run('INSERT INTO voo_queue (id, queue, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET queue = excluded.queue, updated_at = excluded.updated_at', JSON.stringify(list), db.now()); }
};

function cfg() { return config.voo; }
const loginOn = () => !!(cfg().on && cfg().base && cfg().clientId && cfg().clientSecret);
const eventsOn = () => !!(cfg().on && cfg().base && cfg().apiKey);
const anyOn = () => loginOn() || eventsOn();

function get() {
  if (!anyOn()) return null;
  if (inst) return inst;
  const c = cfg();
  inst = KIT.createVooConnect({
    base: c.base, serverBase: c.serverBase || undefined, clientId: c.clientId, clientSecret: c.clientSecret, apiKey: c.apiKey,
    signalSecret: c.signalSecret || undefined, redirectUri: c.redirectUri, eventPrefix: c.eventPrefix, toolName: 'spyvoo',
    defaultReturnTo: '/app', secureCookies: config.isProd ? true : undefined, store: dbStore, timeoutMs: 10000,
    backoffMs: Number(process.env.VOO_BACKOFF_MS) || undefined,
    onRejected(ev, error) {
      console.warn('[voosquare] event refused: ' + ev.event_id + ' (' + error + ')');
      try { db.insert('voo_failed', { event_id: ev.event_id, type: ev.type, error: String(error).slice(0, 300), body: JSON.stringify(ev), created_at: db.now() }); } catch { /* table missing on a very old database */ }
    },
    onError(err) { console.warn('[voosquare] events: ' + err.message); }
  });
  return inst;
}

// Background sender (call once at boot, on the instance that runs the scheduler).
function start() {
  const k = eventsOn() && get();
  if (!k || started) return false;
  k.events.start(cfg().flushMs);
  started = true;
  return true;
}
async function stop({ timeoutMs = 5000 } = {}) {
  if (!inst) return;
  inst.events.stop();
  started = false;
  if (eventsOn()) await inst.events.drain({ timeoutMs }).catch(() => {});
}
function reset() { if (inst) inst.events.stop(); inst = null; started = false; }

module.exports = { KIT, get, start, stop, reset, loginOn, eventsOn, anyOn, dbStore };
