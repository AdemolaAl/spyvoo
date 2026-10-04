'use strict';
// VooSquare: Voo ID login and logout, and the summary API VooSquare calls for its dashboard card.
const config = require('../config');
const auth = require('../lib/auth');
const voo = require('../services/voosquare');
const mailer = require('../services/mailer');
const { HttpError, rateLimit } = require('../lib/http');
const { esc } = require('../lib/md');

const ID_COOKIE = 'sv_vit';
const first = n => String(n || '').trim().split(' ')[0] || 'there';

function errorPage(res, e) {
  const { page } = require('../views/layout');
  const msg = e instanceof HttpError ? e.message : 'Something went wrong while logging you in.';
  if (!(e instanceof HttpError)) console.error('[voosquare] login', e.message);
  res.send(page('Login problem', '<span class="tag">VooSquare login</span><h1>We couldn’t log you in</h1><p>' + esc(msg) + '</p><a class="btn" href="/auth/voosquare">Try again</a><a class="btn ghost" href="/">Back to Spyvoo</a>'), e.status && e.status < 500 ? e.status : 502);
}

module.exports = function (app) {
  const loginLimit = rateLimit('voo-login', 60, 900e3);

  app.get('/auth/voosquare', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/login');
    try { res.redirect(await voo.startLogin(req, res, { returnTo: req.query.return_to, signup: req.query.signup === '1' })); }
    catch (e) { errorPage(res, e); }
  });

  app.get('/auth/voosquare/callback', loginLimit, async (req, res) => {
    if (!voo.enabled()) return res.redirect('/login');
    try {
      const { claims, idToken, returnTo } = await voo.finishLogin(req, res);
      const { user, isNew } = voo.userFromClaims(claims);
      if (user.suspended) throw new HttpError(403, 'This account is suspended. Contact support@spyvoo.com.');
      auth.startSession(req, res, user);
      res.cookie(ID_COOKIE, idToken, { maxAge: 30 * 86400 });
      if (isNew) mailer.send(user.email, 'welcome', { name: first(user.name), dashboard_url: config.appUrl + '/app', verify_url: '' });
      res.redirect(isNew && returnTo === '/app' ? '/app?welcome=1' : returnTo);
    } catch (e) { errorPage(res, e); }
  });

  app.get('/auth/voosquare/logout', async (req, res) => {
    const idToken = req.cookies[ID_COOKIE];
    auth.endSession(req, res);
    res.cookie(ID_COOKIE, '', { maxAge: 0 });
    res.redirect(await voo.endSessionUrl(idToken));
  });

  app.get('/api/voosquare/summary', req => { voo.checkServiceKey(req); return voo.summary(req.query.voo_id, req.query.period); });
};
