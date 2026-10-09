'use strict';
// Support chat: /api/support/* for customers (logged in) and website visitors (cookie), /api/admin/support/* for admins.
const auth = require('../lib/auth');
const support = require('../services/support');
const { HttpError, rateLimit, rateLimitUser } = require('../lib/http');
const { token } = require('../lib/security');

const VISITOR = 'sv_v';

module.exports = function (app) {
  const perMinute = rateLimitUser('support-msg', 12, 60e3);
  const perDay = rateLimitUser('support-day', 300, 864e5);
  const visitorMinute = rateLimit('support-visitor', 8, 60e3);
  const visitorDay = rateLimit('support-visitor-day', 80, 864e5);
  const reads = rateLimitUser('support-read', 90, 60e3);

  // Who is chatting: the logged-in customer, or a website visitor with a random cookie (made on their first message).
  function who(req, res, create) {
    if (req.user) return { user: req.user, ip: req.ip };
    const s = support.agentInfo();
    if (!s.public_chat) throw new HttpError(401, 'Please log in to chat with us.');
    let v = req.cookies[VISITOR];
    if (!v || !/^[A-Za-z0-9_-]{20,64}$/.test(v)) {
      if (!create) return { visitor: null };
      v = token(24).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      res.cookie(VISITOR, v, { maxAge: 90 * 864e5 });
    }
    return { visitor: v, ip: req.ip };
  }
  const empty = () => ({ on: support.enabled(), agent: support.agentInfo(), messages: [], unread: 0, waiting_human: false, you: null });

  app.get('/api/support', reads, (req, res) => {
    const w = who(req, res, false);
    if (!w.user && !w.visitor) return empty();
    return support.state(w);
  });
  app.get('/api/support/poll', reads, (req, res) => {
    const w = who(req, res, false);
    if (!w.user && !w.visitor) return { messages: [], unread: 0 };
    return support.poll(w, Number(req.query.after) || 0);
  });
  app.post('/api/support/read', reads, (req, res) => {
    const w = who(req, res, false);
    if (!w.user && !w.visitor) return { ok: true };
    return support.markRead(w);
  });
  app.post('/api/support/messages', async (req, res) => {
    if (req.user) { perMinute(req); perDay(req); } else { visitorMinute(req); visitorDay(req); }
    const w = who(req, res, true);
    const text = String((req.body || {}).text || '');
    if (text.length > 2000) throw new HttpError(400, 'That message is too long. Keep it under 2,000 characters.');
    try {
      const r = await support.send(w, text);
      return { messages: r.messages, waiting_human: r.waiting_human, agent: r.agent };
    } catch (e) {
      if (e.status) throw new HttpError(e.status, e.message);
      throw e;
    }
  });

  /* ---------- admin ---------- */
  const A = req => auth.needAdmin(req);
  const audit = (req, action, detail) => require('../db').insert('audit_log', { user_id: req.user.id, action, detail: String(detail).slice(0, 500), created_at: require('../db').now() });
  app.get('/api/admin/support', req => { A(req); return support.adminList({ filter: String(req.query.filter || 'all'), q: String(req.query.q || '').slice(0, 80) }); });
  app.get('/api/admin/support/:id', req => { A(req); const r = support.adminThread(req.params.id); if (!r) throw new HttpError(404, 'Chat not found'); return r; });
  app.post('/api/admin/support/:id/reply', req => {
    A(req);
    const b = req.body || {};
    try {
      const r = support.adminReply(req.params.id, req.user, b.text, { takeover: b.takeover !== false });
      if (!r) throw new HttpError(404, 'Chat not found');
      audit(req, 'support_reply', 'thread ' + req.params.id);
      return r;
    } catch (e) { if (e.status && !(e instanceof HttpError)) throw new HttpError(e.status, e.message); throw e; }
  });
  app.post('/api/admin/support/:id/mode', req => { A(req); const r = support.adminMode(req.params.id, (req.body || {}).mode); if (!r) throw new HttpError(404, 'Chat not found'); audit(req, 'support_mode', 'thread ' + req.params.id + ' ' + (req.body || {}).mode); return r; });
  app.post('/api/admin/support/:id/status', req => { A(req); const r = support.adminStatus(req.params.id, (req.body || {}).status); if (!r) throw new HttpError(404, 'Chat not found'); return r; });
};
