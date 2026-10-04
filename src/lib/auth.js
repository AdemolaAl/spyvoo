'use strict';
// Sessions, login state and access checks.
const db = require('../db');
const { token, sha256 } = require('./security');
const { HttpError } = require('./http');

const COOKIE = 'sv_s';
const TTL = 30 * 864e5;

function startSession(req, res, user) {
  const raw = token(32);
  db.insert('sessions', { id: sha256(raw), user_id: user.id, ip: String(req.ip).slice(0, 64), ua: String(req.headers['user-agent'] || '').slice(0, 200), created_at: db.now(), expires_at: new Date(Date.now() + TTL).toISOString() });
  db.update('users', user.id, { last_login: db.now() });
  res.cookie(COOKIE, raw, { maxAge: TTL / 1000 });
}

function endSession(req, res) {
  const raw = req.cookies[COOKIE];
  if (raw) db.run('DELETE FROM sessions WHERE id = ?', sha256(raw));
  res.cookie(COOKIE, '', { maxAge: 0 });
}

// Middleware: loads req.user when a valid session cookie exists.
function load(req) {
  req.user = null;
  const raw = req.cookies[COOKIE];
  if (!raw) return;
  const s = db.one('SELECT * FROM sessions WHERE id = ?', sha256(raw));
  if (!s || new Date(s.expires_at) < new Date()) return;
  const u = db.one('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!u || u.suspended) return;
  req.session = s;
  req.user = u;
}

// Cross-site request protection: browsers can't add custom headers to cross-site requests without CORS.
// /api/voosquare/* is server-to-server (bearer key) and /webhooks/* is signed, so both are exempt.
function csrf(req) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/') && !req.path.startsWith('/api/voosquare/') && req.headers['x-sv'] !== '1') {
    throw new HttpError(403, 'Missing request header');
  }
}

const needUser = req => { if (!req.user) throw new HttpError(401, 'Please log in.'); };
const needAdmin = req => { needUser(req); if (req.user.role !== 'admin') throw new HttpError(403, 'Admins only.'); };

module.exports = { startSession, endSession, load, csrf, needUser, needAdmin, COOKIE, TTL };
