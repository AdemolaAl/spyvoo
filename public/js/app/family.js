/* "More from Zedapex": swipeable slides that sell the other Voo tools, each with its own little animation.
   Slides come from Admin → Voo family, so names, words, colours and links change without code. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I;

  var VIS = {
    joinvoo: function () {
      var faces = ['🧑🏽', '👩🏻', '🧔🏾', '👩🏽‍🦱'], out = '<span class="gate"></span>';
      faces.forEach(function (f, i) { out += '<span class="av" style="top:' + (10 + (i % 2) * 44) + 'px;animation-delay:-' + (i * 1.25) + 's">' + f + '</span>'; });
      out += '<span class="av bot" style="top:32px;animation-delay:-2.4s;background:#FF5A5F">🤖</span>';
      return '<div class="s-vis v-join">' + out + '</div>';
    },
    replyvoo: function () { return '<div class="s-vis v-reply"><span class="bub b1">How much is the black dress? 👗</span><span class="bub me b2">$45, free delivery today. Want the link? ✨</span></div>'; },
    castvoo: function () {
      var phones = [130, 200, 270, 340].map(function (x, i) { return '<span class="ph" style="left:' + x + 'px;animation-delay:' + (i * .3) + 's"></span>'; }).join('');
      return '<div class="s-vis v-cast"><span class="wave"></span><span class="wave"></span><span class="wave"></span>' + phones + '</div>';
    },
    vooads: function () {
      var fr = '';
      for (var i = 0; i < 10; i++) fr += '<span class="fr" style="left:' + (12 + i * 66) + 'px;background-image:url(/img/ads/' + (i % 10) + '.webp)"></span>';
      return '<div class="s-vis v-ads">' + fr + '</div>';
    },
    gatevoo: function () {
      return '<div class="s-vis v-gate"><span class="coin" style="left:30%;background:#26A17B">₮</span><span class="coin" style="left:50%;background:#F7931A;animation-delay:1s">₿</span><span class="coin" style="left:65%;background:#26A17B;animation-delay:2s">₮</span><span class="wallet">Your wallet</span></div>';
    },
    affleego: function () {
      var deals = [['IQ Option', '$1,200 CPA'], ['1win', '50% RevShare'], ['Pocket Option', '$900 CPA']];
      return '<div class="s-vis v-aff">' + deals.map(function (d, i) { return '<span class="deal" style="animation-delay:' + (i * .45) + 's"><b>' + d[0] + '</b><i>' + d[1] + '</i></span>'; }).join('') + '</div>';
    },
    voosquare: function () {
      var c = ['#fff', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.7)', '#C8F75A'];
      return '<div class="s-vis v-sq">' + c.map(function (col, i) { return '<span class="sq" style="background:' + col + ';left:' + (40 + (i % 2) * 38) + 'px;top:' + (14 + Math.floor(i / 2) * 36) + 'px;animation-delay:' + (i * .3) + 's"></span>'; }).join('') + '<span style="position:absolute;left:140px;top:30px;font:800 26px/1 var(--display);letter-spacing:-.04em">Voo<span style="color:#C8F75A">Square</span></span></div>';
    }
  };
  var BRANDS = ['joinvoo', 'replyvoo', 'castvoo', 'vooads', 'gatevoo', 'voosquare', 'affleego'];
  SV.brandMark = function (f, cls) { return BRANDS.indexOf(f.key) >= 0 ? '<img class="' + (cls || 'bmark') + '" src="/img/brands/' + f.key + '.svg" alt="" width="40" height="40">' : '<span class="' + (cls || 'bmark') + ' bm-letter">' + esc((f.name || '?')[0]) + '</span>'; };

  SV.familySlides = function (list) {
    return (list || []).map(function (f) {
      var vis = (VIS[f.key] || VIS.voosquare)();
      var acc = f.accent ? '--acc:' + f.accent + ';--acc-ink:' + f.color + ';' : '';
      var url = f.url + (f.url.indexOf('?') < 0 ? '?' : '&') + 'utm_source=spyvoo&utm_medium=dashboard';
      return '<article class="slide" style="--c:' + esc(f.color) + ';--ink2:' + esc(f.ink || '#fff') + ';' + acc + '"><span class="glow"></span>' +
        '<div class="s-top"><span class="s-logo">' + (BRANDS.indexOf(f.key) >= 0 ? '<img src="/img/brands/' + f.key + '.svg" alt="" width="46" height="46">' : esc(f.name[0])) + '</span><span class="s-name">' + esc(f.name) + '</span><span class="s-tag">' + esc(f.tag) + '</span></div>' +
        '<h3>' + esc(f.title) + '</h3><p>' + esc(f.text) + '</p>' + vis +
        '<div class="s-foot"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Try ' + esc(f.name) + ' ' + I('arrow') + '</a><span class="s-perk">' + esc(f.perk) + '</span></div></article>';
    }).join('');
  };

  SV.family = function (host, list) {
    if (!list || !list.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="fam"><button class="fam-nav prev" type="button" aria-label="Previous">' + I('left') + '</button><div class="fam-track">' + SV.familySlides(list) + '</div><button class="fam-nav next" type="button" aria-label="Next">' + I('right') + '</button></div><div class="fam-dots">' + list.map(function (_, i) { return '<button type="button" aria-label="Slide ' + (i + 1) + '"></button>'; }).join('') + '</div>';
    var track = host.querySelector('.fam-track'), dots = SV.$$('.fam-dots button', host), slides = SV.$$('.slide', host);
    var idx = 0, timer, paused = false;
    function to(i) { idx = (i + slides.length) % slides.length; track.scrollTo({ left: slides[idx].offsetLeft - track.offsetLeft, behavior: 'smooth' }); mark(); }
    function mark() { dots.forEach(function (d, j) { d.classList.toggle('on', j === idx); }); }
    track.addEventListener('scroll', function () {
      var best = 0, dist = 1e9;
      slides.forEach(function (s, j) { var d = Math.abs(s.offsetLeft - track.offsetLeft - track.scrollLeft); if (d < dist) { dist = d; best = j; } });
      idx = best; mark();
    }, { passive: true });
    dots.forEach(function (d, j) { d.onclick = function () { to(j); }; });
    host.querySelector('.prev').onclick = function () { to(idx - 1); };
    host.querySelector('.next').onclick = function () { to(idx + 1); };
    ['mouseenter', 'touchstart', 'focusin'].forEach(function (ev) { host.addEventListener(ev, function () { paused = true; }, { passive: true }); });
    ['mouseleave', 'touchend', 'focusout'].forEach(function (ev) { host.addEventListener(ev, function () { paused = false; }, { passive: true }); });
    mark();
    if (!SV.reduce) timer = setInterval(function () { if (!document.body.contains(host)) return clearInterval(timer); if (!paused && !document.hidden) to(idx + 1); }, 5200);
  };
})();
