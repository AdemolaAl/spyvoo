'use strict';
// Email + password accounts (sign-up until VooSquare login is switched on; log in always), email verification,
// password reset and team invites.
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const account = require('../services/account');
const settings = require('../services/settings');
const mailer = require('../services/mailer');
const voo = require('../services/voosquare');
const countries = require('../lib/countries');
const { HttpError, rateLimit } = require('../lib/http');
const { hashPassword, verifyPassword, token, sha256 } = require('../lib/security');

const first = n => String(n || '').trim().split(' ')[0] || 'there';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function makeToken(userId, kind, hours, data = {}) {
  const raw = token(24);
  db.insert('tokens', { user_id: userId, kind, token_hash: sha256(raw), data: JSON.stringify(data), expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_at: db.now() });
  return raw;
}
// check(t) runs before the token is spent, so a wrong person opening a link doesn't burn it.
function useToken(raw, kind, check) {
  const t = raw ? db.one('SELECT * FROM tokens WHERE token_hash = ? AND kind = ?', sha256(String(raw)), kind) : null;
  if (!t || t.used_at || new Date(t.expires_at) < new Date()) return null;
  const out = { ...t, data: db.json(t.data, {}) };
  if (check) check(out);
  db.update('tokens', t.id, { used_at: db.now() });
  return out;
}
function sendVerify(u) {
  const raw = makeToken(u.id, 'verify', 72);
  return mailer.send(u.email, 'verify-email', { name: first(u.name), verify_url: config.appUrl + '/verify?token=' + raw });
}
const vooBlock = () => { if (voo.enabled()) throw new HttpError(403, 'New Spyvoo accounts are made with your Voo ID.', { login_url: '/auth/voosquare?signup=1' }); };
const out = u => ({ user: account.publicUser(u) });

module.exports = function (app) {
  const signupLimit = rateLimit('signup', 10, 3600e3);
  const loginLimit = rateLimit('login', 20, 900e3);
  const mailLimit = rateLimit('mail', 6, 3600e3);

  app.get('/api/auth/me', req => {
    if (!req.user) return { user: null, voosquare: voo.publicInfo() };
    return { ...out(req.user), voosquare: voo.publicInfo() };
  });

  app.post('/api/auth/signup', signupLimit, (req, res) => {
    vooBlock();
    if (!settings.get('flags').signups || settings.get('flags').maintenance) throw new HttpError(403, 'Sign-ups are paused for a moment. Please try again later.');
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80);
    const country = String(b.country || '').toUpperCase();
    if (!name) throw new HttpError(400, 'Add your name so we know what to call you.');
    if (!EMAIL.test(email) || email.length > 200) throw new HttpError(400, 'Enter an email address like you@yourbrand.com.');
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Your password needs at least 8 characters.');
    if (!countries.valid(country)) throw new HttpError(400, 'Pick your country. It decides which payment methods you see.');
    if (db.one('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'There’s already an account with this email. Log in instead.');
    const id = db.insert('users', { email, name, password_hash: hashPassword(b.password), country, referred_by: String(b.ref || '').slice(0, 64), onboarding: JSON.stringify({ tour_seen: false, niche: String(b.niche || '').slice(0, 40) }), created_at: db.now() });
    const u = db.one('SELECT * FROM users WHERE id = ?', id);
    auth.startSession(req, res, u);
    const raw = makeToken(u.id, 'verify', 72);
    mailer.send(u.email, 'welcome', { name: first(u.name), dashboard_url: config.appUrl + '/app', verify_url: config.appUrl + '/verify?token=' + raw });
    return out(u);
  });

  app.post('/api/auth/login', loginLimit, (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const u = db.one('SELECT * FROM users WHERE email = ?', email);
    // Email + password login stays for everyone who has a password (accounts made before Voo ID, and admins as a
    // break-glass if VooSquare is down). New accounts are made with Voo ID once VooSquare is on.
    if (!u || !u.password_hash || !verifyPassword(String(b.password || ''), u.password_hash)) throw new HttpError(401, 'That email and password don’t match.');
    if (u.suspended) throw new HttpError(403, 'This account is suspended. Contact support@spyvoo.com.');
    auth.startSession(req, res, u);
    return out(u);
  });

  app.post('/api/auth/logout', (req, res) => { auth.endSession(req, res); return { ok: true }; });

  app.post('/api/auth/forgot', mailLimit, req => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const u = email && db.one('SELECT * FROM users WHERE email = ?', email);
    // Only accounts that have a password can reset it (a Voo ID account logs in through VooSquare).
    if (u && !u.suspended && u.password_hash) {
      const raw = makeToken(u.id, 'reset', 2);
      mailer.send(u.email, 'password-reset', { name: first(u.name), reset_url: config.appUrl + '/reset?token=' + raw });
    }
    return { ok: true }; // same answer either way, so nobody can test which emails have accounts
  });

  app.post('/api/auth/reset', loginLimit, (req, res) => {
    const b = req.body || {};
    if (String(b.password || '').length < 8) throw new HttpError(400, 'Your new password needs at least 8 characters.');
    const t = useToken(b.token, 'reset');
    if (!t) throw new HttpError(400, 'This reset link expired. Ask for a new one.');
    db.update('users', t.user_id, { password_hash: hashPassword(b.password), email_verified: 1 });
    db.run('DELETE FROM sessions WHERE user_id = ?', t.user_id);
    db.run("UPDATE tokens SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", db.now(), t.user_id);
    const u = db.one('SELECT * FROM users WHERE id = ?', t.user_id);
    auth.startSession(req, res, u);
    return out(u);
  });

  app.post('/api/auth/verify', req => {
    const t = useToken((req.body || {}).token, 'verify');
    if (!t) throw new HttpError(400, 'This link expired or was already used.');
    db.update('users', t.user_id, { email_verified: 1 });
    return { ok: true };
  });
  app.post('/api/auth/resend', mailLimit, req => {
    auth.needUser(req);
    if (req.user.email_verified) return { ok: true, already: true };
    sendVerify(req.user);
    return { ok: true };
  });

  // Agency team invites.
  app.post('/api/team/invite', mailLimit, req => {
    auth.needUser(req);
    const owner = req.user;
    if (owner.team_owner_id) throw new HttpError(403, 'Only the team owner can invite.');
    const p = account.planFor(owner);
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, 'Enter their email address.');
    const members = db.one('SELECT COUNT(*) n FROM users WHERE team_owner_id = ?', owner.id).n;
    if (p.seats <= 1) throw new HttpError(402, 'Team seats come with the Agency plan.', { upgrade: true });
    if (members + 1 >= p.seats) throw new HttpError(402, 'All ' + p.seats + ' seats are in use. Remove someone first.');
    const raw = makeToken(owner.id, 'invite', 7 * 24, { email });
    mailer.send(email, 'team-invite', { inviter_name: owner.name || owner.email, team_name: owner.name || 'their team', invite_url: config.appUrl + '/invite?token=' + raw });
    return { ok: true };
  });
  app.post('/api/team/accept', req => {
    auth.needUser(req);
    const t = useToken((req.body || {}).token, 'invite', t => {
      if (t.data.email && t.data.email !== req.user.email) throw new HttpError(403, 'This invite is for ' + t.data.email + '. Log in with that email.');
      if (t.user_id === req.user.id) throw new HttpError(400, 'That’s your own invite.');
      const owner = db.one('SELECT * FROM users WHERE id = ?', t.user_id);
      const seats = owner ? account.planFor(owner).seats : 1;
      if (!owner || db.one('SELECT COUNT(*) n FROM users WHERE team_owner_id = ?', owner.id).n + 1 >= seats) throw new HttpError(402, 'This team has no free seats left. Ask the owner to remove someone or upgrade.');
    });
    if (!t) throw new HttpError(400, 'This invite expired or was already used. Ask for a new one.');
    db.update('users', req.user.id, { team_owner_id: t.user_id });
    return { ok: true };
  });
  app.get('/api/team', req => {
    auth.needUser(req);
    const o = account.owner(req.user);
    return { owner: { name: o.name, email: o.email, me: o.id === req.user.id }, seats: account.planFor(req.user).seats, members: db.all('SELECT id, name, email, last_login FROM users WHERE team_owner_id = ?', o.id) };
  });
  app.post('/api/team/remove', req => {
    auth.needUser(req);
    const id = Number((req.body || {}).id);
    if (id === req.user.id && req.user.team_owner_id) { db.update('users', req.user.id, { team_owner_id: null }); return { ok: true }; }
    db.run('UPDATE users SET team_owner_id = NULL WHERE id = ? AND team_owner_id = ?', id, req.user.id);
    return { ok: true };
  });
};

module.exports.makeToken = makeToken;
module.exports.useToken = useToken;
// The support agent resends confirmation emails with the same link and template.
module.exports.sendVerify = sendVerify;
