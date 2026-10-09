/* Admin → Support: every chat with the support agent. Chats handed to a person come first.
   Read the conversation with the customer's live account next to it, reply as yourself (the agent goes quiet),
   hand it back to the agent, close it. The agent's name, look, knowledge notes and switches live here too. */
(function () {
  'use strict';
  var SV = window.SV, A = SV.A, esc = SV.esc, I = SV.I, P = A.pages;
  var timer = null;
  var face = function (name, size) { return '<span style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;overflow:hidden;display:inline-block;flex:0 0 auto;background:#E8EFFF">' + (SV.teamFace ? SV.teamFace(name) : SV.agent(SV.cast.guide, { crop: true, pose: 'idle' })) + '</span>'; };
  var teamRow = function (names, size) { return '<span style="display:inline-flex">' + (names || []).map(function (n, i) { return '<span title="' + esc(n) + '" style="margin-left:' + (i ? -10 : 0) + 'px;box-shadow:0 0 0 3px var(--card);border-radius:50%;display:inline-flex">' + face(n, size) + '</span>'; }).join('') + '</span>'; };
  var rich = function (t) { return esc(t).replace(/\*\*([^*\n]{1,120})\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'); };

  P['/admin/support'] = function (view) {
    clearInterval(timer);
    var qs = new URLSearchParams(location.search);
    var st = { filter: qs.get('f') || 'needs', q: '', open: Number(qs.get('t')) || 0 };
    view.innerHTML = '<div id="supHead"></div><div class="sup-wrap"><div class="sup-list box" id="supList"><div class="skel" style="height:300px"></div></div><div class="sup-thread box" id="supThread"></div></div>';
    if (!document.getElementById('supCss')) {
      var css = document.createElement('style'); css.id = 'supCss';
      css.textContent = '.sup-wrap{display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:16px;align-items:start;margin-top:16px}' +
        '.sup-list{padding:10px!important;max-height:calc(100vh - 220px);overflow:auto}.sup-item{display:flex;gap:10px;padding:11px 10px;border-radius:14px;cursor:pointer;align-items:flex-start;border:1px solid transparent}' +
        '.sup-item:hover{background:var(--card-2)}.sup-item.on{background:var(--blue-l);border-color:var(--line-2)}.sup-item .grow{min-width:0;flex:1}.sup-item b{display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.sup-item small{display:block;color:var(--mut);font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sup-item .n{min-width:20px;height:20px;border-radius:10px;background:var(--pink);color:#fff;font:800 11px/20px var(--body);text-align:center;padding:0 5px}' +
        '.sup-thread{min-height:420px;display:flex;flex-direction:column;padding:0!important;overflow:hidden}.sup-th{display:flex;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}' +
        '.sup-msgs{padding:16px;display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 380px);min-height:260px;overflow:auto;background:var(--bg)}' +
        '.sup-m{max-width:78%;align-self:flex-start;padding:9px 13px;border-radius:16px;background:var(--card);border:1px solid var(--line);font-size:14.5px;line-height:1.45}.sup-m.user{align-self:flex-end;background:var(--blue);color:#fff;border-color:transparent}' +
        '.sup-m.human{border-color:#FFC21A;box-shadow:inset 3px 0 0 #FFC21A}.sup-m.system{align-self:center;background:none;border:1px dashed var(--line-2);color:var(--mut);font-size:12.5px;font-weight:700}' +
        '.sup-meta{font-size:11.5px;color:var(--faint);font-weight:700;margin:-2px 4px 4px}.sup-meta.r{align-self:flex-end}' +
        '.sup-reply{padding:12px 16px;border-top:1px solid var(--line);display:grid;gap:8px}.sup-reply textarea{min-height:70px}' +
        '.sup-facts{padding:12px 16px;border-bottom:1px solid var(--line);font-size:13.5px;display:none}.sup-facts.on{display:block}.sup-facts .kv{display:grid;grid-template-columns:130px 1fr;gap:4px 12px}.sup-facts .kv span:nth-child(odd){color:var(--mut);font-weight:700}' +
        '.sup-who{min-width:0;flex:1}.sup-who b{overflow-wrap:anywhere}.sup-acts{display:flex;gap:6px;flex-wrap:wrap}.sup-noai{display:flex;gap:8px;align-items:flex-start;margin:-4px 0 4px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,#FFB020 16%,var(--card));color:var(--ink);font-size:13px;font-weight:600;line-height:1.4}.sup-noai svg{color:#B87700;flex:0 0 auto;margin-top:1px}' +
        '@media (max-width:900px){.sup-thread{overflow:clip}.sup-th{position:sticky;top:calc(var(--top) + var(--adm-tabs-h,58px));z-index:6;background:var(--card);flex-wrap:nowrap;gap:8px;padding:10px 12px}.sup-th .icon-btn{flex:0 0 auto;width:38px;height:38px}.sup-who b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sup-who b .mut{display:none}.sup-who .mut{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sup-acts{flex-wrap:nowrap;flex:0 0 auto}.sup-acts .btn:not(.keep){width:38px;height:38px;padding:0;justify-content:center;gap:0}.sup-acts .btn.keep{height:38px}.sup-acts .btn:not(.keep) .lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}' +
        '@media (max-width:900px){.sup-wrap{grid-template-columns:1fr}.sup-wrap.reading .sup-list{display:none}.sup-wrap:not(.reading) .sup-thread{display:none}.sup-msgs{max-height:none}}';
      document.head.appendChild(css);
    }

    function head(d) {
      var ag = d.agent, c = d.counts;
      document.getElementById('supHead').innerHTML = A.head('Support', esc(ag.name) + ' answers customers 24/7' + (d.ai ? ' with AI.' : ', in basic mode (no AI key: set one in Ad data & AI).') + ' Chats that need a person come first.', '<button class="btn ghost sm" type="button" id="supSet">' + I('sliders') + 'Agent settings</button>') +
        '<div class="row-wrap" style="gap:8px">' + [['needs', 'Needs a person', c.needs, 'red'], ['human', 'Teammate on', c.human, 'orange'], ['all', 'All chats', c.all, 'blue'], ['closed', 'Closed', null, '']].map(function (t) { return '<button type="button" class="chip' + (st.filter === t[0] ? ' on' : '') + '" data-f="' + t[0] + '">' + esc(t[1]) + (t[2] != null ? ' <b>' + t[2] + '</b>' : '') + '</button>'; }).join('') +
        '<span class="mut" style="font-weight:700;font-size:13px;margin-left:auto">' + SV.n(c.today) + ' customer message' + (c.today === 1 ? '' : 's') + ' today</span></div>';
      SV.$$('#supHead [data-f]').forEach(function (b) { b.onclick = function () { st.filter = b.dataset.f; draw(); }; });
      document.getElementById('supSet').onclick = function () { settings(d.settings, d.ai); };
    }

    function list(d) {
      var el = document.getElementById('supList');
      el.innerHTML = '<input class="input" id="supQ" placeholder="Search name or email" value="' + esc(st.q) + '" style="margin-bottom:8px">' +
        (d.items.length ? d.items.map(function (t) {
          var nm = t.user ? (t.user.name || t.user.email) : 'Website visitor';
          return '<div class="sup-item' + (t.id === st.open ? ' on' : '') + '" data-id="' + t.id + '">' + (t.user ? SV.avatar(t.user.email).replace('<svg', '<svg style="width:38px;height:38px;border-radius:50%;flex:0 0 auto"') : face('Amara', 38)) +
            '<div class="grow"><b>' + esc(nm) + '</b><small>' + (t.needs_human ? (t.priority === 'high' ? '🔴 ' : '🟠 ') + esc(t.reason || 'Needs a person') : t.mode === 'human' ? '🟡 Teammate on it' : esc(t.topic || (t.last ? t.last.text : ''))) + '</small><small>' + (t.user ? esc(t.user.plan || '') + ' · ' : '') + esc(SV.ago(t.updated_at)) + '</small></div>' + (t.unread ? '<span class="n">' + t.unread + '</span>' : '') + '</div>';
        }).join('') : '<div class="empty" style="padding:30px 10px">' + SV.scene('spy', 'bino') + '<h3>' + (st.filter === 'needs' ? 'Nobody is waiting' : 'No chats here') + '</h3><p>' + esc(d.agent.name) + ' is handling everything.</p></div>');
      SV.$$('.sup-item', el).forEach(function (it) { it.onclick = function () { st.open = Number(it.dataset.id); history.replaceState({}, '', '/admin/support?t=' + st.open + '&f=' + st.filter); thread(); SV.$$('.sup-item', el).forEach(function (x) { x.classList.toggle('on', x === it); }); }; });
      var q = document.getElementById('supQ'); var tq;
      q.oninput = function () { clearTimeout(tq); tq = setTimeout(function () { st.q = q.value; draw(true); }, 300); };
      if (st.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }

    function draw(keepFocus) {
      return SV.get('/api/admin/support' + SV.qs({ filter: st.filter, q: st.q })).then(function (d) {
        if (!document.getElementById('supList')) return;
        head(d); list(d);
        if (st.open) thread(true);
        else if (window.innerWidth > 900) document.getElementById('supThread').innerHTML = '<div class="empty" style="margin:auto;padding:40px">' + teamRow(d.agent.team, 64) + '<h3 style="margin-top:12px">Pick a chat</h3><p>Read what Spyvoo Support said, step in when it needs you.</p></div>';
        void keepFocus;
      }).catch(SV.fail);
    }

    function thread(quiet) {
      var box = document.getElementById('supThread');
      view.querySelector('.sup-wrap').classList.add('reading');
      if (!quiet) box.innerHTML = '<div class="skel" style="height:300px;margin:16px"></div>';
      return SV.get('/api/admin/support/' + st.open).then(function (d) {
        if (!document.getElementById('supThread')) return;
        var keep = document.getElementById('supText'); var draft = keep ? keep.value : '';
        var oldMsgs = document.getElementById('supMsgs'); var atBottom = !oldMsgs || oldMsgs.scrollHeight - oldMsgs.scrollTop - oldMsgs.clientHeight < 40; var oldTop = oldMsgs ? oldMsgs.scrollTop : 0;
        var oldPause = document.getElementById('supPause'); var pause = oldPause && oldPause.dataset.thread === String(st.open) ? oldPause.checked : true;
        var hadFocus = keep && document.activeElement === keep;
        var t = d.thread, c = d.customer;
        var who = t.user ? esc(t.user.name || t.user.email) + ' <span class="mut" style="font-weight:600">' + esc(t.user.email) + '</span>' : 'Website visitor';
        var facts = c ? '<div class="kv">' + [['Plan', c.plan + (c.plan_ends ? ' · ends ' + c.plan_ends : '')], ['Email confirmed', c.email_confirmed ? 'Yes' : 'No'], ['Country', c.country || '—'], ['Member since', c.member_since], ['Team', c.team || '—'],
          ['Searches', c.usage.searches], ['AI breakdowns', c.usage.analyses], ['Downloads', c.usage.downloads],
          ['Orders', Array.isArray(c.orders) ? c.orders.map(function (o) { return o.ref + ' · ' + o.plan + ' · $' + o.amount_usd + ' · ' + o.status + (o.underpaid ? ' (underpaid)' : '') + (o.coin ? ' · ' + o.coin : ''); }).join('<br>') : 'none']].map(function (r) { return '<span>' + esc(r[0]) + '</span><span>' + (r[0] === 'Orders' ? r[1].split('<br>').map(esc).join('<br>') : esc(r[1])) + '</span>'; }).join('') + '</div>' + (t.user ? '<p style="margin:10px 0 0"><a class="btn ghost sm" href="/admin/users?q=' + encodeURIComponent(t.user.email) + '">Open in Users</a> <a class="btn ghost sm" href="/admin/payments">Payments</a></p>' : '') : '';
        box.innerHTML = '<div class="sup-th"><button class="icon-btn" type="button" id="supBack" aria-label="Back" style="display:' + (window.innerWidth <= 900 ? 'grid' : 'none') + '">' + I('back') + '</button>' +
          '<div class="sup-who"><b style="font-size:16px">' + who + '</b><div class="mut" style="font-size:12.5px;font-weight:700">' + (t.topic ? esc(t.topic) + ' · ' : '') + (t.mode === 'human' ? 'You’re on it (agent paused)' : 'Agent answering') + (t.status === 'closed' ? ' · closed' : '') + '</div></div>' +
          '<div class="sup-acts">' + (c ? '<button class="btn ghost sm" type="button" id="supFacts" title="Account" aria-label="Account">' + I('user') + '<span class="lbl">Account</span></button>' : '') +
          '<button class="btn ghost sm" type="button" id="supMode" title="' + (t.mode === 'human' ? 'Hand back to agent' : 'Take over') + '" aria-label="' + (t.mode === 'human' ? 'Hand back to agent' : 'Take over') + '">' + (t.mode === 'human' ? I('spark') + '<span class="lbl">Hand back to agent</span>' : I('user') + '<span class="lbl">Take over</span>') + '</button>' +
          '<button class="btn ghost sm' + (t.status === 'closed' ? ' keep' : '') + '" type="button" id="supClose" title="' + (t.status === 'closed' ? 'Reopen' : 'Close') + '" aria-label="' + (t.status === 'closed' ? 'Reopen' : 'Close') + '">' + (t.status === 'closed' ? '' : I('check')) + '<span class="lbl">' + (t.status === 'closed' ? 'Reopen' : 'Close') + '</span></button></div></div>' +
          (t.needs_human ? '<div class="announce warn" style="margin:12px 16px 0">' + I('flag', ' width="16" height="16"') + '<span><b>' + (t.priority === 'high' ? 'High priority. ' : '') + 'Needs a person:</b> ' + esc(t.reason) + '</span></div>' : '') +
          '<div class="sup-facts' + (sessionStorage.getItem('supFacts') === '1' ? ' on' : '') + '" id="supFactsBox">' + facts + '</div>' +
          '<div class="sup-msgs" id="supMsgs">' + d.messages.map(function (m) {
            var meta = m.meta || {}, notes = [];
            if (m.from === 'agent' && meta.tools && meta.tools.length) notes.push('used ' + meta.tools.join(', '));
            if (m.from === 'agent' && meta.via === 'rules') notes.push('basic mode');
            if (m.from === 'agent' && meta.done && meta.done.length) notes.push('✓ ' + meta.done.join(' · '));
            return '<div class="sup-m ' + m.from + '">' + rich(m.text) + '</div><div class="sup-meta' + (m.from === 'user' ? ' r' : '') + '">' + (m.from === 'human' ? esc(meta.name || 'Team') + ' · ' : m.from === 'agent' ? 'Agent · ' : '') + esc(SV.ago(m.at)) + (notes.length ? ' · ' + esc(notes.join(' · ')) : '') + '</div>';
          }).join('') + '</div>' +
          '<form class="sup-reply" id="supForm"><textarea class="input" id="supText" placeholder="Reply as ' + esc((A.me.name || 'you').split(' ')[0]) + '… (' + (t.user ? 'the customer gets a notification and an email' : 'they’ll see it in the chat') + ')"></textarea>' +
          '<div class="row-wrap" style="justify-content:space-between"><label class="sw"><input type="checkbox" id="supPause" data-thread="' + t.id + '"' + (pause ? ' checked' : '') + '><span>Pause the agent on this chat after my reply</span></label><button class="btn" type="submit">' + I('arrow') + 'Send reply</button></div></form>';
        var mb = document.getElementById('supMsgs'); mb.scrollTop = atBottom ? mb.scrollHeight : oldTop;
        var ta = document.getElementById('supText'); ta.value = draft; if (hadFocus) ta.focus();
        document.getElementById('supBack').onclick = function () { st.open = 0; view.querySelector('.sup-wrap').classList.remove('reading'); history.replaceState({}, '', '/admin/support?f=' + st.filter); };
        var fb = document.getElementById('supFacts'); if (fb) fb.onclick = function () { var on = document.getElementById('supFactsBox').classList.toggle('on'); sessionStorage.setItem('supFacts', on ? '1' : '0'); };
        document.getElementById('supMode').onclick = function () { A.call('POST', '/api/admin/support/' + t.id + '/mode', { mode: t.mode === 'human' ? 'ai' : 'human' }, this, t.mode === 'human' ? 'The agent answers this chat again' : 'You’re on this chat. The agent is paused.').then(function () { draw(); }); };
        document.getElementById('supClose').onclick = function () { A.call('POST', '/api/admin/support/' + t.id + '/status', { status: t.status === 'closed' ? 'open' : 'closed' }, this, t.status === 'closed' ? 'Reopened' : 'Closed').then(function () { draw(); }); };
        document.getElementById('supForm').onsubmit = function (e) {
          e.preventDefault();
          var txt = ta.value.trim(); if (!txt) return;
          A.call('POST', '/api/admin/support/' + t.id + '/reply', { text: txt, takeover: document.getElementById('supPause').checked }, this.querySelector('button[type=submit]'), 'Sent').then(function () { ta.value = ''; draw(); });
        };
      }).catch(SV.fail);
    }

    function settings(s, aiReady) {
      var md = SV.modal('<span class="eyebrow">Support agent</span><h2 style="margin-top:8px">Agent settings</h2><form id="supSF" class="form" style="margin-top:14px">' +
        A.sw('on', 'Support chat on', s.on !== false, 'The chat bubble in the dashboard (and on the website if allowed below).', true) +
        A.sw('ai', 'Use AI', s.ai !== false, 'Off = basic mode: fixed answers, payment checks and hand-offs only.', true) +
        (aiReady === false ? '<p class="sup-noai full">' + I('flag', ' width="15" height="15"') + '<span><b>No AI key set — basic mode is answering.</b> This switch takes effect once you add a key in Ad data &amp; AI.</span></p>' : '') +
        A.sw('public_chat', 'Chat on the website too', s.public_chat !== false, 'Visitors before sign-up can ask about plans and payments (no account access).', true) +
        A.field('team', 'Support team names', (s.team || []).join(', '), { full: true, hint: 'Comma separated, up to 8. Each customer always gets the same teammate, who introduces themselves when a chat starts. The chat header says “Spyvoo Support”.' }) +
        '<div class="field full"><label>Faces</label><div id="supTeam">' + teamRow(s.team, 52) + '</div></div>' +
        A.field('daily_ai_free', 'AI replies per Free customer per day', s.daily_ai_free, { type: 'number', hint: 'After it, basic mode answers that customer until tomorrow.' }) +
        A.field('daily_ai_paid', 'AI replies per paying customer per day', s.daily_ai_paid, { type: 'number' }) +
        A.field('visitor_daily_ai', 'AI replies for website visitors per day (all together)', s.visitor_daily_ai, { type: 'number', hint: 'People who haven’t signed up. Also max 20 a day per visitor.' }) +
        A.field('daily_ai_total', 'AI replies per day, everyone together', s.daily_ai_total, { type: 'number', hint: 'A safety cap on the AI bill. Basic mode answers after it.' }) +
        A.field('extra_knowledge', 'Extra things the agent must know', s.extra_knowledge, { type: 'textarea', full: true, ph: 'e.g. TikTok ads launch in November. Bank transfer in Nigeria is paused this week. Black Friday code BF40 gives 40% off yearly plans until 30 Nov.', hint: 'Plain sentences. The agent reads this before every reply. Plans, prices, offers and payment methods are already read live, no need to repeat them.' }) +
        '</form><div class="actions"><button class="btn ghost" type="button" id="supSC">Cancel</button><button class="btn" type="button" id="supSS">Save</button></div>');
      var tIn = md.el.querySelector('[name="team"]');
      if (tIn) tIn.oninput = function () { md.el.querySelector('#supTeam').innerHTML = teamRow(tIn.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 8), 52); };
      md.el.querySelector('#supSC').onclick = function () { md.close(true); };
      md.el.querySelector('#supSS').onclick = function () {
        var v = A.read(md.el.querySelector('#supSF')); v.team = String(v.team || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        A.call('PATCH', '/api/admin/settings/support', { value: v }, this, 'Saved. The team uses it from the next message.').then(function () { md.close(true); draw(); });
      };
    }

    draw();
    // The view element is shared by every admin page: stop refreshing as soon as this page is gone.
    timer = setInterval(function () { if (!document.getElementById('supList')) { clearInterval(timer); return; } if (document.hidden) return; draw(); }, 10000);
  };
})();
