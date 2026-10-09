/* The beginner tour: plays like a 60-second video, but it is the real dashboard. A guide narrates, a cursor moves,
   types and clicks, pages scroll in real time. Pause, jump between chapters, or close at any time.
   It runs on real ads, without spending the user's searches or AI breakdowns. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;
  var T = SV.tour = {};
  var ui, cursor, spot, data, run = 0, paused = false, chapter = 0, voice = true, realApi = null;
  // Narration: a studio voice recorded once (public/audio/tour/0-8.mp3 + music.mp3, made by scripts/tour-voice.js). One audio
  // element is reused so phones allow it after the first tap. If a clip is missing, the device's own voice reads it.
  var aud = null, clipBroken = {}, primed = false, lastText = {};
  function clip(i) { return '/audio/tour/' + i + '.mp3'; }
  function speakFallback(text) { if (!window.speechSynthesis) return; try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, '')); u.rate = 1.02; speechSynthesis.speak(u); } catch (e) { /* no voice */ } }
  function narrate(i, text) {
    if (text) lastText[i] = text;
    primed = false;
    if (!voice) return;
    if (!aud || clipBroken[i]) return speakFallback(text);
    try {
      if (aud.dataset.i !== String(i)) { aud.dataset.i = String(i); aud.src = clip(i); }
      aud.onerror = function () { clipBroken[i] = true; if (aud.dataset.i === String(i)) speakFallback(text); };
      var p = aud.play(); if (p && p.catch) p.catch(function () { /* blocked: captions still show */ });
    } catch (e) { speakFallback(text); }
  }
  function hush() { if (aud) try { aud.pause(); } catch (e) { /* ignore */ } if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  // Wait for the narrator to finish the line before moving on (so the voice is never cut off).
  function voiceDone(my) {
    return new Promise(function (res, rej) {
      var end = Date.now() + 12000;
      (function look() {
        if (my !== run) return rej(new Abort());
        var talking = voice && ((aud && !clipBroken[chapter] && aud.dataset.i === String(chapter) && !aud.ended && aud.currentTime > 0 && !aud.error) || (window.speechSynthesis && speechSynthesis.speaking));
        if (!talking || Date.now() > end) return res();
        if (paused) end += 100;
        setTimeout(look, 100);
      })();
    });
  }
  // Soft music bed (public/audio/tour/music.mp3). It plays through Web Audio so the volume works on iPhone too, and
  // dips under the narrator, rises a little between lines, and fades out at the end. No file = no music, nothing breaks.
  var mus = null, mctx = null, mgain = null, music = true, mTimer = null, MUSIC = '/audio/tour/music.mp3';
  var BED = 0.22, DUCK = 0.08;
  function talkingNow() { return voice && ((aud && !aud.paused && !aud.ended && aud.currentTime > 0 && !aud.error) || (window.speechSynthesis && speechSynthesis.speaking)); }
  function musicLevel() { return (!music || paused || !ui) ? 0 : (talkingNow() ? DUCK : BED); }
  function setVol(v, secs) {
    if (mgain && mctx) { var g = mgain.gain, t = mctx.currentTime; try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + (secs || 0.6)); } catch (e) { g.value = v; } }
    else if (mus) { try { mus.volume = v; } catch (e) { /* ignore */ } }
  }
  function musicStart() {
    try {
      if (!mus) {
        mus = new Audio(); mus.loop = true; mus.preload = 'auto'; mus.crossOrigin = 'anonymous';
        mus.onerror = function () { mus = null; if (mTimer) { clearInterval(mTimer); mTimer = null; } var b = ui && ui.querySelector('[data-music]'); if (b) b.hidden = true; };
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { try { mctx = new AC(); mgain = mctx.createGain(); mgain.gain.value = 0; mctx.createMediaElementSource(mus).connect(mgain); mgain.connect(mctx.destination); } catch (e) { mctx = mgain = null; } }
        if (!mgain) { mus.volume = 0; if (mus.volume !== 0) { mus = null; return; } } // iPhone without Web Audio: volume is fixed, so skip music rather than blast it
        mus.src = MUSIC;
      }
      if (mctx && mctx.state === 'suspended') mctx.resume().catch(function () {});
      mus.currentTime = 0;
      var p = mus.play(); if (p && p.catch) p.catch(function () { /* blocked or missing: tour still works */ });
      setVol(0, 0.01);
      if (mTimer) clearInterval(mTimer);
      mTimer = setInterval(function () { if (mus) setVol(musicLevel(), 0.5); }, 250);
    } catch (e) { mus = null; }
  }
  function musicStop(fadeSecs) {
    if (mTimer) { clearInterval(mTimer); mTimer = null; }
    if (!mus) return;
    var m = mus; setVol(0, fadeSecs || 0.8);
    setTimeout(function () { if (m && !mTimer) try { m.pause(); } catch (e) { /* ignore */ } }, ((fadeSecs || 0.8) * 1000) + 80);
  }
  var CH = [
    { k: 'Your HQ', d: 7 }, { k: 'Ask', d: 9 }, { k: 'Filters', d: 6 }, { k: 'Winners', d: 7 },
    { k: 'The ad', d: 8 }, { k: 'AI', d: 8 }, { k: 'Save', d: 6 }, { k: 'Make it mine', d: 7 }
  ];

  /* ---------- helpers (all cancellable and pausable) ---------- */
  function Abort() {}
  function alive(my) { if (my !== run) throw new Abort(); }
  function wait(ms, my) {
    return new Promise(function (res, rej) {
      var left = ms, last = Date.now();
      (function tick() {
        if (my !== run) return rej(new Abort());
        var now = Date.now(); if (!paused) left -= now - last; last = now;
        if (left <= 0) return res();
        setTimeout(tick, 50);
      })();
    });
  }
  function el(sel) { return typeof sel === 'string' ? document.querySelector(sel) : sel; }
  function until(sel, my, ms) {
    var end = Date.now() + (ms || 6000);
    return new Promise(function (res, rej) {
      (function look() { if (my !== run) return rej(new Abort()); var e = el(sel); if (e && e.getBoundingClientRect().width) return res(e); if (Date.now() > end) return res(null); setTimeout(look, 80); })();
    });
  }
  function moveTo(sel, my, dx, dy) {
    var e = el(sel); if (!e) return wait(300, my);
    var r = e.getBoundingClientRect();
    var x = r.left + (dx == null ? r.width / 2 : dx), y = r.top + (dy == null ? r.height / 2 : dy);
    cursor.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    return wait(950, my);
  }
  function click(sel, my) {
    return moveTo(sel, my).then(function () { cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click'); var e = el(sel); if (e) e.click(); return wait(450, my); });
  }
  function typeInto(sel, text, my) {
    var e = el(sel); if (!e) return Promise.resolve();
    e.value = '';
    var i = 0;
    return new Promise(function (res, rej) {
      (function next() {
        if (my !== run) return rej(new Abort());
        if (paused) return setTimeout(next, 100);
        e.value = text.slice(0, ++i);
        if (i < text.length) setTimeout(next, 45 + Math.random() * 40); else res();
      })();
    });
  }
  function scroller() { var d = document.querySelector('#layer .drawer'); return d || document.querySelector('.app .main'); }
  function scrollTo(target, my) {
    var s = scroller(); if (!s) return wait(300, my);
    var y = typeof target === 'number' ? target : (function () { var e = el(target); if (!e) return s.scrollTop; var r = e.getBoundingClientRect(), sr = s.getBoundingClientRect(); return s.scrollTop + (r.top - sr.top) / scale() - 40; })();
    s.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    return wait(1100, my);
  }
  function scale() { return parseFloat(getComputedStyle(document.body).getPropertyValue('--ts')) || 0.8; }
  function highlight(sel, pad) {
    var e = el(sel);
    if (!e) { spot.classList.remove('on'); return; }
    var r = e.getBoundingClientRect(); pad = pad == null ? 8 : pad;
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px'; spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    spot.classList.add('on');
    // Never let the caption bar sit on top of what we're pointing at: flip it to the top of the screen.
    var bar = ui && ui.querySelector('.tour-bar');
    if (bar) { bar.classList.remove('up'); var br = bar.getBoundingClientRect(); if (r.bottom + pad > br.top - 6 && r.top - pad > br.height + 90) bar.classList.add('up'); }
  }
  function unspot() { spot.classList.remove('on'); var bar = ui && ui.querySelector('.tour-bar'); if (bar) bar.classList.remove('up'); }
  function say(i, text) {
    chapter = i;
    ui.querySelector('.tour-cap p').innerHTML = '<small>' + (i + 1) + ' / ' + CH.length + ' · ' + esc(CH[i].k) + '</small>' + text;
    SV.$$('.tour-prog i', ui).forEach(function (b, j) { b.style.transition = 'none'; b.style.animation = 'none'; b.style.width = j < i ? '100%' : '0'; });
    var bar = SV.$$('.tour-prog i', ui)[i];
    // A keyframe animation (not a transition) so Pause can freeze it.
    if (bar) { void bar.offsetWidth; bar.style.width = ''; bar.style.animation = 'tourbar ' + CH[i].d + 's linear forwards'; bar.style.animationPlayState = paused ? 'paused' : 'running'; }
    narrate(i, text);
  }

  /* ---------- the mock layer: the tour never spends usage ---------- */
  function mockApi(on) {
    if (on && !realApi) {
      realApi = SV.api;
      SV.api = function (method, path, body) {
        if (path.indexOf('/api/app/search') === 0) return Promise.resolve(data.results);
        if (path === '/api/app/ai-search') return Promise.resolve({ filters: Object.assign({ sort: 'score' }, data.filters) });
        if (data.ad && path === '/api/app/ads/' + data.ad.ad.id) return Promise.resolve(data.ad);
        if (/\/(quick-save|analyse|mine|download|follow)$/.test(path)) return Promise.resolve({ saved: true });
        return realApi(method, path, body);
      };
    } else if (!on && realApi) { SV.api = realApi; realApi = null; }
  }

  /* ---------- chapters ---------- */
  var STEPS = [
    function (my) { // HQ
      say(0, 'Welcome, agent! This is your HQ. Every time you log in, today’s best ads are waiting for you right here.');
      return go('/app', my).then(function () { return until('.hero', my); }).then(function () { highlight('.hero'); return moveTo('.hero h1', my); })
        .then(function () { return wait(1600, my); }).then(function () { unspot(); return scrollTo('#winners', my); })
        .then(function () { highlight('#winners', 6); return moveTo('#winners .ad', my); }).then(function () { return wait(1600, my); });
    },
    function (my) { // Ask
      say(1, 'Finding a winner is easy. Just type what you want, the way you’d say it to a friend.');
      unspot();
      return go('/app/discover', my).then(function () { return until('#dq', my); }).then(function () { highlight('#dform', 6); return click('#dq', my); })
        .then(function () { return typeInto('#dq', data.ask, my); }).then(function () { return wait(500, my); }).then(function () { return click('#dform .ai', my); })
        .then(function () { unspot(); return until('#results .ad', my); }).then(function () { return wait(800, my); });
    },
    function (my) { // Filters
      say(2, 'Spyvoo turns your words into filters: the country, how long the ad has run, the button, and more. Tap any chip to change them.');
      return (document.querySelector('#filters .chip') ? Promise.resolve() : go('/app/discover?' + new URLSearchParams(flat(data.filters)).toString(), my).then(function () { return until('#filters .chip', my); }))
        .then(function () { highlight('#understood', 6); return moveTo('#understood', my); }).then(function () { return wait(1400, my); })
        .then(function () { highlight('#filters', 6); return moveTo('#filters .chip:nth-child(2)', my); }).then(function () { return wait(1600, my); });
    },
    function (my) { // Winners
      say(3, 'Look at the days badge. An ad still running after 30 days is almost always making money. The ring is its winner score.');
      unspot();
      return until('#results .ad', my).then(function () { return scrollTo('#results', my); }).then(function () { highlight('#results .ad .days', 6); return moveTo('#results .ad .days', my); })
        .then(function () { return wait(1300, my); }).then(function () { highlight('#results .ad .score', 6); return moveTo('#results .ad .score', my); }).then(function () { return wait(1300, my); });
    },
    function (my) { // The ad
      say(4, 'Open any ad to see everything: the creative, how many days it ran, the variations, the countries, and the full text.');
      unspot();
      if (!data.ad) return wait(1000, my);
      var already = document.querySelector('#layer .drawer');
      return (already ? Promise.resolve() : until('#results .ad', my).then(function () { return moveTo('#results .ad', my); }).then(function () { cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click'); SV.openAd(data.ad.ad.id, { data: data.ad, tour: true }); return until('#layer .stats', my); }))
        .then(function () { return wait(600, my); }).then(function () { highlight('#layer .stats', 6); return moveTo('#layer .stats', my); }).then(function () { return wait(1500, my); })
        .then(function () { highlight('#layer .timeline', 6); return wait(1200, my); });
    },
    function (my) { // AI
      say(5, 'Then let the AI explain it: the hook, the offer, who it targets, and in plain words, why it works.');
      if (!document.querySelector('#layer .drawer') && data.ad) { SV.openAd(data.ad.ad.id, { data: data.ad, tour: true }); }
      return until('#aibox', my).then(function () { unspot(); return scrollTo('#aibox', my); }).then(function () { highlight('#aibox', 4); return moveTo('#aibox h3', my); })
        .then(function () { return wait(2400, my); });
    },
    function (my) { // Save
      say(6, 'Love it? Save it to a board, follow the advertiser, and Spyvoo alerts you the moment they launch something new.');
      if (!document.querySelector('#layer .drawer') && data.ad) SV.openAd(data.ad.ad.id, { data: data.ad, tour: true });
      return until('#dsave', my).then(function () { unspot(); return scrollTo(0, my); }).then(function () { highlight('#dsave', 6); return moveTo('#dsave', my); })
        .then(function () { cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click'); var b = $('#dsave'); if (b) { b.className = 'btn ghost'; b.innerHTML = I('heart', ' fill="currentColor"') + 'Saved'; var r = b.getBoundingClientRect(); SV.confetti(r.left + r.width / 2, r.top, 40); } return wait(900, my); })
        .then(function () { highlight('#dfollow', 6); return moveTo('#dfollow', my); }).then(function () { var b = $('#dfollow'); if (b) { b.className = 'btn sm ghost'; b.innerHTML = I('check') + 'Following'; } return wait(1400, my); });
    },
    function (my) { // Make it mine
      say(7, 'Last trick: “Make it mine”. Type your product, and the AI writes fresh scripts in the same style. Never a copy.');
      if (!document.querySelector('#layer .drawer') && data.ad) SV.openAd(data.ad.ad.id, { data: data.ad, tour: true });
      return until('#mine', my).then(function () { unspot(); return scrollTo('#mine', my); }).then(function () { highlight('#mineForm', 6); return click('#product', my); })
        .then(function () { return typeInto('#product', 'organic hair oil', my); }).then(function () { return moveTo('#mineForm .btn', my); })
        .then(function () {
          var out = $('#mineOut'), s = data.script;
          if (out && s) out.innerHTML = '<div class="scripts">' + s.scripts.slice(0, 2).map(function (x) { return '<div class="script"><b>' + esc(x.title) + '</b><q>' + esc(x.hook.replace('your product', 'organic hair oil')) + '</q><p>' + esc(x.body.replace(/your product/g, 'organic hair oil')) + '</p></div>'; }).join('') + '</div>';
          unspot(); return scrollTo('#mineOut', my);
        }).then(function () { return wait(2200, my); });
    }
  ];
  function flat(f) { var o = {}; Object.keys(f || {}).forEach(function (k) { o[k] = Array.isArray(f[k]) ? f[k].join(',') : f[k]; }); return o; }
  function go(path, my) {
    var cur = location.pathname + location.search;
    if (document.querySelector('#layer .drawer')) SV.closeLayers(true);
    if (cur !== path) { history.pushState({}, '', path); SV.render(); }
    var m = document.querySelector('.app .main'); if (m) m.scrollTop = 0;
    return wait(700, my);
  }

  function playFrom(i) {
    var my = ++run;
    paused = false; setPP();
    var chain = Promise.resolve();
    for (var k = i; k < STEPS.length; k++) (function (k) { chain = chain.then(function () { alive(my); return STEPS[k](my); }).then(function () { return voiceDone(my); }).then(function () { return wait(voice ? 550 : 0, my); }); })(k);
    chain.then(function () { if (my === run) finish(); }).catch(function (e) { if (!(e instanceof Abort)) { console.error(e); finish(); } });
  }

  function setPP() { var b = ui && ui.querySelector('.pp'); if (b) { b.innerHTML = I(paused ? 'play' : 'pause'); b.setAttribute('aria-label', paused ? 'Play' : 'Pause'); } SV.$$('.tour-prog i', ui || document).forEach(function (x) { x.style.animationPlayState = paused ? 'paused' : 'running'; }); }

  function finish() {
    run++;
    unspot();
    hush();
    chapter = 8; narrate(8, 'You’re ready, agent. Search like you talk, look for ads running thirty days or more, read the AI breakdown, then make it yours. Happy spying!');
    var end = document.createElement('div');
    end.className = 'tour-end';
    end.innerHTML = '<div class="card"><button class="x" type="button" data-x aria-label="Close" style="position:absolute;right:14px;top:14px">' + I('x') + '</button><div class="art">' + SV.agent(SV.cast.guide, { pose: 'cheer' }) + '</div><span class="eyebrow" style="color:var(--pink)">Tour complete</span><h2 style="margin-top:8px">You’re ready, agent.</h2><p>Search like you talk, look for ads running 30+ days, read the AI breakdown, then make it yours.</p><div class="row"><button class="btn ghost" type="button" data-again>' + I('play') + 'Watch again</button><button class="btn grad" type="button" data-start>' + I('search') + 'Start spying</button></div></div>';
    document.body.appendChild(end);
    SV.confetti(null, innerHeight / 3, 200);
    SV.post('/api/app/onboarding', { tour_seen: true }).catch(function () {});
    if (SV.state.boot) SV.state.boot.user.onboarding.tour_seen = true;
    setTimeout(function () { if (document.querySelector('.tour-end')) musicStop(4); }, 9000);
    end.querySelector('[data-again]').onclick = function () { end.remove(); musicStart(); playFrom(0); };
    end.querySelector('[data-x]').onclick = function () { end.remove(); T.stop(); };
    end.querySelector('[data-start]').onclick = function () { end.remove(); T.stop(); SV.go('/app/discover'); };
  }

  T.start = function () {
    if (ui) return;
    SV.closeLayers(true);
    // Created inside the tap that started the tour, so phones let it play for the whole tour.
    try {
      if (!aud) { aud = new Audio(); aud.preload = 'auto'; }
      aud.onerror = function () { clipBroken[Number(aud.dataset.i) || 0] = true; };
      aud.dataset.i = '0'; aud.src = clip(0); primed = true;
      var pp = aud.play(); if (pp && pp.then) pp.then(function () { if (primed) { aud.pause(); aud.currentTime = 0; } }).catch(function () {});
    } catch (e) { aud = null; }
    musicStart();
    // iPhone only lets the device voice speak after it was started inside a tap: start it silently now.
    try { if (window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* no voice */ }
    SV.get('/api/app/tour').then(function (d) {
      data = d;
      mockApi(true);
      document.body.classList.add('touring');
      document.body.style.setProperty('--ts', SV.phone() ? .74 : .8);
      ui = document.createElement('div');
      ui.className = 'tour-ui';
      ui.innerHTML = '<div class="tour-top"><span class="mark" style="width:34px;height:34px">' + SV.MARK + '</span><b>How Spyvoo works</b><span class="rec"><i></i>LIVE DEMO</span><button class="x" type="button" aria-label="Close tour">' + I('x', ' width="18" height="18"') + '</button></div>' +
        '<div class="tour-bar" role="region" aria-label="Tour"><div class="tour-cap"><span class="guide">' + SV.agent(SV.cast.guide, { crop: true }) + '</span><p></p></div>' +
        '<div class="tour-ctl"><button class="pp" type="button"></button><div class="tour-prog">' + CH.map(function (c, i) { return '<button type="button" title="' + esc(c.k) + '" data-ch="' + i + '"><i></i></button>'; }).join('') + '</div>' +
        '<button class="pp" type="button" data-voice aria-label="Narration on" style="background:var(--blue);color:#fff" title="Narration voice">' + I('sound') + '</button>' +
        '<button class="pp" type="button" data-music aria-label="Music on" style="background:var(--blue);color:#fff" title="Background music">' + I('music') + '</button></div></div>';
      document.body.appendChild(ui);
      ui.querySelector('.mark').style.background = 'var(--blue)';
      cursor = document.createElement('div'); cursor.className = 'tcursor';
      cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 2-3 7z" fill="#fff" stroke="#0A1638" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="clk"></span>';
      cursor.style.transform = 'translate(' + innerWidth / 2 + 'px,' + innerHeight / 2 + 'px)';
      document.body.appendChild(cursor);
      spot = document.createElement('div'); spot.className = 'tspot'; document.body.appendChild(spot);
      ui.querySelector('.x').onclick = T.stop;
      ui.querySelector('.pp').onclick = function () {
        paused = !paused; setPP();
        try { if (aud && aud.dataset.i === String(chapter) && !aud.ended) { if (paused) aud.pause(); else if (voice) aud.play().catch(function () {}); } } catch (e) { /* ignore */ }
        if (window.speechSynthesis) try { paused ? speechSynthesis.pause() : speechSynthesis.resume(); } catch (e) { /* ignore */ }
      };
      ui.querySelector('[data-voice]').onclick = function () {
        voice = !voice;
        this.style.background = voice ? 'var(--blue)' : 'rgba(255,255,255,.12)'; this.innerHTML = I(voice ? 'sound' : 'mute'); this.setAttribute('aria-label', voice ? 'Narration on' : 'Narration off');
        SV.toast(voice ? 'Narration on' : 'Narration off', { icon: 'bell', ms: 1500 });
        if (!voice) hush(); else if (!paused) { if (aud) aud.dataset.i = ''; narrate(chapter, lastText[chapter] || ''); }
      };
      ui.querySelector('[data-music]').onclick = function () {
        music = !music;
        this.style.background = music ? 'var(--blue)' : 'rgba(255,255,255,.12)'; this.style.opacity = music ? '1' : '.6'; this.setAttribute('aria-label', music ? 'Music on' : 'Music off');
        SV.toast(music ? 'Music on' : 'Music off', { icon: 'bell', ms: 1500 });
        if (music && mus && mus.paused) { if (mctx && mctx.state === 'suspended') mctx.resume().catch(function () {}); mus.play().catch(function () {}); }
      };
      if (!mus) ui.querySelector('[data-music]').hidden = true;
      SV.$$('[data-ch]', ui).forEach(function (b) { b.onclick = function () { var e = document.querySelector('.tour-end'); if (e) e.remove(); playFrom(Number(b.dataset.ch)); }; });
      document.addEventListener('keydown', keys);
      playFrom(0);
    }).catch(SV.fail);
  };
  function keys(e) { if (!ui) return; if (e.key === 'Escape') T.stop(); if (e.key === ' ') { e.preventDefault(); ui.querySelector('.pp').click(); } }
  T.stop = function () {
    run++;
    hush();
    musicStop(0.8);
    mockApi(false);
    [ui, cursor, spot, document.querySelector('.tour-end')].forEach(function (x) { if (x) x.remove(); });
    ui = cursor = spot = null;
    document.removeEventListener('keydown', keys);
    document.body.classList.remove('touring');
    SV.closeLayers(true);
    if (SV.state.boot && !SV.state.boot.user.onboarding.tour_seen) { SV.post('/api/app/onboarding', { tour_seen: true }).catch(function () {}); SV.state.boot.user.onboarding.tour_seen = true; }
    SV.go('/app');
  };
})();
