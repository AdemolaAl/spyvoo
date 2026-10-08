/* Landing page: live data (offer, numbers, plans, featured winners, Voo family), the laptop demo, the
   before/after slider and the try-it search. Everything degrades to the designed defaults if the API is slow. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var flag = function (c) { return /^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint.apply(null, c.split('').map(function (ch) { return 0x1F1E6 + ch.charCodeAt(0) - 65; })) : '🌍'; };
  var IMGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return '/img/ads/' + i + '.webp'; });
  var featured = [];

  function get(u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.json(); }); }

  /* ---------- site data ---------- */
  get('/api/public/site').then(function (s) {
    offer(s.offer);
    numbers(s.stats);
    var lp = $('#livePill'); if (lp && s.stats && s.stats.ads >= 1000) lp.innerHTML = '<b class="tnum">' + s.stats.ads.toLocaleString('en-US') + '</b> ads tracked' + (s.stats.today ? ', <b class="tnum">' + s.stats.today.toLocaleString('en-US') + '</b> new today' : '');
    plans(s.plans, s.offer);
    family(s.family);
    var c = s.company || {};
    var leg = document.querySelector('.foot .legal span'); if (leg) leg.textContent = '© ' + new Date().getFullYear() + ' ' + (c.name || 'Zedapex Limited');
  }).catch(function () { numbers(null); family(null); });

  function offer(o) {
    var bar = $('#offerbar');
    if (!bar || !o) return;
    try { if (sessionStorage.getItem('sv-offer-x') === o.code) return; } catch (e) { /* ignore */ }
    bar.innerHTML = '<span class="ob-badge">' + esc(o.badge || 'Offer') + '</span><span>' + esc(o.title) + ': ' + esc(o.text) + ' Code <code>' + esc(o.code) + '</code></span>' + (o.ends_at ? '<span class="ob-cd" id="obcd"></span>' : '') + '<a href="#start" data-auth="up">Claim it →</a><button class="ob-x" type="button" aria-label="Hide offer">×</button>';
    bar.hidden = false;
    bar.querySelector('.ob-x').onclick = function () { bar.hidden = true; try { sessionStorage.setItem('sv-offer-x', o.code); } catch (e) { /* ignore */ } };
    if (o.ends_at) { var el = $('#obcd'), end = new Date(o.ends_at).getTime(); var t = setInterval(function () { var s = Math.max(0, Math.floor((end - Date.now()) / 1000)); el.textContent = 'Ends in ' + Math.floor(s / 86400) + 'd ' + String(Math.floor(s % 86400 / 3600)).padStart(2, '0') + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); if (!s) clearInterval(t); }, 1000); }
  }

  // Real numbers once there is real volume; until then, promises that are true from day one.
  function numbers(st) {
    var g = $('#liveGrid'); if (!g) return;
    var cards = st && st.ads >= 1000
      ? [[st.ads, 'ads tracked', '#1F5BFF', 1], [st.active, 'running right now', '#FF3D8B', 1], [st.advertisers, 'advertisers', '#7B5CFF', 1], [st.countries, 'countries', '#14C894', 1]]
      : [['Every', 'country Meta runs ads in', '#1F5BFF'], ['Forever', 'ads are saved, even after Meta deletes them', '#FF3D8B'], ['6 h', 'between fresh scrapes', '#7B5CFF'], ['30 s', 'to your first winning ad', '#14C894']];
    g.innerHTML = cards.map(function (c, i) { return '<div style="--c:' + c[2] + '"><b class="tnum" data-n="' + (c[3] ? c[0] : '') + '">' + (c[3] ? '0' : esc(c[0])) + '</b><span>' + (i === 1 && c[3] ? '<i class="dot"></i>' : '') + esc(c[1]) + '</span></div>'; }).join('');
    g.querySelectorAll('[data-n]').forEach(function (b) {
      var target = Number(b.dataset.n); if (!target) return;
      var io = new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) return; io.disconnect();
        var t0 = performance.now();
        (function step(t) { var p = Math.min(1, (t - t0) / 1600); b.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US'); if (p < 1) requestAnimationFrame(step); })(t0);
      });
      io.observe(b);
    });
  }

  function plans(list, o) {
    if (!list || !list.length || !window.__drawPlans) return;
    window.__PLANS = list.map(function (p) { return { id: p.id, n: p.name, m: p.price_month, y: p.price_year, pop: p.popular, who: p.tagline, f: p.features, cta: p.price_month ? 'Choose ' + p.name : 'Start free', off: o && (o.plans || []).indexOf(p.id) >= 0 ? o : null }; });
    window.__drawPlans();
  }

  /* ---------- all features ---------- */
  var FEATS = [
    ['Saved forever', 'Meta deletes ads and links expire. Spyvoo keeps every video and image.', '#1F5BFF', 'shield'],
    ['Live status', 'See which ads are still running, and since when, at a glance.', '#14C894', 'radar'],
    ['Hook finder', 'The AI pulls out the first line or first 3 seconds of every winner.', '#FF3D8B', 'magnet'],
    ['Creative tests', 'See every variation an advertiser runs of the same ad.', '#7B5CFF', 'layers'],
    ['Landing pages', 'One tap to the page every ad sends traffic to.', '#FF9F1C', 'link'],
    ['Timeline', 'When it started, when it stopped, how fast they scaled.', '#0FA3B1', 'chart'],
    ['Share boards', 'Swipe files your team or client can open with one link.', '#5B3DF5', 'share'],
    ['Email + in-app alerts', 'Get told when a competitor launches new ads.', '#E5484D', 'bell']
  ];
  var af = $('#allf');
  if (af) af.innerHTML = FEATS.map(function (f) { return '<div class="af" style="--c:' + f[2] + '">' + window.SV.tile(f[3], f[2], 52) + '<b>' + f[0] + '</b><p>' + f[1] + '</p></div>'; }).join('');

  /* ---------- Voo family slides ---------- */
  var DEFAULT_FAM = [
    { key: 'joinvoo', name: 'Joinvoo', tag: 'Tracking', title: 'Track every lead. Kill every fake.', text: 'Tracks every real Telegram join, sign-up and deposit and feeds it back to Meta, so your ads buy quality.', perk: 'First 500 joins free', url: 'https://joinvoo.com', color: '#5B3DF5' },
    { key: 'replyvoo', name: 'Replyvoo', tag: 'New', title: 'Sky-rocket your sales. On autopilot.', text: 'AI Closers answer every chat in seconds and send the payment link while you sleep.', perk: '30 free chats a month', url: 'https://replyvoo.com', color: '#121110', accent: '#FFC21A' }
  ];
  var VIS = {
    joinvoo: function () { return '<div class="vf-vis v-join"><span class="gate"></span>' + ['🧑🏽', '👩🏻', '🧔🏾', '👩🏽‍🦱'].map(function (f, i) { return '<span class="av" style="top:' + (10 + (i % 2) * 44) + 'px;animation-delay:-' + (i * 1.25) + 's">' + f + '</span>'; }).join('') + '<span class="av bot" style="top:32px;animation-delay:-2.4s;background:#FF5A5F">🤖</span></div>'; },
    replyvoo: function () { return '<div class="vf-vis v-reply"><span class="bub b1">How much is the black dress? 👗</span><span class="bub me b2">$45, free delivery today. Want the link? ✨</span></div>'; },
    castvoo: function () { return '<div class="vf-vis v-cast"><span class="wave"></span><span class="wave"></span><span class="wave"></span>' + [130, 200, 270, 340].map(function (x, i) { return '<span class="ph" style="left:' + x + 'px;animation-delay:' + (i * .3) + 's"></span>'; }).join('') + '</div>'; },
    vooads: function () { var s = ''; for (var i = 0; i < 10; i++) s += '<span class="fr" style="left:' + (12 + i * 66) + 'px;background-image:url(' + IMGS[i] + ')"></span>'; return '<div class="vf-vis v-ads">' + s + '</div>'; },
    gatevoo: function () { return '<div class="vf-vis v-gate"><span class="coin" style="left:30%;background:#26A17B">₮</span><span class="coin" style="left:50%;background:#F7931A;animation-delay:1s">₿</span><span class="coin" style="left:65%;background:#26A17B;animation-delay:2s">₮</span><span class="wallet">Your wallet</span></div>'; },
    affleego: function () { return '<div class="vf-vis v-aff">' + [['IQ Option', '$1,200 CPA'], ['1win', '50% RevShare'], ['Pocket Option', '$900 CPA']].map(function (d, i) { return '<span class="deal" style="animation-delay:' + (i * .45) + 's"><b>' + d[0] + '</b><i>' + d[1] + '</i></span>'; }).join('') + '</div>'; },
    voosquare: function () { return '<div class="vf-vis v-sq">' + ['#fff', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.7)', '#C8F75A'].map(function (c, i) { return '<span class="sq" style="background:' + c + ';left:' + (40 + (i % 2) * 38) + 'px;top:' + (14 + Math.floor(i / 2) * 36) + 'px;animation-delay:' + (i * .3) + 's"></span>'; }).join('') + '<span style="position:absolute;left:140px;top:30px;font:800 26px/1 var(--display);letter-spacing:-.04em">Voo<span style="color:#C8F75A">Square</span></span></div>'; }
  };
  var BRANDS = ['joinvoo', 'replyvoo', 'castvoo', 'vooads', 'gatevoo', 'voosquare', 'affleego'];
  var mark = function (f) { return BRANDS.indexOf(f.key) >= 0 ? '<img src="/img/brands/' + f.key + '.svg" alt="" width="44" height="44">' : esc(f.name[0]); };
  function family(list) {
    var tr = $('#vfTrack'), dots = $('#vfDots'); if (!tr) return;
    list = list && list.length ? list : DEFAULT_FAM;
    tr.innerHTML = list.map(function (f) {
      var acc = f.accent ? '--acc:' + f.accent + ';--acc-ink:' + f.color + ';' : '';
      var url = f.url + (f.url.indexOf('?') < 0 ? '?' : '&') + 'utm_source=spyvoo&utm_medium=website';
      return '<article class="vf" style="--c:' + esc(f.color) + ';--fg:' + esc(f.ink || '#fff') + ';' + acc + '"><span class="glow"></span><div class="vf-top"><span class="vf-logo">' + (BRANDS.indexOf(f.key) >= 0 ? '<img src="/img/brands/' + f.key + '.svg" alt="" width="46" height="46">' : esc(f.name[0])) + '</span><span class="vf-name">' + esc(f.name) + '</span><span class="vf-tag">' + esc(f.tag) + '</span></div><h3>' + esc(f.title) + '</h3><p>' + esc(f.text) + '</p>' + (VIS[f.key] || VIS.voosquare)() + '<div class="vf-foot"><a href="' + esc(url) + '" target="_blank" rel="noopener">Try ' + esc(f.name) + ' →</a><span>' + esc(f.perk) + '</span></div></article>';
    }).join('');
    var cards = tr.querySelectorAll('.vf');
    dots.innerHTML = Array.prototype.map.call(cards, function (_, i) { return '<button type="button" aria-label="Slide ' + (i + 1) + '"></button>'; }).join('');
    var db = dots.querySelectorAll('button'), idx = 0, paused = false;
    var pad = function () { return parseFloat(getComputedStyle(tr).paddingLeft) || 0; };
    var startOf = function (c) { return c.getBoundingClientRect().left - tr.getBoundingClientRect().left + tr.scrollLeft - pad(); };
    var maxScroll = function () { return tr.scrollWidth - tr.clientWidth; };
    function to(i) { idx = (i + cards.length) % cards.length; tr.scrollTo({ left: Math.min(maxScroll(), Math.max(0, startOf(cards[idx]))), behavior: 'smooth' }); mark(); hold(); }
    function mark() { db.forEach(function (d, j) { d.classList.toggle('on', j === idx); }); }
    // After a tap, autoplay waits a few seconds so it doesn't jump away from what you picked.
    var holdUntil = 0; function hold() { holdUntil = Date.now() + 9000; }
    db.forEach(function (d, j) { d.onclick = function () { to(j); }; });
    var lock = 0;
    tr.addEventListener('scroll', function () {
      clearTimeout(lock); lock = setTimeout(function () {
        if (tr.scrollLeft >= maxScroll() - 4 && Math.abs(startOf(cards[idx]) - tr.scrollLeft) > 8) { /* reached the end: keep the picked dot if it can't scroll further */ }
        var best = idx, dist = 1e9; cards.forEach(function (c, j) { var d = Math.abs(startOf(c) - tr.scrollLeft); if (d < dist) { dist = d; best = j; } });
        if (tr.scrollLeft >= maxScroll() - 4 && startOf(cards[idx]) >= tr.scrollLeft - 4) best = idx;
        idx = best; mark();
      }, 90);
    }, { passive: true });
    // Arrows + drag to swipe with a mouse.
    var wrap = tr.parentNode;
    if (wrap && !wrap.querySelector('.vf-nav')) {
      var nav = document.createElement('div'); nav.className = 'vf-nav';
      nav.innerHTML = '<button type="button" aria-label="Previous">‹</button><button type="button" aria-label="Next">›</button>';
      dots.parentNode.insertBefore(nav, dots);
      nav.children[0].onclick = function () { to(tr.scrollLeft <= 4 ? cards.length - 1 : idx - 1); }; nav.children[1].onclick = function () { to(tr.scrollLeft >= maxScroll() - 4 ? 0 : idx + 1); };
    }
    var dragX = null, startScroll = 0, moved = false;
    tr.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; dragX = e.clientX; startScroll = tr.scrollLeft; moved = false; tr.style.scrollSnapType = 'none'; tr.style.scrollBehavior = 'auto'; });
    window.addEventListener('pointermove', function (e) { if (dragX === null) return; var dx = e.clientX - dragX; if (Math.abs(dx) > 4) moved = true; tr.scrollLeft = startScroll - dx; });
    window.addEventListener('pointerup', function () { if (dragX === null) return; dragX = null; tr.style.scrollSnapType = ''; tr.style.scrollBehavior = ''; if (moved) { hold(); var best = 0, dist = 1e9; cards.forEach(function (c, j) { var d = Math.abs(startOf(c) - tr.scrollLeft); if (d < dist) { dist = d; best = j; } }); to(best); } });
    tr.addEventListener('click', function (e) { if (moved) { e.preventDefault(); moved = false; } }, true);
    ['mouseenter', 'touchstart'].forEach(function (e) { tr.addEventListener(e, function () { paused = true; }, { passive: true }); });
    ['mouseleave', 'touchend'].forEach(function (e) { tr.addEventListener(e, function () { paused = false; }, { passive: true }); });
    mark();
    if (!reduce) setInterval(function () { if (!paused && !document.hidden && Date.now() > holdUntil) { to(idx + 1); holdUntil = 0; } }, 5000);
  }

  /* ---------- featured winners: feed the demo, the compare grid, and the wall when there is real data ---------- */
  get('/api/public/featured').then(function (d) { var seen = {}; featured = (d.items || []).filter(function (a) { if (seen[a.thumb]) return false; seen[a.thumb] = 1; return true; }); fillCompare(); demo(); }).catch(function () { fillCompare(); demo(); });
  function pick(i) { var a = featured[i % (featured.length || 1)]; return a ? { img: a.thumb, days: a.days, score: a.score, name: a.advertiser } : { img: IMGS[i % 10], days: [74, 121, 33, 92, 64, 88][i % 6], score: [94, 92, 81, 90, 87, 89][i % 6], name: ['Lumora Skin', 'TradeNest', 'Kora Coffee', 'PixelPay', 'SkillForge', 'CoinHarbor'][i % 6] }; }
  function fillCompare() {
    var g = $('#cmpGrid'); if (!g) return;
    var h = ''; for (var i = 0; i < 6; i++) { var a = pick(i); h += '<div class="ng"><div class="ni" style="background-image:url(\'' + esc(a.img) + '\')"><b>' + a.days + ' days</b><s>' + a.score + '</s></div><small>' + esc(a.name) + '</small></div>'; }
    g.innerHTML = h;
  }

  /* ---------- before / after slider ---------- */
  var range = $('#cmpRange'), after = $('#cmpAfter'), handle = $('#cmpHandle'), touched = false;
  function setCmp(v) { after.style.clipPath = 'inset(0 0 0 ' + v + '%)'; handle.style.left = v + '%'; }
  if (range) {
    range.addEventListener('input', function () { touched = true; setCmp(range.value); });
    var t0 = null;
    if (!reduce) (function sweep(t) { if (touched) return; if (t0 == null) t0 = t; var v = 50 + Math.sin((t - t0) / 1400) * 30; range.value = v; setCmp(v); requestAnimationFrame(sweep); })(performance.now());
    else setCmp(50);
  }

  /* ---------- laptop demo: a scripted loop on the mini dashboard ---------- */
  function demo() {
    var mini = document.querySelector('.mini'), grid = $('#miniGrid'), typed = $('#miniTyped'), cur = document.querySelector('.mini-cursor');
    if (!mini || !grid) return;
    var steps = document.querySelectorAll('.demo-steps div');
    var Q = 'crypto ads in Brazil over 30 days';
    var cards = ''; for (var i = 0; i < 8; i++) { var a = pick(i); cards += '<div class="mg"><div class="mi" style="background-image:url(\'' + esc(a.img) + '\')"><b>' + a.days + 'd</b><s>' + a.score + '</s></div><i></i><i></i></div>'; }
    grid.innerHTML = cards;
    var mgs = grid.querySelectorAll('.mg');
    function at(el, dx, dy) { var r = el.getBoundingClientRect(), m = mini.getBoundingClientRect(); cur.style.transform = 'translate(' + (r.left - m.left - 54 + (dx || r.width / 2)) + 'px,' + (r.top - m.top + (dy || r.height / 2)) + 'px)'; }
    function stepOn(n) { steps.forEach(function (s, j) { s.classList.toggle('on', j === n); }); }
    function loop() {
      mini.className = 'mini'; typed.textContent = ''; mgs.forEach(function (m) { m.classList.remove('in', 'hot'); });
      stepOn(0); at(document.querySelector('.mini-search'), 30);
      var k = 0;
      var ty = setInterval(function () { typed.textContent = Q.slice(0, ++k); if (k >= Q.length) { clearInterval(ty); after1(); } }, 55);
      function after1() {
        setTimeout(function () { at(document.querySelector('.mini-spy')); }, 200);
        setTimeout(function () { mini.classList.add('s1'); mgs.forEach(function (m, i) { setTimeout(function () { m.classList.add('in'); }, i * 110); }); stepOn(1); }, 900);
        setTimeout(function () { at(mgs[0]); mgs[0].classList.add('hot'); }, 2300);
        setTimeout(function () { mini.classList.add('s3'); stepOn(2); }, 3400);
        setTimeout(function () { mini.classList.add('s4'); at(document.querySelector('.md-ai')); }, 4300);
        setTimeout(function () { stepOn(3); }, 6200);
        setTimeout(loop, 8600);
      }
    }
    if (reduce) { mini.classList.add('s1', 's3', 's4'); typed.textContent = Q; mgs.forEach(function (m) { m.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); loop(); } }, { threshold: .3 });
    io.observe(mini);
  }

  /* ---------- try it ---------- */
  var tf = $('#tryForm'), out = $('#tryResults');
  function search(q) {
    out.innerHTML = '<div class="try-empty">Spying…</div>';
    get('/api/public/search?q=' + encodeURIComponent(q)).then(function (d) {
      if (!d.items.length) { out.innerHTML = '<div class="try-empty">Nothing yet for that. Try a niche and a country, like “skincare in Mexico”.</div>'; return; }
      var locked = d.items.filter(function (a) { return a.locked; }).length;
      out.innerHTML = d.items.map(function (a) {
        if (a.locked) return '<div class="tr locked"><div class="ti" style="background-image:url(\'' + esc(a.thumb) + '\')"><b>' + a.days + ' days</b><s>' + a.score + '</s></div><strong>Hidden advertiser</strong><p>Sign up free to see who runs this ad and what it says.</p></div>';
        return '<div class="tr"><div class="ti" style="background-image:url(\'' + esc(a.thumb) + '\')"><b>' + a.days + ' days</b><s>' + a.score + '</s></div><strong>' + esc(a.advertiser) + ' ' + (a.countries || []).slice(0, 3).map(flag).join('') + '</strong><p>' + esc(a.text || a.headline) + '</p></div>';
      }).join('') + (locked || d.total > d.items.length ? '<div class="try-lock"><b>' + (d.total || d.items.length) + ' ads match. See them all free.</b><span style="font-weight:700;color:var(--mut)">Free plan, no card.</span><a class="btn btn-blue" href="#start" data-auth="up">Unlock all results →</a></div>' : '<div class="try-lock"><b>Want an alert when new ads like these go live?</b><span style="font-weight:700;color:var(--mut)">Free plan, no card.</span><a class="btn btn-blue" href="#start" data-auth="up">Start spying free →</a></div>');
    }).catch(function () { out.innerHTML = '<div class="try-empty">Search is busy. Try again in a moment.</div>'; });
  }
  if (tf) {
    tf.addEventListener('submit', function (e) { e.preventDefault(); search($('#tryQ').value || 'crypto ads in Brazil over 30 days'); });
    document.querySelectorAll('.try-chips button').forEach(function (b) { b.onclick = function () { $('#tryQ').value = b.textContent; search(b.textContent); }; });
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); search('crypto ads in Brazil over 30 days'); } });
    io.observe(tf);
  }
})();
