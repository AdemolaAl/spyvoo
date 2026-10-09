/* Spyvoo support chat: the 24/7 agent in the corner of the dashboard and the website.
   Replies arrive like a person texting: a short "seen" pause, typing dots sized to each message, then the next bubble.
   Standalone (works on the website without the dashboard scripts). Everything from the server is escaped before it
   is shown; only our own links and **bold** are turned into markup. */
(function () {
  'use strict';
  if (window.__svSupport) return; window.__svSupport = true;
  var SV = window.SV = window.SV || {};
  var doc = document, store = {};
  try { store = window.sessionStorage; } catch (e) { store = {}; }
  var ss = function (k, v) { try { if (v === undefined) return store.getItem(k); store.setItem(k, v); } catch (e) { return null; } };

  var CSS = '' +
    '.svc{--c-blue:#1F5BFF;--c-ink:#0A1638;--c-ink2:#26355C;--c-mut:#5A6787;--c-bg:#F4F7FF;--c-card:#fff;--c-line:#E1E8F7;--c-me:#1F5BFF;--c-meink:#fff;--c-them:#fff;--c-mint:#14C894;font:500 15px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--c-ink);}' +
    ':root[data-theme="dark"] .svc{--c-ink:#EEF2FF;--c-ink2:#C9D3F2;--c-mut:#8E9BC2;--c-bg:#0B1330;--c-card:#0E1736;--c-line:#1D2A55;--c-them:#121D42;--c-blue:#4D7FFF;--c-me:#3D6BFF}' +
    '.svc *{box-sizing:border-box}' +
    '.svc-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:90;width:62px;height:62px;border-radius:50%;border:0;padding:0;background:#E8EFFF;box-shadow:0 14px 34px -10px rgba(31,91,255,.55),0 0 0 3px #fff;cursor:pointer;overflow:visible;transition:transform .25s cubic-bezier(.2,.9,.3,1.3)}' +
    '.svc-fab:hover{transform:translateY(-3px) scale(1.04)}.svc-fab:active{transform:scale(.96)}' +
    '.svc-fab .svc-face{width:100%;height:100%;border-radius:50%;overflow:hidden;display:block}' +
    '.svc-fab .svc-on{position:absolute;right:2px;bottom:3px;width:15px;height:15px;border-radius:50%;background:var(--c-mint);border:3px solid #fff}' +
    '.svc-fab .svc-badge{position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:#FF3D8B;color:#fff;font:800 12px/22px Manrope,sans-serif;text-align:center;border:2px solid #fff;animation:svcPop .4s cubic-bezier(.2,.9,.3,1.4)}' +
    '.svc-fab::before{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(31,91,255,.35);animation:svcRing 2.6s ease-out infinite}' +
    '.svc.open .svc-fab{transform:scale(.0);pointer-events:none}' +
    '.svc.svc-away .svc-fab,.svc-tease.svc-away,body.touring .svc{opacity:0;transform:scale(.4);pointer-events:none}' +
    '.svc-tease{position:fixed;right:92px;bottom:calc(30px + env(safe-area-inset-bottom,0px));z-index:90;max-width:240px;background:var(--c-card);color:var(--c-ink);border:1px solid var(--c-line);border-radius:18px 18px 4px 18px;padding:11px 32px 11px 14px;font-weight:700;font-size:14px;box-shadow:0 18px 40px -18px rgba(10,22,56,.45);animation:svcIn .45s cubic-bezier(.2,.9,.3,1.2);cursor:pointer}' +
    '.svc-tease button{position:absolute;top:6px;right:6px;border:0;background:none;color:var(--c-mut);font-size:16px;line-height:1;cursor:pointer;padding:4px}' +
    '.svc-panel{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:95;width:380px;height:min(620px,calc(100vh - 40px));display:flex;flex-direction:column;background:var(--c-bg);border:1px solid var(--c-line);border-radius:26px;box-shadow:0 40px 90px -30px rgba(10,22,56,.55);overflow:hidden;transform-origin:bottom right;transform:scale(.6) translateY(30px);opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(.2,.9,.3,1.15),opacity .2s}' +
    '.svc.open .svc-panel{transform:none;opacity:1;pointer-events:auto}' +
    '.svc-head{display:flex;align-items:center;gap:12px;padding:14px 14px 14px 16px;background:linear-gradient(120deg,#1F5BFF,#5B4BFF 60%,#7B5CFF);color:#fff;position:relative}' +
    '.svc-head .svc-av{width:46px;height:46px;border-radius:50%;overflow:hidden;background:#E8EFFF;flex:0 0 auto;box-shadow:0 0 0 2px rgba(255,255,255,.7);position:relative}' +
    '.svc-head .svc-av .svc-on{position:absolute;right:0;bottom:1px;width:12px;height:12px;border-radius:50%;background:var(--c-mint);border:2px solid #4A55FF}' +
    '.svc-head b{display:block;font:800 17px/1.1 "Bricolage Grotesque",Manrope,sans-serif;letter-spacing:-.02em}' +
    '.svc-head small{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;opacity:.92;margin-top:3px}' +
    '.svc-head small i{width:7px;height:7px;border-radius:50%;background:#7CF5C8;box-shadow:0 0 0 0 rgba(124,245,200,.7);animation:svcLive 2s infinite}' +
    '.svc-x{margin-left:auto;width:36px;height:36px;border-radius:12px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:20px;line-height:1;cursor:pointer;transition:background .2s}' +
    '.svc-x:hover{background:rgba(255,255,255,.28)}' +
    '.svc-body{flex:1;overflow-y:auto;padding:16px 14px 8px;display:flex;flex-direction:column;gap:4px;scroll-behavior:smooth;overscroll-behavior:contain}' +
    '.svc-hello{display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;margin:18px auto 14px;animation:svcIn .5s both}.svc-hello-av{width:78px;height:78px;border-radius:50%;overflow:hidden;background:#E8EFFF;box-shadow:0 0 0 4px var(--c-card),0 12px 26px -12px rgba(31,91,255,.6);margin-bottom:6px}.svc-hello b{font:800 18px/1.1 "Bricolage Grotesque",Manrope,sans-serif}.svc-hello span{font-size:13px;font-weight:700;color:var(--c-mut)}' +
    '.svc-stack{display:flex;justify-content:center;margin-bottom:8px}.svc-stk{border-radius:50%;overflow:hidden;background:#E8EFFF;box-shadow:0 0 0 3px var(--c-card),0 10px 22px -12px rgba(31,91,255,.6);margin-left:-14px;position:relative;display:block;animation:svcIn .5s both}.svc-stk:first-child{margin-left:0}.svc-stk:nth-child(2){animation-delay:.08s}.svc-stk:nth-child(3){animation-delay:.16s}' +
    '.svc-day{align-self:center;font-size:11.5px;font-weight:800;color:var(--c-mut);letter-spacing:.06em;text-transform:uppercase;margin:6px 0 8px}' +
    '.svc-row{display:flex;gap:8px;align-items:flex-end;max-width:100%}' +
    '.svc-row.me{justify-content:flex-end}' +
    '.svc-row .svc-mini{width:28px;height:28px;border-radius:50%;overflow:hidden;background:#E8EFFF;flex:0 0 auto;visibility:hidden}' +
    '.svc-row.lead .svc-mini{visibility:visible}' +
    '.svc-b{max-width:82%;padding:9px 13px;border-radius:18px;background:var(--c-them);color:var(--c-ink);border:1px solid var(--c-line);word-wrap:break-word;overflow-wrap:anywhere;animation:svcIn .32s cubic-bezier(.2,.9,.3,1.2);white-space:normal}' +
    '.svc-row.them .svc-b{border-bottom-left-radius:6px}' +
    '.svc-row.me .svc-b{background:var(--c-me);color:var(--c-meink);border-color:transparent;border-bottom-right-radius:6px}' +
    '.svc-row.human .svc-b{border-color:#FFC21A;box-shadow:inset 3px 0 0 #FFC21A}' +
    '.svc-b a{color:inherit;font-weight:800;text-decoration:underline;text-underline-offset:2px}' +
    '.svc-row.them .svc-b a{color:var(--c-blue)}' +
    '.svc-who{font-size:11.5px;font-weight:800;color:var(--c-mut);margin:8px 0 2px 36px}' +
    '.svc-done{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px 36px}' +
    '.svc-done span{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:#0B7A57;background:#DDFBEF;border-radius:999px;padding:5px 10px;animation:svcPop .45s cubic-bezier(.2,.9,.3,1.4)}' +
    ':root[data-theme="dark"] .svc-done span{background:#0D3A2C;color:#7CF5C8}' +
    '.svc-typing{display:inline-flex;gap:4px;padding:13px 14px}' +
    '.svc-typing i{width:7px;height:7px;border-radius:50%;background:var(--c-mut);opacity:.5;animation:svcDot 1.2s infinite}' +
    '.svc-typing i:nth-child(2){animation-delay:.15s}.svc-typing i:nth-child(3){animation-delay:.3s}' +
    '.svc-chips{display:flex;flex-wrap:wrap;gap:7px;padding:2px 14px 10px}' +
    '.svc-chips button{border:1px solid var(--c-line);background:var(--c-card);color:var(--c-ink2);border-radius:999px;padding:8px 12px;font:700 13.5px/1 Manrope,sans-serif;cursor:pointer;transition:all .2s;animation:svcIn .4s both}' +
    '.svc-chips button:hover{border-color:var(--c-blue);color:var(--c-blue);transform:translateY(-1px)}' +
    '.svc-note{margin:0 14px 8px;padding:9px 12px;border-radius:14px;background:#FFF6DA;color:#6B4E00;font-size:13px;font-weight:700}' +
    ':root[data-theme="dark"] .svc-note{background:#3A2E07;color:#FFD866}' +
    '.svc-foot{display:flex;gap:8px;align-items:flex-end;padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--c-line);background:var(--c-card)}' +
    '.svc-foot textarea{flex:1;resize:none;border:1px solid var(--c-line);background:var(--c-bg);color:var(--c-ink);border-radius:18px;padding:11px 14px;font:500 16px/1.35 Manrope,sans-serif;max-height:120px;outline:none;transition:border-color .2s}' +
    '.svc-foot textarea:focus{border-color:var(--c-blue)}' +
    '.svc-send{width:44px;height:44px;border-radius:50%;border:0;background:var(--c-blue);color:#fff;display:grid;place-items:center;cursor:pointer;flex:0 0 auto;transition:transform .2s,opacity .2s}' +
    '.svc-send:disabled{opacity:.4;cursor:default}.svc-send:not(:disabled):hover{transform:scale(1.07)}' +
    '.svc-send svg{width:20px;height:20px}' +
    '.svc-brand{text-align:center;font-size:11px;font-weight:700;color:var(--c-mut);padding:0 0 8px;background:var(--c-card)}' +
    '@keyframes svcIn{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}' +
    '@keyframes svcPop{0%{transform:scale(.4)}100%{transform:scale(1)}}' +
    '@keyframes svcDot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}' +
    '@keyframes svcRing{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.35);opacity:0}}' +
    '@keyframes svcLive{0%{box-shadow:0 0 0 0 rgba(124,245,200,.7)}70%{box-shadow:0 0 0 7px rgba(124,245,200,0)}100%{box-shadow:0 0 0 0 rgba(124,245,200,0)}}' +
    '@media (max-width:920px){.svc.on-tabbar .svc-fab{bottom:calc(92px + env(safe-area-inset-bottom,0px))}.svc-tease.on-tabbar{bottom:calc(102px + env(safe-area-inset-bottom,0px))}}' +
    '@media (max-width:560px){.svc-panel{right:0;left:0;bottom:0;top:auto;width:100%;height:100%;height:100dvh;border-radius:0;border:0}.svc-fab{right:14px}.svc-tease{right:84px}}' +
    '@media (prefers-reduced-motion:reduce){.svc *,.svc-fab::before{animation:none!important;transition:none!important}}' +
    '.svc .agent .body{animation:svcBreathe 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom center}.svc .agent .eyes{animation:svcBlink 4.6s infinite;transform-box:fill-box;transform-origin:center}.svc .agent .head{animation:svcNod 5s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 90%}' +
    '@keyframes svcBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}@keyframes svcNod{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}@keyframes svcBreathe{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.02)}}';

  var SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // Raw text → safe markup in ONE pass: every piece is escaped; only **bold**, https links and links to our own pages
  // become tags, and an href is built only from characters a URL token can't break out of.
  var TOKENS = /\*\*([^*\n]{1,120})\*\*|(https:\/\/[^\s<>"'`()\[\]{}]+)|(^|[\s(])(\/(?:app|pricing|signup|login|legal|b)(?:[\/?][^\s<>"'`()\[\]{}]*)?)(?=$|[\s).,!?;:])/g;
  function rich(t) {
    var src = String(t == null ? '' : t), out = '', last = 0, m;
    TOKENS.lastIndex = 0;
    while ((m = TOKENS.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1] != null) out += '<b>' + esc(m[1]) + '</b>';
      else if (m[2] != null) { var u = m[2].replace(/[.,!?;:]+$/, ''); out += '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https:\/\//, '').slice(0, 48)) + '</a>' + esc(m[2].slice(u.length)); }
      else { var p = m[4].replace(/[.,!?;:]+$/, ''); out += esc(m[3]) + '<a href="' + esc(p) + '">' + esc(label(p)) + '</a>' + esc(m[4].slice(p.length)); }
      last = TOKENS.lastIndex;
      if (m[0] === '') TOKENS.lastIndex++;
    }
    return (out + esc(src.slice(last))).replace(/\n/g, '<br>');
  }
  // A readable name for one of our links: "/app/discover?ask=crypto%20ads" → "🔎 crypto ads".
  var PAGES = { '/app': 'Home', '/app/discover': 'Discover', '/app/boards': 'Boards', '/app/alerts': 'Alerts', '/app/scripts': 'AI scripts', '/app/plan': 'Plan & billing', '/app/account': 'Account', '/pricing': 'Pricing', '/signup': 'Sign up', '/login': 'Log in' };
  function label(href) {
    var dec = function (v) { try { return decodeURIComponent(String(v).replace(/\+/g, ' ')); } catch (e) { return v; } };
    var m = /^\/app\/discover\?(?:.*&)?ask=([^&]+)/.exec(href); if (m) return '🔎 ' + dec(m[1]).slice(0, 50);
    var c = /^\/app\/plan\?(?:.*&)?checkout=(\w+)/.exec(href); if (c) return 'Upgrade to ' + c[1].charAt(0).toUpperCase() + c[1].slice(1) + ' →';
    var path = href.split('?')[0].replace(/\/+$/, '') || '/';
    return PAGES[path] ? PAGES[path] + ' →' : dec(href).slice(0, 48);
  }
  var api = function (method, path, body) {
    var o = { method: method, credentials: 'same-origin', headers: { 'x-sv': '1', Accept: 'application/json' } };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong'); e.status = r.status; throw e; } return d; }); });
  };

  var TEAM0 = ['Amara', 'Daniel', 'Sofia', 'Kenji', 'Zara', 'Lucas'];
  var st = { agent: { name: 'Spyvoo Support', role: 'Spyvoo Support', assigned: false, team: TEAM0 }, you: null, seen: {}, lastId: 0, queue: [], playing: false, open: false, unread: 0, waitingHuman: false, booted: false, pending: 0 };
  var root, body, input, sendBtn, badge, chips, note, statusEl;

  // The teammate looking after this chat (or the first of the team before anyone is assigned). Always smiling.
  function who() { return st.agent.assigned ? st.agent.name : ((st.agent.team || TEAM0)[0] || 'Amara'); }
  function face(name) {
    if (SV.teamFace) return SV.teamFace(name || who());
    // Simple smiling stand-in until the illustrations load.
    return '<svg viewBox="0 0 84 84" aria-hidden="true"><rect width="84" height="84" fill="#E8EFFF"/><circle cx="42" cy="48" r="24" fill="#C98D62"/><path d="M18 44c0-18 10-28 24-28s24 10 24 28c-6-8-14-11-24-11s-18 3-24 11z" fill="#1B1210"/><path d="M31 47q4-5 8 0M45 47q4-5 8 0" stroke="#0A1638" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M32 55q10 12 20 0z" fill="#5A1F22"/><path d="M34 56q8 4 16 0z" fill="#fff"/></svg>';
  }
  // Three smiling faces side by side: "the team".
  function teamStack(size) {
    return '<span class="svc-stack">' + (st.agent.team || TEAM0).slice(0, 3).map(function (n, i) { return '<span class="svc-stk" style="width:' + size + 'px;height:' + size + 'px;z-index:' + (3 - i) + '">' + face(n) + '</span>'; }).join('') + '</span>';
  }
  function title() { return 'Spyvoo Support'; }
  function sub() { return (st.agent.assigned ? st.agent.name + ' · ' : '') + 'Online · replies in seconds'; }
  function refreshHead() {
    if (!root) return;
    var av = root.querySelector('.svc-head .svc-av'); if (av) av.innerHTML = face() + '<span class="svc-on"></span>';
    var fc = root.querySelector('.svc-fab .svc-face'); if (fc) fc.innerHTML = face();
    root.querySelector('.svc-head b').textContent = title();
    root.querySelector('.svc-fab').setAttribute('aria-label', 'Chat with Spyvoo Support');
    input.placeholder = 'Message ' + (st.agent.assigned ? st.agent.name : 'Spyvoo Support') + '…';
    root.querySelector('.svc-brand').textContent = 'Spyvoo Support · 24/7';
    setStatus();
  }
  function setAgent(a) {
    if (!a) return;
    var was = st.agent.assigned ? st.agent.name : '';
    st.agent = a;
    if ((a.assigned ? a.name : '') !== was) refreshHead();
  }
  function needArt(cb) {
    if (SV.agent) return cb();
    var s = doc.createElement('script'); s.src = '/js/app/art.js'; s.onload = cb; s.onerror = cb; doc.head.appendChild(s);
  }

  function build() {
    var style = doc.createElement('style'); style.textContent = CSS; doc.head.appendChild(style);
    root = doc.createElement('div'); root.className = 'svc';
    if (doc.getElementById('tabbar')) root.classList.add('on-tabbar');
    root.innerHTML =
      '<button class="svc-fab" type="button" aria-label="Chat with Spyvoo Support"><span class="svc-face">' + face() + '</span><span class="svc-on"></span></button>' +
      '<section class="svc-panel" role="dialog" aria-modal="false" aria-label="Spyvoo support chat">' +
      '<header class="svc-head"><span class="svc-av">' + face() + '<span class="svc-on"></span></span><div><b>' + esc(title()) + '</b><small><i></i><span class="svc-status">' + esc(sub()) + '</span></small></div><button class="svc-x" type="button" aria-label="Close chat">×</button></header>' +
      '<div class="svc-body" aria-live="polite"></div><div class="svc-chips"></div><div class="svc-note" hidden></div>' +
      '<form class="svc-foot"><textarea rows="1" maxlength="2000" placeholder="Message Spyvoo Support…" aria-label="Your message"></textarea><button class="svc-send" type="submit" aria-label="Send" disabled>' + SEND + '</button></form>' +
      '<div class="svc-brand">Spyvoo Support · 24/7</div></section>';
    doc.body.appendChild(root);
    body = root.querySelector('.svc-body'); input = root.querySelector('textarea'); sendBtn = root.querySelector('.svc-send');
    chips = root.querySelector('.svc-chips'); note = root.querySelector('.svc-note'); statusEl = root.querySelector('.svc-status');
    root.querySelector('.svc-fab').onclick = function () { openChat(); };
    root.querySelector('.svc-x').onclick = function () { closeChat(); };
    root.querySelector('form').onsubmit = function (e) { e.preventDefault(); submit(); };
    input.addEventListener('input', function () { sendBtn.disabled = !input.value.trim(); input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !(window.innerWidth <= 560)) { e.preventDefault(); submit(); } });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) closeChat(); });
    // In the dashboard, core.js turns /app links into in-page navigation; on a phone the full-screen chat steps aside.
    body.addEventListener('click', function (e) { if (e.target.closest('a[href^="/"]') && window.innerWidth <= 560) closeChat(); });
  }

  function setBadge(n) {
    st.unread = n;
    var fab = root.querySelector('.svc-fab');
    var b = fab.querySelector('.svc-badge');
    if (n > 0 && !st.open) { if (!b) { b = doc.createElement('span'); b.className = 'svc-badge'; fab.appendChild(b); } b.textContent = n > 9 ? '9+' : n; }
    else if (b) b.remove();
  }
  function setStatus() {
    statusEl.textContent = st.waitingHuman ? 'A teammate is on this chat' : sub();
    note.hidden = !st.waitingHuman;
    note.textContent = 'A Spyvoo teammate is handling this chat. They’ll reply right here.';
  }

  function scroll() { body.scrollTop = body.scrollHeight + 999; }
  var lastFrom = null;
  function addBubble(m) {
    var from = m.from === 'user' ? 'me' : 'them';
    var lead = from === 'them' && lastFrom !== (m.from + (m.by || ''));
    if (m.from === 'human' && lead) body.insertAdjacentHTML('beforeend', '<div class="svc-who">' + esc(m.by || 'Spyvoo team') + ' · Spyvoo team</div>');
    var row = doc.createElement('div');
    row.className = 'svc-row ' + from + (m.from === 'human' ? ' human' : '') + (lead ? ' lead' : '');
    row.innerHTML = (from === 'them' ? '<span class="svc-mini">' + (m.from === 'human' ? '<svg viewBox="0 0 28 28"><rect width="28" height="28" fill="#FFC21A"/><text x="14" y="19" text-anchor="middle" font-family="Manrope,sans-serif" font-weight="800" font-size="13" fill="#0A1638">' + esc((m.by || 'S').charAt(0).toUpperCase()) + '</text></svg>' : face()) + '</span>' : '') +
      '<div class="svc-b" title="' + esc(m.at ? new Date(m.at).toLocaleString() : '') + '">' + rich(m.text) + '</div>';
    body.appendChild(row);
    if (m.done && m.done.length) {
      body.insertAdjacentHTML('beforeend', '<div class="svc-done">' + m.done.map(function (d) { return '<span>✓ ' + esc(d) + '</span>'; }).join('') + '</div>');
      if (/plan is on|confirmed/i.test(m.done.join(' '))) celebrate();
    }
    lastFrom = m.from + (m.by || '');
    if (m.id) st.lastId = Math.max(st.lastId, m.id);
    scroll();
  }
  function celebrate() {
    try { if (SV.confetti) SV.confetti(); } catch (e) { /* optional */ }
    try { if (SV.boot && location.pathname.indexOf('/app') === 0) setTimeout(function () { SV.boot(true); SV.refreshMeter && SV.refreshMeter(); }, 400); } catch (e) { /* optional */ }
  }

  var typingEl = null;
  function typing(on) {
    if (on && !typingEl) { typingEl = doc.createElement('div'); typingEl.className = 'svc-row them lead'; typingEl.innerHTML = '<span class="svc-mini">' + face() + '</span><div class="svc-b svc-typing" aria-label="' + esc(who()) + ' is typing"><i></i><i></i><i></i></div>'; body.appendChild(typingEl); scroll(); }
    else if (!on && typingEl) { typingEl.remove(); typingEl = null; }
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // How long a person takes to type this bubble (capped so nobody waits too long).
  var typeTime = function (t) { return Math.max(650, Math.min(3400, 380 + String(t).length * 26 + Math.random() * 380)); };

  function enqueue(list, opts) {
    (list || []).forEach(function (m) {
      if (!m || !m.id || st.seen[m.id]) return;
      st.seen[m.id] = 1;
      if (m.from === 'user') { if (opts && opts.withUser) { st.queue.push({ m: m, instant: true }); } return; }
      st.queue.push({ m: m, instant: !!(opts && opts.instant), polled: !!(opts && opts.polled) });
    });
    play();
  }
  function play() {
    if (st.playing) return;
    st.playing = true;
    (function next(first) {
      var item = st.queue.shift();
      if (!item) { st.playing = false; if (!st.pending) typing(false); return; }
      if (item.instant || item.m.from === 'user') { typing(false); addBubble(item.m); return next(false); }
      var wait = first ? Math.max(0, typeTime(item.m.text) - (Date.now() - (st.typingSince || 0))) : 260 + typeTime(item.m.text);
      typing(true);
      sleep(wait).then(function () {
        typing(false); addBubble(item.m);
        if (!st.open && !item.polled) setBadge(st.unread + 1);
        if (st.open && item.m.from === 'human') markRead();
        next(false);
      });
    })(true);
  }

  function submit(textArg) {
    var text = String(textArg != null ? textArg : input.value).trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto'; sendBtn.disabled = true;
    chips.innerHTML = '';
    addBubble({ from: 'user', text: text });
    st.pending++;
    // A person reads the message first, then starts typing.
    setTimeout(function () { if (st.pending) { st.typingSince = Date.now(); if (!st.playing) typing(true); } }, 700 + Math.random() * 500);
    api('POST', '/api/support/messages', { text: text }).then(function (d) {
      st.pending--;
      st.waitingHuman = !!d.waiting_human; setAgent(d.agent); setStatus();
      if (!d.messages || !d.messages.length) { if (!st.playing && !st.pending) typing(false); return; }
      enqueue(d.messages);
    }).catch(function (e) {
      st.pending--; typing(false);
      addBubble({ from: 'agent', text: e.status === 429 ? 'Whoa, that’s a lot of messages at once 😅 Give me a few seconds and send it again.' : e.status === 401 ? 'Please log in so I can see your account, then open this chat again.' : 'Hmm, that didn’t go through. Check your connection and send it again.' });
    });
  }

  // An empty chat shows who you're talking to and a few ideas. The agent's own greeting is the first message.
  function intro() {
    if (body.children.length) return;
    var tm = st.agent.team || TEAM0;
    body.innerHTML = st.agent.assigned
      ? '<div class="svc-hello"><span class="svc-hello-av">' + face() + '</span><b>' + esc(st.agent.name) + '</b><span>Spyvoo Support · usually replies in seconds, 24/7</span></div>'
      : '<div class="svc-hello">' + teamStack(64) + '<b>Spyvoo Support</b><span>' + esc(tm.slice(0, 3).join(', ')) + ' and the team · replies in seconds, 24/7</span></div>';
    var opts = st.you ? ['My payment isn’t showing 💸', 'Find winning ads for my niche 🔎', 'Which plan is right for me?', 'Talk to a person 🙋'] : ['What does Spyvoo do?', 'How much is it?', 'Can I pay with crypto?', 'Is there a free plan?'];
    chips.innerHTML = opts.map(function (t, i) { return '<button type="button" style="animation-delay:' + (0.25 + i * 0.07) + 's">' + esc(t) + '</button>'; }).join('');
    Array.prototype.forEach.call(chips.querySelectorAll('button'), function (b) { b.onclick = function () { submit(b.textContent); }; });
  }

  function openChat() {
    st.open = true; root.classList.add('open'); ss('svc-open', '1');
    var t = doc.querySelector('.svc-tease'); if (t) t.remove();
    setBadge(0);
    load().then(function () { if (!body.children.length && !st.queue.length) intro(); markRead(); });
    setTimeout(function () { if (window.innerWidth > 560) input.focus(); }, 350);
    poller();
  }
  function markRead() { api('POST', '/api/support/read', {}).catch(function () {}); }
  function closeChat() { st.open = false; root.classList.remove('open'); ss('svc-open', '0'); markRead(); poller(); }
  SV.openSupport = function (text) { openChat(); if (text) setTimeout(function () { submit(text); }, 500); };

  function load() {
    if (st.booted) return Promise.resolve();
    return api('GET', '/api/support').then(function (d) {
      st.booted = true;
      if (d.on === false) { root.remove(); st.off = true; return; }
      if (d.agent) st.agent = d.agent;
      if (!st.agent.team) st.agent.team = TEAM0;
      st.you = d.you; st.waitingHuman = !!d.waiting_human; setStatus();
      var hist = d.messages || [];
      if (hist.length) { body.insertAdjacentHTML('beforeend', '<div class="svc-day">Earlier</div>'); enqueue(hist, { instant: true, withUser: true }); }
      if (!st.open) setBadge(d.unread || 0);
    }).catch(function () { st.booted = true; });
  }

  var pollT = null, pollGen = 0;
  function poller() {
    clearTimeout(pollT);
    var gen = ++pollGen;
    pollT = setTimeout(function tick() {
      if (gen !== pollGen) return;
      if (doc.hidden) { pollT = setTimeout(tick, 15000); return; }
      api('GET', '/api/support/poll?after=' + st.lastId).then(function (d) {
        if (gen !== pollGen) return;
        st.waitingHuman = !!d.waiting_human; setAgent(d.agent); setStatus();
        // Our own answers come back with the send request; the poll brings a teammate's replies (and other tabs').
        if (d.messages && d.messages.length && !st.pending) enqueue(d.messages, { polled: true });
        if (!st.open) setBadge(d.unread || 0);
      }).catch(function () { /* try again later */ }).then(function () { if (gen === pollGen) pollT = setTimeout(tick, st.open ? 6000 : 45000); });
    }, st.open ? 6000 : 45000);
  }

  function tease() {
    if (ss('svc-teased') || st.open || window.innerWidth <= 560) return;
    ss('svc-teased', '1');
    var n = st.you && st.you.first_name;
    var el = doc.createElement('div'); el.className = 'svc-tease svc';
    el.innerHTML = esc(st.you ? 'Hi' + (n ? ' ' + n : '') + ' 👋 ' + (st.agent.assigned ? 'It’s ' + st.agent.name + ' from Spyvoo Support. Need a hand?' : 'Need a hand? Spyvoo Support is here 24/7.') : 'Questions about Spyvoo? Ask us 👀') + '<button type="button" aria-label="Dismiss">×</button>';
    el.onclick = function (e) { if (e.target.tagName === 'BUTTON') { el.remove(); return; } openChat(); };
    if (root.classList.contains('on-tabbar')) el.classList.add('on-tabbar');
    doc.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 14000);
  }

  // Step aside while a pop-up, the ad panel or the tour is on screen, so the bubble never covers their buttons.
  function watchLayers() {
    var check = function () {
      var busy = !!doc.querySelector('.modal-wrap, #layer .drawer, .tour-end, .tour-ui') || doc.body.classList.contains('touring');
      root.classList.toggle('svc-away', busy && !st.open);
      var t = doc.querySelector('.svc-tease'); if (t) t.classList.toggle('svc-away', busy);
    };
    try { new MutationObserver(check).observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) { /* old browser */ }
    check();
  }

  function start() {
    var cfg = doc.currentScript || doc.querySelector('script[src*="support-chat.js"]');
    build();
    watchLayers();
    needArt(function () { Array.prototype.forEach.call(root.querySelectorAll('.svc-face,.svc-av'), function (el) { var dot = el.querySelector('.svc-on'); el.innerHTML = face() + (dot ? dot.outerHTML : ''); }); });
    load().then(function () {
      if (st.off) return;
      refreshHead();
      // Reopen after a reload only on bigger screens; on a phone the chat is full-screen and would cover the new page.
      if (/[?&]support=1/.test(location.search) || (ss('svc-open') === '1' && window.innerWidth > 560)) openChat();
      else setTimeout(tease, 9000);
      poller();
    });
    void cfg;
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
