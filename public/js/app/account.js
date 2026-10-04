/* Plan & billing (checkout with Gatevoo crypto or other methods), account settings and team seats. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;
  var COIN = { USDT_TRC20: { c: '#26A17B', s: '₮' }, BTC: { c: '#F7931A', s: '₿' } };

  SV.upgradePrompt = function (d) {
    var words = { searches: 'searches', analyses: 'AI breakdowns', downloads: 'video downloads', scripts: 'scripts', saves: 'saves', follows: 'follows' }[d.kind] || 'that';
    var o = SV.state.boot && SV.state.boot.offer;
    var locked = d.limit === 0;
    SV.modal('<div style="text-align:center"><div class="md-art">' + SV.agent(SV.cast.fan, { pose: locked ? 'wave' : 'cheer' }) + '</div><span class="eyebrow" style="color:var(--pink)">' + (locked ? 'Paid plans only' : 'Limit reached') + '</span><h2 style="margin-top:8px">' + (locked ? 'Unlock ' + words + '.' : 'You’re spying like a pro.') + '</h2><p class="mut" style="font-weight:600">' + esc(d.error || ('You’ve used all your ' + words + '.')) + '</p>' +
      (o && o.eligible ? '<div class="offer" style="margin:14px 0;text-align:left"><span class="badge">' + esc(o.badge) + '</span><div><b>' + esc(o.text) + '</b><span>Code <code>' + esc(o.code) + '</code></span></div></div>' : '') +
      '<div class="actions" style="justify-content:center"><a class="btn grad" href="/app/plan' + (o && o.eligible ? '?coupon=' + encodeURIComponent(o.code) : '') + '">' + I('crown') + 'See plans</a></div></div>');
  };

  /* =================== PLAN =================== */
  SV.route(/^\/app\/plan$/, function (view, m, q) {
    view.innerHTML = '<div class="boot"><div class="boot-eyes"></div></div>';
    var offerNow = SV.state.boot && SV.state.boot.offer;
    var yearly = q.get('interval') === 'year', coupon = q.get('coupon') || (offerNow && offerNow.eligible && q.get('interval') !== 'year' ? offerNow.code : '');
    SV.get('/api/app/plan').then(function (d) {
      var cur = d.current;
      function draw() {
        view.innerHTML = '<div class="fade-in"><div class="page-head"><div><span class="eyebrow">Plan & billing</span><h1>' + (cur.id === 'free' ? 'Unlock the full radar' : 'You’re on ' + esc(cur.name)) + '</h1><p>' + (cur.id === 'free' ? 'Upgrade any time. Pay with USDT or Bitcoin. No card needed.' : 'Renews ' + SV.date(cur.renews_at) + '. Crypto plans don’t renew by themselves: we remind you before.') + '</p></div>' +
          '<div class="seg" id="iv"><button type="button" data-y="0" class="' + (yearly ? '' : 'on') + '">Monthly</button><button type="button" data-y="1" class="' + (yearly ? 'on' : '') + '">Yearly <span style="color:var(--mint)">2 months free</span></button></div></div>' +
          (cur.team_owner ? '<div class="announce" style="margin:0 0 16px">' + I('team', ' width="18" height="18"') + 'Your plan comes from ' + esc(cur.team_owner.name || cur.team_owner.email) + '’s Agency team.</div>' : '') +
          '<div id="offerSlot"></div>' +
          '<div class="meters" style="margin-bottom:22px">' + [['searches', 'Searches today', 'search'], ['analyses', 'AI breakdowns this month', 'spark'], ['downloads', 'Downloads this month', 'download'], ['scripts', 'Scripts this month', 'wand'], ['saves', 'Saved ads', 'heart']].map(function (k) {
            var mm = d.meter[k[0]]; var p = SV.pct(mm);
            return '<div class="m"><b class="tnum">' + SV.limitText(mm) + '</b><small>' + k[1] + '</small><div class="bar' + (p > 85 && mm.limit !== -1 ? ' warn' : '') + '"><i style="width:' + p + '%"></i></div></div>';
          }).join('') + '</div>' +
          '<div class="plans stagger">' + d.plans.map(function (p) {
            var price = yearly ? Math.round(p.price_year / 12) : p.price_month;
            var isCur = p.id === cur.id;
            var off = d.offer && d.offer.eligible && !yearly && (d.offer.plans || []).indexOf(p.id) >= 0 && p.price_month > 0;
            return '<article class="plan' + (p.popular ? ' pop' : '') + (isCur ? ' cur' : '') + '"><h3>' + esc(p.name) + (isCur ? '<span class="bdg cur-b">Your plan</span>' : p.popular ? '<span class="bdg">Most popular</span>' : isCur ? '<span class="bdg" style="background:var(--mint);color:#fff">Current</span>' : '') + '</h3>' +
              '<div class="price"><b class="tnum">' + SV.money(price) + '</b><span>' + (p.price_month ? '/mo' + (yearly ? ', billed ' + SV.money(p.price_year) + '/yr' : '') : 'forever') + '</span></div>' +
              (off ? '<div style="font-weight:800;font-size:13px;color:' + (p.popular ? '#FFE08A' : 'var(--pink)') + '">' + I('gift', ' width="15" height="15" style="vertical-align:-3px"') + ' ' + esc(d.offer.badge) + ' first month with ' + esc(d.offer.code) + '</div>' : '') +
              '<p style="margin:0;font-weight:600;font-size:13.5px;opacity:.8">' + esc(p.tagline) + '</p><ul>' + p.features.map(function (f) { return '<li>' + I('check') + '<span>' + esc(f) + '</span></li>'; }).join('') + '</ul>' +
              (p.price_month > 0 ? '<button class="btn' + (p.popular ? '' : isCur ? ' ghost' : '') + '" type="button" data-buy="' + p.id + '">' + (isCur ? 'Renew / extend' : 'Choose ' + esc(p.name)) + '</button>' : '<button class="btn ghost" type="button" disabled>' + (isCur ? 'Your plan' : 'Free forever') + '</button>') + '</article>';
          }).join('') + '</div>' +
          '<section class="sec"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));align-items:start"><div class="panel"><h3 style="font-size:19px">Billing history</h3><div class="list" id="orders"></div></div><div class="panel" id="team"></div></div></section></div>';
        if (d.offer && d.offer.eligible && cur.id === 'free' && !yearly) { $('#offerSlot').style.marginBottom = '18px'; SV.offerBox($('#offerSlot')); }
        SV.$$('#iv button').forEach(function (b) { b.onclick = function () { yearly = b.dataset.y === '1'; draw(); }; });
        SV.$$('[data-buy]').forEach(function (b) { b.onclick = function () { checkout(d, b.dataset.buy, yearly ? 'year' : 'month', coupon); }; });
        $('#orders').innerHTML = d.orders.length ? d.orders.map(function (o) {
          return '<div class="li"><span class="thumbsm" style="display:grid;place-items:center;background:var(--blue-l);color:var(--blue)">' + I('card') + '</span><span class="grow"><b>' + esc(o.plan) + ' · ' + o.interval + 'ly · ' + SV.money(o.amount) + '</b><small>' + esc(o.ref) + ' · ' + SV.date(o.created_at) + (o.coupon ? ' · ' + esc(o.coupon) : '') + (o.tx_url ? ' · <a href="' + esc(o.tx_url) + '" target="_blank" rel="noopener" style="color:var(--blue)">transaction</a>' : '') + '</small></span>' +
            (o.status === 'pending' && o.pay_url ? '<a class="btn sm" href="' + esc(o.pay_url) + '">Pay</a>' : '<span class="status ' + o.status + '">' + o.status + '</span>') + '</div>';
        }).join('') : '<p class="mut" style="font-weight:600">No payments yet.</p>';
        team();
      }
      draw();
      var ref = q.get('order');
      if (ref) poll(ref);
      if (q.get('checkout')) checkout(d, q.get('checkout'), q.get('interval') === 'year' ? 'year' : 'month', coupon);
    }).catch(SV.fail);
  });

  function poll(ref, n) {
    n = n || 0;
    SV.get('/api/app/orders/' + encodeURIComponent(ref)).then(function (r) {
      if (!r.order) return;
      if (r.order.status === 'paid') {
        history.replaceState({}, '', '/app/plan');
        SV.state.boot.user = r.user;
        SV.modal('<div style="text-align:center"><div class="md-art">' + SV.agent(SV.cast.host, { pose: 'cheer' }) + '</div><span class="eyebrow" style="color:var(--mint)">Payment confirmed</span><h2 style="margin-top:8px">Welcome to ' + esc(r.user.plan.name) + '!</h2><p class="mut" style="font-weight:600">Your plan is active until ' + SV.date(r.user.plan.renews_at) + '. A receipt is in your inbox.</p><div class="actions" style="justify-content:center"><a class="btn grad" href="/app/discover">' + I('search') + 'Start spying</a></div></div>', { onClose: function () { SV.render(); } });
        SV.confetti(null, null, 220);
        SV.boot(true);
      } else if (r.order.status === 'pending' && n < 40) {
        if (n === 0) SV.toast('Waiting for your payment to confirm…', { icon: 'clock', ms: 4000 });
        setTimeout(function () { poll(ref, n + 1); }, 6000);
      } else if (r.order.status === 'failed') SV.toast('That payment didn’t go through. Try again.', { bad: true });
    }).catch(function () {});
  }

  function checkout(d, planId, interval, coupon) {
    var plan = d.plans.find(function (p) { return p.id === planId; });
    if (!plan) return;
    var methods = d.methods;
    var md = SV.modal('<span class="eyebrow">Checkout</span><h2 style="margin-top:8px">' + esc(plan.name) + ' · ' + interval + 'ly</h2>' +
      (methods.length ? '<div class="field" style="margin-top:14px"><label>Pay with</label><div class="methods">' + methods.map(function (m, i) {
        return '<label class="method"><input type="radio" name="pm" value="' + m.id + '"' + (i === 0 ? ' checked' : '') + '><span style="flex:1"><b>' + esc(m.name) + '</b><small>' + esc(m.description) + '</small>' +
          '</span></label>';
      }).join('') + '</div><div id="coinBox"></div></div>' : '<p class="mut">No payment method is available for your country yet. Contact support.</p>') +
      '<div class="field" style="margin-top:12px"><label>Discount code</label><div style="display:flex;gap:8px"><input class="input" id="cpn" placeholder="e.g. SPYLAUNCH" value="' + esc(coupon || '') + '" style="text-transform:uppercase"><button class="btn ghost" type="button" id="cpnGo">Apply</button></div><small id="cpnMsg" style="font-weight:700"></small></div>' +
      '<div class="sum" id="sum"></div><div class="actions"><button class="btn grad block" type="button" id="pay"' + (methods.length ? '' : ' disabled') + '>' + I('lock') + 'Continue to payment</button></div>' +
      '<p class="mut" style="font-size:12px;font-weight:600;margin:10px 0 0;text-align:center">Secure checkout. Your plan switches on as soon as the payment confirms.</p>');
    var el = md.el, applied = '';
    function coins() {
      var pm = el.querySelector('input[name=pm]:checked'), m = pm && methods.find(function (x) { return String(x.id) === pm.value; });
      el.querySelector('#coinBox').innerHTML = m && m.coins ? '<div class="field" style="margin-top:10px"><label>Coin</label><div class="coins">' + m.coins.map(function (c, j) { return '<label><input type="radio" name="coin" value="' + c.id + '"' + (j === 0 ? ' checked' : '') + ' hidden><span class="coin-ic" style="background:' + (COIN[c.id] || {}).c + '">' + (COIN[c.id] || {}).s + '</span><span>' + esc(c.label) + '<small style="display:block;color:var(--mut);font-weight:700">' + esc(c.network) + '</small></span></label>'; }).join('') + '</div></div>' : '';
    }
    if (methods.length) { coins(); SV.$$('input[name=pm]', el).forEach(function (r) { r.onchange = coins; }); }
    function quote() {
      var code = el.querySelector('#cpn').value.trim();
      SV.post('/api/app/quote', { plan: planId, interval: interval, coupon: code }).then(function (q) {
        applied = q.coupon || '';
        el.querySelector('#cpnMsg').innerHTML = code ? (q.coupon ? '<span style="color:var(--mint)">' + I('check', ' width="13" height="13"') + ' ' + esc(q.coupon) + ' applied</span>' : '<span style="color:var(--coral)">' + esc(q.coupon_error) + '</span>') : '';
        el.querySelector('#sum').innerHTML = '<div><span>' + esc(plan.name) + ' (' + interval + 'ly)</span><span>' + SV.money(q.list) + '</span></div>' + (q.discount ? '<div style="color:var(--mint)"><span>Discount</span><span>−' + SV.money(q.discount) + '</span></div>' : '') + '<div class="total"><span>Total today</span><span>' + SV.money(q.amount) + '</span></div>';
      }).catch(SV.fail);
    }
    quote();
    el.querySelector('#cpnGo').onclick = quote;
    el.querySelector('#pay').onclick = function () {
      var b = this, pm = el.querySelector('input[name=pm]:checked'), coin = el.querySelector('input[name=coin]:checked');
      if (!pm) return;
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Creating your order…';
      SV.post('/api/app/checkout', { plan: planId, interval: interval, method_id: Number(pm.value), coupon: applied, coin: coin ? coin.value : undefined }).then(function (r) {
        if (r.checkout_url) { location.href = r.checkout_url; return; }
        md.close(true);
        SV.modal('<span class="eyebrow">Order ' + esc(r.ref) + '</span><h2 style="margin-top:8px">Almost done</h2><p style="font-weight:600;white-space:pre-wrap">' + esc(r.instructions || 'We will confirm your payment shortly.') + '</p><div class="sum"><div class="total"><span>Amount</span><span>' + SV.money(r.amount) + '</span></div></div><div class="actions"><a class="btn" href="/app/plan">Done</a></div>');
      }).catch(function (e) { b.disabled = false; b.innerHTML = I('lock') + 'Continue to payment'; SV.fail(e); });
    };
  }

  function team() {
    var host = $('#team'); if (!host) return;
    SV.get('/api/team').then(function (t) {
      if (t.seats <= 1 && t.owner.me) {
        host.innerHTML = '<h3 style="font-size:19px">Team</h3><div style="display:flex;gap:14px;align-items:center;margin-top:8px"><div style="width:90px;height:100px;flex:0 0 auto">' + SV.agent(SV.cast.guide, { pose: 'wave' }) + '</div><p class="mut" style="font-weight:600;margin:0">Spy together. The Agency plan includes ' + 3 + ' seats with shared boards and limits.</p></div>';
        return;
      }
      host.innerHTML = '<h3 style="font-size:19px">Team · ' + (t.members.length + 1) + ' / ' + t.seats + ' seats</h3><div class="list"><div class="li"><span class="avatar" style="width:40px;height:40px">' + SV.avatar(t.owner.email) + '</span><span class="grow"><b>' + esc(t.owner.name || t.owner.email) + '</b><small>Owner</small></span></div>' +
        t.members.map(function (m) { return '<div class="li"><span class="avatar" style="width:40px;height:40px">' + SV.avatar(m.email) + '</span><span class="grow"><b>' + esc(m.name || m.email) + '</b><small>' + esc(m.email) + '</small></span>' + (t.owner.me ? '<button class="btn ghost sm" type="button" data-rm="' + m.id + '">Remove</button>' : '') + '</div>'; }).join('') + '</div>' +
        (t.owner.me ? '<form id="inv" style="display:flex;gap:8px;margin-top:10px"><input class="input" type="email" id="invE" placeholder="teammate@agency.com" required><button class="btn" type="submit">' + I('plus') + 'Invite</button></form>' : '<button class="btn ghost sm" type="button" id="leave" style="margin-top:10px">Leave team</button>');
      var f = $('#inv'); if (f) f.onsubmit = function (e) { e.preventDefault(); SV.post('/api/team/invite', { email: $('#invE').value }).then(function () { SV.toast('Invite sent'); $('#invE').value = ''; }).catch(SV.fail); };
      SV.$$('[data-rm]').forEach(function (b) { b.onclick = function () { SV.post('/api/team/remove', { id: Number(b.dataset.rm) }).then(team); }; });
      var lv = $('#leave'); if (lv) lv.onclick = function () { SV.post('/api/team/remove', { id: SV.state.boot.user.id }).then(function () { location.reload(); }); };
    });
  }

  /* =================== ACCOUNT =================== */
  SV.route(/^\/app\/account$/, function (view) {
    var b = SV.state.boot;
    view.innerHTML = '<div class="boot"><div class="boot-eyes"></div></div>';
    SV.get('/api/app/me').then(function (d) {
      var u = d.user;
      view.innerHTML = '<div class="fade-in"><div class="page-head"><div style="display:flex;gap:16px;align-items:center"><span class="avatar" style="width:72px;height:72px;border-radius:22px">' + SV.avatar(u.email) + '</span><div><span class="eyebrow">Account</span><h1 style="margin-top:6px">' + esc(u.name) + '</h1><p>' + esc(u.email) + (u.email_verified ? ' · <span style="color:var(--mint)">verified</span>' : ' · <button type="button" id="resend" style="border:0;background:none;color:var(--blue);font-weight:800;padding:0">confirm your email</button>') + '</p></div></div></div>' +
        '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));align-items:start">' +
        '<form class="panel grid" id="prof" style="gap:12px"><h3 style="font-size:19px">Profile</h3><div class="field"><label>Name</label><input class="input" id="pn" value="' + esc(u.name) + '"></div>' +
        '<div class="field"><label>Country (decides your payment methods)</label><select class="input" id="pc">' + b.countries.map(function (c) { return '<option value="' + c.code + '"' + (c.code === u.country ? ' selected' : '') + '>' + c.flag + ' ' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
        '<label class="li" style="padding:6px 0;border:0"><span class="grow"><b>Weekly spy report</b><small>Top angles in your niche, every Monday</small></span><button class="toggle" type="button" role="switch" id="wk" aria-checked="' + !d.marketing_opt_out + '"></button></label>' +
        '<label class="li" style="padding:6px 0;border:0"><span class="grow"><b>Dark mode</b><small>Easy on the eyes at night</small></span><button class="toggle" type="button" role="switch" id="dm" aria-checked="' + (document.documentElement.getAttribute('data-theme') === 'dark') + '"></button></label>' +
        '<button class="btn" type="submit">Save changes</button></form>' +
        '<div class="grid" style="gap:18px">' +
        (u.voo ? '<div class="panel"><h3 style="font-size:19px">VooSquare account</h3><p class="mut" style="font-weight:600">You log in with your Voo ID. Manage your password and connected tools in VooSquare.</p><a class="btn ghost" href="' + esc(b.voosquare.home_url) + '" target="_blank" rel="noopener">' + I('ext') + 'Open VooSquare</a></div>' :
          (d.has_password ? '<form class="panel grid" id="pw" style="gap:12px"><h3 style="font-size:19px">Password</h3><div class="field"><label>Current password</label><input class="input" type="password" id="p1" autocomplete="current-password"></div><div class="field"><label>New password</label><input class="input" type="password" id="p2" autocomplete="new-password" minlength="8"></div><button class="btn ghost" type="submit">Change password</button></form>' : '')) +
        '<div class="panel"><h3 style="font-size:19px">Help</h3><p class="mut" style="font-weight:600">Stuck? Replay the tour, or write to us at <b>' + esc(b.support_email) + '</b>.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" type="button" id="replay">' + I('play') + 'Replay the tour</button><button class="btn ghost" type="button" id="cpmail">' + I('copy') + 'Copy support email</button></div></div>' +
        '<div class="panel"><h3 style="font-size:19px">Danger zone</h3><p class="mut" style="font-weight:600">Delete your account and everything you saved. This can’t be undone.</p><button class="btn ghost" type="button" id="delAcc" style="color:var(--coral)">' + I('trash') + 'Delete my account</button></div></div></div></div>';
      $('#prof').onsubmit = function (e) {
        e.preventDefault();
        SV.api('PATCH', '/api/app/me', { name: $('#pn').value, country: $('#pc').value, marketing_opt_out: $('#wk').getAttribute('aria-checked') !== 'true' }).then(function (r) { SV.state.boot.user = r.user; SV.toast('Saved'); SV.shell(); }).catch(SV.fail);
      };
      SV.$$('.toggle', view).forEach(function (t) { t.onclick = function () { t.setAttribute('aria-checked', t.getAttribute('aria-checked') !== 'true'); if (t.id === 'dm') SV.setTheme(t.getAttribute('aria-checked') === 'true' ? 'dark' : 'light'); }; });
      var pw = $('#pw'); if (pw) pw.onsubmit = function (e) { e.preventDefault(); SV.api('PATCH', '/api/app/me', { password: $('#p1').value, new_password: $('#p2').value }).then(function () { SV.toast('Password changed'); pw.reset(); }).catch(SV.fail); };
      var rs = $('#resend'); if (rs) rs.onclick = function () { SV.post('/api/auth/resend').then(function () { SV.toast('Check your inbox for the link', { icon: 'bell' }); }).catch(SV.fail); };
      $('#replay').onclick = function () { SV.tour.start(); };
      $('#cpmail').onclick = function () { SV.copy(b.support_email, 'Email'); };
      $('#delAcc').onclick = function () {
        var md = SV.modal('<h2>Delete your account?</h2><p class="mut" style="font-weight:600">Boards, saved ads, alerts and scripts are deleted. Paid time is not refunded.</p>' + (d.has_password ? '<div class="field"><label>Type your password to confirm</label><input class="input" type="password" id="dp"></div>' : '') + '<div class="actions"><button class="btn ghost" id="dno">Keep my account</button><button class="btn dark" id="dyes">Delete forever</button></div>');
        md.el.querySelector('#dno').onclick = function () { md.close(true); };
        md.el.querySelector('#dyes').onclick = function () { var p = md.el.querySelector('#dp'); SV.post('/api/app/delete-account', { password: p ? p.value : '' }).then(function () { location.href = '/'; }).catch(SV.fail); };
      };
    }).catch(SV.fail);
  });
})();
