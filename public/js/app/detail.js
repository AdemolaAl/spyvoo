/* Ad detail drawer: player, numbers, timeline, the ad's text, AI breakdown, "Make it mine", save, download, follow. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I, $ = SV.$;

  // The v2 breakdown fields (scores, hook type, awareness, funnel, compliance, test ideas). Every value is model output:
  // always escaped, numbers checked, arrays capped. Older breakdowns without them simply skip this part.
  var PILL = 'display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 10px;font-weight:800;font-size:12.5px;line-height:1.2;max-width:100%;';
  var RISK = { low: ['#14C894', '#05271C', 'Low ban risk'], medium: ['#FFB020', '#2A1B00', 'Medium ban risk'], high: ['#FF3D5A', '#fff', 'High ban risk'] };
  function num(n) { return typeof n === 'number' && isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : null; }
  function list(v, n) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }).slice(0, n) : []; }
  function v2Html(an) {
    var sc = an.scores && typeof an.scores === 'object' ? an.scores : {};
    var scores = [['overall', 'Overall'], ['hook', 'Hook'], ['offer', 'Offer'], ['creative', 'Creative']].filter(function (k) { return num(sc[k[0]]) !== null; }).map(function (k, i) {
      var v = num(sc[k[0]]);
      return '<span style="' + PILL + (i === 0 && k[0] === 'overall' ? 'background:#fff;color:var(--blue)' : 'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24)') + '" title="' + esc(k[1]) + ' score">' + esc(k[1]) + ' <b class="tnum" style="font-size:15px">' + v + '</b><small style="opacity:.7">/10</small></span>';
    }).join('');
    var chip = function (label, value) { return value ? '<span style="' + PILL + 'background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.24)"><small style="opacity:.75;font-weight:700">' + esc(label) + '</small>' + esc(value) + '</span>' : ''; };
    var soph = typeof an.sophistication === 'number' && an.sophistication >= 1 && an.sophistication <= 5 ? 'Level ' + Math.round(an.sophistication) + '/5' : '';
    var cr = an.compliance_risk && RISK[an.compliance_risk.level] ? an.compliance_risk : null;
    var chips = chip('Hook', an.hook_type) + chip('Awareness', an.awareness_stage) + chip('Sophistication', soph) + chip('Funnel', an.funnel) +
      (cr ? '<span style="' + PILL + 'background:' + RISK[cr.level][0] + ';color:' + RISK[cr.level][1] + '">' + I('flag', ' width="13" height="13"') + RISK[cr.level][2] + '</span>' : '');
    if (!scores && !chips) return '';
    return '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' +
      (scores ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' + scores + '</div>' : '') +
      (chips ? '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips + '</div>' : '') +
      (cr && cr.notes ? '<p style="margin:0;font-size:12.5px;font-weight:600;line-height:1.45;opacity:.9">' + esc(String(cr.notes).slice(0, 600)) + '</p>' : '') + '</div>';
  }

  function aiHtml(an) {
    var mech = list(an.offer_mechanics, 6), ideas = list(an.test_ideas, 5);
    return v2Html(an) + '<div class="ai-out"><div><b>Hook</b>“' + esc(an.hook) + '”</div><div><b>Offer</b>' + esc(an.offer) +
      (mech.length ? '<span class="trig" style="margin-top:6px">' + mech.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span>' : '') + '</div>' +
      '<div><b>' + (an.persona ? 'Who it targets' : 'Audience') + '</b>' + esc(an.persona || an.audience) + '</div>' +
      '<div><b>Triggers</b><span class="trig">' + (an.triggers || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</span></div>' +
      (an.angle ? '<div class="wide"><b>Angle</b>' + esc(an.angle) + (an.pacing ? '<span style="display:block;margin-top:6px;opacity:.75;font-size:13px">' + esc(an.format) + ' · ' + esc(an.pacing) + '</span>' : '') + '</div>' : '') +
      '<div class="wide"><b>Why it works</b>' + esc(an.why) + '</div><div class="wide"><b>Make your own version</b>' + esc(an.how_to_adapt) + '</div>' +
      (ideas.length ? '<div class="wide"><b>Test this next</b><ol style="margin:0;padding-left:20px;display:grid;gap:5px">' + ideas.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>' : '') +
      (an.transcript ? '<div class="wide"><b>Transcript</b>' + esc(an.transcript.slice(0, 1200)) + '</div>' : '') + '</div>' +
      '<p style="margin:12px 0 0;font-size:12px;opacity:.75;font-weight:700">' + (an.model === 'spyvoo-basic' && SV.isAdmin() ? 'Admin note: rule-based breakdown. Add an AI key in Admin → Ad data & AI for the full expert analysis.' : 'Written by Spyvoo AI from the ad’s copy, run time and reach. Scores are estimates, not spend data.') + '</p>';
  }
  function lockedHtml(d) {
    var m = SV.state.meter ? SV.state.meter.analyses : { used: 0, limit: 5 };
    var left = m.limit === -1 ? 'Unlimited on your plan' : Math.max(0, m.limit - m.used) + ' of ' + m.limit + ' breakdowns left this month';
    return '<div class="locked"><div class="scanner"><i></i><s style="left:14px;top:18px;width:60%"></s><s style="left:14px;top:40px;width:40%"></s><s style="left:14px;top:62px;width:75%"></s><s style="left:14px;top:84px;width:30%"></s></div>' +
      '<p>The AI reads the hook, offer, audience and triggers, then tells you in plain words why this ad keeps running.</p>' +
      '<button class="btn" type="button" id="unlock" style="background:#fff;color:var(--blue);box-shadow:none">' + I('spark') + 'Break it down</button><small style="opacity:.8;font-weight:700">' + left + '</small></div>';
  }

  SV.openAd = function (id, opts) {
    opts = opts || {};
    var dr = SV.drawer({});
    SV.state.drawer = dr;
    dr.body.innerHTML = '<div class="dt"><div class="dt-grid"><div class="player skel"></div><div><div class="skel" style="height:48px;width:60%"></div><div class="stats">' + '<div class="stat skel" style="height:80px"></div>'.repeat(4) + '</div><div class="skel" style="height:160px"></div></div></div></div>';
    var p = opts.data ? Promise.resolve(opts.data) : SV.get('/api/app/ads/' + id);
    p.then(function (d) { render(dr, d, opts); }).catch(function (e) { dr.body.innerHTML = '<div class="dt">' + SV.emptyState(SV.scene('spy', 'think'), 'Ad not available', e.message) + '</div>'; });
    return dr;
  };

  function render(dr, d, opts) {
    var a = d.ad, el = dr.body;
    var media = a.media && a.media.length ? a.media : [{ type: 'image', url: a.thumb, poster: a.thumb }];
    var first = media[0];
    var isVideo = function (m) { return m.type === 'video' && /\.(mp4|webm|mov)(\?|$)/i.test(m.url || ''); };
    var playerInner = function (m) { return isVideo(m) ? '<video src="' + esc(m.url) + '" poster="' + esc(m.poster || '') + '" controls playsinline preload="metadata"></video>' : '<img class="kb" src="' + esc(m.poster || m.url) + '" alt="Ad creative">'; };
    var started = a.start_date ? new Date(a.start_date) : null;
    var total = Math.max(1, a.days);
    var flagRow = (a.countries_named || []).filter(function (c) { return c.code !== 'ALL'; }).map(function (c) { return '<span class="chip" style="padding:6px 10px">' + c.flag + ' ' + esc(c.name) + '</span>'; }).join('') || '<span class="chip">🌍 All countries</span>';
    var savedOn = d.saved_in && d.saved_in.length;
    el.innerHTML = '<div class="dt">' +
      '<div class="dt-grid"><div><div class="player" id="player">' + playerInner(first) + (media.length > 1 ? '<div class="thumbs">' + media.slice(0, 6).map(function (m, i) { return '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-m="' + i + '"><img src="' + esc(m.poster || m.url) + '" alt=""></button>'; }).join('') + '</div>' : '') +
      (isVideo(first) ? '' : '<div class="hud-tag">' + SV.G(a.media_type === 'video' ? 'video' : a.media_type === 'carousel' ? 'layers' : 'image') + '<span>' + (a.media_type === 'video' ? 'Video cover · open the original to play' : a.media_type === 'carousel' ? 'Carousel' : 'Image ad') + '</span></div>') + '</div>' +
      (a.sample && SV.isAdmin() ? '<p class="mut" style="font-size:12.5px;font-weight:700;margin:10px 4px 0">' + I('flag', ' width="13" height="13"') + ' Admin note: sample ad. Real ads replace these once Apify is connected.</p>' : '') + '</div>' +
      '<div><div class="adv-row"><a href="/app/advertiser/' + a.advertiser.id + '" data-close-dr>' + SV.logo(a.advertiser) + '</a><div style="flex:1;min-width:0"><a href="/app/advertiser/' + a.advertiser.id + '" data-close-dr><b>' + esc(a.advertiser.name) + '</b></a><small>' + SV.plat(a.platforms) + esc(a.niche || 'Advertiser') + ' · ' + (a.platforms || []).map(function (x) { return x[0].toUpperCase() + x.slice(1).replace('_', ' '); }).join(', ') + '</small></div>' +
      '<button class="btn sm' + (d.following ? ' ghost' : ' grad') + '" type="button" id="dfollow">' + I(d.following ? 'check' : 'bell') + (d.following ? 'Following' : 'Follow') + '</button></div>' +
      '<div class="stats">' + [['Days running', a.days, '#FF3D8B'], ['Score', a.score + '<small style="font-size:14px;color:var(--mut)">/100</small>', '#7B5CFF'], ['Variations', a.variations, '#1F5BFF'], ['Countries', (a.countries || []).filter(function (c) { return c !== 'ALL'; }).length || 'All', '#14C894']].map(function (s) { return '<div class="stat" style="--c:' + s[2] + '"><small>' + s[0] + '</small><b class="tnum">' + s[1] + '</b></div>'; }).join('') + '</div>' +
      '<div class="timeline"><span>' + (started ? SV.date(a.start_date) : 'Start unknown') + '</span><span class="tl"><i style="right:' + (a.status === 'active' ? 0 : 6) + '%"></i></span><span style="color:' + (a.status === 'active' ? 'var(--mint)' : 'var(--mut)') + '">' + (a.status === 'active' ? '● Still running' : 'Stopped ' + SV.date(a.end_date || a.last_seen_at)) + '</span></div>' +
      '<div class="dt-actions"><button class="btn' + (savedOn ? ' ghost' : '') + '" type="button" id="dsave">' + SV.G('heart') + (savedOn ? 'Saved' : 'Save to board') + '</button>' +
      '<button class="btn ghost" type="button" id="ddl">' + SV.G('download') + 'Download</button>' +
      '<button class="btn ghost" type="button" id="dcopy">' + SV.G('copy') + 'Copy text</button>' +
      (a.library_url ? '<a class="btn ghost" href="' + esc(a.library_url) + '" target="_blank" rel="noopener">' + I('ext') + 'Meta Ad Library</a>' : '') +
      (a.landing_url ? '<a class="btn ghost" href="' + esc(a.landing_url) + '" target="_blank" rel="noopener nofollow">' + SV.G('link') + esc(a.domain || 'Landing page') + '</a>' : '') + '</div>' +
      '<div class="copy-box" style="margin-top:14px"><h4>Ad text</h4>' + (a.headline ? '<p style="font-weight:800;color:var(--ink)">' + esc(a.headline) + '</p>' : '') + '<p>' + esc(a.text) + '</p>' + (a.description ? '<p class="mut">' + esc(a.description) + '</p>' : '') + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="chip" style="padding:6px 10px">' + I('cursor') + esc(a.cta || 'No button') + '</span>' + flagRow + '</div></div>' +
      '<div class="ai-box" id="aibox"><h3><span class="sp">' + I('spark', ' width="17" height="17"') + '</span>AI breakdown</h3><div id="aiBody">' + (a.analysis ? aiHtml(a.analysis) : lockedHtml(d)) + '</div></div>' +
      '<div class="mine" id="mine"><span class="eyebrow" style="color:var(--violet)">Make it mine</span><h3 style="margin-top:6px">Turn this angle into your own ad</h3><p class="mut" style="font-weight:600;margin:6px 0 12px">Tell us your product. The AI writes 3 fresh video scripts and 5 headlines in this ad’s style, without copying it.</p>' +
      '<form id="mineForm" style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" id="product" placeholder="Your product, e.g. “organic hair oil”" style="flex:1;min-width:200px"><button class="btn grad" type="submit">' + I('wand') + 'Write my scripts</button></form><div id="mineOut"></div></div>' +
      '</div></div>' +
      (a.variations_list && a.variations_list.length ? '<section class="sec">' + SV.secHead('Other variations of this ad', 'layers', 'var(--blue)') + '<div class="strip">' + a.variations_list.map(function (x) { return SV.adCard(x, { compact: true }); }).join('') + '</div></section>' : '') +
      (d.more && d.more.length ? '<section class="sec">' + SV.secHead('More from ' + esc(a.advertiser.name), 'radar', 'var(--mint)', { href: '/app/advertiser/' + a.advertiser.id, label: 'All their ads' }) + '<div class="strip">' + d.more.map(function (x) { return SV.adCard(x, { compact: true }); }).join('') + '</div></section>' : '') +
      (d.similar && d.similar.length ? '<section class="sec">' + SV.secHead('Similar winners', 'fire', 'var(--pink)') + '<div class="strip">' + d.similar.map(function (x) { return SV.adCard(x, { compact: true }); }).join('') + '</div></section>' : '') +
      '</div>';

    SV.$$('[data-close-dr]', el).forEach(function (x) { x.addEventListener('click', function () { dr.close(true); }); });
    SV.$$('.thumbs [data-m]', el).forEach(function (b) {
      b.onclick = function () { var m = media[Number(b.dataset.m)]; var pl = $('#player', el); pl.querySelector('img, video').outerHTML = playerInner(m); SV.$$('.thumbs button', el).forEach(function (x) { x.classList.toggle('on', x === b); }); };
    });
    if (opts.tour) return; // the tour drives the rest itself

    $('#dfollow', el).onclick = function () {
      var on = !d.following, b = this;
      SV.post('/api/app/advertisers/' + a.advertiser.id + '/follow', { on: on }).then(function () {
        d.following = on; b.className = 'btn sm' + (on ? ' ghost' : ' grad'); b.innerHTML = I(on ? 'check' : 'bell') + (on ? 'Following' : 'Follow');
        if (on) { SV.toast('Following ' + a.advertiser.name + '. New ads will alert you.', { icon: 'bell' }); var r = b.getBoundingClientRect(); SV.confetti(r.left + 30, r.top, 40); }
      }).catch(SV.fail);
    };
    $('#dsave', el).onclick = function () { saveTo(a, this); };
    $('#ddl', el).onclick = function () {
      var b = this; b.disabled = true;
      SV.post('/api/app/ads/' + a.id + '/download', {}).then(function (r) {
        b.disabled = false;
        var link = document.createElement('a'); link.href = r.url; link.download = r.filename; link.target = '_blank'; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove();
        SV.toast('Download started', { icon: 'download' }); SV.refreshMeter();
      }).catch(function (e) { b.disabled = false; SV.fail(e); });
    };
    $('#dcopy', el).onclick = function () { SV.copy([a.headline, a.text, a.description].filter(Boolean).join('\n\n'), 'Ad text'); };
    var un = $('#unlock', el);
    if (un) un.onclick = function () {
      un.disabled = true; un.innerHTML = '<span class="spin"></span>Reading the ad…';
      SV.post('/api/app/ads/' + a.id + '/analyse', {}).then(function (r) {
        $('#aiBody', el).innerHTML = aiHtml(r.analysis); SV.refreshMeter();
        var bx = $('#aibox', el).getBoundingClientRect(); SV.confetti(bx.left + bx.width / 2, bx.top + 20, 60);
      }).catch(function (e) { un.disabled = false; un.innerHTML = I('spark') + 'Break it down'; SV.fail(e); });
    };
    $('#mineForm', el).onsubmit = function (e) {
      e.preventDefault();
      var btn = this.querySelector('button'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Writing…';
      SV.post('/api/app/ads/' + a.id + '/mine', { product: $('#product', el).value }).then(function (r) {
        btn.disabled = false; btn.innerHTML = I('wand') + 'Write again';
        $('#mineOut', el).innerHTML = '<div class="scripts">' + r.scripts.map(function (s, i) { return '<div class="script" style="animation-delay:' + (i * .1) + 's"><b>' + esc(s.title) + (s.hook_type ? ' <small style="font:700 11px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--violet);margin-left:4px">' + esc(s.hook_type) + '</small>' : '') + '</b><q' + (/[“”"]/.test(s.hook) ? ' class="noq"' : '') + '>' + esc(s.hook) + '</q>' +
            (s.first_3s ? '<p style="margin-bottom:6px"><b style="display:inline;font:800 12px/1 var(--body)">First 3 seconds: </b>' + esc(s.first_3s) + '</p>' : '') +
            (s.on_screen_text ? '<p style="margin-bottom:6px"><b style="display:inline;font:800 12px/1 var(--body)">On screen: </b>“' + esc(s.on_screen_text) + '”</p>' : '') +
            '<p>' + esc(s.body) + '</p><p style="margin-top:6px;font-weight:800;color:var(--blue)">Button: ' + esc(s.cta) + '</p></div>'; }).join('') + '</div>' +
          '<div class="heads">' + r.headlines.map(function (h) { return '<span>' + esc(h) + '</span>'; }).join('') + '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn ghost sm" type="button" id="cpAll">' + I('copy') + 'Copy all</button><a class="btn sm" style="background:#F25C2A" href="https://vooads.com/?utm_source=spyvoo&utm_medium=make-it-mine" target="_blank" rel="noopener">' + I('video') + 'Send to Vooads</a></div>';
        $('#cpAll', el).onclick = function () { SV.copy(r.scripts.map(function (s) { return s.title + (s.hook_type ? ' (' + s.hook_type + ')' : '') + '\nHook: ' + s.hook + (s.first_3s ? '\nFirst 3 seconds: ' + s.first_3s : '') + (s.on_screen_text ? '\nOn screen: ' + s.on_screen_text : '') + '\n' + s.body + '\nButton: ' + s.cta; }).join('\n\n') + '\n\nHeadlines:\n' + r.headlines.join('\n'), 'Scripts'); };
        SV.refreshMeter();
      }).catch(function (err) { btn.disabled = false; btn.innerHTML = I('wand') + 'Write my scripts'; SV.fail(err); });
    };
  }
  SV.aiHtml = aiHtml;

  function saveTo(a, btn, pre) {
    SV.get('/api/app/boards').then(function (d) {
      var savedIn = [];
      var md = SV.modal('<span class="eyebrow">Save ad</span><h2 style="margin-top:8px">Pick a board</h2><div class="list" id="blist">' +
        (d.items.length ? d.items.map(function (b) { return '<label class="li" style="cursor:pointer"><input type="checkbox" data-b="' + b.id + '" style="width:20px;height:20px;accent-color:var(--pink)"><span class="grow"><b>' + esc((b.emoji ? b.emoji + ' ' : '') + b.name) + '</b><small>' + b.count + ' ad' + (b.count === 1 ? '' : 's') + '</small></span></label>'; }).join('') : '<p class="mut">No boards yet. Create your first one.</p>') +
        '</div><div class="field" style="margin-top:10px"><label>Note (optional)</label><input class="input" id="bnote" placeholder="Why you saved it: the hook, the offer…"></div><div class="actions"><button class="btn ghost" id="bnew">' + I('plus') + 'New board</button><button class="btn" id="bsave">' + I('heart') + 'Save</button></div>');
      SV.get('/api/app/ads/' + a.id).then(function (x) { savedIn = x.saved_in || []; savedIn.concat(pre ? [pre] : []).forEach(function (id) { var c = md.el.querySelector('[data-b="' + id + '"]'); if (c) c.checked = true; }); });
      md.el.querySelector('#bnew').onclick = function () { md.close(true); SV.newBoard(function (nb) { saveTo(a, btn, nb && nb.id); }); };
      md.el.querySelector('#bsave').onclick = function () {
        var picks = SV.$$('[data-b]', md.el), note = md.el.querySelector('#bnote').value, jobs = [];
        picks.forEach(function (c) {
          var id = Number(c.dataset.b), was = savedIn.indexOf(id) >= 0;
          if (c.checked && (!was || note)) jobs.push(SV.post('/api/app/boards/' + id + '/items', { ad_id: a.id, note: note }));
          if (!c.checked && was) jobs.push(SV.api('DELETE', '/api/app/boards/' + id + '/items/' + a.id));
        });
        if (!d.items.length) jobs.push(SV.post('/api/app/quick-save', { ad_id: a.id }));
        Promise.all(jobs).then(function () {
          md.close(true); var any = picks.some(function (c) { return c.checked; }) || !d.items.length;
          btn.className = 'btn' + (any ? ' ghost' : ''); btn.innerHTML = I('heart', any ? ' fill="currentColor"' : '') + (any ? 'Saved' : 'Save to board');
          if (any) { SV.toast('Saved', { icon: 'heart', link: { href: '/app/boards', label: 'Open boards' } }); var r = btn.getBoundingClientRect(); SV.confetti(r.left + r.width / 2, r.top, 40); }
          SV.refreshMeter();
        }).catch(SV.fail);
      };
    }).catch(SV.fail);
  }
})();
