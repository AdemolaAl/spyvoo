'use strict';
// VooSquare (Voo Connect kit): "Continue with Voo ID" login and sign-up, "Connect VooSquare" for existing accounts,
// logout everywhere, the browser snippet for landing pages and the summary card VooSquare calls.
const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const db = require('../db');
const auth = require('../lib/auth');
const voo = require('../services/voosquare');
const mailer = require('../services/mailer');
const { HttpError, rateLimit } = require('../lib/http');
const { esc } = require('../lib/md');
const { sha256 } = require('../lib/security');

const first = n => String(n || '').trim().split(' ')[0] || 'there';
const SNIPPET = path.join(config.root, 'voo-connect', 'voo-connect-browser.js');

function errorPage(res, e) {
  const { page } = require('../views/layout');
  const msg = e instanceof HttpError ? e.message : 'Something went wrong while logging you in.';
  if (!(e instanceof HttpError)) console.error('[voosquare] login', e.message);
  res.send(page('Login did not finish', '<div class="pg-card center"><span class="tag">Voo ID login</span><h1>Login did not finish</h1><p>' + esc(msg) + '</p><a class="btn" href="/auth/voosquare">Try again</a> <a class="btn ghost" href="/login">Log in with email</a></div>'), e.status && e.status < 500 ? e.status : 502, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
}

module.exports = function (app) {
  const loginLimit = rateLimit('voo-login', 60, 900e3);

  // Start: /auth/voosquare?return_to=/app (VooSquare's launcher), &signup=1 for "Start free".
  app.get('/auth/voosquare', loginLimit, (req, res) => {
    if (!voo.enabled()) return res.redirect('/login');
    try { voo.startLogin(req, res, { returnTo: req.query.return_to, signup: req.query.signup === '1' || req.query.prompt === 'signup' }); }
    catch (e) { errorPage(res, e); }
  });

  app.get('/auth/voosquare/callback', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/login');
    try {
      const { vu, returnTo } = await voo.finishLogin(req, res);
      const { user, isNew, linked } = voo.linkOrCreate(vu, req.user);
      if (user.suspended) throw new HttpError(403, 'This account is suspended. Contact support@spyvoo.com.');
      // A different account was logged in here: end that session first (no cookie juggling, the new one replaces it).
      if (req.session) db.run('DELETE FROM sessions WHERE id = ?', req.session.id);
      auth.startSession(req, res, user);
      if (isNew) mailer.send(user.email, 'welcome', { name: first(user.name), dashboard_url: config.appUrl + '/app', verify_url: '' });
      if (linked) db.insert('audit_log', { user_id: user.id, action: 'voo_linked', detail: user.email, created_at: db.now() });
      res.redirect(isNew && returnTo === '/app' ? '/app?welcome=1' : linked && /^\/app(\/|\?|$)/.test(returnTo) ? returnTo + (returnTo.includes('?') ? '&' : '?') + 'voo=linked' : returnTo);
    } catch (e) { errorPage(res, e); }
  });

  // Logout everywhere: our session, then VooSquare's, then back to our home page (registered as a Redirect URI).
  const logout = (req, res) => {
    const was = req.user;
    auth.endSession(req, res);
    res.writeHead(302, { Location: voo.enabled() && (!was || was.voo_id) ? voo.logoutUrl() : '/', 'Cache-Control': 'no-store' });
    res.end();
  };
  app.get('/auth/voosquare/logout', logout);
  app.get('/logout', logout);

  // Landing pages keep the affiliate click even when served from a cache (docs/VOOSQUARE.md).
  app.get('/voo-connect-browser.js', (req, res) => {
    const body = fs.readFileSync(SNIPPET);
    const etag = '"' + sha256(body).slice(0, 16) + '"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    res.send(body, 200, 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=3600', ETag: etag });
  });

  // VooSquare's dashboard card. Authorization: Bearer <VOO_API_KEY>.
  app.get('/api/voosquare/summary', (req, res) => voo.summaryHandler()(req, res));
  // VooSquare's launcher opens /auth/voosquare?return_to=/dashboard; a plain /dashboard link works too.
  app.get('/dashboard', (req, res) => res.redirect('/app'));
};
