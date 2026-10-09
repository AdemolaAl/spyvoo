/* App shell: sidebar, top bar, phone tab bar, usage meter, notifications, theme, first-visit welcome. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;

  var NAV = [
    { href: '/app', label: 'Home', icon: 'home', re: /^\/app$/ },
    { href: '/app/discover', label: 'Discover', icon: 'search', re: /^\/app\/(discover|advertiser)/ },
    { href: '/app/boards', label: 'Boards', icon: 'boards', re: /^\/app\/boards/ },
    { href: '/app/alerts', label: 'Alerts', icon: 'bell', re: /^\/app\/alerts/, count: true },
    { href: '/app/scripts', label: 'AI scripts', icon: 'wand', re: /^\/app\/scripts/ },
    { href: '/app/plan', label: 'Plan & billing', icon: 'crown', re: /^\/app\/plan/ },
    { href: '/app/account', label: 'Account', icon: 'user', re: /^\/app\/account/ }
  ];


  // Member badge ("agent ID"): each paid plan is a clearance level. Owner reads as level 3 in gold.
  var EYES = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="20" cy="33" r="12" fill="currentColor"/><circle cx="44" cy="33" r="12" fill="currentColor"/><circle class="pupil" cx="21.5" cy="33" r="5.2"/><circle class="pupil" cx="45.5" cy="33" r="5.2"/></svg>';
  SV.tier = function (u) {
    var pl = (u && u.plan) || {};
    if (!pl.paid && !pl.owner) return null;
    var lvl = pl.owner ? 3 : ({ starter: 1, pro: 2, agency: 3 })[pl.id] || 2;
    var key = pl.owner ? 'owner' : ({ 1: 'starter', 2: 'pro', 3: 'agency' })[lvl];
    var name = pl.owner ? 'Owner' : pl.name;
    return { lvl: lvl, key: key, name: name, label: pl.owner ? 'Owner' : name + ' agent' };
  };
  SV.tierPips = function (t) { var h = '<span class="pips" aria-hidden="true">'; for (var i = 1; i <= 3; i++) h += '<i' + (i <= t.lvl ? ' class="on"' : '') + '></i>'; return h + '</span>'; };
  SV.tierEyes = EYES;
  // The ID card shown when a payment confirms.
  SV.agentCard = function (u, t, ref) {
    var since = SV.date ? SV.date(u.created_at || Date.now()) : '';
    var nm = String(u.name || (u.email || '').split('@')[0] || 'Agent');
    var initials = nm.trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'SV';
    var id = String(ref || u.id || '').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
    return '<div class="agent-card t-' + t.key + '" role="img" aria-label="' + esc(t.name) + ' member card">' +
      '<i class="ac-slot"></i><i class="ac-holo"></i><i class="ac-scan"></i>' +
      '<div class="ac-head"><span class="ac-mark">' + EYES + '</span><b>Spyvoo</b>' + (id ? '<small>ID ' + esc(id) + '</small>' : '') + '</div>' +
      '<div class="ac-who"><span class="ac-photo">' + esc(initials) + '</span><div><small>' + (t.key === 'owner' ? 'Station chief' : 'Field agent') + '</small><b>' + esc(nm) + '</b><small>Since ' + esc(since) + '</small></div></div>' +
      '<div class="ac-foot"><span class="ac-plan">' + esc(t.name) + '</span><span class="ac-clear"><small>Clearance · LVL 0' + t.lvl + '</small>' + SV.tierPips(t) + '</span></div>' +
      '<i class="ac-code"></i></div>';
  };

  SV.setTheme = function (t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('sv-theme', t); } catch (e) { /* private mode */ }
  };

  SV.shell = function () {
    var b = SV.state.boot, u = b.user, tier = SV.tier(u);
    $('#side').innerHTML = '<a class="brand" href="/app"><span class="mark">' + SV.MARK + '</span><span class="word">Spy<b>voo</b></span></a>' +
      '<nav class="nav">' + NAV.map(function (n) { return '<a href="' + n.href + '" data-nav="' + n.href + '">' + SV.G(n.icon) + '<span>' + n.label + '</span>' + (n.count && b.unread ? '<span class="count">' + b.unread + '</span>' : '') + '</a>'; }).join('') +
      (u.role === 'admin' ? '<div class="nav-sep"></div><a href="/admin" target="_self">' + I('sliders') + '<span>Admin panel</span></a>' : '') + '</nav>' +
      '<div class="side-foot"><div class="meter-card" id="sideMeter"></div>' +
      (u.plan.id === 'free' ? '<div class="upgrade">' + (b.offer && b.offer.eligible ? '<span class="pill">' + esc(b.offer.badge) + '</span>' : '') + '<b>Go Pro</b><span>Unlimited searches, 1,000 AI breakdowns and competitor alerts.</span><a class="btn sm" href="/app/plan' + (b.offer && b.offer.eligible ? '?coupon=' + encodeURIComponent(b.offer.code) : '') + '">' + I('crown') + 'Upgrade</a></div>' : '') +
      (b.voosquare && b.voosquare.app_url ? '<a class="voo-part" href="' + esc(b.voosquare.app_url) + '" target="_blank" rel="noopener">Part of <b>VooSquare</b></a>' : '') + '</div>';
    $('#top').innerHTML = '<a class="m-brand" href="/app"><span class="mark">' + SV.MARK + '</span><span class="word">Spy<b>voo</b></span></a>' +
      '<form class="ask" id="topAsk" role="search"><svg class="lens" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="topQ" placeholder="Ask Spyvoo… “crypto ads in Brazil over 30 days”" autocomplete="off" aria-label="Search ads"><span class="kbd">/</span><button class="ai" type="submit">' + I('spark', ' width="14" height="14"') + 'Spy</button></form>' +
      '<div class="top-actions"><button class="tour-btn" type="button" id="tourBtn"><i>' + I('play', ' width="14" height="14"') + '</i><span class="lbl">How it works</span><span class="lbl-s">Tour</span></button>' +
      '<button class="icon-btn" type="button" id="bell" aria-label="Notifications">' + SV.G('bell') + (b.unread ? '<span class="dot">' + b.unread + '</span>' : '') + '</button>' +
      (tier ? '<a class="tier-pill t-' + tier.key + '" href="/app/plan" title="Your plan: ' + esc(tier.name) + '"><span class="eyes">' + EYES + '</span><span class="tp-lbl">' + esc(tier.label) + '</span>' + SV.tierPips(tier) + '</a>' : '') +
      '<button class="avatar' + (tier ? ' prem t-' + tier.key : '') + '" type="button" id="me" aria-label="Account menu">' + SV.avatar(u.email) + (tier ? '<span class="agent-clip" aria-hidden="true">' + esc(tier.key === 'owner' ? 'OWNER' : tier.name.toUpperCase()) + '</span>' : '') + '</button></div>';
    $('#tabbar').innerHTML = '<a href="/app" data-nav="/app">' + SV.G('home') + 'Home</a><a href="/app/discover" data-nav="/app/discover">' + SV.G('compass') + 'Discover</a>' +
      '<button class="fab" type="button" id="fab" aria-label="Search">' + I('search') + '</button>' +
      '<a href="/app/boards" data-nav="/app/boards">' + SV.G('boards') + 'Boards</a><a href="/app/alerts" data-nav="/app/alerts">' + SV.G('bell') + 'Alerts</a>';
    var a = b.announcement, an = $('#announce');
    if (a && a.text) { an.hidden = false; an.className = 'announce' + (a.tone === 'warn' ? ' warn' : ''); an.innerHTML = I('bell', ' width="18" height="18"') + '<span>' + esc(a.text) + '</span>' + (a.link ? '<a href="' + esc(a.link) + '" style="margin-left:auto;font-weight:800">Learn more →</a>' : ''); } else an.hidden = true;
    drawMeter();
    $('#topAsk').onsubmit = function (e) { e.preventDefault(); var v = $('#topQ').value.trim(); SV.go('/app/discover' + (v ? '?ask=' + encodeURIComponent(v) : '')); $('#topQ').blur(); };
    $('#tourBtn').onclick = function () { SV.tour.start(); };
    $('#fab').onclick = mobileSearch;
    $('#bell').onclick = function () { bellPop(this); };
    $('#me').onclick = function () { meMenu(this); };
    SV.markNav(location.pathname);
  };

  function drawMeter() {
    var m = SV.state.meter, el = $('#sideMeter'); if (!el || !m) return;
    var row = function (k, label) { var x = m[k], p = SV.pct(x); return '<div class="row"><span>' + label + '</span><span class="tnum">' + SV.limitText(x) + '</span></div><div class="bar' + (p > 85 && x.limit !== -1 ? ' warn' : '') + '" style="margin-bottom:10px"><i style="width:' + p + '%"></i></div>'; };
    el.innerHTML = '<div class="row" style="margin-bottom:10px"><b style="color:var(--ink)">' + esc(SV.state.boot.user.plan.owner ? 'Owner · full access' : SV.state.boot.user.plan.name + ' plan') + '</b><a href="/app/plan" style="color:var(--blue)">Usage</a></div>' + row('searches', 'Searches today') + row('analyses', 'AI breakdowns');
  }
  SV.refreshMeter = function () {
    clearTimeout(SV._mt);
    SV._mt = setTimeout(function () { SV.get('/api/app/bootstrap').then(function (b) { SV.state.meter = b.meter; SV.state.boot.unread = b.unread; drawMeter(); var d = $('#bell .dot'); if (b.unread && !d) $('#bell').insertAdjacentHTML('beforeend', '<span class="dot">' + b.unread + '</span>'); else if (d) { if (b.unread) d.textContent = b.unread; else d.remove(); } var nc = $('#side a[data-nav="/app/alerts"]'); if (nc) { var c = nc.querySelector('.count'); if (b.unread && !c) nc.insertAdjacentHTML('beforeend', '<span class="count">' + b.unread + '</span>'); else if (c) { if (b.unread) c.textContent = b.unread; else c.remove(); } } }).catch(function () {}); }, 400);
  };

  SV.markNav = function (path) {
    SV.$$('[data-nav]').forEach(function (a) {
      var n = NAV.find(function (x) { return x.href === a.dataset.nav; });
      a.classList.toggle('on', !!(n && n.re.test(path)));
    });
  };

  function mobileSearch() {
    var md = SV.modal('<span class="eyebrow">Ask Spyvoo</span><h2 style="margin-top:8px">What are you looking for?</h2><form id="mq" style="margin-top:12px"><label class="ask" style="max-width:none"><svg class="lens" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="mqi" placeholder="crypto ads in Brazil, 30+ days" autofocus></label></form><div class="opts" style="margin-top:12px">' +
      ['Skincare winners in Mexico', 'Fintech video ads in Egypt', 'Trading apps, sign up, 60+ days', 'Travel deals in UAE'].map(function (t) { return '<button type="button" class="chip" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>');
    md.el.querySelector('#mq').onsubmit = function (e) { e.preventDefault(); md.close(true); SV.go('/app/discover?ask=' + encodeURIComponent(md.el.querySelector('#mqi').value)); };
    SV.$$('[data-t]', md.el).forEach(function (c) { c.onclick = function () { md.close(true); SV.go('/app/discover?ask=' + encodeURIComponent(c.dataset.t)); }; });
  }

  function bellPop(btn) {
    var p = SV.popover(btn, '<h4>Notifications</h4><div class="list" id="np"><div class="skel" style="height:60px"></div></div><div class="row"><a class="btn ghost sm" href="/app/alerts">See all</a><button class="btn sm" type="button" id="nra">Mark all read</button></div>');
    p.style.width = '360px';
    var r = btn.getBoundingClientRect(); p.style.left = Math.max(12, r.right - 360) + 'px';
    SV.get('/api/app/notifications').then(function (d) {
      $('#np').innerHTML = d.items.slice(0, 6).map(function (n) { return '<a class="li' + (n.read ? '' : ' unread') + '" href="' + esc(n.url || '/app') + '">' + (n.image ? '<img class="thumbsm" src="' + esc(n.image) + '" alt="">' : '<span class="thumbsm" style="display:grid;place-items:center;background:var(--blue-l);color:var(--blue)">' + I('bell') + '</span>') + '<span class="grow"><b>' + esc(n.title) + '</b><small>' + SV.ago(n.created_at) + '</small></span></a>'; }).join('') || '<p class="mut" style="font-weight:600;margin:8px 0">Nothing new. Follow advertisers to get alerts.</p>';
      SV.$$('#np a').forEach(function (x) { x.addEventListener('click', SV.closePop); });
    });
    $('#nra').onclick = function () { SV.post('/api/app/notifications/read', {}).then(function () { SV.closePop(); SV.refreshMeter(); }); };
  }

  function meMenu(btn) {
    var u = SV.state.boot.user, dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var p = SV.popover(btn, '<div class="menu"><div class="who"><b>' + esc(u.name) + '</b><small>' + esc(u.email) + '</small><br>' + (SV.tier(u) ? '<span class="plan-chip agent t-' + SV.tier(u).key + '"><span class="eyes">' + EYES + '</span>' + esc(SV.tier(u).label) + SV.tierPips(SV.tier(u)) + '</span>' : '<span class="plan-chip">' + esc(u.plan.name) + '</span>') + '</div>' +
      '<a href="/app/account">' + I('user') + 'Account</a><a href="/app/plan">' + I('crown') + 'Plan & billing</a><button type="button" id="mt">' + I(dark ? 'sun' : 'moon') + (dark ? 'Light mode' : 'Dark mode') + '</button><button type="button" id="mtour">' + I('play') + 'Replay the tour</button>' +
'<a href="/app/scripts">' + I('wand') + 'AI scripts</a>' + (SV.state.boot.support ? '<button type="button" id="msup">' + I('spark') + 'Chat with Spyvoo Support</button>' : '') + (u.role === 'admin' ? '<a href="/admin" target="_self">' + I('sliders') + 'Admin panel</a>' : '') + '<button type="button" id="mlo">' + I('logout') + 'Log out</button></div>');
    var r = btn.getBoundingClientRect(); p.style.left = Math.max(12, r.right - p.offsetWidth) + 'px';
    SV.$$('.menu a', p).forEach(function (a) { a.addEventListener('click', SV.closePop); });
    $('#mt').onclick = function () { SV.setTheme(dark ? 'light' : 'dark'); SV.closePop(); };
    $('#mtour').onclick = function () { SV.closePop(); SV.tour.start(); };
    if ($('#msup')) $('#msup').onclick = function () { SV.closePop(); if (SV.openSupport) SV.openSupport(); };
    $('#mlo').onclick = function () { SV.post('/api/auth/logout').then(function () { location.href = SV.state.boot.voosquare.enabled && SV.state.boot.user.voo ? '/auth/voosquare/logout' : '/'; }); };
  }

  function welcome() {
    var u = SV.state.boot.user;
    var md = SV.modal('<div style="text-align:center"><div class="welcome-art">' + SV.agent(SV.cast.guide, { pose: 'wave' }) + '</div><span class="eyebrow">Welcome to Spyvoo</span><h2 style="margin-top:8px">Hi ' + esc((u.name || '').split(' ')[0] || 'agent') + ', I’m your guide.</h2><p class="mut" style="font-weight:600">Want a quick tour? It plays right on your dashboard, like a video. You can pause or close it any time.</p>' +
      '<div class="field" style="text-align:left;margin-top:14px"><label>What do you run ads for? (we’ll show you that first)</label><div class="opts" id="niPick">' + SV.state.boot.niches.slice(0, 12).map(function (n) { return '<button type="button" class="chip" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div></div>' +
      '<div class="actions" style="justify-content:center"><button class="btn ghost" type="button" id="wSkip">Skip for now</button><button class="btn grad" type="button" id="wGo">' + I('play') + 'Play the tour</button></div></div>', { onClose: function () { SV.post('/api/app/onboarding', { welcome_done: true }); } });
    var niche = '';
    md.el.querySelector('#niPick').onclick = function (e) { var b = e.target.closest('[data-n]'); if (!b) return; niche = b.dataset.n; SV.$$('[data-n]', md.el).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    md.el.querySelector('#wSkip').onclick = function () { md.close(true); SV.post('/api/app/onboarding', { welcome_done: true, niche: niche }); };
    md.el.querySelector('#wGo').onclick = function () { md.close(true); SV.post('/api/app/onboarding', { welcome_done: true, niche: niche }); SV.tour.start(); };
  }

  SV.boot = function (quiet) {
    return SV.get('/api/app/bootstrap').then(function (b) {
      SV.state.boot = b; SV.state.meter = b.meter;
      SV.shell();
      if (!quiet) {
        SV.render();
        var ob = b.user.onboarding || {};
        // The welcome only greets people on Home: someone who arrived to pay (a plan picked on the pricing page),
        // to open an ad or to join a team has the checkout or that page in front of them already.
        if (/[?&]voo=linked/.test(location.search)) { var sp = new URLSearchParams(location.search); sp.delete('voo'); history.replaceState({}, '', location.pathname + (sp.toString() ? '?' + sp : '')); SV.toast('VooSquare connected. Log in with your Voo ID from now on.', { icon: 'check' }); }
        if (!ob.welcome_done && !ob.tour_seen && location.pathname === '/app' && !/[?&](checkout|order)=/.test(location.search)) setTimeout(function () { if (!document.querySelector('.modal-wrap')) welcome(); }, 700);
      }
    });
  };

  // "/" focuses search, top bar gets a line when scrolled.
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.body.classList.contains('touring')) { var q = $('#topQ'); if (q && q.offsetParent) { e.preventDefault(); q.focus(); } }
  });
  window.addEventListener('scroll', function () { var t = $('#top'); if (t) t.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });

  SV.boot().catch(function (e) { $('#view').innerHTML = '<div class="empty"><h3>Couldn’t load Spyvoo</h3><p>' + esc(e.message) + '</p><button class="btn" type="button" id="bootRetry">Try again</button></div>'; var r = $('#bootRetry'); if (r) r.addEventListener('click', function () { location.reload(); }); });
})();
