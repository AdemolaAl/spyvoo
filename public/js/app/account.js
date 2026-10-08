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
        view.innerHTML = '<div class="fade-in"><div class="page-head"><div><span class="eyebrow">Plan & billing</span><h1>' + (cur.id === 'free' ? 'Find more winners, faster' : 'You’re on ' + esc(cur.name)) + '</h1><p>' + (cur.id === 'free' ? 'Upgrade when you’re ready. Pay with USDT or Bitcoin. Nothing renews or charges you automatically.' : 'Active until ' + SV.date(cur.renews_at) + '. Nothing charges you automatically: we email you a few days before so you can renew.') + '</p></div>' +
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
            (o.status === 'pending' && o.pay_url ? '<a class="btn sm" href="' + esc(o.pay_url) + '">Pay</a>'
              : o.pay && (o.status === 'pending' || o.status === 'expired') ? '<button class="btn sm" type="button" data-pay="' + esc(o.ref) + '">' + (o.status === 'expired' ? 'Paid already?' : 'Pay') + '</button>'
              : o.pay && o.status === 'review' ? '<button class="status review" type="button" data-pay="' + esc(o.ref) + '">In review</button>'
              : '<span class="status ' + o.status + '">' + o.status.replace(/_/g, ' ') + '</span>') + '</div>' +
            (o.status === 'rejected' && o.review_note ? '<p class="rej-note">' + esc(o.review_note) + '</p>' : '');
        }).join('') : '<p class="mut" style="font-weight:600">No payments yet.</p>';
        SV.$$('[data-pay]').forEach(function (b) { b.onclick = function () { var o = d.orders.filter(function (x) { return x.ref === b.dataset.pay; })[0]; if (o && o.pay) payModal(o.pay); }; });
        team();
      }
      draw();
      var ref = q.get('order');
      if (ref) poll(ref, 0, { prev: SV.state.boot && SV.state.boot.user && SV.state.boot.user.plan, orders: d.orders });
      if (q.get('checkout')) checkout(d, q.get('checkout'), q.get('interval') === 'year' ? 'year' : 'month', coupon);
    }).catch(SV.fail);
  });

  // Was this payment a renewal of the plan the user already had? (then "extended", not "welcome")
  function isRenewal(ctx, ref, plan, orderPlan) {
    var prev = ctx && ctx.prev;
    if (!prev || prev.owner || !prev.paid || prev.id !== plan.id) return false;
    if (prev.renews_at && prev.renews_at !== plan.renews_at) return true;
    // The plan may already have switched on before this page loaded: look for an earlier paid order for the same plan.
    return (ctx.orders || []).some(function (o) { return o.ref !== ref && o.status === 'paid' && o.plan === orderPlan; });
  }

  function poll(ref, n, ctx) {
    n = n || 0;
    SV.get('/api/app/orders/' + encodeURIComponent(ref)).then(function (r) {
      if (!r.order) return;
      if (r.order.status === 'paid') {
        history.replaceState({}, '', '/app/plan');
        SV.state.boot.user = r.user;
        var pl = r.user.plan, name = pl.owner ? (r.order.plan || pl.name) : pl.name;
        var renew = isRenewal(ctx, ref, pl, r.order.plan);
        SV.modal('<div class="pay-done">' + (SV.tier && SV.tier(r.user) ? SV.agentCard(r.user, SV.tier(r.user), ref) : '<div class="md-art">' + SV.agent(SV.cast.host, { pose: 'cheer' }) + '</div>') + '<span class="eyebrow" style="color:var(--mint)">Payment confirmed</span><h2 style="margin-top:8px">' + (renew ? 'Your ' + esc(name) + ' plan is extended' : 'Welcome to ' + esc(name) + '!') + '</h2><p class="mut" style="font-weight:600">' + (pl.renews_at ? 'Your plan is active until ' + SV.date(pl.renews_at) + '. ' : '') + 'A receipt is in your inbox.</p><div class="actions" style="justify-content:center"><a class="btn grad" href="/app/discover">' + I('search') + 'Start spying</a></div></div>', { onClose: function () { SV.render(); } });
        SV.confetti(null, null, 220);
        // Redraw the shell now so the sidebar upgrade box goes and the member badge shows without a reload.
        if (typeof SV.shell === 'function') { try { SV.shell(); } catch (e) { /* the modal is what matters */ } }
        SV.boot(true);
      } else if (r.order.status === 'pending' && n < 40) {
        if (n === 0) SV.toast('Waiting for your payment to confirm…', { icon: 'clock', ms: 4000 });
        setTimeout(function () { poll(ref, n + 1, ctx); }, 6000);
      } else if (r.order.status === 'failed') SV.toast('That payment didn’t go through. Try again.', { bad: true });
    }).catch(function () {});
  }

  function checkout(d, planId, interval, coupon) {
    var plan = d.plans.find(function (p) { return p.id === planId; });
    if (!plan) return;
    var methods = d.methods;
    var md = SV.modal('<span class="eyebrow">Checkout</span><h2 style="margin-top:8px">' + esc(plan.name) + ' · ' + interval + 'ly</h2>' +
      (methods.length ? '<div class="field" style="margin-top:14px"><label>Pay with</label><div class="methods">' + methods.map(function (m, i) {
        return '<label class="method"><input type="radio" name="pm" value="' + m.id + '"' + (i === 0 ? ' checked' : '') + '>' + (m.provider === 'manual' ? '<span class="pm-ic">' + I(m.icon || 'bank') + '</span>' : '') + '<span style="flex:1;min-width:0"><b>' + esc(m.name) + '</b><small>' + esc(m.description) + (m.provider === 'manual' && m.currency && m.currency !== 'USD' ? ' Pay in ' + esc(m.currency) + '.' : '') + '</small>' +
          '</span></label>';
      }).join('') + '</div><div id="coinBox"></div></div>' : '<p class="mut">No payment method is available for your country yet. Contact support.</p>') +
      '<div class="field" style="margin-top:12px"><label>Discount code</label><div style="display:flex;gap:8px"><input class="input" id="cpn" placeholder="e.g. SPYLAUNCH" value="' + esc(coupon || '') + '" style="text-transform:uppercase"><button class="btn ghost" type="button" id="cpnGo">Apply</button></div><small id="cpnMsg" style="font-weight:700"></small></div>' +
      '<div class="sum" id="sum"></div><p id="payErr" class="pay-err" role="alert" hidden></p><div class="actions"><button class="btn grad block" type="button" id="pay"' + (methods.length ? '' : ' disabled') + '>' + I('lock') + 'Continue to payment</button></div>' +
      '<p class="mut" style="font-size:12px;font-weight:600;margin:10px 0 0;text-align:center">Secure checkout. Your plan switches on as soon as the payment confirms. First paid order? You can ask for a refund within 7 days.</p>');
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
      var eb = el.querySelector('#payErr'); if (eb) eb.hidden = true;
      var b = this, pm = el.querySelector('input[name=pm]:checked'), coin = el.querySelector('input[name=coin]:checked');
      if (!pm) return;
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Creating your order…';
      SV.post('/api/app/checkout', { plan: planId, interval: interval, method_id: Number(pm.value), coupon: applied, coin: coin ? coin.value : undefined }).then(function (r) {
        if (r.checkout_url) { location.href = r.checkout_url; return; }
        md.close(true);
        if (r.pay) { payModal(r.pay); return; }
        SV.modal('<span class="eyebrow">Order ' + esc(r.ref) + '</span><h2 style="margin-top:8px">Almost done</h2><p style="font-weight:600;white-space:pre-wrap">' + esc(r.instructions || 'We will confirm your payment shortly.') + '</p><div class="sum"><div class="total"><span>Amount</span><span>' + SV.money(r.amount) + '</span></div></div><div class="actions"><a class="btn" href="/app/plan">Done</a></div>');
      }).catch(function (e) {
        b.disabled = false; b.innerHTML = I('lock') + 'Continue to payment';
        // Say what went wrong right above the button (the server sends a specific, safe reason).
        var box = el.querySelector('#payErr'), d = e.data || {};
        var msg = e.message || 'The payment couldn’t start. Please try again.';
        if (/^gatevoo_/.test(d.code || '') && d.other_methods) msg += ' You can also pick another way to pay above.';
        if (box) { box.textContent = msg; box.hidden = false; box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } else SV.fail(e);
      });
    };
  }

  /* Custom payment method (bank transfer, mobile money, wallet...): exact amount, account details with copy buttons,
     instructions, then a reference and/or a screenshot. The order waits for the team to approve it. */
  function money2(n, cur) { var v = Number(n); return (v % 1 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : v.toLocaleString('en-US')) + ' ' + cur; }
  function shrink(file) {
    // Phone screenshots can be large: resize to 1600px JPEG when over 1.5 MB.
    return new Promise(function (ok, no) {
      var rd = new FileReader();
      rd.onerror = function () { no(new Error('Couldn’t read that file. Try another screenshot.')); };
      rd.onload = function () {
        if (file.size <= 1.5e6) return ok(rd.result);
        var img = new Image();
        img.onerror = function () { no(new Error('That file isn’t an image we can read. Use a PNG or JPG.')); };
        img.onload = function () { var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.85)); };
        img.src = rd.result;
      };
      rd.readAsDataURL(file);
    });
  }
  function payModal(p) {
    var copyRow = function (label, value, key) { return '<div class="pay-row"><span><small>' + esc(label) + '</small><b>' + esc(value) + '</b></span><button class="btn ghost sm" type="button" data-cp="' + key + '" aria-label="Copy ' + esc(label) + '">' + I('copy') + '</button></div>'; };
    var vals = { amt: String(p.amount), ref: p.ref };
    (p.details || []).forEach(function (x, i) { vals['d' + i] = x.value; });
    var review = p.status === 'review', mode = p.proof_mode || 'either';
    var md = SV.modal('<span class="eyebrow">Order ' + esc(p.ref) + '</span><h2 style="margin-top:8px">' + (review ? 'Payment in review' : 'Pay with ' + esc(p.name)) + '</h2>' +
      (review ? '<div class="pay-state">' + I('clock') + '<span>We got your proof' + (p.proof ? ' (' + esc(p.proof) + ')' : '') + '. Our team is checking it and will switch your plan on. You’ll get an email.</span></div>' : '') +
      '<div class="pay-amount"><small>Send exactly</small><b class="tnum">' + esc(money2(p.amount, p.currency)) + '</b>' + (p.currency !== 'USD' ? '<small>= ' + SV.money(p.amount_usd) + ' at a locked rate</small>' : '') + (p.coupon ? '<small style="color:var(--mint)">' + esc(p.coupon) + ' applied (was ' + SV.money(p.list_usd) + ')</small>' : '') + '<button class="btn ghost sm" type="button" data-cp="amt">' + I('copy') + 'Copy amount</button></div>' +
      '<div class="pay-rows">' + (p.details || []).map(function (x, i) { return copyRow(x.label || 'Detail', x.value, 'd' + i); }).join('') + copyRow('Payment note / reference', p.ref, 'ref') + '</div>' +
      (p.instructions ? '<p class="pay-ins">' + esc(p.instructions) + '</p>' : '') +
      (mode === 'none' ? '<div class="actions"><button class="btn grad block" type="button" id="prfGo">' + I('check') + 'I’ve paid</button></div>' :
      '<form id="prfF" class="pay-proof"><h3>' + (review ? 'Update your proof' : 'After you pay') + '</h3>' +
        (mode !== 'image' ? '<div class="field"><label for="prfT">Transfer reference or transaction ID' + (mode === 'either' ? ' (or a screenshot)' : '') + '</label><input class="input" id="prfT" maxlength="300" autocomplete="off" placeholder="e.g. FT2410061234" value="' + esc(p.proof || '') + '"></div>' : '') +
        (mode !== 'text' ? '<div class="field"><label for="prfI">Screenshot of the payment' + (mode === 'either' ? ' (or type a reference above)' : '') + '</label><label class="file-pick"><input type="file" id="prfI" accept="image/png,image/jpeg,image/webp">' + I('upload') + '<span id="prfN">' + (p.has_screenshot ? 'Screenshot added. Tap to replace' : 'Choose a screenshot') + '</span></label></div>' : '') +
        '<p id="prfErr" class="pay-err" role="alert" hidden></p><div class="actions"><button class="btn grad block" type="submit" id="prfGo">' + I('check') + (review ? 'Update proof' : 'I’ve paid, send for review') + '</button></div></form>') +
      '<p class="mut" style="font-size:12px;font-weight:600;margin:10px 0 0;text-align:center">Your price is locked on this order. We switch your plan on as soon as we confirm the money arrived.</p>');
    var el = md.el;
    SV.$$('[data-cp]', el).forEach(function (b) { b.onclick = function () { SV.copy(vals[b.dataset.cp], b.dataset.cp === 'amt' ? 'Amount' : b.dataset.cp === 'ref' ? 'Reference' : 'Detail'); }; });
    var fi = el.querySelector('#prfI'); if (fi) fi.onchange = function () { el.querySelector('#prfN').textContent = fi.files[0] ? fi.files[0].name : 'Choose a screenshot'; };
    var send = function (e) {
      if (e) e.preventDefault();
      var b = el.querySelector('#prfGo'), err = el.querySelector('#prfErr'), t = el.querySelector('#prfT'), f = fi && fi.files[0];
      if (err) err.hidden = true;
      b.disabled = true; var label = b.innerHTML; b.innerHTML = '<span class="spin"></span>Sending…';
      (f ? shrink(f) : Promise.resolve(undefined)).then(function (img) {
        return SV.post('/api/app/orders/' + encodeURIComponent(p.ref) + '/proof', { reference: t ? t.value : '', image: img });
      }).then(function (r) {
        md.close(true);
        // Refresh billing history first (a re-render closes open layers), then show the "in review" card.
        if (location.pathname === '/app/plan') { history.replaceState({}, '', '/app/plan'); SV.state.keepScroll = true; SV.render(); }
        payModal(r.pay);
      }).catch(function (x) { b.disabled = false; b.innerHTML = label; if (err) { err.textContent = x.message; err.hidden = false; } else SV.fail(x); });
    };
    var form = el.querySelector('#prfF'); if (form) form.onsubmit = send; else el.querySelector('#prfGo').onclick = send;
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
      view.innerHTML = '<div class="fade-in"><div class="page-head acct-head"><div class="acct-id"><span class="avatar" style="width:72px;height:72px;border-radius:22px">' + SV.avatar(u.email) + '</span><div class="acct-who"><span class="eyebrow">Account</span><h1 style="margin-top:6px">' + esc(u.name) + '</h1><p><span class="acct-mail" title="' + esc(u.email) + '">' + esc(u.email) + '</span>' + (u.email_verified ? ' · <span style="color:var(--mint)">verified</span>' : ' · <button type="button" id="resend" style="border:0;background:none;color:var(--blue);font-weight:800;padding:0">confirm your email</button>') + '</p></div></div></div>' +
        '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));align-items:start">' +
        '<form class="panel grid" id="prof" style="gap:12px"><h3 style="font-size:19px">Profile</h3><div class="field"><label>Name</label><input class="input" id="pn" value="' + esc(u.name) + '"></div>' +
        '<div class="field"><label>Country (decides your payment methods)</label><select class="input" id="pc">' + b.countries.map(function (c) { return '<option value="' + c.code + '"' + (c.code === u.country ? ' selected' : '') + '>' + c.flag + ' ' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
        '<label class="li" style="padding:6px 0;border:0"><span class="grow"><b>Weekly report, offers & news</b><small>Top angles in your niche every Monday, plus deals and product news. Receipts and your ad alerts still arrive either way.</small></span><button class="toggle" type="button" role="switch" id="wk" aria-checked="' + !d.marketing_opt_out + '"></button></label>' +
        '<label class="li" style="padding:6px 0;border:0"><span class="grow"><b>Dark mode</b><small>Easy on the eyes at night</small></span><button class="toggle" type="button" role="switch" id="dm" aria-checked="' + (document.documentElement.getAttribute('data-theme') === 'dark') + '"></button></label>' +
        '<button class="btn" type="submit">Save changes</button></form>' +
        '<div class="grid" style="gap:18px">' +
        (u.voo ? '<div class="panel"><h3 style="font-size:19px">VooSquare account</h3><p class="mut" style="font-weight:600">You log in with your Voo ID. Manage your password and connected tools in VooSquare.</p><a class="btn ghost" href="' + esc(b.voosquare.app_url) + '" target="_blank" rel="noopener">' + I('ext') + 'Open VooSquare</a></div>' :
          (b.voosquare.enabled ? '<div class="panel"><h3 style="font-size:19px">Connect VooSquare</h3><p class="mut" style="font-weight:600">Use one Voo ID for Spyvoo and every Voo tool. Your boards, alerts and plan stay as they are.</p><a class="btn" href="/auth/voosquare?return_to=%2Fapp%2Faccount" id="vooConnect">' + I('link') + 'Connect VooSquare</a></div>' : '') +
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
