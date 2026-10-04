/* Sign up / log in / forgot / reset / verify / invite. Used by the landing page popup and the /login, /signup… pages.
   The binoculars watch what you type and cover their eyes while you type a password. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var auth = $('#auth');
  if (!auth) return;
  var page = auth.hasAttribute('data-page'); // full page (not a popup)
  var seg = $('.seg', auth), form = $('#authForm'), err = $('#authErr'), spy = $('#spy'), pup = $('#spyPup');
  var params = new URLSearchParams(location.search);
  var site = { voosquare: false };
  var COPY = {
    up: { t: 'Become an <span class="g">agent.</span>', s: 'Free forever plan. No card. Your first winning ad is a search away.', go: 'Create my account' },
    in: { t: 'Welcome back, <span class="g">agent.</span>', s: 'The winners kept running while you were away. Let’s see what launched.', go: 'Log in' },
    forgot: { t: 'Forgot your <span class="g">password?</span>', s: 'Type your email and we’ll send you a link to choose a new one.', go: 'Send me the link' },
    reset: { t: 'Choose a new <span class="g">password.</span>', s: 'Make it at least 8 characters. Then you’re straight back in.', go: 'Save and log in' },
    verify: { t: 'Confirming your <span class="g">email…</span>', s: 'One second.', go: 'Open my dashboard' },
    invite: { t: 'Join your <span class="g">team.</span>', s: 'Log in or create an account with the invited email, then we’ll add you to the team.', go: 'Log in and join' }
  };
  var mode = 'up', lastFocus = null;
  var nextUrl = (function () { var n = params.get('next') || ''; return /^\/(app|admin)(\/|\?|$)/.test(n) ? n : ''; })();

  function show(sel, on) { auth.querySelectorAll(sel).forEach(function (x) { x.hidden = !on; }); }
  function setMode(m) {
    mode = m;
    auth.className = auth.className.replace(/\bmode-\w+/g, '').trim() + ' mode-' + m;
    if (seg) { seg.classList.toggle('in', m === 'in'); seg.hidden = !(m === 'up' || m === 'in'); seg.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.m === m); }); }
    $('#authTitle').innerHTML = COPY[m].t; $('#authSub').textContent = COPY[m].s; $('#goTxt').textContent = COPY[m].go;
    $('#fPass').setAttribute('autocomplete', m === 'up' || m === 'reset' ? 'new-password' : 'current-password');
    $('#fPass').closest('.fld').hidden = m === 'forgot' || m === 'verify';
    $('#fEmail').closest('.fld').hidden = m === 'reset' || m === 'verify';
    form.hidden = m === 'verify';
    var vs = $('#vsqBtn'), or = $('.or', auth);
    if (vs) { vs.hidden = !(site.voosquare && (m === 'up' || m === 'in' || m === 'invite')); if (or) or.hidden = vs.hidden; }
    err.textContent = '';
    if (page && (m === 'up' || m === 'in' || m === 'forgot')) history.replaceState({}, '', '/' + ({ up: 'signup', in: 'login', forgot: 'forgot' }[m]) + location.search);
    var go = $('.auth-go', auth); if (go) go.disabled = m === 'up' && site.signups === false;
    if (m === 'up' && site.signups === false) err.textContent = 'New sign-ups are paused for a moment. If you already have an account, log in.';
  }
  function open(m, email) {
    lastFocus = document.activeElement; setMode(m || 'up');
    $('#authMain').hidden = false; $('#authDone').hidden = true;
    if (email) $('#fEmail').value = email;
    auth.hidden = false; if (!page) document.body.style.overflow = 'hidden';
    setTimeout(function () { var f = (m === 'up' ? $('#fName') : m === 'reset' ? $('#fPass') : $('#fEmail')); if (f && f.offsetParent) f.focus(); }, 60);
  }
  function close() { if (page) return; auth.hidden = true; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  window.SpyAuth = { open: open, close: close };

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-auth]');
    if (t) { e.preventDefault(); var plan = t.getAttribute('data-plan'), iv = t.getAttribute('data-interval') === 'year' ? 'year' : 'month'; if (plan) { params.set('plan', plan); params.set('interval', iv); } if (window.__svUser) { location.href = plan ? '/app/plan?checkout=' + encodeURIComponent(plan) + '&interval=' + iv : '/app'; return; } open(t.dataset.auth); return; }
    if (e.target.closest('[data-close]') && !auth.hidden) close();
  });
  document.addEventListener('keydown', function (e) {
    if (auth.hidden || page) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(auth.querySelectorAll('button,input,select,a[href]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return; var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });
  if (seg) seg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setMode(b.dataset.m); });

  // the spy watches you type and covers its eyes for the password
  function look(x, y) { if (pup) pup.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
  ['#fName', '#fEmail'].forEach(function (id) { var el = $(id); if (!el) return; el.addEventListener('input', function () { look(Math.min(4, this.value.length * .25) - 2, 3.5); }); el.addEventListener('focus', function () { spy && spy.classList.remove('shy'); look(-1, 3); }); });
  $('#fPass').addEventListener('focus', function () { if (this.type === 'password' && spy) spy.classList.add('shy'); });
  $('#fPass').addEventListener('blur', function () { spy && spy.classList.remove('shy'); look(0, 0); });
  $('#peek').addEventListener('click', function () {
    var p = $('#fPass'), sh = p.type === 'password'; p.type = sh ? 'text' : 'password';
    this.setAttribute('aria-label', sh ? 'Hide password' : 'Show password');
    if (spy) spy.classList.toggle('shy', !sh); if (sh) look(2, 4); p.focus();
  });
  $('#fPass').addEventListener('input', function () {
    var v = this.value, l = 0;
    if (v.length >= 8) l++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) l++; if (/\d/.test(v)) l++; if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) l++;
    if (!v) l = 0; var m = $('.meter', auth); if (m) m.setAttribute('data-l', l);
    var t = $('#meterTxt'); if (t) t.textContent = ['Use 8+ characters', 'Weak', 'Getting there', 'Strong', 'Spy-grade'][l];
  });
  if (spy) setInterval(function () { if (!auth.hidden && !spy.classList.contains('shy')) { spy.classList.add('blink'); setTimeout(function () { spy.classList.remove('blink'); }, 140); } }, 3800);
  auth.addEventListener('pointermove', function (e) {
    if (!spy || (document.activeElement && /f(Name|Email|Pass)/.test(document.activeElement.id))) return;
    var r = spy.getBoundingClientRect(), a = Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
    look(Math.cos(a) * 3.5, Math.sin(a) * 3.5);
  });

  // countries (sign-up decides payment methods); guess from the browser language
  var cs = $('#fCountry');
  fetch('/api/public/countries').then(function (r) { return r.json(); }).then(function (d) {
    if (!cs) return;
    var guess = ((navigator.language || '').split('-')[1] || '').toUpperCase();
    cs.innerHTML = '<option value="">Pick your country</option>' + d.items.map(function (c) { return '<option value="' + c.code + '"' + (c.code === guess ? ' selected' : '') + '>' + c.flag + ' ' + c.name + '</option>'; }).join('');
  }).catch(function () {});

  function api(path, body) {
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sv': '1' }, credentials: 'same-origin', body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || 'Something went wrong. Please try again.'); e.data = d; throw e; } return d; }); });
  }
  function fail(msg) { err.textContent = msg; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
  function busy(on) { var b = $('.auth-go', auth); b.disabled = on; b.style.opacity = on ? .7 : ''; }
  function confetti() { if (window.svConfetti) { var r = $('.auth-card').getBoundingClientRect(); window.svConfetti(r.left + r.width * .7, r.top + r.height * .4, 180); } }
  function done(title, text, btnLabel, href) {
    $('#authMain').hidden = true; $('#authDone').hidden = false; if (seg) seg.hidden = true;
    $('#doneTitle').textContent = title; $('#doneTxt').textContent = text;
    var b = $('#doneBtn'); b.textContent = btnLabel; b.onclick = function () { location.href = href; };
    confetti();
  }
  function goApp(u, isNew) {
    var to = nextUrl || (u && u.role === 'admin' && params.get('next') === '/admin' ? '/admin' : '/app');
    if (params.get('plan')) to = '/app/plan?checkout=' + encodeURIComponent(params.get('plan')) + '&interval=' + (params.get('interval') === 'year' ? 'year' : 'month');
    done(isNew ? 'You’re in, ' + ((u.name || '').split(' ')[0] || 'agent') + '.' : 'Welcome back.', 'Opening your dashboard…', 'Open my dashboard', to);
    setTimeout(function () { location.href = to; }, 1100);
  }

  // Once you start fixing a field, the old error goes away.
  form.addEventListener('input', function () { if (err && err.textContent && !err.querySelector('a')) { err.textContent = ''; } });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = ($('#fName') || {}).value || '', em = $('#fEmail').value.trim(), pw = $('#fPass').value;
    if (mode === 'up' && !name.trim()) return fail('Add your name so we know what to call you.');
    if (mode !== 'reset' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return fail('Enter an email address like you@yourbrand.com.');
    if (mode !== 'forgot' && pw.length < 8) return fail('Your password needs at least 8 characters.');
    if (mode === 'up' && cs && !cs.value) return fail('Pick your country. It decides which payment methods you see.');
    err.textContent = ''; busy(true);
    var p;
    if (mode === 'up') p = api('/api/auth/signup', { name: name, email: em, password: pw, country: cs ? cs.value : '', ref: params.get('ref') || '' }).then(function (d) { goApp(d.user, true); });
    else if (mode === 'in') p = api('/api/auth/login', { email: em, password: pw }).then(function (d) { goApp(d.user, false); });
    else if (mode === 'invite') p = api('/api/auth/login', { email: em, password: pw }).then(function () { return api('/api/team/accept', { token: params.get('token') }); }).then(function () { done('You joined the team.', 'Your Agency seat is active.', 'Open my dashboard', '/app'); });
    else if (mode === 'forgot') p = api('/api/auth/forgot', { email: em }).then(function () { done('Check your inbox.', 'If ' + em + ' has an account, a reset link is on its way. It works for 2 hours.', 'Back to log in', '/login'); });
    else if (mode === 'reset') p = api('/api/auth/reset', { token: params.get('token'), password: pw }).then(function (d) { goApp(d.user, false); });
    p.catch(function (x) {
      if (x.data && x.data.login_url) { location.href = x.data.login_url; return; }
      fail(x.message);
      // Turn the hint in the message into an action.
      if (/Log in instead/.test(x.message)) err.innerHTML = err.textContent.replace('Log in instead.', '') + ' <a href="/login" data-swap="in">Log in instead</a>';
      if (mode === 'reset' && /expired|used/i.test(x.message)) err.innerHTML = err.textContent + ' <a href="/forgot" data-swap="forgot">Send a new link</a>';
    }).then(function () { busy(false); });
  });
  var vs = $('#vsqBtn');
  if (vs) vs.addEventListener('click', function () { var q = new URLSearchParams(); if (nextUrl) q.set('return_to', nextUrl); if (mode === 'up') q.set('signup', '1'); location.href = '/auth/voosquare' + (q.toString() ? '?' + q : ''); });
  var fg = $('#forgot'); if (fg) fg.addEventListener('click', function (e) { e.preventDefault(); setMode('forgot'); });
  var bl = $('#backLogin'); if (bl) bl.addEventListener('click', function (e) { e.preventDefault(); setMode('in'); });
  auth.addEventListener('click', function (e) { var a = e.target.closest('[data-swap]'); if (a) { e.preventDefault(); setMode(a.dataset.swap); } });
  fetch('/api/public/site', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { site.signups = d.signups !== false; if (mode === 'up') setMode('up'); }).catch(function () {});

  fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
    site.voosquare = !!(d.voosquare && d.voosquare.enabled);
    window.__svUser = d.user || null;
    if (d.user && !page) document.querySelectorAll('[data-auth]').forEach(function (a) { if (a.dataset.auth === 'in') a.textContent = 'Dashboard'; });
    var m = auth.getAttribute('data-mode'); m = { login: 'in', signup: 'up' }[m] || m;
    if (page) {
      if (m === 'verify') {
        open('verify');
        api('/api/auth/verify', { token: params.get('token') }).then(function () { done('Email confirmed.', 'Alerts and weekly reports will reach you now.', 'Open my dashboard', '/app'); }).catch(function (x) {
          $('#authTitle').innerHTML = 'This link has <span class="g">expired.</span>';
          $('#authSub').innerHTML = (x.message || 'This link is no longer valid.') + ' Log in and we’ll send a fresh one from your dashboard.';
          var fine = $('.auth-fine', auth); if (fine) fine.hidden = true;
          form.hidden = false; setMode('in');
        });
      } else if (m === 'invite' && d.user) {
        open('invite');
        api('/api/team/accept', { token: params.get('token') }).then(function () { done('You joined the team.', 'Your Agency seat is active.', 'Open my dashboard', '/app'); }).catch(function (x) { fail(x.message); });
      } else open(m || 'in');
    } else setMode(mode);
  }).catch(function () { if (page) open({ login: 'in', signup: 'up' }[auth.getAttribute('data-mode')] || 'in'); });
})();
