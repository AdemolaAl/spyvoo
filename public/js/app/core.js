/* Spyvoo dashboard core: API calls, router, icons, toasts, modals, drawers, popovers, confetti and formatting. */
(function () {
  'use strict';
  var SV = window.SV = { state: {}, pages: {}, cache: {} };
  var $ = SV.$ = function (s, r) { return (r || document).querySelector(s); };
  SV.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = SV.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  SV.reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  SV.isAdmin = function () { var b = SV.state.boot; return !!(b && b.user && b.user.role === 'admin'); };
  SV.phone = function () { return window.innerWidth <= 920; };

  /* ---------- icons (24px stroke set) ---------- */
  var P = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    boards: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    crown: '<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 20h16"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    fire: '<path d="M12 3c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-4.5 3-6 0 2 1 3 2 3-1-4 1-7 1-9z"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
    wand: '<path d="M4 20L16 8M14 4v3M18 8h3M19 4l-2 2M10 4l1 2M20 13l-2-1"/>',
    moon: '<path d="M20 15A8 8 0 1 1 9 4a7 7 0 0 0 11 11z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1s6 1 6 1 6 2 6-1-4-3-6 1z"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5M15 15c2.5 0 4.6 1.6 5.5 5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
  };
  SV.I = function (n, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + (P[n] || '') + '</svg>'; };

  /* ---------- formatting ---------- */
  SV.n = function (x) { return Number(x || 0).toLocaleString('en-US'); };
  SV.money = function (x) { var n = Number(x || 0), d = n % 1 ? 2 : 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  SV.flag = function (c) { return /^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint.apply(null, c.split('').map(function (ch) { return 0x1F1E6 + ch.charCodeAt(0) - 65; })) : '🌍'; };
  SV.ago = function (iso) {
    if (!iso) return '';
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  SV.date = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  SV.limitText = function (m) { return m.limit === -1 ? 'Unlimited' : m.limit === 0 && !m.used ? 'Not included' : SV.n(m.used) + ' / ' + SV.n(m.limit); };
  SV.pct = function (m) { return m.limit === -1 ? 0 : m.limit === 0 ? 0 : Math.min(100, Math.round(m.used / m.limit * 100)); };
  var COL = ['#1F5BFF', '#7B5CFF', '#FF3D8B', '#FF9F1C', '#14C894', '#0FA3B1', '#E5484D', '#5B3DF5'];
  SV.color = function (s) { var h = 0; String(s || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return COL[h % COL.length]; };
  SV.scoreColor = function (s) { return s >= 85 ? '#FF3D8B' : s >= 70 ? '#7B5CFF' : s >= 50 ? '#1F5BFF' : '#8D97B2'; };

  /* ---------- API ---------- */
  SV.api = function (method, path, body) {
    var opt = { method: method, headers: { 'x-sv': '1', Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); throw new Error('Please log in.'); }
        if (!r.ok) {
          var e = new Error(d.error || 'Something went wrong. Please try again.'); e.status = r.status; e.data = d;
          if (r.status === 402 && d.upgrade) SV.upgradePrompt(d);
          throw e;
        }
        return d;
      });
    });
  };
  SV.get = function (p) { return SV.api('GET', p); };
  SV.post = function (p, b) { return SV.api('POST', p, b || {}); };
  SV.qs = function (o) { var q = []; Object.keys(o || {}).forEach(function (k) { var v = o[k]; if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return; q.push(encodeURIComponent(k) + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v)); }); return q.length ? '?' + q.join('&') : ''; };

  /* ---------- router ---------- */
  var routes = [];
  SV.route = function (re, fn) { routes.push({ re: re, fn: fn }); };
  SV.go = function (url, opts) {
    opts = opts || {};
    if (!opts.replace) history.pushState({}, '', url); else history.replaceState({}, '', url);
    SV.render();
  };
  SV.render = function () {
    var path = location.pathname.replace(/\/+$/, '') || '/app';
    SV.closeLayers && SV.closeLayers(true);
    for (var i = 0; i < routes.length; i++) {
      var m = path.match(routes[i].re);
      if (m) {
        var view = $('#view');
        view.innerHTML = '';
        SV.state.page = path; SV.state.boardId = null;
        SV.markNav && SV.markNav(path);
        if (!SV.state.keepScroll) window.scrollTo(0, 0);
        SV.state.keepScroll = false;
        try { routes[i].fn(view, m, new URLSearchParams(location.search)); } catch (e) { console.error(e); view.innerHTML = '<div class="empty"><h3>Something broke</h3><p>' + esc(e.message) + '</p></div>'; }
        return;
      }
    }
    SV.go('/app', { replace: true });
  };
  window.addEventListener('popstate', SV.render);
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    var href = a.getAttribute('href');
    if (/^\/app(\/|\?|$)/.test(href)) { e.preventDefault(); SV.go(href); }
  });

  /* ---------- toasts ---------- */
  SV.toast = function (msg, opts) {
    opts = opts || {};
    var t = document.createElement('div');
    t.className = 'toast' + (opts.bad ? ' bad' : '');
    t.innerHTML = (opts.bad ? '' : '<span class="ic">' + SV.I(opts.icon || 'check') + '</span>') + '<span>' + esc(msg) + (opts.link ? ' <a href="' + esc(opts.link.href) + '">' + esc(opts.link.label) + '</a>' : '') + '</span>';
    $('#toasts').appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, opts.ms || 3200);
  };
  SV.fail = function (e) { if (e && e.status === 402 && e.data && e.data.upgrade) return; SV.toast((e && e.message) || 'Something went wrong.', { bad: true }); };

  /* ---------- layers: modal, drawer, popover ---------- */
  var layer = function () { return $('#layer'); };
  var stack = [];
  SV.closeLayers = function (all) {
    while (stack.length) { var l = stack.pop(); l.close(true); if (!all) break; }
  };
  function trap(el, onClose) {
    var prev = document.activeElement;
    var key = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        var f = SV.$$('button, a[href], input, select, textarea, [tabindex="0"]', el).filter(function (x) { return x.offsetParent !== null && !x.disabled; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    el.addEventListener('keydown', key);
    return function () { if (prev && prev.focus) prev.focus(); };
  }
  SV.modal = function (html, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = '<div class="modal" role="dialog" aria-modal="true"' + (opts.wide ? ' style="width:min(760px,100%)"' : '') + '><button class="x" type="button" aria-label="Close">' + SV.I('x') + '</button>' + html + '</div>';
    layer().appendChild(wrap);
    var m = wrap.firstChild;
    var restore;
    var api = { el: m, close: function (silent) { wrap.remove(); var i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); if (restore) restore(); if (!silent && opts.onClose) opts.onClose(); } };
    restore = trap(m, function () { api.close(); });
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) api.close(); });
    m.querySelector('.x').addEventListener('click', function () { api.close(); });
    stack.push(api);
    setTimeout(function () { var f = m.querySelector('[autofocus], input, button.btn') || m.querySelector('a.btn, .x'); if (f) f.focus({ preventScroll: true }); }, 30);
    return api;
  };
  SV.drawer = function (opts) {
    opts = opts || {};
    var veil = document.createElement('div');
    veil.className = 'veil';
    veil.innerHTML = '<div class="drawer" role="dialog" aria-modal="true" tabindex="-1"><button class="x" type="button" aria-label="Close">' + SV.I('x') + '</button><div class="dr-body"></div></div>';
    layer().appendChild(veil);
    var d = veil.firstChild; var restore;
    var api = { el: d, body: d.querySelector('.dr-body'), close: function (silent) { veil.remove(); if (!document.querySelector('#layer .veil')) document.body.style.overflow = ''; var i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); if (restore) restore(); if (!silent && opts.onClose) opts.onClose(); } };
    restore = trap(d, function () { api.close(); });
    veil.addEventListener('mousedown', function (e) { if (e.target === veil) api.close(); });
    d.querySelector('.x').addEventListener('click', function () { api.close(); });
    document.body.style.overflow = 'hidden';
    stack.push(api);
    setTimeout(function () { d.focus(); }, 30);
    return api;
  };
  SV.confirm = function (title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = SV.modal('<h2>' + esc(title) + '</h2><p class="mut" style="font-weight:600">' + esc(text) + '</p><div class="actions"><button class="btn ghost" data-no>Cancel</button><button class="btn' + (danger ? ' dark' : '') + '" data-yes>' + esc(okLabel || 'Yes') + '</button></div>', { onClose: function () { resolve(false); } });
      m.el.querySelector('[data-no]').onclick = function () { m.close(true); resolve(false); };
      m.el.querySelector('[data-yes]').onclick = function () { m.close(true); resolve(true); };
    });
  };
  var openPop = null;
  SV.popover = function (anchor, html, onMount) {
    SV.closePop();
    var p = document.createElement('div');
    p.className = 'pop';
    p.innerHTML = html;
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect();
    var left = Math.min(window.innerWidth - p.offsetWidth - 12, Math.max(12, r.left));
    p.style.left = left + 'px';
    p.style.top = (r.bottom + window.scrollY + 8) + 'px';
    openPop = p;
    if (onMount) onMount(p);
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);
    return p;
  };
  function outside(e) { if (openPop && !openPop.contains(e.target)) SV.closePop(); }
  SV.closePop = function () { if (openPop) { openPop.remove(); openPop = null; document.removeEventListener('mousedown', outside); } };
  window.addEventListener('resize', function () { SV.closePop(); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (openPop) { SV.closePop(); return; }
    // Focus slipped out of the top modal or drawer (e.g. a button got disabled): Escape still closes it.
    var top = stack[stack.length - 1];
    if (top && !top.el.contains(document.activeElement)) { e.preventDefault(); top.close(); }
  });

  /* ---------- copy ---------- */
  SV.copy = function (text, label) {
    var done = function () { SV.toast((label ? label + ' copied' : 'Copied') + ' to clipboard', { icon: 'copy' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { SV.toast('Select the text and copy it', { bad: true }); } t.remove(); }
  };

  /* ---------- confetti ---------- */
  var cv, cx, parts = [], raf = 0;
  var CC = ['#1F5BFF', '#7B5CFF', '#FF3D8B', '#FF9F1C', '#14C894', '#FFC21A', '#4AA8FF'];
  SV.confetti = function (x, y, count) {
    if (SV.reduce) return;
    cv = cv || $('#confetti'); cx = cx || cv.getContext('2d');
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight / 3 : y;
    for (var i = 0; i < (count || 140); i++) {
      var a = -Math.PI / 2 + (Math.random() - .5) * 2.4, v = 6 + Math.random() * 10;
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .3 + Math.random() * .12, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: CC[i % CC.length], life: 0, round: Math.random() < .3 });
    }
    if (!raf) raf = requestAnimationFrame(tick);
  };
  function tick() {
    var d = devicePixelRatio; cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.life < 220 && p.y < innerHeight + 40; });
    parts.forEach(function (p) {
      p.life++; p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x * d, p.y * d); cx.rotate(p.r); cx.fillStyle = p.c;
      if (p.round) { cx.beginPath(); cx.arc(0, 0, p.h * d / 2, 0, 7); cx.fill(); } else cx.fillRect(-p.w * d / 2, -p.h * d / 2, p.w * d, p.h * d * Math.abs(Math.cos(p.life / 6)));
      cx.restore();
    });
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }

  /* ---------- countdown ---------- */
  SV.countdown = function (el, endsAt) {
    if (!el || !endsAt) return;
    var end = new Date(endsAt).getTime();
    var draw = function () {
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
      el.innerHTML = [[d, 'days'], [h, 'hrs'], [m, 'min'], [sec, 'sec']].map(function (p) { return '<div><b>' + String(p[0]).padStart(2, '0') + '</b><small>' + p[1] + '</small></div>'; }).join('');
      if (!document.body.contains(el)) clearInterval(t);
    };
    draw(); var t = setInterval(draw, 1000);
  };

  /* ---------- infinite scroll ---------- */
  SV.onVisible = function (el, fn) {
    if (!('IntersectionObserver' in window)) return fn();
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); fn(); } }); }, { rootMargin: '600px 0px' });
    io.observe(el);
    return io;
  };
})();
