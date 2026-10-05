/* Spyvoo admin shell ("Control room"): sidebar, phone tabs, router glue and small form/chart helpers.
   Uses core.js (SV.api, SV.route, SV.modal, SV.toast…) and art.js (the animated cast). */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;
  var A = SV.A = {};

  A.NAV = [
    { h: 'Run' },
    { href: '/admin', label: 'Overview', icon: 'home', re: /^\/admin$/ },
    { href: '/admin/rules', label: 'Tracking rules', icon: 'radar', re: /^\/admin\/rules/ },
    { href: '/admin/provider', label: 'Ad data & AI', icon: 'layers', re: /^\/admin\/provider/ },
    { href: '/admin/jobs', label: 'Job monitor', icon: 'clock', re: /^\/admin\/jobs/ },
    { href: '/admin/ads', label: 'Ads manager', icon: 'image', re: /^\/admin\/ads/ },
    { h: 'Money' },
    { href: '/admin/users', label: 'Users', icon: 'team', re: /^\/admin\/users/ },
    { href: '/admin/plans', label: 'Plans', icon: 'crown', re: /^\/admin\/plans/ },
    { href: '/admin/payments', label: 'Payments', icon: 'card', re: /^\/admin\/payments/ },
    { h: 'Grow' },
    { href: '/admin/offer', label: 'Offer & Voo family', icon: 'gift', re: /^\/admin\/offer/ },
    { href: '/admin/emails', label: 'Emails', icon: 'bell', re: /^\/admin\/emails/ },
    { href: '/admin/settings', label: 'Settings', icon: 'sliders', re: /^\/admin\/settings/ },
    { href: '/admin/audit', label: 'Audit log', icon: 'eye', re: /^\/admin\/audit/ }
  ];

  SV.markNav = function (path) {
    SV.$$('[data-nav]').forEach(function (a) {
      var n = A.NAV.filter(function (x) { return x.href === a.getAttribute('data-nav'); })[0];
      var on = !!(n && n.re.test(path));
      a.classList.toggle('on', on);
      if (on && a.parentNode.id === 'admTabs') a.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  };

  function shell(me) {
    $('#side').innerHTML = '<a class="brand" href="/admin"><span class="mark">' + SV.MARK + '</span><span class="word">Spy<b>voo</b></span><span class="adm-badge">ADMIN</span></a>' +
      '<nav class="nav">' + A.NAV.map(function (n) { return n.h ? '<div class="nav-h">' + n.h + '</div>' : '<a href="' + n.href + '" data-nav="' + n.href + '">' + SV.G(n.icon) + '<span>' + n.label + '</span></a>'; }).join('') + '</nav>' +
      '<div class="side-foot"><a href="/app">' + I('back') + 'Back to the dashboard</a><a href="/" target="_blank" rel="noopener">' + I('ext') + 'Open the website</a></div>';
    $('#admTabs').innerHTML = A.NAV.filter(function (n) { return !n.h; }).map(function (n) { return '<a class="chip" href="' + n.href + '" data-nav="' + n.href + '">' + n.label + '</a>'; }).join('');
    $('#top').innerHTML = '<a class="m-brand" href="/admin"><span class="mark">' + SV.MARK + '</span><span class="word">Spy<b>voo</b></span></a>' +
      '<div class="adm-title"><span class="live"></span><span>Control room</span></div>' +
      '<div class="top-actions"><button class="icon-btn" type="button" id="themeBtn" aria-label="Switch theme">' + I(document.documentElement.getAttribute('data-theme') === 'dark' ? 'sun' : 'moon') + '</button>' +
      '<a class="avatar" href="/app/account" aria-label="' + esc(me.email) + '">' + SV.avatar(me.email) + '</a></div>';
    $('#themeBtn').onclick = function () {
      var dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('sv-theme', dark ? 'dark' : 'light'); } catch (e) { /* private mode */ }
      this.innerHTML = I(dark ? 'sun' : 'moon');
    };
    window.addEventListener('scroll', function () { $('#top').classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
  }

  // Admin links are handled in-page (core.js only catches /app links).
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    var href = a.getAttribute('href');
    if (/^\/admin(\/|\?|$)/.test(href)) { e.preventDefault(); SV.go(href); }
  });

  /* ---------- helpers ---------- */
  A.head = function (title, sub, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="row-wrap">' + actions + '</div>' : '') + '</div>';
  };
  A.loading = function (view) { view.innerHTML = '<div class="g4" style="margin-top:20px"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="skel" style="height:300px;margin-top:16px"></div>'; };
  A.load = function (view, path, draw) {
    A.loading(view);
    return SV.get(path).then(function (d) { if (document.body.contains(view)) draw(d); }).catch(function (e) {
      view.innerHTML = '<div class="empty">' + SV.scene('spy', 'think') + '<h3>Couldn’t load this page</h3><p>' + esc(e.message) + '</p><button class="btn" type="button" data-retry>Try again</button></div>';
      var rt = view.querySelector('[data-retry]'); if (rt) rt.addEventListener('click', function () { SV.render(); });
    });
  };
  A.busy = function (btn, p) {
    if (!btn) return p;
    var html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + esc(btn.textContent.trim());
    return p.finally(function () { btn.disabled = false; btn.innerHTML = html; });
  };
  A.call = function (method, path, body, btn, okMsg) {
    // Resolves on success. On failure the error is shown as a toast and the promise stays pending,
    // so follow-up steps (close modal, reload) simply don't run and nothing leaks as an unhandled rejection.
    return new Promise(function (resolve) {
      A.busy(btn, SV.api(method, path, body)).then(function (d) { if (okMsg) SV.toast(typeof okMsg === 'function' ? okMsg(d) : okMsg); resolve(d); }, function (e) { SV.fail(e); if (A.onFail) A.onFail(e); });
    });
  };
  A.field = function (name, label, value, opts) {
    opts = opts || {};
    var id = 'f_' + name.replace(/\W/g, '_');
    var input;
    if (opts.type === 'textarea') input = '<textarea class="input" id="' + id + '" name="' + name + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>' + esc(value == null ? '' : value) + '</textarea>';
    else if (opts.options) input = '<select class="input" id="' + id + '" name="' + name + '">' + opts.options.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    else input = '<input class="input" id="' + id + '" name="' + name + '" type="' + (opts.type || 'text') + '" value="' + esc(value == null ? '' : value) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + (opts.step ? ' step="' + opts.step + '"' : '') + (opts.attrs || '') + '>';
    return '<div class="field' + (opts.full ? ' full' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' + input + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
  };
  A.sw = function (name, label, on, hint, full) {
    return '<label class="sw' + (full ? ' full' : '') + '"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + (hint ? '<small>' + hint + '</small>' : '') + '</span></label>';
  };
  // Read a form into a plain object. Checkboxes become booleans, number inputs numbers.
  A.read = function (root) {
    var o = {};
    SV.$$('[name]', root).forEach(function (el) {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'number') o[el.name] = el.value === '' ? '' : Number(el.value);
      else o[el.name] = el.value;
    });
    return o;
  };
  A.tag = function (text, tone) { return '<span class="tag2 ' + (tone || '') + '">' + esc(text) + '</span>'; };
  A.status = function (s) { return A.tag(String(s).replace(/_/g, ' '), { done: 'mint', paid: 'mint', active: 'mint', live: 'mint', running: 'blue', pending: 'orange', sandbox: 'orange', soon: 'orange', refunded: 'orange', failed: 'red', expired: 'red', charged_back: 'red', off: '', inactive: '' }[s] || ''); };
  // {"found":12,"skipped":"provider not connected"} → "Found 12 · Skipped: provider not connected"
  A.human = function (r) {
    if (r == null || r === '') return '';
    if (typeof r !== 'object') return String(r);
    return Object.keys(r).map(function (k) { var v = r[k]; var key = k.replace(/_/g, ' '); key = key.charAt(0).toUpperCase() + key.slice(1); return typeof v === 'object' ? key : key + (typeof v === 'string' ? ': ' + v : ' ' + v); }).join(' · ');
  };
  // ISO (UTC) → value for <input type="datetime-local"> in the admin's own time zone.
  A.localInput = function (iso) { var d = new Date(iso); if (isNaN(d)) return ''; d = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  A.lim = function (v) { return v === -1 ? '∞' : SV.n(v); };
  A.when = function (iso) { return iso ? '<span title="' + esc(new Date(iso).toLocaleString()) + '">' + esc(SV.ago(iso)) + '</span>' : '<span class="mut">—</span>'; };

  // Bar chart drawn to one scale: bars, a max label and day labels at both ends.
  A.bars = function (series, opts) {
    opts = opts || {};
    // Fewer than 3 days with data: say so instead of drawing a lonely bar.
    if (series.filter(function (s) { return s.value; }).length < 3) {
      var tot = series.reduce(function (a, s) { return a + s.value; }, 0);
      return '<div class="achart"><div class="row-wrap" style="justify-content:space-between"><span class="mut" style="font-weight:800;font-size:13px">' + esc(opts.title || '') + '</span><span class="total">' + (opts.money ? SV.money(tot) : SV.n(tot)) + '</span></div><div class="achart-empty"><span></span><p>The chart fills in after a few days of activity.</p></div></div>';
    }
    var W = 300, H = 110, n = series.length, gap = 4, bw = (W - gap * (n - 1)) / n;
    var max = Math.max.apply(null, series.map(function (s) { return s.value; }).concat([1]));
    var total = series.reduce(function (a, s) { return a + s.value; }, 0);
    var color = opts.color || 'var(--blue)';
    var bars = series.map(function (s, i) {
      var h = Math.max(s.value ? 3 : 1.5, s.value / max * (H - 16));
      return '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (H - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3" fill="' + (s.value ? color : 'var(--line)') + '" style="animation-delay:' + (i * 35) + 'ms"><title>' + esc(s.day) + ': ' + (opts.money ? SV.money(s.value) : SV.n(s.value)) + '</title></rect>';
    }).join('');
    var lbl = function (d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    return '<div class="achart"><div class="row-wrap" style="justify-content:space-between"><span class="mut" style="font-weight:800;font-size:13px">' + esc(opts.title || '') + '</span><span class="total">' + (opts.money ? SV.money(total) : SV.n(total)) + '</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + (H + 16) + '" preserveAspectRatio="none" role="img" aria-label="' + esc(opts.title || 'Chart') + '">' +
      '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="var(--line)" stroke-width="1"/>' + bars +
      '<text x="0" y="' + (H + 13) + '">' + lbl(series[0].day) + '</text><text x="' + W + '" y="' + (H + 13) + '" text-anchor="end">' + lbl(series[n - 1].day) + '</text>' +
      '<text x="' + W + '" y="8" text-anchor="end">max ' + (opts.money ? SV.money(max) : SV.n(max)) + '</text></svg></div>';
  };

  /* ---------- boot ---------- */
  // Wait for pages.js (loaded right after this file) before rendering.
  var ready = document.readyState === 'loading' ? new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); }) : Promise.resolve();
  Promise.all([SV.get('/api/app/bootstrap'), ready]).then(function (res) { var b = res[0];
    if (!b.user || b.user.role !== 'admin') { location.href = '/app'; return; }
    SV.state.boot = b; A.me = b.user;
    shell(b.user);
    var ad = b.admin || {};
    if (ad.maintenance || ad.signups === false) {
      var bar = document.createElement('div'); bar.className = 'adm-alert';
      bar.innerHTML = I('flag', ' width="16" height="16"') + '<span>' + (ad.maintenance ? '<b>Maintenance mode is ON.</b> Customers see “Back soon”.' : '') + (ad.signups === false ? ' <b>Sign-ups are paused.</b>' : '') + '</span><a href="/admin/settings">Change in Settings →</a>';
      document.querySelector('.adm .main').insertBefore(bar, document.getElementById('admTabs'));
    }
    SV.route(/^\/admin\/.+|^\/admin$/, function (view) { (A.pages[location.pathname.replace(/\/+$/, '')] || A.pages['/admin'])(view); });
    SV.render();
  }).catch(function (e) { $('#view').innerHTML = '<div class="empty"><h3>Can’t open the control room</h3><p>' + esc(e.message) + '</p></div>'; });
  A.pages = {};

  // Phone tables become cards: copy each column's heading onto its cells so values keep their labels.
  function labelTables(root) {
    (root || document).querySelectorAll('table.tbl').forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
      if (!heads.length) return;
      t.querySelectorAll('tbody tr').forEach(function (tr) { Array.prototype.forEach.call(tr.children, function (td, i) { if (!td.hasAttribute('data-l')) td.setAttribute('data-l', heads[i] || ''); }); });
    });
  }
  new MutationObserver(function () { labelTables(); }).observe(document.documentElement, { childList: true, subtree: true });
})();
