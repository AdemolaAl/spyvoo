/* Dashboard pages: Home, Discover (search), Advertiser, Boards, Alerts and Scripts. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;

  function secHead(title, icon, color, more) {
    return '<div class="sec-h"><h2>' + SV.tile(icon, color) + title + '</h2>' + (more ? '<a class="more" href="' + more.href + '">' + esc(more.label) + ' ' + I('arrow', ' width="15" height="15"') + '</a>' : '') + '</div>';
  }
  SV.secHead = secHead;
  function empty(art, title, text, btn) {
    return '<div class="empty">' + art + '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (btn || '') + '</div>';
  }
  SV.emptyState = empty;
  var NICHE_GLYPH = { 'E-commerce': 'gift', Trading: 'trend', Crypto: 'bolt', iGaming: 'fire', Apps: 'boards', Fintech: 'card', 'Lead gen': 'team', Health: 'heart', Beauty: 'spark', Education: 'trophy', Travel: 'globe', Fashion: 'image', Food: 'gift', SaaS: 'layers', 'Real estate': 'home', Coaching: 'user' };
  var NICHE_COL = ['#1F5BFF', '#FF3D8B', '#7B5CFF', '#FF9F1C', '#14C894', '#0FA3B1', '#E5484D', '#5B3DF5', '#FFB000', '#2F80ED'];

  /* =================== HOME =================== */
  SV.route(/^\/app$/, function (view, m, q) {
    var b = SV.state.boot, u = b.user;
    var hr = new Date().getHours();
    var hi = hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    view.innerHTML = '<div class="stagger">' +
      '<section class="hero"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><div>' +
      '<span class="eyebrow" style="color:rgba(255,255,255,.75)">Today · ' + new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '</span>' +
      '<h1 style="margin-top:12px">' + hi + ', ' + esc((u.name || 'agent').split(' ')[0]) + '.<br><span class="hl"><span class="tnum" id="liveN">' + SV.n(b.stats.active) + '</span> winners</span> are running right now.</h1>' +
      '<p>Search like you talk, open a winner, and let the AI tell you why it works. Your next angle is in here somewhere.</p>' +
      '<form class="home-search" id="homeSearch" role="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="homeQ" placeholder="Try: crypto ads in Brazil" autocomplete="off" aria-label="Search ads"><button type="submit">Spy</button></form>' +
      '<div class="quick">' + ['Crypto in Brazil, 30+ days', 'Skincare winners in Mexico', 'Fintech video ads in Egypt', 'Sign-up ads running 60+ days'].map(function (t) { return '<button type="button" data-q="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
      '<button class="tour-card" type="button" data-tour><span class="thumb"><span class="mini"><i></i><u><s></s><s></s><s></s><s></s><s></s><s></s></u></span><span class="play">' + I('play') + '</span></span><span><b>Watch how Spyvoo works</b><span>60 seconds · it plays right here, on your dashboard</span></span></button>' +
      '</div><div class="hero-art" id="heroArt"><div class="agent-wrap">' + SV.agent(SV.cast.host, { pose: 'bino' }) + '</div></div></section>' +
      '<section class="sec">' + secHead('Today’s top winners', 'trophy', 'var(--pink)', { href: '/app/discover?sort=score&status=active', label: 'See all' }) + '<div class="strip" id="winners">' + SV.skelCards(5) + '</div></section>' +
      '<div id="checklist"></div><div id="offerBox"></div>' +
      '<section class="sec">' + secHead('Trending niches', 'trend', 'var(--violet)') + '<div class="niches" id="niches"></div></section>' +
      '<section class="sec">' + secHead('More from Zedapex', 'spark', 'var(--orange)') + '<div id="family"></div></section>' +
      '<section class="sec">' + secHead('Longest runners', 'clock', 'var(--blue)', { href: '/app/discover?sort=days&status=active', label: 'See all' }) + '<div class="strip" id="longest">' + SV.skelCards(5) + '</div></section>' +
      '<section class="sec" id="followSec"></section>' +
      '<section class="sec" id="recentSec"></section>' +
      '</div>';
    var art = $('#heroArt');
    SV.$$('[data-q]', view).forEach(function (x) { x.onclick = function () { SV.go('/app/discover?ask=' + encodeURIComponent(x.dataset.q)); }; });
    view.querySelector('[data-tour]').onclick = function () { SV.tour.start(); };
    $('#homeSearch').onsubmit = function (e) { e.preventDefault(); var v = $('#homeQ').value.trim(); SV.go('/app/discover' + (v ? '?ask=' + encodeURIComponent(v) : '')); };
    SV.family($('#family'), b.family);
    checklist();
    offerBox($('#offerBox'));

    SV.get('/api/app/home').then(function (d) {
      if (!document.getElementById('winners') || !document.getElementById('heroArt')) return; // left Home before it loaded
      $('#winners').innerHTML = d.winners.length ? d.winners.map(function (a) { return SV.adCard(a); }).join('') : '<div class="mut">No ads yet. The first scrape fills this in.</div>';
      $('#longest').innerHTML = d.longest.map(function (a) { return SV.adCard(a); }).join('');
      // floating ad cards in the hero
      var top = [], seenAdv = {}, seenImg = {};
      d.winners.concat(d.longest || []).forEach(function (a) { if (top.length < 2 && a.thumb && !seenAdv[a.advertiser.name] && !seenImg[a.thumb]) { seenAdv[a.advertiser.name] = 1; seenImg[a.thumb] = 1; top.push(a); } });
      top.forEach(function (a, i) {
        var c = document.createElement('a'); c.href = '#'; c.className = 'float-card fc' + (i + 1);
        c.innerHTML = '<img src="' + esc(a.thumb) + '" alt=""><b>' + esc(a.advertiser.name.split(' ')[0]) + '<span>' + a.days + 'd</span></b>';
        c.onclick = function (e) { e.preventDefault(); SV.openAd(a.id); };
        art.appendChild(c);
      });
      $('#niches').innerHTML = d.niches.map(function (n, i) {
        var w = n.weeks || [], mx = Math.max.apply(null, w.concat([1])), bars = '';
        w.forEach(function (v, k) { bars += '<i style="height:' + Math.max(8, Math.round(v / mx * 100)) + '%;animation-delay:' + (k * .05) + 's" title="' + v + ' ads running"></i>'; });
        var a0 = w[0] || 0, a1 = w[w.length - 1] || 0;
        var badge = !a0 && a1 ? '<em class="up">New</em>' : a0 === a1 ? '<em class="flat">Steady</em>' : '<em class="' + (a1 > a0 ? 'up' : 'down') + '">' + (a1 > a0 ? '▲ ' : '▼ ') + Math.abs(Math.round((a1 - a0) / a0 * 100)) + '%</em>';
        return '<button class="niche" type="button" data-niche="' + esc(n.niche) + '" style="--c:' + NICHE_COL[i % NICHE_COL.length] + '"><span class="n-top">' + SV.tile(NICHE_GLYPH[n.niche] || 'spark', NICHE_COL[i % NICHE_COL.length], 32) + badge + '</span><b>' + esc(n.niche) + (n.top_country ? ' <span class="n-flag" title="Top country">' + SV.flag(n.top_country) + '</span>' : '') + '</b><small>' + n.ads + ' ad' + (n.ads === 1 ? '' : 's') + ' · avg score ' + n.score + '</small><span class="spark">' + bars + '</span></button>';
      }).join('') || '<div class="mut">Trends appear after the first scrape.</div>';
      SV.$$('[data-niche]', view).forEach(function (x) { x.onclick = function () { SV.go('/app/discover?niche=' + encodeURIComponent(x.dataset.niche)); }; });
      var fs = $('#followSec');
      if (d.followed.length) fs.innerHTML = secHead('New from advertisers you follow', 'radar', 'var(--mint)', { href: '/app/alerts', label: 'Manage' }) + '<div class="strip">' + d.followed.map(function (a) { return SV.adCard(a); }).join('') + '</div>';
      else fs.innerHTML = '<div class="panel" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div style="width:120px;height:130px;flex:0 0 auto">' + SV.agent(SV.cast.spy, { pose: 'point' }) + '</div><div style="flex:1;min-width:220px"><span class="eyebrow">Competitor alerts</span><h3 style="font-size:24px;margin:8px 0 6px">Follow a competitor. Hear the moment they launch.</h3><p class="mut" style="margin:0;font-weight:600">Open any ad, tap <b>Follow</b> on the advertiser, and new ads land here and in your inbox.</p></div><a class="btn" href="/app/discover">Find a competitor ' + I('arrow') + '</a></div>';
      var rs = $('#recentSec');
      if (d.recent.length) rs.innerHTML = secHead('Recently viewed', 'eye', 'var(--ink-2)') + '<div class="strip">' + d.recent.map(function (a) { return SV.adCard(a, { compact: true }); }).join('') + '</div>';
      // Count up to the real number once (no fake ticking).
      var n = d.stats.active, el = $('#liveN');
      if (el && !SV.reduce && n > 0) { var k = 0, steps = 24; var t = setInterval(function () { k++; el.textContent = SV.n(Math.round(n * k / steps)); if (k >= steps) clearInterval(t); }, 30); }
    }).catch(SV.fail);
  });

  function checklist() {
    var host = $('#checklist');
    if (!host || SV.state.boot.user.onboarding.checklist_hidden) return;
    SV.get('/api/app/checklist').then(function (d) {
      var done = d.steps.filter(function (s) { return s.done; }).length, total = d.steps.length;
      if (done === total) return;
      var pct = Math.round(done / total * 100), C = 2 * Math.PI * 32;
      host.innerHTML = '<section class="sec"><div class="panel check fade-in"><div class="ring"><svg viewBox="0 0 76 76"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#1F5BFF"/><stop offset=".6" stop-color="#7B5CFF"/><stop offset="1" stop-color="#FF3D8B"/></linearGradient></defs><circle cx="38" cy="38" r="32" fill="none" stroke="var(--line)" stroke-width="8"/><circle cx="38" cy="38" r="32" fill="none" stroke="url(#rg)" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"/></svg><b>' + done + '/' + total + '</b></div>' +
        '<div><span class="eyebrow">Beginner path</span><h3 style="font-size:20px;margin:6px 0 10px">Become a pro spy in 6 small steps</h3><div class="steps-list">' + d.steps.map(function (s) { return '<button type="button" class="step-pill' + (s.done ? ' done' : '') + '" data-step="' + s.id + '"><i>' + (s.done ? I('check') : '') + '</i>' + esc(s.label) + '</button>'; }).join('') + '</div></div>' +
        '<button class="btn ghost sm" type="button" data-hide>Hide</button></div></section>';
      setTimeout(function () { var c = host.querySelector('circle:last-child'); if (c) c.style.strokeDashoffset = C * (1 - pct / 100); }, 80);
      host.querySelector('[data-hide]').onclick = function () { host.innerHTML = ''; SV.post('/api/app/onboarding', { checklist_hidden: true }); SV.state.boot.user.onboarding.checklist_hidden = true; };
      SV.$$('[data-step]', host).forEach(function (x) {
        x.onclick = function () {
          var id = x.dataset.step;
          if (id === 'tour') SV.tour.start();
          else if (id === 'search') SV.go('/app/discover?ask=' + encodeURIComponent('Crypto ads in Brazil, 30+ days'));
          else if (id === 'open' || id === 'ai') SV.go('/app/discover?sort=score&status=active');
          else if (id === 'save') SV.go('/app/discover?sort=score');
          else if (id === 'follow') SV.go('/app/discover?sort=variations');
        };
      });
    }).catch(function () {});
  }

  function offerBox(host) {
    var o = SV.state.boot.offer;
    if (!host || !o || !o.eligible || SV.state.boot.user.plan.id !== 'free') return;
    host.innerHTML = '<section class="sec"><div class="offer fade-in"><span class="badge">' + esc(o.badge || 'Offer') + '</span><div><b>' + esc(o.title) + ': ' + esc(o.text) + '</b><span>Use code <code>' + esc(o.code) + '</code> at checkout.</span></div>' + (o.ends_at ? '<div class="cd" id="offerCd"></div>' : '') + '<a class="btn" href="/app/plan?coupon=' + encodeURIComponent(o.code) + '">Claim it ' + I('arrow') + '</a></div></section>';
    if (o.ends_at) SV.countdown($('#offerCd'), o.ends_at);
  }
  SV.offerBox = offerBox;

  /* =================== DISCOVER =================== */
  var FKEYS = ['q', 'countries', 'min_days', 'cta', 'media', 'niche', 'platforms', 'status', 'sort', 'domain', 'from', 'to', 'language', 'min_score'];
  SV.route(/^\/app\/discover$/, function (view, m, q) {
    var f = {};
    FKEYS.forEach(function (k) { var v = q.get(k); if (v) f[k] = /^(countries|cta|media|niche|platforms)$/.test(k) ? v.split(',') : v; });
    if (!f.sort) f.sort = 'score';
    var ask = q.get('ask') || '', saved = q.get('saved');
    view.innerHTML = '<div class="page-head"><div><span class="eyebrow">Discover</span><h1>Find a winner</h1><p>Search by keyword, brand, website, or just describe what you want.</p></div><button class="btn ghost" type="button" id="saveSearch">' + I('bell') + 'Save & get alerts</button></div>' +
      '<form class="dsearch" id="dform"><label class="ask" style="flex:1"><svg class="lens" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">' + '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="dq" placeholder="Try “crypto ads in Brazil over 30 days with sign up”" value="' + esc(ask || (f.q || '')) + '" autocomplete="off"><button class="ai" type="submit">' + I('spark', ' width="14" height="14"') + 'Spy</button></label></form>' +
      '<div class="understood" id="understood"></div><div class="filters" id="filters"></div>' +
      '<div class="result-bar"><div><b id="count">…</b> <span class="mut" style="font-weight:700" id="countLbl">ads</span></div><div class="seg" id="sorts">' + [['score', 'Winner score'], ['days', 'Longest running'], ['new', 'Newest'], ['variations', 'Most variations']].map(function (s) { return '<button type="button" data-s="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="cards" id="results"></div><div class="loadmore" id="more"></div>';
    var state = { f: f, offset: 0, loading: false, relax: false };
    var boot = SV.state.boot;

    function chipsHtml() {
      var c = function (key, label, icon, count) { return '<button class="chip' + (count ? ' on' : '') + '" type="button" data-f="' + key + '">' + (SV.hasGlyph(icon) ? SV.G(icon) : I(icon)) + label + (count ? ' <span class="n">' + count + '</span>' : '') + '</button>'; };
      var f = state.f;
      var daysLbl = f.min_days ? f.min_days + '+ days' : 'Days running';
      return c('countries', (f.countries && f.countries.length === 1 ? SV.flag(f.countries[0]) + ' ' + f.countries[0] : 'Country'), 'globe', f.countries && f.countries.length > 1 ? f.countries.length : 0) +
        c('min_days', daysLbl, 'clock', f.min_days ? 1 : 0) + c('cta', 'Button', 'cursor', (f.cta || []).length) + c('media', 'Format', 'video', (f.media || []).length) +
        c('niche', 'Niche', 'fire', (f.niche || []).length) + c('platforms', 'Platform', 'eye', (f.platforms || []).length) + c('status', f.status === 'active' ? 'Active only' : f.status === 'inactive' ? 'Stopped' : 'Status', 'radar', f.status ? 1 : 0) +
        c('more', 'More', 'sliders', (f.domain ? 1 : 0) + (f.from ? 1 : 0) + (f.min_score ? 1 : 0)) +
        (Object.keys(f).some(function (k) { return k !== 'sort' && f[k] && (!Array.isArray(f[k]) || f[k].length); }) ? '<button class="chip" type="button" data-clear>' + I('x') + 'Clear</button>' : '');
    }
    function drawChips() {
      $('#filters').innerHTML = chipsHtml();
      SV.$$('#sorts button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === state.f.sort); });
      var u = [];
      if (state.f.q) u.push('“' + esc(state.f.q) + '”');
      (state.f.countries || []).forEach(function (c) { u.push(SV.flag(c) + ' ' + c); });
      if (state.f.min_days) u.push(state.f.min_days + '+ days');
      (state.f.cta || []).forEach(function (c) { var x = boot.ctas.find(function (k) { return k.id === c; }); u.push(x ? x.label : c); });
      (state.f.media || []).forEach(function (x) { u.push(x); }); (state.f.niche || []).forEach(function (x) { u.push(x); });
      if (state.f.status) u.push(state.f.status);
      $('#understood').innerHTML = state.fromAi && u.length ? '<span>' + I('spark', ' width="14" height="14" style="color:var(--violet)"') + ' Spyvoo understood:</span>' + u.map(function (x) { return '<span class="u">' + x + '</span>'; }).join('') : '';
    }
    function url() {
      var o = {}; FKEYS.forEach(function (k) { if (state.f[k] && (!Array.isArray(state.f[k]) || state.f[k].length)) o[k] = state.f[k]; });
      if (o.sort === 'score') delete o.sort;
      return '/app/discover' + SV.qs(o);
    }
    function load(reset) {
      // A new search always wins; "load more" waits for the current request.
      if (state.loading && !reset) return;
      var seq = state.seq = (state.seq || 0) + 1;
      state.loading = true;
      if (reset) { state.offset = 0; $('#results').innerHTML = SV.skelCards(8); $('#more').innerHTML = ''; history.replaceState({}, '', url()); drawChips(); }
      var params = Object.assign({}, state.f, { offset: state.offset, limit: 24 });
      if (state.relax) params.relax = 1;
      SV.get('/api/app/search' + SV.qs(params)).then(function (d) {
        if (seq !== state.seq) return;
        state.loading = false;
        var res = $('#results');
        if (reset) res.innerHTML = '';
        if (d.total !== undefined) { $('#count').textContent = SV.n(d.total); $('#countLbl').textContent = (d.total === 1 ? 'ad' : 'ads') + (d.relaxed ? ' (closest matches)' : ''); }
        if (reset && !d.items.length) {
          res.innerHTML = '<div style="grid-column:1/-1">' + empty(SV.scene('spy', 'think', [{ pos: 'left:6px;top:30px', c: 'var(--pink)', i: 'search' }, { pos: 'right:4px;top:60px', c: 'var(--violet)', i: 'filter' }]), 'No ads match that yet', 'Try fewer filters, another country, or a broader word. New ads arrive every few hours.', '<button class="btn" type="button" id="clearAll">Clear filters</button>') + '</div>';
          var ca = $('#clearAll'); if (ca) ca.onclick = function () { state.f = { sort: 'score' }; state.fromAi = false; $('#dq').value = ''; load(true); };
          return;
        }
        res.insertAdjacentHTML('beforeend', d.items.map(function (a) { return SV.adCard(a); }).join(''));
        state.offset = d.next;
        var more = $('#more');
        if (state.io) { state.io.disconnect(); state.io = null; }
        if (d.next != null) { more.innerHTML = '<button class="btn ghost" type="button">Load more</button>'; more.firstChild.onclick = function () { load(false); }; state.io = SV.onVisible(more, function () { if (state.offset) load(false); }); }
        else more.innerHTML = d.items.length ? '<span class="mut" style="font-weight:700">That’s everything. New ads arrive every few hours.</span>' : '';
        SV.refreshMeter();
      }).catch(function (e) {
        if (seq !== state.seq) return;
        state.loading = false;
        $('#results').innerHTML = '<div style="grid-column:1/-1">' + empty(SV.scene('host', 'sleep'), e.status === 402 ? 'You’ve used today’s searches' : 'Search failed', e.message, e.status === 402 ? '<a class="btn grad" href="/app/plan">' + I('crown') + 'See plans</a>' : '') + '</div>';
        if (e.status !== 402) SV.fail(e);
      });
    }
    function askAi(text) {
      if (!text.trim()) { delete state.f.q; state.fromAi = false; state.relax = false; return load(true); }
      if (state.io) { state.io.disconnect(); state.io = null; }
      $('#more').innerHTML = '';
      $('#results').innerHTML = SV.skelCards(8);
      SV.post('/api/app/ai-search', { text: text }).then(function (d) {
        var fl = d.filters, nf = { sort: fl.sort || state.f.sort || 'score' };
        ['q', 'countries', 'min_days', 'cta', 'media', 'niche', 'platforms', 'status'].forEach(function (k) { if (fl[k] !== undefined) nf[k] = fl[k]; });
        state.f = nf; state.fromAi = true; state.relax = true;
        load(true);
      }).catch(SV.fail);
    }
    $('#dform').onsubmit = function (e) { e.preventDefault(); askAi($('#dq').value); };
    SV.$$('#sorts button').forEach(function (b) { b.onclick = function () { state.f.sort = b.dataset.s; load(true); }; });
    $('#filters').addEventListener('click', function (e) {
      if (e.target.closest('[data-clear]')) { state.f = { sort: state.f.sort }; state.fromAi = false; state.relax = false; $('#dq').value = ''; return load(true); }
      var c = e.target.closest('[data-f]'); if (!c) return;
      openFilter(c, c.dataset.f);
    });
    function multi(anchor, key, title, opts, searchable) {
      var sel = (state.f[key] || []).slice();
      var p = SV.popover(anchor, '<h4>' + title + '</h4>' + (searchable ? '<input class="input" placeholder="Search…" style="margin-bottom:10px;padding:9px 12px" id="fsearch">' : '') + '<div class="opts">' + opts.map(function (o) { return '<button type="button" class="chip' + (sel.indexOf(o.id) >= 0 ? ' on' : '') + '" data-v="' + esc(o.id) + '" data-t="' + esc(o.label.toLowerCase()) + '">' + esc(o.label) + '</button>'; }).join('') + '</div><div class="row"><button class="btn ghost sm" type="button" data-reset>Reset</button><button class="btn sm" type="button" data-apply>Show ads</button></div>');
      p.addEventListener('click', function (e) {
        var b = e.target.closest('[data-v]');
        if (b) { var v = b.dataset.v, i = sel.indexOf(v); if (i >= 0) sel.splice(i, 1); else sel.push(v); b.classList.toggle('on'); }
        if (e.target.closest('[data-reset]')) { sel = []; SV.$$('[data-v]', p).forEach(function (x) { x.classList.remove('on'); }); }
        if (e.target.closest('[data-apply]')) { state.f[key] = sel; SV.closePop(); load(true); }
      });
      var s = p.querySelector('#fsearch');
      if (s) { s.focus(); s.oninput = function () { var t = s.value.toLowerCase(); SV.$$('[data-v]', p).forEach(function (x) { x.style.display = x.dataset.t.indexOf(t) >= 0 || x.dataset.v.toLowerCase() === t ? '' : 'none'; }); }; }
    }
    function single(anchor, key, title, opts) {
      var p = SV.popover(anchor, '<h4>' + title + '</h4><div class="opts">' + opts.map(function (o) { return '<button type="button" class="chip' + (String(state.f[key] || '') === String(o.id) ? ' on' : '') + '" data-v="' + esc(o.id) + '">' + esc(o.label) + '</button>'; }).join('') + '</div>');
      p.addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; if (b.dataset.v) state.f[key] = b.dataset.v; else delete state.f[key]; SV.closePop(); load(true); });
    }
    function openFilter(anchor, key) {
      if (key === 'countries') multi(anchor, 'countries', 'Countries', boot.countries.map(function (c) { return { id: c.code, label: c.flag + ' ' + c.name }; }), true);
      else if (key === 'min_days') single(anchor, 'min_days', 'Running for at least', [{ id: '', label: 'Any' }, { id: 7, label: '7+ days' }, { id: 14, label: '14+ days' }, { id: 30, label: '30+ days 🔥' }, { id: 60, label: '60+ days' }, { id: 90, label: '90+ days 🏆' }]);
      else if (key === 'cta') multi(anchor, 'cta', 'Call-to-action button', boot.ctas);
      else if (key === 'media') multi(anchor, 'media', 'Format', [{ id: 'video', label: 'Video' }, { id: 'image', label: 'Image' }, { id: 'carousel', label: 'Carousel' }]);
      else if (key === 'niche') multi(anchor, 'niche', 'Niche', boot.niches.map(function (n) { return { id: n, label: n }; }));
      else if (key === 'platforms') multi(anchor, 'platforms', 'Platform', Object.keys(boot.platforms).filter(function (p) { return boot.platforms[p] === 'live'; }).map(function (p) { return { id: p, label: p[0].toUpperCase() + p.slice(1) }; }));
      else if (key === 'status') single(anchor, 'status', 'Status', [{ id: '', label: 'All ads' }, { id: 'active', label: 'Still running' }, { id: 'inactive', label: 'Stopped' }]);
      else if (key === 'more') {
        var p = SV.popover(anchor, '<h4>More filters</h4><div class="grid" style="gap:10px"><div class="field"><label>Landing page domain</label><input class="input" id="fdom" placeholder="e.g. shopify.com" value="' + esc(state.f.domain || '') + '"></div><div class="field"><label>Started after</label><input class="input" type="date" id="ffrom" value="' + esc(state.f.from || '') + '"></div><div class="field"><label>Minimum winner score</label><input class="input" type="number" min="0" max="100" id="fscore" value="' + esc(state.f.min_score || '') + '" placeholder="e.g. 70"></div></div><div class="row"><button class="btn ghost sm" type="button" data-reset>Reset</button><button class="btn sm" type="button" data-apply>Show ads</button></div>');
        p.querySelector('[data-apply]').onclick = function () { state.f.domain = $('#fdom').value.trim(); state.f.from = $('#ffrom').value; state.f.min_score = $('#fscore').value; SV.closePop(); load(true); };
        p.querySelector('[data-reset]').onclick = function () { delete state.f.domain; delete state.f.from; delete state.f.min_score; SV.closePop(); load(true); };
      }
    }
    $('#saveSearch').onclick = function () {
      var name = state.f.q || (state.f.niche || [])[0] || 'My search';
      if (state.f.countries && state.f.countries.length) name += ' · ' + state.f.countries.join(', ');
      if (state.f.min_days) name += ' · ' + state.f.min_days + '+ days';
      var md = SV.modal('<span class="eyebrow">Saved search</span><h2 style="margin-top:8px">Get alerts for new matches</h2><p class="mut" style="font-weight:600">We check every few hours and tell you (in the app and by email) when new ads match.</p><div class="field"><label>Name</label><input class="input" id="ssn" value="' + esc(name) + '"></div><div class="actions"><button class="btn" id="ssgo">' + I('bell') + 'Save search</button></div>');
      md.el.querySelector('#ssgo').onclick = function () {
        SV.post('/api/app/searches', { name: md.el.querySelector('#ssn').value, query: state.f, alert: true }).then(function () { md.close(true); SV.toast('Saved. We’ll alert you about new matches.', { icon: 'bell', link: { href: '/app/alerts', label: 'Manage' } }); }).catch(SV.fail);
      };
    };
    if (saved) {
      SV.get('/api/app/searches').then(function (d) { var s = d.items.find(function (x) { return String(x.id) === saved; }); if (s) { state.f = Object.assign({ sort: 'score' }, s.query); } load(true); });
    } else if (ask) { askAi(ask); }
    else load(true);
    drawChips();
  });

  /* =================== ADVERTISER =================== */
  SV.route(/^\/app\/advertiser\/(\d+)$/, function (view, m) {
    view.innerHTML = '<div class="boot"><div class="boot-eyes"></div></div>';
    SV.get('/api/app/advertisers/' + m[1]).then(function (d) {
      var v = d.advertiser, max = Math.max.apply(null, v.weeks.map(function (w) { return w.launched; }).concat([1]));
      view.innerHTML = '<div class="fade-in"><a class="btn ghost sm" href="/app/discover">' + I('back') + 'Back</a>' +
        '<div class="page-head"><div class="adv-row">' + SV.logo({ name: v.name, logo: v.logo }).replace('class="logo"', 'class="logo" style="width:64px;height:64px;font-size:26px"') + '<div><span class="eyebrow">Advertiser</span><h1 style="margin-top:6px">' + esc(v.name) + '</h1><p>' + esc(v.category || 'Facebook page') + ' · tracked since ' + SV.date(v.first_seen_at) + '</p></div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (v.page_url ? '<a class="btn ghost" href="' + esc(v.page_url) + '" target="_blank" rel="noopener">' + I('ext') + 'Facebook page</a>' : '') + '<button class="btn' + (d.following ? ' ghost' : ' grad') + '" type="button" id="follow">' + I(d.following ? 'check' : 'bell') + (d.following ? 'Following' : 'Follow & get alerts') + '</button></div></div>' +
        '<div class="stats">' + [['Ads tracked', v.ads, '#1F5BFF'], ['Still running', v.active_ads, '#14C894'], ['Best score', v.best_score, '#FF3D8B'], ['Longest run', v.longest_days + ' days', '#FF9F1C']].map(function (s) { return '<div class="stat" style="--c:' + s[2] + '"><small>' + s[0] + '</small><b>' + s[1] + '</b></div>'; }).join('') + '</div>' +
        '<div class="adv-hero"><div class="panel"><h3 style="font-size:18px">New ads per week</h3><div class="chart">' + v.weeks.map(function (w, i) { return '<div><i style="height:' + Math.max(3, Math.round(w.launched / max * 100)) + '%;animation-delay:' + (i * .05) + 's" title="' + w.launched + ' ads"></i><small>' + (i % 3 === 0 ? w.week.slice(5) : '') + '</small></div>'; }).join('') + '</div></div>' +
        '<div class="panel"><h3 style="font-size:18px;margin-bottom:12px">Top countries</h3>' + (v.countries.length ? v.countries.map(function (c, i) { return '<div class="cbar"><span style="width:110px">' + c.flag + ' ' + esc(c.name) + '</span><span class="t"><i style="width:' + Math.round(c.ads / v.countries[0].ads * 100) + '%;--c:' + ['#1F5BFF', '#7B5CFF', '#FF3D8B', '#FF9F1C', '#14C894'][i % 5] + '"></i></span><b class="tnum">' + c.ads + '</b></div>'; }).join('') : '<p class="mut">No country data yet.</p>') + '</div></div>' +
        '<section class="sec">' + secHead('All their ads', 'layers', 'var(--blue)') + '<div class="cards" id="advAds">' + SV.skelCards(4) + '</div></section></div>';
      $('#follow').onclick = function () {
        var on = !d.following, b = this;
        SV.post('/api/app/advertisers/' + v.id + '/follow', { on: on }).then(function () {
          d.following = on; b.className = 'btn' + (on ? ' ghost' : ' grad'); b.innerHTML = I(on ? 'check' : 'bell') + (on ? 'Following' : 'Follow & get alerts');
          if (on) { SV.toast('You’ll hear when ' + v.name + ' launches new ads', { icon: 'bell' }); var r = b.getBoundingClientRect(); SV.confetti(r.left + r.width / 2, r.top, 40); }
        }).catch(SV.fail);
      };
      SV.get('/api/app/search?advertiser_id=' + v.id + '&limit=48&sort=new').then(function (r) { $('#advAds').innerHTML = r.items.map(function (a) { return SV.adCard(a); }).join(''); });
    }).catch(function (e) { view.innerHTML = empty(SV.scene('spy', 'think'), 'Advertiser not found', e.message); });
  });

  /* =================== BOARDS =================== */
  SV.newBoard = function (then) {
    var md = SV.modal('<span class="eyebrow">New board</span><h2 style="margin-top:8px">Name your swipe file</h2><div class="field" style="margin-top:12px"><label>Board name</label><input class="input" id="bn" placeholder="e.g. Crypto hooks that work" autofocus></div><div class="field" style="margin-top:10px"><label>Pick an emoji</label><div class="opts" id="bem">' + ['⭐', '🔥', '💰', '🎯', '🧠', '🚀', '💎', '📈'].map(function (x, i) { return '<button type="button" class="chip' + (i === 0 ? ' on' : '') + '" data-e="' + x + '">' + x + '</button>'; }).join('') + '</div></div><div class="actions"><button class="btn" id="bgo">' + I('plus') + 'Create board</button></div>');
    var em = '⭐';
    md.el.querySelector('#bem').onclick = function (e) { var b = e.target.closest('[data-e]'); if (!b) return; em = b.dataset.e; SV.$$('[data-e]', md.el).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    md.el.querySelector('#bn').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); md.el.querySelector('#bgo').click(); } };
    md.el.querySelector('#bgo').onclick = function () {
      SV.post('/api/app/boards', { name: md.el.querySelector('#bn').value, emoji: em }).then(function (b) { md.close(true); SV.toast('Board created', { icon: 'boards' }); if (then) then(b); }).catch(SV.fail);
    };
  };
  SV.route(/^\/app\/boards$/, function (view) {
    view.innerHTML = '<div class="page-head"><div><span class="eyebrow">Boards</span><h1>Your swipe files</h1><p>Save winners, add notes, share a board with your team or a client.</p></div><button class="btn" type="button" id="nb">' + I('plus') + 'New board</button></div><div class="boards stagger" id="boards"></div>';
    $('#nb').onclick = function () { SV.newBoard(function (b) { SV.go('/app/boards/' + b.id); }); };
    SV.get('/api/app/boards').then(function (d) {
      if (!d.items.length) {
        $('#boards').outerHTML = empty(SV.scene('fan', 'wave', [{ pos: 'left:0;top:40px', c: 'var(--pink)', i: 'heart' }, { pos: 'right:0;top:20px', c: 'var(--orange)', i: 'boards' }]), 'No boards yet', 'Tap the heart on any ad to save it. Your first board is created for you.', '<a class="btn" href="/app/discover">' + I('search') + 'Find ads to save</a>');
        return;
      }
      $('#boards').innerHTML = d.items.map(function (b) {
        var cov = b.covers.length ? b.covers.slice(0, 3).map(function (c) { return '<img src="' + esc(c) + '" alt="" loading="lazy">'; }).join('') : '';
        return '<a class="board" href="/app/boards/' + b.id + '"><div class="cov' + (cov ? ' n' + Math.min(3, b.covers.length) : ' empty-cov') + '">' + (cov || '<span style="font-size:40px">' + esc(b.emoji || '⭐') + '</span>') + '</div><b>' + esc((b.emoji ? b.emoji + ' ' : '') + b.name) + '</b><small>' + b.count + ' ad' + (b.count === 1 ? '' : 's') + (b.share_url ? ' · ' + I('link', ' width="13" height="13"') + 'shared' : '') + '</small></a>';
      }).join('') + '<button class="board new" type="button" id="nb2">' + I('plus', ' width="28" height="28"') + '<span>New board</span></button>';
      $('#nb2').onclick = function () { SV.newBoard(function (b) { SV.go('/app/boards/' + b.id); }); };
    }).catch(SV.fail);
  });
  SV.route(/^\/app\/boards\/(\d+)$/, function (view, m) {
    SV.state.boardId = Number(m[1]);
    view.innerHTML = '<div class="boot"><div class="boot-eyes"></div></div>';
    SV.get('/api/app/boards/' + m[1]).then(function (d) {
      var b = d.board;
      view.innerHTML = '<div class="fade-in"><a class="btn ghost sm" href="/app/boards">' + I('back') + 'All boards</a><div class="page-head"><div><span class="eyebrow">Board</span><h1 style="margin-top:6px">' + esc((b.emoji ? b.emoji + ' ' : '') + b.name) + '</h1><p id="bcount">' + b.count + ' saved ad' + (b.count === 1 ? '' : 's') + '</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" id="share">' + I('share') + (b.share_url ? 'Shared · copy link' : 'Share board') + '</button><button class="btn ghost" type="button" id="ren">' + I('edit') + 'Rename</button><button class="btn ghost" type="button" id="del">' + I('trash') + 'Delete</button></div></div>' +
        (d.items.length ? '<div class="cards" id="bitems">' + d.items.map(function (a) { return SV.adCard(a, { note: a.note }); }).join('') + '</div>' : empty(SV.scene('host', 'point'), 'This board is empty', 'Open any ad and tap “Save to board”, or tap the heart on a card.', '<a class="btn" href="/app/discover">Find ads</a>')) + '</div>';
      $('#share').onclick = function () {
        if (b.share_url) {
          var md = SV.modal('<span class="eyebrow">Shared board</span><h2 style="margin-top:8px">Anyone with the link can view it</h2><div class="field" style="margin-top:12px"><input class="input" readonly value="' + esc(b.share_url) + '"></div><div class="actions"><button class="btn ghost" id="unshare">Stop sharing</button><button class="btn" id="cp">' + I('copy') + 'Copy link</button></div>');
          md.el.querySelector('#cp').onclick = function () { SV.copy(b.share_url, 'Link'); };
          md.el.querySelector('#unshare').onclick = function () { SV.api('PATCH', '/api/app/boards/' + b.id, { share: false }).then(function () { md.close(true); SV.render(); }); };
        } else SV.api('PATCH', '/api/app/boards/' + b.id, { share: true }).then(function (nb) { SV.copy(nb.share_url, 'Share link'); SV.render(); }).catch(SV.fail);
      };
      $('#ren').onclick = function () {
        var md = SV.modal('<h2>Rename board</h2><div class="field" style="margin-top:12px"><input class="input" id="rn" value="' + esc(b.name) + '"></div><div class="actions"><button class="btn" id="rgo">Save</button></div>');
        md.el.querySelector('#rgo').onclick = function () { SV.api('PATCH', '/api/app/boards/' + b.id, { name: md.el.querySelector('#rn').value }).then(function () { md.close(true); SV.render(); }).catch(SV.fail); };
      };
      $('#del').onclick = function () { SV.confirm('Delete “' + b.name + '”?', 'The ads stay in Spyvoo; only this board and its notes are removed.', 'Delete board', true).then(function (ok) { if (ok) SV.api('DELETE', '/api/app/boards/' + b.id).then(function () { SV.go('/app/boards'); }); }); };
    }).catch(function (e) { view.innerHTML = empty(SV.scene('spy', 'think'), 'Board not found', e.message); });
  });

  /* =================== ALERTS =================== */
  SV.route(/^\/app\/alerts$/, function (view) {
    view.innerHTML = '<div class="page-head"><div><span class="eyebrow">Alerts</span><h1>Your radar</h1><p>Competitors you follow, searches you saved, and everything new.</p></div><button class="btn ghost" type="button" id="readAll">' + I('check') + 'Mark all read</button></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));align-items:start"><div class="panel"><h3 style="font-size:19px;margin-bottom:6px">Notifications</h3><div class="list" id="notifs"></div></div>' +
      '<div class="grid"><div class="panel"><h3 style="font-size:19px;margin-bottom:6px">Following</h3><div class="list" id="following"></div></div><div class="panel"><h3 style="font-size:19px;margin-bottom:6px">Saved searches</h3><div class="list" id="searches"></div></div></div></div>';
    $('#readAll').onclick = function () { SV.post('/api/app/notifications/read', {}).then(function () { SV.render(); SV.refreshMeter(); }); };
    SV.get('/api/app/notifications').then(function (d) {
      $('#notifs').innerHTML = d.items.length ? d.items.map(function (n) {
        return '<a class="li' + (n.read ? '' : ' unread') + '" href="' + esc(n.url || '/app') + '" data-n="' + n.id + '">' + (n.image ? '<img class="thumbsm" src="' + esc(n.image) + '" alt="">' : SV.tile(n.kind === 'billing' ? 'card' : n.kind === 'search' ? 'search' : n.kind === 'advertiser' ? 'radar' : 'bell', n.kind === 'billing' ? 'var(--mint)' : n.kind === 'search' ? 'var(--violet)' : 'var(--blue)', 46)) + '<span class="grow"><b>' + esc(n.title) + '</b><small>' + esc(n.body) + '</small></span><small>' + SV.ago(n.created_at) + '</small></a>';
      }).join('') : empty(SV.scene('host', 'sleep'), 'All quiet', 'Follow an advertiser or save a search and alerts land here.');
      SV.$$('[data-n]').forEach(function (a) { a.addEventListener('click', function () { SV.post('/api/app/notifications/read', { id: Number(a.dataset.n) }); }); });
    });
    SV.get('/api/app/following').then(function (d) {
      $('#following').innerHTML = d.items.length ? d.items.map(function (v) {
        return '<div class="li">' + SV.logo(v) + '<a class="grow" href="/app/advertiser/' + v.id + '"><b>' + esc(v.name) + '</b><small>' + v.active_ads + ' running' + (v.new_this_week ? ' · <span style="color:var(--pink);font-weight:800">' + v.new_this_week + ' new this week</span>' : '') + '</small></a><button class="btn ghost sm" type="button" data-unf="' + v.id + '">Unfollow</button></div>';
      }).join('') : '<p class="mut" style="font-weight:600">You’re not following anyone yet. Open an ad and tap <b>Follow</b>.</p>';
      SV.$$('[data-unf]').forEach(function (b) { b.onclick = function () { SV.post('/api/app/advertisers/' + b.dataset.unf + '/follow', { on: false }).then(function () { b.closest('.li').remove(); }); }; });
    });
    SV.get('/api/app/searches').then(function (d) {
      $('#searches').innerHTML = d.items.length ? d.items.map(function (s) {
        return '<div class="li">' + SV.tile('search', 'var(--violet)', 46) + '<a class="grow" href="/app/discover?saved=' + s.id + '"><b>' + esc(s.name) + '</b><small>Saved ' + SV.ago(s.created_at) + '</small></a><button class="toggle" type="button" role="switch" aria-label="Alerts" aria-checked="' + s.alert + '" data-al="' + s.id + '"></button><button class="icon-btn" style="width:36px;height:36px" type="button" aria-label="Delete" data-ds="' + s.id + '">' + I('trash') + '</button></div>';
      }).join('') : '<p class="mut" style="font-weight:600">On Discover, tap <b>Save & get alerts</b> to watch a search.</p>';
      SV.$$('[data-al]').forEach(function (t) { t.onclick = function () { var on = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', on); SV.api('PATCH', '/api/app/searches/' + t.dataset.al, { alert: on }); }; });
      SV.$$('[data-ds]').forEach(function (b) { b.onclick = function () { SV.api('DELETE', '/api/app/searches/' + b.dataset.ds).then(function () { b.closest('.li').remove(); }); }; });
    });
  });

  /* =================== SCRIPTS =================== */
  SV.route(/^\/app\/scripts$/, function (view) {
    view.innerHTML = '<div class="page-head"><div><span class="eyebrow">AI studio</span><h1>Your “Make it mine” scripts</h1><p>Fresh ad scripts and headlines, inspired by winners, never copied.</p></div><a class="btn grad" href="/app/discover?sort=score">' + I('wand') + 'Make a new one</a></div><div id="scripts" class="grid"></div>';
    SV.get('/api/app/scripts').then(function (d) {
      $('#scripts').innerHTML = d.items.length ? d.items.map(function (s) {
        return '<div class="panel fade-in"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><span class="eyebrow">' + SV.ago(s.created_at) + (s.product ? ' · for ' + esc(s.product) : '') + '</span><h3 style="font-size:18px;margin-top:6px">Inspired by: “' + esc(s.ad) + '”</h3></div><button class="btn ghost sm" type="button" data-open="' + s.ad_id + '">' + I('eye') + 'Original ad</button></div>' +
          '<div class="scripts">' + (s.scripts || []).map(function (x) { return '<div class="script"><b>' + esc(x.title) + '</b><q>' + esc(x.hook) + '</q><p>' + esc(x.body) + '</p></div>'; }).join('') + '</div><div class="heads">' + (s.headlines || []).map(function (h) { return '<span>' + esc(h) + '</span>'; }).join('') + '</div></div>';
      }).join('') : empty(SV.scene('guide', 'phone', [{ pos: 'left:0;top:30px', c: 'var(--violet)', i: 'wand' }]), 'No scripts yet', 'Open any winning ad and tap “Make it mine”. The AI writes 3 scripts and 5 headlines for your product.', '<a class="btn" href="/app/discover?sort=score">Find a winner</a>');
      SV.$$('[data-open]').forEach(function (b) { b.onclick = function () { SV.openAd(Number(b.dataset.open)); }; });
    });
  });
})();
