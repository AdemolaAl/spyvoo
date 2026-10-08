/* Spyvoo admin pages. Every number and switch here is live: it reads and writes /api/admin/*. */
(function () {
  'use strict';
  var SV = window.SV, A = SV.A, esc = SV.esc, I = SV.I, $ = SV.$, P = A.pages;
  var reload = function () { SV.state.keepScroll = true; SV.render(); };

  /* ======================= OVERVIEW ======================= */
  P['/admin'] = function (view) {
    A.load(view, '/api/admin/overview', function (d) {
      var hour = new Date().getHours();
      var hi = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
      var first = (A.me.name || '').split(' ')[0];
      var fails = d.failures.length;
      var line = !d.provider.configured && d.provider.active === 'apify' ? 'Spyvoo is showing sample ads. Connect Apify to start pulling real winners.'
        : fails ? fails + ' job' + (fails > 1 ? 's' : '') + ' failed recently. Check the job monitor.'
        : 'All systems are running. ' + SV.n(d.ads.ads) + ' ads tracked from ' + SV.n(d.ads.advertisers) + ' advertisers in ' + SV.n(d.ads.countries) + ' countries.';
      var health = [
        ['Ad data', d.provider.configured ? 'ok' : 'bad', d.provider.label + (d.provider.configured ? ' connected' : ' not connected'), d.provider.configured ? 'Live' : 'Set up', '/admin/provider'],
        ['Scrape budget today', d.credits.left > 0 ? 'ok' : 'warn', SV.money(d.credits.spent) + ' of ' + SV.money(d.credits.budget) + ' spent', d.credits.left > 0 ? SV.money(d.credits.left) + ' left' : 'Paused', '/admin/provider'],
        ['AI breakdowns', d.ai ? 'ok' : 'warn', d.ai ? 'Claude is writing breakdowns' : 'Basic rules only. Add ANTHROPIC_API_KEY.', d.ai ? 'Live' : 'Basic', '/admin/provider'],
        ['Emails', d.mail ? 'ok' : 'warn', d.mail ? 'Sending through your email provider' : 'Logged only. Add MAIL_PROVIDER and MAIL_API_KEY.', d.mail ? 'Live' : 'Log only', '/admin/emails'],
        ['Payments', d.gatevoo_error && !d.gatevoo_error.resolved ? 'bad' : d.gatevoo === 'live' ? 'ok' : d.gatevoo === 'sandbox' || d.demo_payments ? 'warn' : 'bad', d.gatevoo_error && !d.gatevoo_error.resolved ? 'Last crypto checkout failed: ' + d.gatevoo_error.reason : d.gatevoo === 'live' ? 'Gatevoo crypto checkout is live' : d.demo_payments ? 'Test checkout (PAYMENTS_DEMO) is on' : d.gatevoo === 'sandbox' ? 'Gatevoo sandbox: no real coins move' : 'No payment method can take money' + (d.gatevoo_missing && d.gatevoo_missing.length ? ' (' + d.gatevoo_missing.join(', ') + ')' : ''), d.gatevoo === 'live' ? 'Live' : d.gatevoo === 'sandbox' ? 'Sandbox' : d.demo_payments ? 'Test' : 'Off', '/admin/payments'],
        ['Media storage', d.media.failed ? 'warn' : 'ok', SV.n(d.media.files) + ' files saved' + (d.media.pending ? ', ' + SV.n(d.media.pending) + ' waiting' : '') + (d.media.failed ? ', ' + SV.n(d.media.failed) + ' failed' : ''), d.media.driver === 'r2' ? 'R2' : 'Disk', '/admin/jobs']
      ];
      var planCount = {}; d.plans.forEach(function (p) { planCount[p.plan_id] = p.n; });
      view.innerHTML =
        '<section class="cr-hero"><div class="grid-lines"></div><div class="radar"></div><div style="position:relative">' +
          '<span class="eyebrow" style="color:#fff;opacity:.75">Control room</span><h1 style="margin-top:10px">' + esc(hi + (first ? ', ' + first : '')) + '.</h1><p>' + esc(line) + '</p>' +
          '<div class="row-wrap"><a class="btn grad" href="/admin/rules">' + I('radar') + 'Tracking rules</a><a class="btn ghost" href="/admin/jobs">' + I('clock') + 'Job monitor</a></div></div>' +
          SV.scene(fails ? 'spy' : 'host', fails ? 'think' : 'bino', [{ i: 'trend', c: '#14C894', pos: 'left:8px;top:14px' }, { i: 'fire', c: '#FF3D8B', pos: 'right:4px;top:40px', w: 30 }, { i: 'crown', c: '#FF9F1C', pos: 'left:30px;bottom:10px', w: 28 }]) + '</section>' +
        '<div class="g4">' +
          kpi('Ads tracked', SV.n(d.ads.ads), SV.n(d.ads.active) + ' active · +' + SV.n(d.ads.today) + ' today', 'image', '#1F5BFF') +
          kpi('Users', SV.n(d.users.total), '+' + SV.n(d.users.new7) + ' this week · ' + SV.n(d.users.active7) + ' active', 'team', '#7B5CFF') +
          kpi('Paying', SV.n(d.users.paid), d.users.total ? Math.round(d.users.paid / d.users.total * 100) + '% of users' : 'No users yet', 'crown', '#FF3D8B') +
          kpi('Revenue · 30 days', SV.money(d.revenue.d30), SV.money(d.revenue.all) + ' all time' + (d.revenue.pending ? ' · ' + d.revenue.pending + ' pending' : ''), 'card', '#14C894') +
        '</div>' +
        '<div class="g3" style="margin-top:16px">' +
          '<div class="box">' + A.bars(d.charts.ads, { title: 'New ads found · 14 days', color: 'var(--blue)' }) + '</div>' +
          '<div class="box">' + A.bars(d.charts.signups, { title: 'Sign-ups · 14 days', color: 'var(--violet)' }) + '</div>' +
          '<div class="box">' + A.bars(d.charts.revenue, { title: 'Revenue · 14 days', color: 'var(--mint)', money: true }) + '</div>' +
        '</div>' +
        '<div class="g2" style="margin-top:16px">' +
          '<div class="box"><h3>' + SV.tile('spark', 'var(--violet)', 28) + 'System health</h3><p>Green means it works on its own. Tap a row to fix it.</p><div class="health">' +
            health.map(function (h) { return '<a href="' + h[4] + '" class="' + h[1] + '" style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-weight:700;font-size:14px"><span class="dot"></span><span>' + esc(h[0]) + '<small>' + esc(h[2]) + '</small></span><em>' + esc(h[3]) + '</em></a>'; }).join('') + '</div></div>' +
          '<div class="stack"><div class="box"><h3>' + SV.tile('crown', 'var(--orange)', 28) + 'People per plan</h3><p>Free plus everyone with a paid plan that hasn’t run out.</p><div class="row-wrap">' +
            Object.keys(planCount).map(function (k) { return '<span class="chip">' + esc(k.charAt(0).toUpperCase() + k.slice(1)) + ' <span class="n" style="background:var(--blue)">' + SV.n(planCount[k]) + '</span></span>'; }).join('') + '</div></div>' +
          '<div class="box"><h3>' + SV.tile('clock', 'var(--blue)', 28) + 'Background jobs</h3><p>They run by themselves every few minutes.</p><div class="tbl-wrap"><table class="tbl"><tbody>' +
            d.scheduler.map(function (j) { return '<tr><td><b>' + esc(j.name) + '</b><br><small class="mut">every ' + (j.every_min >= 60 ? (j.every_min / 60) + ' h' : j.every_min + ' min') + '</small></td><td>' + (j.busy ? A.tag('running', 'blue') : j.error ? A.tag('error', 'red') : j.finished ? A.tag('ok', 'mint') : A.tag('waiting')) + '</td><td class="num">' + A.when(j.finished) + '</td></tr>'; }).join('') +
          '</tbody></table></div></div></div></div>' +
        (fails ? '<div class="box" style="margin-top:16px"><h3>' + SV.tile('flag', 'var(--coral)', 28) + 'Recent failures</h3><p>The newest errors. Retry from the job monitor.</p><div class="tbl-wrap"><table class="tbl"><tbody>' + d.failures.map(function (j) { return '<tr><td>' + A.status(j.kind) + '</td><td>' + esc(j.ref || '') + '</td><td style="color:var(--coral);font-weight:700">' + esc(j.error || '') + '</td><td class="num">' + A.when(j.finished_at || j.created_at) + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '');
    });
  };
  function kpi(label, val, sub, icon, color) { return '<div class="kpi" style="--c:' + color + '"><i>' + SV.G(icon) + '</i><small>' + esc(label) + '</small><b>' + val + '</b><span>' + esc(sub) + '</span></div>'; }

  /* ======================= TRACKING RULES ======================= */
  P['/admin/rules'] = function (view) {
    A.load(view, '/api/admin/rules', function (d) {
      view.innerHTML = A.head('Tracking rules', 'What Spyvoo watches. Each rule is a keyword, a Facebook page or a domain, in the countries you pick.',
        '<button class="btn ghost" id="csvBtn">' + I('layers') + 'Import CSV</button><button class="btn" id="addBtn">' + I('plus') + 'New rule</button>') +
        (d.items.length ? '<div class="box"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Watching</th><th>Countries</th><th>Niche</th><th>Every</th><th>Last run</th><th>On</th><th></th></tr></thead><tbody>' +
          d.items.map(function (r) {
            var j = r.last_job;
            return '<tr data-id="' + r.id + '"><td><b>' + esc(r.value) + '</b><br><small class="mut">' + esc(r.type) + ' · up to ' + r.results_limit + ' ads</small></td>' +
              '<td>' + r.countries.slice(0, 6).map(function (c) { return c === 'ALL' ? '🌍 All' : SV.flag(c) + ' ' + c; }).join(' ') + (r.countries.length > 6 ? ' +' + (r.countries.length - 6) : '') + '</td>' +
              '<td>' + (r.niche ? A.tag(r.niche, 'blue') : '<span class="mut">—</span>') + '</td><td class="num">' + r.interval_hours + ' h</td>' +
              '<td>' + (j ? A.status(j.status) + ' <small class="mut">' + (j.status === 'done' ? SV.n(j.ads_found) + ' found, ' + SV.n(j.ads_new) + ' new' : esc((j.error || '').slice(0, 60))) + '</small>' : '<span class="mut">Never</span>') + '</td>' +
              '<td><label class="sw"><input type="checkbox" data-act="toggle"' + (r.active ? ' checked' : '') + ' aria-label="Rule on"></label></td>' +
              '<td class="acts"><button class="btn sm ghost" data-act="run">' + I('play') + 'Run now</button><button class="btn sm ghost" data-act="edit" aria-label="Edit">' + I('edit') + '</button><button class="btn sm ghost" data-act="del" aria-label="Delete">' + I('trash') + '</button></td></tr>';
          }).join('') + '</tbody></table></div></div>'
        : '<div class="box empty">' + SV.scene('guide', 'point', [{ i: 'radar', c: '#1F5BFF', pos: 'right:10px;top:10px' }]) + '<h3>No rules yet</h3><p>Add a keyword like “crypto” in Brazil and Spyvoo starts collecting those ads on its own.</p></div>');
      $('#addBtn').onclick = function () { ruleModal(null, d); };
      $('#csvBtn').onclick = csvModal;
      SV.$$('tr[data-id]', view).forEach(function (tr) {
        var r = d.items.filter(function (x) { return String(x.id) === tr.dataset.id; })[0];
        tr.querySelector('[data-act=toggle]').onchange = function () { A.call('PATCH', '/api/admin/rules/' + r.id, { active: this.checked }, null, this.checked ? 'Rule switched on' : 'Rule paused'); };
        tr.querySelector('[data-act=edit]').onclick = function () { ruleModal(r, d); };
        tr.querySelector('[data-act=run]').onclick = function () { A.call('POST', '/api/admin/rules/' + r.id + '/run', {}, this, function (x) { return 'Found ' + SV.n(x.found) + ' ads, ' + SV.n(x.created) + ' new'; }).then(reload); A.onFail = function () { A.onFail = null; reload(); }; };
        tr.querySelector('[data-act=del]').onclick = function () { SV.confirm('Delete this rule?', 'Ads it already found stay in Spyvoo.', 'Delete', true).then(function (ok) { if (ok) A.call('DELETE', '/api/admin/rules/' + r.id, null, null, 'Rule deleted').then(reload); }); };
      });
    });
  };
  function ruleModal(r, d) {
    r = r || { type: 'keyword', value: '', countries: ['ALL'], platforms: ['facebook', 'instagram'], niche: '', results_limit: 50, interval_hours: 12, active: true };
    var m = SV.modal('<h2>' + (r.id ? 'Edit rule' : 'New tracking rule') + '</h2><p class="mut" style="font-weight:600">Spyvoo checks this on its own and saves every ad it finds.</p><form class="form" style="margin-top:14px">' +
      A.field('type', 'Watch a', r.type, { options: [['keyword', 'Keyword'], ['advertiser', 'Facebook page ID'], ['domain', 'Website domain']] }) +
      A.field('value', 'Keyword, page ID or domain', r.value, { ph: 'crypto exchange' }) +
      A.field('countries', 'Countries (codes, or ALL)', r.countries.join(', '), { full: true, ph: 'BR, MX, EG', hint: 'Two-letter codes separated by commas. Example: BR, MX, AE.' }) +
      A.field('niche', 'Niche', r.niche, { options: [['', 'None']].concat(d.niches) }) +
      A.field('interval_hours', 'Check every (hours)', r.interval_hours, { type: 'number' }) +
      A.field('results_limit', 'Max ads per run', r.results_limit, { type: 'number', hint: 'More ads cost more scraper credit.' }) +
      A.field('platforms', 'Platforms', r.platforms.join(', '), { hint: 'facebook, instagram, messenger, audience_network' }) +
      '</form><div class="actions"><button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('check') + 'Save rule</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    m.el.querySelector('[data-ok]').onclick = function () {
      var b = A.read(m.el.querySelector('form'));
      A.call(r.id ? 'PATCH' : 'POST', '/api/admin/rules' + (r.id ? '/' + r.id : ''), b, this, 'Rule saved').then(function () { m.close(); reload(); });
    };
  }
  function csvModal() {
    var m = SV.modal('<h2>Import rules from CSV</h2><p class="mut" style="font-weight:600">One rule per line: <span class="mono">type,value,countries,niche,interval_hours</span>. Separate countries with a space or |.</p>' +
      '<textarea class="input mono" id="csvTxt" style="min-height:180px;margin-top:10px" placeholder="type,value,countries,niche,interval_hours\nkeyword,crypto exchange,BR|MX,Crypto,6\nkeyword,skincare,EG AE,Beauty,12"></textarea><div id="csvOut"></div>' +
      '<div class="actions"><button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('plus') + 'Import</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    m.el.querySelector('[data-ok]').onclick = function () {
      A.call('POST', '/api/admin/rules/import', { csv: $('#csvTxt').value }, this).then(function (x) {
        SV.toast(x.added + ' rules added');
        if (x.errors.length) { $('#csvTxt').value = ''; $('#csvOut').innerHTML = '<div class="note warn" style="margin-top:10px"><b>' + x.added + ' added.</b> These lines were skipped:<br>' + x.errors.map(esc).join('<br>') + '</div>'; reload(); } else { m.close(); reload(); }
      });
    };
  }

  /* ======================= PROVIDER + AI ======================= */
  // Which AI answers (Claude direct, OpenRouter or OpenAI), the OpenRouter model and fallbacks, and the API key.
  function aiBox(ai) {
    var opts = [['', 'Default from AI_PROVIDER (' + (ai.providers.filter(function (p) { return p.id === ai.env_provider; })[0] || { label: ai.env_provider }).label + ')']].concat(ai.providers.map(function (p) { return [p.id, p.label]; }));
    return '<div class="box"><div class="box-head"><div><h3>' + SV.tile('spark', 'var(--violet)', 28) + 'AI provider</h3><p>OpenRouter gives you hundreds of models (Claude, GPT, Gemini, Llama…) with one key and one bill.</p></div>' +
      (ai.has_key ? A.tag(ai.key_source === 'admin' ? 'Key saved ' + ai.key_hint : 'Key from ' + ai.key_env + ' ' + ai.key_hint, 'mint') : A.tag('No key', 'red')) + '</div>' +
      (ai.test_endpoint ? '<div class="note warn" style="margin-bottom:10px">Test address in use: ' + esc(ai.endpoint) + '. Production always uses the real API.</div>' : '') +
      (ai.saved_key_other_endpoint ? '<div class="note warn" style="margin-bottom:10px">The saved key belongs to another provider and is not used. Type the key for ' + esc(ai.label) + '.</div>' : '') +
      '<form class="form" id="aiForm">' +
        A.field('provider', 'Provider', ai.provider_from === 'admin' ? ai.provider : '', { options: opts, full: true }) +
        '<div class="field full" data-or>' + '<label for="f_openrouter_model">OpenRouter model</label><input class="input" id="f_openrouter_model" name="openrouter_model" list="orModels" value="' + esc(ai.openrouter_model) + '" placeholder="' + esc(ai.default_openrouter_model) + '"><datalist id="orModels"><option value="anthropic/claude-sonnet-4.5"><option value="openai/gpt-4o-mini"></datalist><span class="hint">Leave empty for ' + esc(ai.default_openrouter_model) + '. Copy any id from openrouter.ai/models.</span></div>' +
        '<div class="field full" data-or>' + '<label for="f_fallback_models">Fallback models (optional)</label><input class="input" id="f_fallback_models" name="fallback_models" value="' + esc(ai.fallback_models) + '" placeholder="' + esc(ai.default_fallbacks || 'openai/gpt-4o-mini') + '"><span class="hint">Comma list. Tried in order if the main model is down or busy.</span></div>' +
        A.field('key', 'API key', '', { type: 'password', full: true, ph: ai.key_source === 'admin' ? '•••••••• ' + ai.key_hint + ' saved. Type to replace.' : 'sk-or-…', hint: 'For the provider above. Stored encrypted, never shown again. Switching provider means typing its key again.' + (ai.key_source === 'env' ? ' A key is also set in ' + esc(ai.key_env) + '; the one saved here wins.' : ''), attrs: ' autocomplete="new-password"' }) +
      '</form><div class="save-bar"><button class="btn ghost" id="aiPing">' + I('spark') + 'Test AI</button><button class="btn" id="aiSave">' + I('check') + 'Save</button></div></div>';
  }

  P['/admin/provider'] = function (view) {
    A.load(view, '/api/admin/provider', function (d) {
      var s = d.settings;
      view.innerHTML = A.head('Ad data & AI', 'Where ads come from, how much you spend on scraping, and how the AI breakdowns run.') +
        '<div class="g2"><div class="box"><div class="box-head"><div><h3>' + SV.tile('layers', 'var(--blue)', 28) + 'Ad data provider</h3><p>Spyvoo pulls ads from Meta’s Ad Library through Apify. Swap providers here without touching code.</p></div>' +
          (d.has_token ? A.tag('Token saved', 'mint') : A.tag('No token', 'red')) + '</div>' +
          '<form class="form" id="provForm">' +
            A.field('active', 'Provider', s.active, { options: d.providers.map(function (p) { return [p.id, p.label + (p.configured ? '' : ' (not connected)')]; }) }) +
            A.field('token', 'Apify API token', '', { type: 'password', ph: d.has_token ? '•••••••• saved. Type to replace.' : 'apify_api_…', hint: d.token_from_env ? 'A token is also set in APIFY_TOKEN. The one saved here wins.' : 'Find it at console.apify.com → Settings → Integrations. Stored encrypted.' }) +
            A.field('actor', 'Apify actor', s.actor, { ph: d.default_actor, full: true, hint: 'Leave empty to use ' + esc(d.default_actor) + '.' }) +
            A.field('daily_budget_usd', 'Daily budget (USD)', s.daily_budget_usd, { type: 'number', step: '0.5', hint: 'Scraping stops for the day when this is spent. You get an email.' }) +
            A.field('interval_hours', 'Default check interval (hours)', s.interval_hours, { type: 'number' }) +
            A.field('results_per_rule', 'Default ads per run', s.results_per_rule, { type: 'number' }) +
            A.field('inactive_after_days', 'Mark inactive after (days unseen)', s.inactive_after_days, { type: 'number' }) +
            A.sw('download_media', 'Save images and videos forever', s.download_media, 'Copies media to your storage so ads never expire.', true) +
            A.sw('analyze_new', 'Write AI breakdowns for every new ad', s.analyze_new, 'Off = only when someone opens the ad (cheaper).', true) +
          '</form><div class="save-bar"><button class="btn ghost" id="pingBtn">' + I('spark') + 'Test connection</button><button class="btn" id="provSave">' + I('check') + 'Save</button></div></div>' +
        '<div class="stack"><div class="box"><h3>' + SV.tile('card', 'var(--mint)', 28) + 'Spend today</h3><p>What the scraper has used so far.</p>' +
          '<div class="g2"><div class="kpi" style="--c:#FF9F1C"><small>Spent</small><b>' + SV.money(d.spent_today) + '</b><span>of ' + SV.money(s.daily_budget_usd) + '</span></div><div class="kpi" style="--c:#14C894"><small>Left</small><b>' + SV.money(d.budget_left) + '</b><span>resets at midnight UTC</span></div></div>' +
          '<div class="bar" style="margin-top:14px"><i style="width:' + Math.min(100, s.daily_budget_usd ? d.spent_today / s.daily_budget_usd * 100 : 0) + '%"></i></div></div>' +
        '<div class="box"><h3>' + SV.tile('search', 'var(--violet)', 28) + 'Test scrape</h3><p>Pulls up to 10 ads right now so you can see it work. Uses a little credit.</p>' +
          '<form class="form" id="testForm">' + A.field('value', 'Keyword or page ID', '', { ph: 'online course' }) + A.field('country', 'Country', 'BR', { ph: 'BR' }) + '</form>' +
          '<div class="save-bar"><button class="btn" id="testBtn">' + I('play') + 'Run test</button></div><div id="testOut"></div></div>' +
        '<div class="box"><h3>' + SV.tile('wand', 'var(--pink)', 28) + 'AI</h3><p>Breakdowns, “Make it mine” scripts and plain-English search.</p><div class="health">' +
          '<div class="' + (d.ai.live ? 'ok' : 'warn') + '"><span class="dot"></span><span>' + esc(d.ai.label) + '<small>' + (d.ai.live ? 'Model ' + esc(d.ai.model) + (d.ai.fallbacks.length ? ' · then ' + esc(d.ai.fallbacks.join(', ')) : '') : 'Not connected: basic rule-based breakdowns are used. Add the API key below or set ' + esc(d.ai.key_env) + '.') + '</small></span><em>' + (d.ai.live ? 'Live' : 'Basic') + '</em></div>' +
          '<div class="' + (d.ai.transcripts ? 'ok' : 'warn') + '"><span class="dot"></span><span>Video transcripts<small>' + (d.ai.transcripts ? 'Whisper turns video voiceovers into text' : 'Optional. Set TRANSCRIBE_API_KEY to read what videos say.') + '</small></span><em>' + (d.ai.transcripts ? 'Live' : 'Off') + '</em></div>' +
          '<div class="ok"><span class="dot"></span><span>AI use today<small>' + SV.n(d.ai.usage_today.calls) + ' calls · ' + SV.n(d.ai.usage_today.input_tokens + d.ai.usage_today.output_tokens) + ' tokens' + (d.ai.usage_today.cost_usd ? ' · about ' + SV.money(d.ai.usage_today.cost_usd) : '') + '</small></span><em>' + SV.n(d.ai.usage_today.calls) + '</em></div>' +
          '<div class="' + (d.media.failed ? 'warn' : 'ok') + '"><span class="dot"></span><span>Media storage<small>' + SV.n(d.media.files) + ' files (' + (d.media.bytes / 1048576).toFixed(0) + ' MB) on ' + (d.media.driver === 'r2' ? 'Cloudflare R2' : 'the server disk') + '</small></span><em>' + (d.media.driver === 'r2' ? 'R2' : 'Disk') + '</em></div>' +
        '</div></div>' + aiBox(d.ai) + '</div></div>';
      $('#provSave').onclick = function () {
        var b = A.read($('#provForm')); if (!b.token) delete b.token;
        A.call('PATCH', '/api/admin/provider', b, this, 'Saved').then(reload);
      };
      $('#pingBtn').onclick = function () { A.call('POST', '/api/admin/provider/ping', {}, this).then(function (x) { SV.toast(x.message, { bad: !x.ok }); }); };
      var aiF = $('#aiForm');
      var aiSync = function () { var p = aiF.provider.value || d.ai.env_provider; SV.$$('[data-or]', aiF).forEach(function (el) { el.style.display = p === 'openrouter' ? '' : 'none'; }); };
      aiF.provider.onchange = aiSync; aiSync();
      $('#aiSave').onclick = function () {
        var b = A.read(aiF); if (!b.key) delete b.key;
        A.call('PATCH', '/api/admin/ai', b, this, function (x) { return x.key_cleared ? 'Saved. The provider changed, so type its API key again.' : 'AI settings saved'; }).then(reload);
      };
      $('#aiPing').onclick = function () { A.call('POST', '/api/admin/ai/ping', {}, this).then(function (x) { SV.toast(x.message, { bad: !x.ok }); }); };
      $('#testBtn').onclick = function () {
        var b = A.read($('#testForm'));
        A.call('POST', '/api/admin/provider/test', b, this).then(function (x) {
          $('#testOut').innerHTML = '<div class="note" style="margin-top:12px">Found <b>' + x.found + '</b> ads, <b>' + x.created + '</b> new' + (x.credits ? ', about ' + SV.money(x.credits) + ' used' : '') + '.</div><div class="row-wrap" style="margin-top:10px">' + (x.sample || []).map(function (a) { return '<span class="athumb" title="' + esc(a.advertiser.name) + '" style="background-image:url(\'' + esc(a.thumb) + '\')"></span>'; }).join('') + '</div>';
        });
      };
    });
  };

  /* ======================= JOBS ======================= */
  P['/admin/jobs'] = function (view, q) {
    var qs = new URLSearchParams(location.search);
    var f = { kind: qs.get('kind') || '', status: qs.get('status') || '' };
    A.load(view, '/api/admin/jobs' + SV.qs(f), function (d) {
      var seg = function (k, opts) { return '<div class="seg">' + opts.map(function (o) { return '<button data-k="' + k + '" data-v="' + o[0] + '"' + (f[k] === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>'; };
      view.innerHTML = A.head('Job monitor', 'Every scrape, download and AI job, newest first. Failed jobs can be retried.',
        '<button class="btn ghost" id="mediaRetry">' + I('download') + 'Retry failed media' + (d.media.failed ? ' (' + d.media.failed + ')' : '') + '</button>') +
        '<div class="box" style="margin-bottom:16px"><h3>' + SV.tile('clock', 'var(--blue)', 28) + 'Scheduler</h3><p>Background jobs. “Run now” skips the wait.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Job</th><th>Every</th><th>State</th><th>Last result</th><th>Finished</th><th></th></tr></thead><tbody>' +
          d.scheduler.map(function (j) { return '<tr><td><b>' + esc(j.name) + '</b></td><td>' + (j.every_min >= 60 ? (j.every_min / 60) + ' h' : j.every_min + ' min') + '</td><td>' + (j.busy ? A.tag('running', 'blue') : j.error ? A.tag('error', 'red') : A.tag('ok', 'mint')) + '</td><td class="mono" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(j.error || A.human(j.result)) + '</td><td>' + A.when(j.finished) + '</td><td class="acts"><button class="btn sm ghost" data-run="' + esc(j.name) + '">' + I('play') + 'Run now</button></td></tr>'; }).join('') +
        '</tbody></table></div></div>' +
        '<div class="box"><div class="row-wrap" style="margin-bottom:12px">' + seg('kind', [['', 'All'], ['scrape', 'Scrape'], ['media', 'Media'], ['analysis', 'AI']]) + seg('status', [['', 'Any'], ['running', 'Running'], ['done', 'Done'], ['failed', 'Failed']]) + '</div>' +
        (d.items.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Kind</th><th>What</th><th>Status</th><th class="num">Found</th><th class="num">New</th><th class="num">Cost</th><th>When</th><th></th></tr></thead><tbody>' +
          d.items.map(function (j) { return '<tr><td class="mono">' + j.id + '</td><td>' + A.tag(j.kind, 'blue') + '</td><td>' + esc(j.ref || '') + (j.error ? '<br><small style="color:var(--coral);font-weight:700">' + esc(j.error.slice(0, 140)) + '</small>' : '') + '</td><td>' + A.status(j.status) + '</td><td class="num">' + SV.n(j.ads_found) + '</td><td class="num">' + SV.n(j.ads_new) + '</td><td class="num">' + (j.credits_used ? SV.money(j.credits_used) : '—') + '</td><td>' + A.when(j.finished_at || j.started_at || j.created_at) + '</td><td class="acts">' + (j.status === 'failed' && (j.kind === 'media' || j.rule_id) ? '<button class="btn sm ghost" data-retry="' + j.id + '">Retry</button>' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<div class="empty"><h3>No jobs here</h3><p>Nothing matches these filters yet.</p></div>') + '</div>';
      SV.$$('[data-k]', view).forEach(function (b) { b.onclick = function () { f[b.dataset.k] = b.dataset.v; SV.go('/admin/jobs' + SV.qs(f), { replace: true }); }; });
      SV.$$('[data-run]', view).forEach(function (b) { b.onclick = function () { A.call('POST', '/api/admin/scheduler/' + b.dataset.run, {}, b, 'Done').then(reload); }; });
      SV.$$('[data-retry]', view).forEach(function (b) { b.onclick = function () { A.call('POST', '/api/admin/jobs/' + b.dataset.retry + '/retry', {}, b, 'Retried').then(reload); }; });
      $('#mediaRetry').onclick = function () { A.call('POST', '/api/admin/media/retry', {}, this, function (x) { return 'Media retried' + (x && x.done != null ? ': ' + x.done + ' saved' : ''); }).then(reload); };
    });
  };

  /* ======================= ADS MANAGER ======================= */
  P['/admin/ads'] = function (view) {
    var qs = new URLSearchParams(location.search);
    var f = { q: qs.get('q') || '', filter: qs.get('filter') || '', source: qs.get('source') || '', offset: Number(qs.get('offset')) || 0 };
    A.load(view, '/api/admin/ads' + SV.qs(f), function (d) {
      view.innerHTML = A.head('Ads manager', SV.n(d.total) + ' ads. Feature the best ones on the website, hide bad ones, re-run the AI.',
        '<button class="btn ghost" id="seedBtn">' + I('plus') + 'Add sample ads</button><button class="btn ghost" id="clearBtn">' + I('trash') + 'Remove sample ads</button>') +
        '<div class="box"><div class="row-wrap" style="margin-bottom:12px"><form id="adQ" style="flex:1;min-width:220px"><input class="input" name="q" value="' + esc(f.q) + '" placeholder="Search text, headline or advertiser"></form>' +
          '<div class="seg">' + [['', 'All'], ['featured', 'Featured'], ['hidden', 'Hidden']].map(function (o) { return '<button data-f="' + o[0] + '"' + (f.filter === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>' +
          '<div class="seg">' + [['', 'Any source'], ['apify', 'Real'], ['demo', 'Sample']].map(function (o) { return '<button data-s="' + o[0] + '"' + (f.source === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div></div>' +
        (d.items.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ad</th><th class="num">Score</th><th class="num">Days</th><th>Status</th><th>Featured</th><th>Hidden</th><th></th></tr></thead><tbody>' +
          d.items.map(function (a) {
            return '<tr data-id="' + a.id + '"><td><div class="who"><span class="athumb" style="background-image:url(\'' + esc(a.thumb) + '\')"></span><span><b>' + esc(a.advertiser.name) + '</b><small>' + esc((a.headline || a.text || '').slice(0, 70)) + '</small><br>' + (a.niche ? A.tag(a.niche, 'blue') + ' ' : '') + (a.sample ? A.tag('sample', 'orange') + ' ' : '') + (a.analysed ? A.tag('AI ✓', 'mint') : '') + '</span></div></td>' +
              '<td class="num"><b style="color:' + SV.scoreColor(a.score) + '">' + a.score + '</b></td><td class="num">' + a.days + '</td><td>' + A.status(a.status) + '</td>' +
              '<td><label class="sw"><input type="checkbox" data-act="featured"' + (a.featured ? ' checked' : '') + ' aria-label="Featured"></label></td>' +
              '<td><label class="sw"><input type="checkbox" data-act="hidden"' + (a.hidden ? ' checked' : '') + ' aria-label="Hidden"></label></td>' +
              '<td class="acts"><button class="btn sm ghost" data-act="ai">' + I('wand') + 'Re-run AI</button><button class="btn sm ghost" data-act="del" aria-label="Delete">' + I('trash') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty"><h3>No ads match</h3><p>Try another search, or add sample ads to preview the dashboard.</p></div>') +
        '<div class="pager">' + (f.offset ? '<button class="btn ghost sm" data-page="' + Math.max(0, f.offset - 50) + '">' + I('left') + 'Newer</button>' : '') + (d.next ? '<button class="btn ghost sm" data-page="' + d.next + '">Older' + I('arrow') + '</button>' : '') + '</div></div>';
      var nav = function () { SV.go('/admin/ads' + SV.qs(f), { replace: true }); };
      $('#adQ').onsubmit = function (e) { e.preventDefault(); f.q = this.q.value.trim(); f.offset = 0; nav(); };
      SV.$$('[data-f]', view).forEach(function (b) { b.onclick = function () { f.filter = b.dataset.f; f.offset = 0; nav(); }; });
      SV.$$('[data-s]', view).forEach(function (b) { b.onclick = function () { f.source = b.dataset.s; f.offset = 0; nav(); }; });
      SV.$$('[data-page]', view).forEach(function (b) { b.onclick = function () { f.offset = Number(b.dataset.page); nav(); }; });
      $('#seedBtn').onclick = function () { A.call('POST', '/api/admin/demo', { action: 'seed' }, this, function (x) { return x.added + ' sample ads added'; }).then(reload); };
      $('#clearBtn').onclick = function () { var b = this; SV.confirm('Remove all sample ads?', 'Real ads stay. Users stop seeing the sample ads straight away.', 'Remove', true).then(function (ok) { if (ok) A.call('POST', '/api/admin/demo', { action: 'clear' }, b, function (x) { return x.removed + ' sample ads removed'; }).then(reload); }); };
      SV.$$('tr[data-id]', view).forEach(function (tr) {
        var id = tr.dataset.id;
        tr.querySelector('[data-act=featured]').onchange = function () { A.call('PATCH', '/api/admin/ads/' + id, { featured: this.checked }, null, this.checked ? 'Featured on the website' : 'No longer featured'); };
        tr.querySelector('[data-act=hidden]').onchange = function () { A.call('PATCH', '/api/admin/ads/' + id, { hidden: this.checked }, null, this.checked ? 'Hidden from users' : 'Visible again'); };
        tr.querySelector('[data-act=ai]').onclick = function () { A.call('POST', '/api/admin/ads/' + id + '/reanalyse', {}, this, 'New AI breakdown written'); };
        tr.querySelector('[data-act=del]').onclick = function () { SV.confirm('Delete this ad?', 'It is removed with its saved images and videos. This can’t be undone.', 'Delete', true).then(function (ok) { if (ok) A.call('DELETE', '/api/admin/ads/' + id, null, null, 'Ad deleted').then(reload); }); };
      });
    });
  };

  /* ======================= USERS ======================= */
  P['/admin/users'] = function (view) {
    var qs = new URLSearchParams(location.search);
    var f = { q: qs.get('q') || '', offset: Number(qs.get('offset')) || 0 };
    Promise.all([SV.get('/api/admin/users' + SV.qs(f)), SV.get('/api/admin/plans')]).then(function (r) {
      var d = r[0], plans = r[1].items;
      view.innerHTML = A.head('Users', SV.n(d.total) + ' people. Change plans, give free time, suspend accounts.') +
        '<div class="box"><form id="uQ" style="margin-bottom:12px"><input class="input" name="q" value="' + esc(f.q) + '" placeholder="Search by email or name"></form>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Country</th><th>Plan</th><th>Renews</th><th>Last login</th><th>Joined</th><th></th></tr></thead><tbody>' +
          d.items.map(function (u) {
            return '<tr><td><div class="who"><span class="av">' + SV.avatar(u.email) + '</span><span><b>' + esc(u.name || u.email.split('@')[0]) + '</b><small>' + esc(u.email) + '</small></span></div></td><td>' + SV.flag(u.country) + ' ' + esc(u.country || '') + '</td>' +
              '<td>' + A.tag(u.plan, u.plan === 'free' ? '' : 'blue') + (u.role === 'admin' ? ' ' + A.tag('admin', 'pink') : '') + (u.suspended ? ' ' + A.tag('suspended', 'red') : '') + (u.team_owner_id ? ' ' + A.tag('team seat') : '') + (u.voo ? ' ' + A.tag('VooSquare', 'mint') : '') + '</td>' +
              '<td>' + (u.plan_renews_at ? SV.date(u.plan_renews_at) : '<span class="mut">—</span>') + '</td><td>' + A.when(u.last_login) + '</td><td>' + SV.date(u.created_at) + '</td>' +
              '<td class="acts"><button class="btn sm ghost" data-u="' + u.id + '">Manage</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
        '<div class="pager">' + (f.offset ? '<button class="btn ghost sm" data-page="' + Math.max(0, f.offset - 50) + '">' + I('left') + 'Newer</button>' : '') + (d.next ? '<button class="btn ghost sm" data-page="' + d.next + '">Older' + I('arrow') + '</button>' : '') + '</div></div>';
      $('#uQ').onsubmit = function (e) { e.preventDefault(); f.q = this.q.value.trim(); f.offset = 0; SV.go('/admin/users' + SV.qs(f), { replace: true }); };
      SV.$$('[data-page]', view).forEach(function (b) { b.onclick = function () { f.offset = Number(b.dataset.page); SV.go('/admin/users' + SV.qs(f), { replace: true }); }; });
      SV.$$('[data-u]', view).forEach(function (b) { b.onclick = function () { userModal(b.dataset.u, plans); }; });
    }).catch(SV.fail);
  };
  function userModal(id, plans) {
    SV.get('/api/admin/users/' + id).then(function (d) {
      var u = d.user, mt = d.meter;
      var meter = function (k, l) { var x = mt[k]; return '<div class="row-wrap" style="justify-content:space-between;font-weight:700;font-size:13.5px"><span>' + l + '</span><span class="tnum">' + SV.limitText(x) + '</span></div><div class="bar" style="margin:6px 0 10px"><i style="width:' + SV.pct(x) + '%"></i></div>'; };
      var m = SV.modal('<div class="row-wrap" style="gap:14px"><span style="width:64px;height:64px;border-radius:20px;overflow:hidden">' + SV.avatar(u.email) + '</span><div><h2 style="margin:0">' + esc(u.name || u.email) + '</h2><p class="mut" style="margin:2px 0 0;font-weight:600">' + esc(u.email) + ' · ' + SV.flag(u.country) + ' ' + esc(u.country || '') + '</p></div></div>' +
        '<div class="g2" style="margin-top:16px;align-items:start"><div>' + meter('searches', 'Searches today') + meter('analyses', 'AI breakdowns') + meter('downloads', 'Downloads') + meter('saves', 'Saved ads') + '</div>' +
        '<div class="note">' + d.boards + ' boards · ' + d.follows + ' advertisers followed · ' + d.orders.length + ' order' + (d.orders.length === 1 ? '' : 's') + (u.marketing_opt_out ? '<br>Opted out of news emails' : '') + '</div></div>' +
        '<form class="form" style="margin-top:14px">' +
          A.field('plan_id', 'Plan', u.plan_id, { options: plans.map(function (p) { return [p.id, p.name]; }) }) +
          A.field('plan_renews_at', 'Paid until (UTC)', u.plan_renews_at ? u.plan_renews_at.slice(0, 10) : '', { type: 'date', hint: 'Give free time by moving this date.' }) +
          A.field('role', 'Role', u.role, { options: [['user', 'User'], ['admin', 'Admin']] }) +
          A.sw('suspended', 'Suspended', u.suspended, 'Logs them out and blocks sign-in.') +
        '</form>' +
        (d.orders.length ? '<h3 style="margin:16px 0 6px;font-size:16px">Orders</h3><div class="tbl-wrap" style="margin:0"><table class="tbl"><tbody>' + d.orders.slice(0, 6).map(function (o) { return '<tr><td class="mono">' + esc(o.ref) + '</td><td>' + esc(o.plan || o.plan_id || '') + '</td><td class="num">' + SV.money(o.amount) + '</td><td>' + A.status(o.status) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        '<div class="actions"><button class="btn ghost" data-no>Close</button><button class="btn" data-ok>' + I('check') + 'Save changes</button></div>', { wide: true });
      m.el.querySelector('[data-no]').onclick = function () { m.close(); };
      m.el.querySelector('[data-ok]').onclick = function () {
        var b = A.read(m.el.querySelector('form'));
        var body = {};
        if (b.role !== u.role) body.role = b.role;
        if (!!b.suspended !== !!u.suspended) body.suspended = b.suspended;
        if (b.plan_id !== u.plan_id) { body.plan_id = b.plan_id; body.plan_renews_at = b.plan_renews_at || null; }
        else if ((b.plan_renews_at || '') !== (u.plan_renews_at ? u.plan_renews_at.slice(0, 10) : '')) body.plan_renews_at = b.plan_renews_at || null;
        A.call('PATCH', '/api/admin/users/' + id, body, this, 'Saved').then(function () { m.close(); reload(); });
      };
    }).catch(SV.fail);
  }

  /* ======================= PLANS ======================= */
  P['/admin/plans'] = function (view) {
    A.load(view, '/api/admin/plans', function (d) {
      view.innerHTML = A.head('Plans', 'Prices and limits. Changes show on the website, pricing page and checkout straight away. -1 means unlimited.', '<button class="btn" id="newPlan">' + I('plus') + 'New plan</button>') +
        '<div class="g4">' + d.items.map(function (p) {
          return '<div class="box" style="display:flex;flex-direction:column;gap:8px;' + (p.popular ? 'box-shadow:inset 0 0 0 2px var(--blue)' : '') + (p.active ? '' : ';opacity:.55') + '"><div class="row-wrap" style="justify-content:space-between"><h3>' + esc(p.name) + '</h3>' + (p.popular ? A.tag('Popular', 'blue') : '') + (p.active ? '' : A.tag('Hidden')) + '</div>' +
            '<div style="font:800 34px/1 var(--display);letter-spacing:-.04em">' + SV.money(p.price_month) + '<small class="mut" style="font-size:13px"> /mo · ' + SV.money(p.price_year) + ' /yr</small></div><p class="mut" style="margin:0;font-weight:600;font-size:13.5px">' + esc(p.tagline) + '</p>' +
            '<div class="mut" style="font-size:13px;font-weight:700;line-height:1.8">' + A.lim(p.searches_per_day) + ' searches/day<br>' + A.lim(p.ai_per_month) + ' AI/month · ' + A.lim(p.saves_limit) + ' saves<br>' + A.lim(p.downloads_per_month) + ' downloads · ' + A.lim(p.scripts_per_month) + ' scripts<br>' + A.lim(p.follows_limit) + ' follows · ' + p.seats + ' seat' + (p.seats > 1 ? 's' : '') + '</div>' +
            '<div class="row-wrap" style="margin-top:auto;justify-content:space-between"><span class="tag2">' + SV.n(p.users) + ' users</span><button class="btn sm ghost" data-p="' + esc(p.id) + '">' + I('edit') + 'Edit</button></div></div>';
        }).join('') + '</div>';
      $('#newPlan').onclick = function () { planModal(null); };
      SV.$$('[data-p]', view).forEach(function (b) { b.onclick = function () { planModal(d.items.filter(function (p) { return p.id === b.dataset.p; })[0]); }; });
    });
  };
  function planModal(p) {
    var isNew = !p;
    p = p || { id: '', name: '', tagline: '', price_month: 0, price_year: 0, searches_per_day: 50, saves_limit: 200, ai_per_month: 50, downloads_per_month: 20, scripts_per_month: 10, follows_limit: 5, seats: 1, features: [], popular: false, active: true, sort: 10 };
    var m = SV.modal('<h2>' + (isNew ? 'New plan' : 'Edit ' + esc(p.name)) + '</h2><form class="form" style="margin-top:14px">' +
      (isNew ? A.field('id', 'Plan id (letters, no spaces)', '', { ph: 'business' }) : '') +
      A.field('name', 'Name', p.name) + A.field('tagline', 'One-line pitch', p.tagline, { full: !isNew }) +
      A.field('price_month', 'Price per month (USD)', p.price_month, { type: 'number', step: '0.01' }) + A.field('price_year', 'Price per year (USD)', p.price_year, { type: 'number', step: '0.01' }) +
      A.field('searches_per_day', 'Searches per day', p.searches_per_day, { type: 'number' }) + A.field('ai_per_month', 'AI breakdowns per month', p.ai_per_month, { type: 'number' }) +
      A.field('saves_limit', 'Saved ads', p.saves_limit, { type: 'number' }) + A.field('downloads_per_month', 'Downloads per month', p.downloads_per_month, { type: 'number' }) +
      A.field('scripts_per_month', '“Make it mine” scripts per month', p.scripts_per_month, { type: 'number' }) + A.field('follows_limit', 'Advertisers to follow', p.follows_limit, { type: 'number' }) +
      A.field('seats', 'Team seats', p.seats, { type: 'number' }) + A.field('sort', 'Order on the page', p.sort, { type: 'number' }) +
      A.field('features', 'Feature list (one per line)', (p.features || []).join('\n'), { type: 'textarea', full: true }) +
      A.sw('popular', 'Mark as most popular', p.popular) + A.sw('active', 'Show this plan', p.active) +
      '</form><div class="actions">' + (!isNew && p.id !== 'free' ? '<button class="btn ghost" data-del style="margin-right:auto">' + I('trash') + 'Delete</button>' : '') + '<button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('check') + 'Save plan</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    var del = m.el.querySelector('[data-del]');
    if (del) del.onclick = function () { SV.confirm('Delete the ' + p.name + ' plan?', 'This can’t be undone. If anyone is on it, hide it instead.', 'Delete', true).then(function (ok) { if (ok) A.call('DELETE', '/api/admin/plans/' + p.id, null, del, 'Plan deleted').then(function () { m.close(); reload(); }).catch(function () {}); }); };
    m.el.querySelector('[data-ok]').onclick = function () {
      var b = A.read(m.el.querySelector('form'));
      b.features = String(b.features || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      var id = isNew ? b.id : p.id; delete b.id; if (isNew) b.create = true;
      if (!id) return SV.toast('Give the plan an id', { bad: true });
      A.call('PUT', '/api/admin/plans/' + encodeURIComponent(id), b, this, 'Plan saved').then(function () { m.close(); reload(); });
    };
  }

  /* ======================= PAYMENTS ======================= */
  P['/admin/payments'] = function (view) {
    var qs = new URLSearchParams(location.search), st = qs.get('status') || '';
    Promise.all([SV.get('/api/admin/payments'), SV.get('/api/admin/orders' + SV.qs({ status: st }))]).then(function (r) {
      var d = r[0], orders = r[1].items, g = d.gatevoo;
      view.innerHTML = A.head('Payments', 'How people pay, discount codes and every order.') +
        '<div class="g2"><div class="box"><div class="box-head"><div><h3>' + SV.tile('card', 'var(--mint)', 28) + 'Gatevoo crypto checkout</h3><p>USDT (TRON) and Bitcoin, straight to your wallet.</p></div>' + A.status(g.mode) + '</div>' +
          '<div class="stack" style="gap:10px"><div><small class="mut" style="font-weight:800">Webhook URL (paste into Gatevoo)</small><div class="code-box"><span>' + esc(g.webhook_url) + '</span><button class="btn sm ghost" id="cpHook">' + I('copy') + '</button></div></div>' +
          '<div class="row-wrap">' + A.tag(g.has_key ? 'API key set' : 'No API key', g.has_key ? 'mint' : 'red') + A.tag(g.has_secret ? 'Webhook secret set' : 'No webhook secret', g.has_secret ? 'mint' : 'red') + (g.coins || []).map(function (c) { return A.tag(c.label, 'blue'); }).join('') + '</div>' +
          '<div><small class="mut" style="font-weight:800">API address (GATEVOO_API_URL)</small><div class="code-box"><span>' + esc(g.api_url) + '</span></div></div>' +
          (d.demo ? '<div class="note warn">PAYMENTS_DEMO is on: people can “pay” on a test page. Turn it off before launch.</div>' : '') +
          (g.missing && g.missing.length && g.mode !== 'sandbox' ? '<div class="note warn">' + esc(g.missing.join(', ')) + ' on the server, so customers don’t see crypto checkout.</div>' : '') +
          (g.last_error && !g.last_error.resolved ? '<div class="note warn"><b>Last crypto checkout failed</b> (' + esc(g.last_error.ref) + ', ' + A.when(g.last_error.at) + '): ' + esc(g.last_error.reason) + '</div>' : '') +
          '<div id="gvResult"></div>' +
          '<div class="save-bar" style="margin:0"><button class="btn ghost" id="gvPing">' + I('spark') + 'Test payment connection</button><button class="btn ghost" id="gvRecheck">' + I('clock') + 'Re-check unpaid crypto orders</button></div></div></div>' +
        '<div class="box"><div class="box-head"><div><h3>' + SV.tile('globe', 'var(--blue)', 28) + 'Payment methods</h3><p>Global methods show to everyone. Local ones only to the countries you list.</p></div><button class="btn sm" id="newMethod">' + I('plus') + 'Add</button></div>' +
          '<div class="tbl-wrap"><table class="tbl"><tbody>' + d.methods.map(function (m, i) { return '<tr><td><b>' + (m.provider === 'manual' ? '<span style="display:inline-block;width:16px;height:16px;vertical-align:-3px;margin-right:6px;color:var(--blue)">' + I(m.icon || 'bank') + '</span>' : '') + esc(m.name) + '</b><br><small class="mut">' + esc(m.provider === 'manual' ? 'custom · ' + (m.currency || 'USD') + (m.currency && m.currency !== 'USD' ? ' @ ' + m.rate : '') : m.provider) + ' · ' + (m.scope === 'local' ? m.countries.map(SV.flag).join(' ') || '<b style="color:var(--coral)">no countries</b>' : 'everyone') + '</small>' + (m.warnings || []).map(function (w) { return '<div class="note warn" style="margin-top:6px;padding:8px 10px;font-size:12.5px">' + esc(w) + '</div>'; }).join('') + '</td><td>' + (m.active ? A.tag('on', 'mint') : A.tag('off')) + '</td><td class="acts"><button class="btn sm ghost" data-mv="' + m.id + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>↑</button><button class="btn sm ghost" data-mv="' + m.id + '" data-dir="1" aria-label="Move down"' + (i === d.methods.length - 1 ? ' disabled' : '') + '>↓</button><button class="btn sm ghost" data-m="' + m.id + '">' + I('edit') + '</button></td></tr>'; }).join('') + '</tbody></table></div></div></div>' +
        '<div class="box" style="margin-top:16px"><div class="box-head"><div><h3>' + SV.tile('gift', 'var(--pink)', 28) + 'Coupons</h3><p>Codes people type at checkout. The launch offer uses one of these.</p></div><button class="btn sm" id="newCoupon">' + I('plus') + 'New coupon</button></div>' +
          (d.coupons.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Plans</th><th>Rules</th><th class="num">Used</th><th>Ends</th><th>On</th><th></th></tr></thead><tbody>' + d.coupons.map(function (c) {
            return '<tr><td class="mono"><b>' + esc(c.code) + '</b></td><td>' + (c.percent ? c.percent + '% off' : SV.money(c.amount_off) + ' off') + '</td><td>' + esc(c.plans || 'all') + '</td><td><small>' + [c.intervals ? c.intervals + 'ly only' : '', c.first_purchase_only ? 'first purchase' : ''].filter(Boolean).join(' · ') + '</small></td><td class="num">' + c.uses + (c.max_uses ? ' / ' + c.max_uses : '') + '</td><td>' + (c.ends_at ? SV.date(c.ends_at) : '<span class="mut">never</span>') + '</td><td>' + (c.active ? A.tag('on', 'mint') : A.tag('off')) + '</td><td class="acts"><button class="btn sm ghost" data-c="' + esc(c.code) + '">' + I('edit') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<p class="mut">No coupons yet.</p>') + '</div>' +
        '<div class="box" style="margin-top:16px"><div class="box-head"><div><h3>' + SV.tile('layers', 'var(--blue)', 28) + 'Orders</h3><p>Crypto orders confirm on their own (“Check” asks Gatevoo now). Custom-method payments wait in “Review”: look at the proof, then approve or reject.' + (d.review ? ' <b>' + d.review + ' waiting for review.</b>' : '') + '</p></div>' +
          '<div class="seg">' + [['', 'All'], ['review', 'Review' + (d.review ? ' (' + d.review + ')' : '')], ['pending', 'Pending'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['expired', 'Expired'], ['refunded', 'Refunded'], ['charged_back', 'Chargebacks'], ['failed', 'Failed']].map(function (o) { return '<button data-st="' + o[0] + '"' + (st === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div></div>' +
          (orders.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ref</th><th>Who</th><th>Plan</th><th class="num">Amount</th><th>Via</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>' + orders.map(function (o) {
            return '<tr><td class="mono">' + esc(o.ref) + '</td><td>' + esc(o.email) + '</td><td>' + esc(o.plan || o.plan_id) + ' · ' + esc(o.interval) + 'ly</td><td class="num">' + SV.money(o.amount_usd) + (o.pay_currency && o.pay_currency !== 'USD' ? '<br><small class="mut">' + esc(o.pay_amount + ' ' + o.pay_currency) + '</small>' : '') + (o.coupon ? '<br><small class="mut">' + esc(o.coupon) + '</small>' : '') + '</td><td>' + esc(o.provider) + '</td><td>' + A.status(o.status) + '</td><td>' + A.when(o.created_at) + '</td><td class="acts">' +
              (o.provider === 'manual' && ['pending', 'review', 'expired', 'rejected'].indexOf(o.status) >= 0 ? '<button class="btn sm' + (o.status === 'review' ? '' : ' ghost') + '" data-review="' + esc(o.ref) + '">' + (o.status === 'review' ? 'Review' : 'Open') + '</button>' : '') +
              (o.status === 'pending' && o.provider !== 'manual' ? (o.provider === 'gatevoo' ? '<button class="btn sm ghost" data-check="' + esc(o.ref) + '">Check</button>' : '') + '<button class="btn sm ghost" data-paid="' + esc(o.ref) + '">Mark paid</button>' : '') +
              (o.status === 'paid' ? '<button class="btn sm ghost" data-refund="' + esc(o.ref) + '" data-amount="' + o.amount_usd + '">Refund</button>' : '') +
              (o.status === 'paid' || o.status === 'refunded' ? '<button class="btn sm ghost" data-cb="' + esc(o.ref) + '" data-amount="' + o.amount_usd + '">Chargeback</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty"><h3>No orders yet</h3><p>Orders show here the moment someone starts a checkout.</p></div>') + '</div>';
      $('#cpHook').onclick = function () { SV.copy(g.webhook_url, 'Webhook URL'); };
      $('#gvRecheck').onclick = function () { A.call('POST', '/api/admin/payments/gatevoo/recheck', {}, this).then(function (x) { $('#gvResult').innerHTML = '<div class="note">' + esc(x.skipped ? 'Crypto checkout is not live, nothing to check.' : 'Asked Gatevoo about ' + x.checked + ' unpaid crypto order' + (x.checked === 1 ? '' : 's') + ' from the last 45 days: ' + x.activated + ' switched on.' + (x.errors ? ' ' + x.errors + ' could not be checked (try again later).' : '')) + '</div>'; }); };
      $('#gvPing').onclick = function () { A.call('POST', '/api/admin/payments/gatevoo/ping', {}, this).then(function (x) { if (!x) return; SV.toast(x.ok ? 'Gatevoo connection works' : 'Gatevoo connection failed', { bad: !x.ok }); $('#gvResult').innerHTML = '<div class="note' + (x.ok ? '' : ' warn') + '">' + (x.ok ? '✓ ' : '✗ ') + esc(x.message) + '</div>'; }); };
      $('#newMethod').onclick = function () { methodModal(null); };
      SV.$$('[data-m]', view).forEach(function (b) { b.onclick = function () { methodModal(d.methods.filter(function (m) { return String(m.id) === b.dataset.m; })[0]); }; });
      $('#newCoupon').onclick = function () { couponModal(null); };
      SV.$$('[data-c]', view).forEach(function (b) { b.onclick = function () { couponModal(d.coupons.filter(function (c) { return c.code === b.dataset.c; })[0]); }; });
      SV.$$('[data-st]', view).forEach(function (b) { b.onclick = function () { SV.go('/admin/payments' + SV.qs({ status: b.dataset.st }), { replace: true }); }; });
      SV.$$('[data-paid]', view).forEach(function (b) { b.onclick = function () { SV.confirm('Mark ' + b.dataset.paid + ' as paid?', 'Their plan starts now and they get a receipt email. Only do this when the money has arrived.', 'Mark paid').then(function (ok) { if (ok) A.call('POST', '/api/admin/orders/' + b.dataset.paid + '/paid', {}, b, 'Marked paid. Plan is active.').then(reload); }); }; });
      SV.$$('[data-refund]', view).forEach(function (b) { b.onclick = function () { SV.confirm('Refund ' + b.dataset.refund + '?', 'Record that ' + SV.money(Number(b.dataset.amount)) + ' went back to the customer (send the money yourself first). Their plan ends now. Affiliate commission is not reversed.', 'Record refund').then(function (ok) { if (ok) A.call('POST', '/api/admin/orders/' + b.dataset.refund + '/refund', {}, b, 'Refund recorded.').then(reload); }); }; });
      SV.$$('[data-cb]', view).forEach(function (b) { b.onclick = function () { SV.confirm('Chargeback on ' + b.dataset.cb + '?', 'The payment was disputed and taken back. Their plan ends now and the affiliate commission on it is reversed in VooSquare.', 'Record chargeback', true).then(function (ok) { if (ok) A.call('POST', '/api/admin/orders/' + b.dataset.cb + '/chargeback', {}, b, 'Chargeback recorded.').then(reload); }); }; });
      SV.$$('[data-mv]', view).forEach(function (b) { b.onclick = function () { A.call('POST', '/api/admin/payments/methods/' + b.dataset.mv + '/move', { dir: Number(b.dataset.dir) }, b).then(reload); }; });
      SV.$$('[data-review]', view).forEach(function (b) { b.onclick = function () { reviewModal(orders.filter(function (o) { return o.ref === b.dataset.review; })[0]); }; });
      SV.$$('[data-check]', view).forEach(function (b) { b.onclick = function () { A.call('POST', '/api/admin/orders/' + b.dataset.check + '/check', {}, b).then(function (x) { SV.toast(x.ok ? 'Payment confirmed' : (x.reason || 'Not paid yet'), { bad: !x.ok }); if (x.ok) reload(); }); }; });
    }).catch(SV.fail);
  };
  function methodModal(mt) {
    mt = mt || { name: '', provider: 'manual', scope: 'local', countries: [], description: '', instructions: '', coins: [], details: [], icon: 'bank', currency: 'USD', rate: 1, proof_mode: 'either', active: true, sort: 100 };
    var m = SV.modal('<h2>' + (mt.id ? 'Edit payment method' : 'New payment method') + '</h2><form class="form" style="margin-top:14px">' +
      A.field('name', 'Name people see', mt.name, { ph: 'Bank transfer (Brazil)' }) + A.field('provider', 'Type', mt.provider, { options: [['manual', 'Custom (bank, mobile money, wallet… you approve)'], ['gatevoo', 'Gatevoo crypto (automatic)']] }) +
      A.field('scope', 'Who sees it', mt.scope, { options: [['global', 'Everyone'], ['local', 'Only some countries']] }) + A.field('countries', 'Countries (codes)', (mt.countries || []).join(', '), { ph: 'BR, MX' }) +
      A.field('description', 'Short description', mt.description, { full: true }) +
      A.field('coins', 'Coins (Gatevoo only)', (mt.coins || []).map(function (c) { return c.id || c; }).join(', '), { ph: 'USDT_TRC20, BTC' }) + A.field('sort', 'Order', mt.sort || 0, { type: 'number' }) +
      A.field('icon', 'Icon (custom only)', mt.icon || 'bank', { options: [['bank', 'Bank'], ['phone', 'Mobile money'], ['wallet', 'Wallet / crypto address'], ['card', 'Card'], ['cash', 'Cash'], ['globe', 'Other']] }) +
      A.field('proof_mode', 'Proof the customer adds', mt.proof_mode || 'either', { options: [['either', 'Reference or screenshot'], ['text', 'Reference only'], ['image', 'Screenshot only'], ['both', 'Reference and screenshot'], ['none', 'Nothing (just “I’ve paid”)']] }) +
      A.field('currency', 'Currency (custom only)', mt.currency || 'USD', { ph: 'USD, NGN, KES, USDT' }) + A.field('rate', 'Rate: 1 USD = ? of that currency', mt.rate || 1, { type: 'number', hint: 'Use 1 for USD or USDT. Orders keep the rate they were created with.' }) +
      A.field('details', 'Account details (one per line, “Label: value”)', (mt.details || []).map(function (x) { return (x.label ? x.label + ': ' : '') + x.value; }).join('\n'), { type: 'textarea', full: true, hint: 'Each line gets a Copy button at checkout. E.g. “Bank: GTBank”, “Account number: 0123456789”, “USDT (TRC20) address: T…”.' }) +
      A.field('instructions', 'Payment instructions', mt.instructions || '', { type: 'textarea', full: true, hint: 'Shown after checkout, under the amount and the account details.' }) +
      A.sw('active', 'Switched on', mt.active) +
      '</form><div class="actions">' + (mt.id ? '<button class="btn ghost" data-del style="margin-right:auto">' + I('trash') + 'Delete</button>' : '') + '<button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('check') + 'Save</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    var del = m.el.querySelector('[data-del]');
    if (del) del.onclick = function () { SV.confirm('Delete “' + mt.name + '”?', 'People won’t see this payment method any more.', 'Delete', true).then(function (ok) { if (ok) A.call('DELETE', '/api/admin/payments/methods/' + mt.id, null, del, 'Deleted').then(function () { m.close(); reload(); }).catch(function () {}); }); };
    m.el.querySelector('[data-ok]').onclick = function () {
      A.call(mt.id ? 'PATCH' : 'POST', '/api/admin/payments/methods' + (mt.id ? '/' + mt.id : ''), A.read(m.el.querySelector('form')), this, 'Saved').then(function () { m.close(); reload(); });
    };
  }
  function reviewModal(o) {
    if (!o) return;
    var m = SV.modal('<span class="eyebrow">Order ' + esc(o.ref) + ' · ' + esc(o.status) + '</span><h2 style="margin-top:8px">' + esc((o.meta.pay || {}).name || 'Custom payment') + '</h2>' +
      '<div class="stack" style="gap:8px;margin-top:10px"><div><b>' + esc(o.email) + '</b> · ' + esc(o.plan || o.plan_id) + ' · ' + esc(o.interval) + 'ly</div>' +
      '<div>Should receive: <b>' + esc((o.pay_amount != null ? o.pay_amount : o.amount_usd) + ' ' + (o.pay_currency || 'USD')) + '</b>' + (o.pay_currency && o.pay_currency !== 'USD' ? ' (= ' + SV.money(o.amount_usd) + ')' : '') + (o.coupon ? ' · code ' + esc(o.coupon) : '') + '</div>' +
      '<div>Reference: <b class="mono">' + (o.proof ? esc(o.proof) : '<span class="mut">none</span>') + '</b>' + (o.proof_at ? ' <small class="mut">· sent ' + A.when(o.proof_at) + '</small>' : '') + '</div>' +
      (o.proof_file ? '<a href="/api/admin/orders/' + encodeURIComponent(o.ref) + '/proof" target="_blank" rel="noopener"><img src="/api/admin/orders/' + encodeURIComponent(o.ref) + '/proof" alt="Payment screenshot" style="max-width:100%;max-height:360px;border-radius:14px;border:1px solid var(--line)"></a>' : '<small class="mut">No screenshot.</small>') +
      (o.review_note ? '<div class="note warn">' + esc(o.review_note) + '</div>' : '') +
      (['pending', 'review', 'expired'].indexOf(o.status) >= 0 ? '<form class="form" style="margin-top:6px">' + A.field('reason', 'Reason if you reject (the customer sees it)', '', { type: 'textarea', full: true, ph: 'We couldn’t find a transfer with this reference.' }) + '</form>' : '') + '</div>' +
      '<div class="actions"><button class="btn ghost" data-no>Close</button>' + (['pending', 'review', 'expired'].indexOf(o.status) >= 0 ? '<button class="btn ghost" data-rej style="color:var(--coral)">Reject</button>' : '') + '<button class="btn" data-ok>' + I('check') + 'Approve, plan on</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    var rj = m.el.querySelector('[data-rej]');
    if (rj) rj.onclick = function () { A.call('POST', '/api/admin/orders/' + encodeURIComponent(o.ref) + '/reject', { reason: m.el.querySelector('[name=reason]').value }, rj, 'Rejected. The customer was told why.').then(function () { m.close(); reload(); }); };
    m.el.querySelector('[data-ok]').onclick = function () { var b = this; SV.confirm('Approve ' + o.ref + '?', 'Only when the money has arrived. Their plan starts now and they get a receipt.', 'Approve').then(function (ok) { if (ok) A.call('POST', '/api/admin/orders/' + encodeURIComponent(o.ref) + '/approve', {}, b, 'Approved. Plan is active.').then(function () { m.close(); reload(); }); }); };
  }
  function couponModal(c) {
    var isNew = !c;
    c = c || { code: '', percent: 20, amount_off: 0, plans: '', intervals: '', first_purchase_only: false, max_uses: 0, ends_at: '', active: true };
    var m = SV.modal('<h2>' + (isNew ? 'New coupon' : 'Edit ' + esc(c.code)) + '</h2><form class="form" style="margin-top:14px">' +
      (isNew ? A.field('code', 'Code', '', { ph: 'CAIRO30' }) : '') +
      A.field('percent', 'Percent off', c.percent, { type: 'number' }) + A.field('amount_off', 'Or amount off (USD)', c.amount_off, { type: 'number' }) +
      A.field('plans', 'Only these plans (empty = all)', c.plans, { ph: 'starter, pro' }) + A.field('intervals', 'Only (empty = both)', c.intervals, { options: [['', 'Monthly and yearly'], ['month', 'Monthly only'], ['year', 'Yearly only']] }) +
      A.field('max_uses', 'Max uses (0 = no limit)', c.max_uses, { type: 'number' }) + A.field('ends_at', 'Ends on', c.ends_at ? c.ends_at.slice(0, 10) : '', { type: 'date' }) +
      A.sw('first_purchase_only', 'First purchase only', c.first_purchase_only) + A.sw('active', 'Switched on', c.active) +
      '</form><div class="actions">' + (!isNew ? '<button class="btn ghost" data-del style="margin-right:auto">' + I('trash') + 'Delete</button>' : '') + '<button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('check') + 'Save</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    var del = m.el.querySelector('[data-del]');
    if (del) del.onclick = function () { SV.confirm('Delete ' + c.code + '?', 'The code stops working at checkout straight away.', 'Delete', true).then(function (ok) { if (ok) A.call('DELETE', '/api/admin/coupons/' + encodeURIComponent(c.code), null, del, 'Deleted').then(function () { m.close(); reload(); }).catch(function () {}); }); };
    m.el.querySelector('[data-ok]').onclick = function () {
      var b = A.read(m.el.querySelector('form'));
      A.call(isNew ? 'POST' : 'PATCH', '/api/admin/coupons' + (isNew ? '' : '/' + encodeURIComponent(c.code)), b, this, 'Coupon saved').then(function () { m.close(); reload(); });
    };
  }

  /* ======================= OFFER + VOO FAMILY + ANNOUNCEMENT ======================= */
  P['/admin/offer'] = function (view) {
    A.load(view, '/api/admin/settings', function (s) {
      var o = s.offer, an = s.announcement, fam = s.family.slice();
      view.innerHTML = A.head('Offer & Voo family', 'The launch offer, the dashboard banner, and the swipe slides that sell your other brands.') +
        '<div class="g2"><div class="box"><h3>' + SV.tile('gift', 'var(--pink)', 28) + 'Offer</h3><p>Shows on the website bar, pricing, dashboard and checkout. It needs a coupon with the same code.</p><form class="form" id="offerF">' +
          A.sw('on', 'Offer is live', o.on, '', true) + A.field('badge', 'Badge', o.badge, { ph: '-50%' }) + A.field('code', 'Coupon code', o.code) +
          A.field('title', 'Title', o.title, { full: true }) + A.field('text', 'Text', o.text, { full: true }) +
          A.field('ends_at', 'Ends (your local time, empty = no countdown)', o.ends_at ? A.localInput(o.ends_at) : '', { type: 'datetime-local' }) +
          A.field('plans', 'For plans', (o.plans || []).join(', ')) +
        '</form><div class="save-bar"><button class="btn ghost" id="offerMail">' + I('bell') + 'Email it to free users</button><button class="btn" id="offerSave">' + I('check') + 'Save offer</button></div></div>' +
        '<div class="box"><h3>' + SV.tile('bell', 'var(--orange)', 28) + 'Dashboard announcement</h3><p>A strip at the top of every user’s dashboard.</p><form class="form" id="annF">' +
          A.sw('on', 'Show the announcement', an.on, '', true) + A.field('text', 'Message', an.text, { full: true, type: 'textarea' }) + A.field('link', 'Link (optional)', an.link) + A.field('tone', 'Tone', an.tone, { options: [['info', 'Info (blue)'], ['warn', 'Warning (orange)']] }) +
        '</form><div class="save-bar"><button class="btn" id="annSave">' + I('check') + 'Save announcement</button></div></div></div>' +
        '<div class="box" style="margin-top:16px"><div class="box-head"><div><h3>' + SV.tile('layers', 'var(--blue)', 28) + 'Voo family slides</h3><p>These swipe on the landing page, the dashboard home and the bottom of every email. Reorder them with the arrows.</p></div><button class="btn sm" id="famAdd">' + I('plus') + 'Add a brand</button></div>' +
          '<div class="fam-ed" id="famEd"></div><div class="save-bar"><button class="btn" id="famSave">' + I('check') + 'Save slides</button></div></div>';
      function drawFam() {
        $('#famEd').innerHTML = fam.map(function (f, i) {
          return '<div class="fam-card' + (f.on ? '' : ' off') + '" style="--fc:' + esc(f.color) + ';--fc-ink:' + esc(f.ink) + '">' + (['joinvoo','replyvoo','castvoo','vooads','gatevoo','voosquare','affleego'].indexOf(f.key) >= 0 ? '<img src="/img/brands/' + f.key + '.svg" alt="" width="40" height="40" style="border-radius:12px;box-shadow:0 0 0 1.5px rgba(255,255,255,.25)">' : '') + '<span class="k" style="color:' + esc(f.accent || f.ink) + '">' + esc(f.tag) + '</span><b>' + esc(f.name) + '</b><p><b style="font:800 14px var(--body)">' + esc(f.title) + '</b></p><p>' + esc(f.text) + '</p>' +
            '<div class="acts"><button class="btn sm" data-i="' + i + '" data-a="up" aria-label="Move left">' + I('left') + '</button><button class="btn sm" data-i="' + i + '" data-a="down" aria-label="Move right">' + I('arrow') + '</button><button class="btn sm" data-i="' + i + '" data-a="edit">' + I('edit') + 'Edit</button><button class="btn sm" data-i="' + i + '" data-a="on">' + (f.on ? 'Hide' : 'Show') + '</button></div></div>';
        }).join('');
        SV.$$('[data-a]', $('#famEd')).forEach(function (b) {
          b.onclick = function () {
            var i = Number(b.dataset.i), a = b.dataset.a;
            if (a === 'up' && i > 0) fam.splice(i - 1, 0, fam.splice(i, 1)[0]);
            if (a === 'down' && i < fam.length - 1) fam.splice(i + 1, 0, fam.splice(i, 1)[0]);
            if (a === 'on') fam[i].on = !fam[i].on;
            if (a === 'edit') return famModal(fam[i], function (v) { fam[i] = v; drawFam(); }, function () { fam.splice(i, 1); drawFam(); });
            drawFam();
          };
        });
      }
      drawFam();
      $('#famAdd').onclick = function () { famModal(null, function (v) { fam.push(v); drawFam(); }); };
      $('#famSave').onclick = function () { A.call('PATCH', '/api/admin/settings/family', { value: fam }, this, 'Slides saved'); };
      $('#offerSave').onclick = function () {
        var b = A.read($('#offerF'));
        b.plans = String(b.plans).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        b.ends_at = b.ends_at ? new Date(b.ends_at).toISOString() : '';
        A.call('PATCH', '/api/admin/settings/offer', { value: b }, this, 'Offer saved');
      };
      $('#offerMail').onclick = function () {
        var btn = this;
        A.call('POST', '/api/admin/emails/offer', { dry: true }, btn).then(function (x) {
          SV.confirm('Email the offer to ' + SV.n(x.recipients) + ' free users?', 'They get the “' + o.title + '” email with code ' + o.code + '. Save the offer first if you changed it.', 'Send now').then(function (ok) { if (ok) A.call('POST', '/api/admin/emails/offer', {}, btn, function (y) { return 'Sending to ' + SV.n(y.sent) + ' people'; }); });
        });
      };
      $('#annSave').onclick = function () { A.call('PATCH', '/api/admin/settings/announcement', { value: A.read($('#annF')) }, this, 'Announcement saved'); };
    });
  };
  function famModal(f, onSave, onDelete) {
    var isNew = !f;
    f = f || { key: '', name: '', tag: '', title: '', text: '', perk: '', url: 'https://', color: '#1F5BFF', ink: '#FFFFFF', accent: '', on: true };
    var m = SV.modal('<h2>' + (isNew ? 'Add a brand' : 'Edit ' + esc(f.name)) + '</h2><form class="form" style="margin-top:14px">' +
      A.field('name', 'Brand name', f.name) + A.field('tag', 'Small label', f.tag, { ph: 'Tracking' }) +
      A.field('title', 'Headline', f.title, { full: true }) + A.field('text', 'Pitch', f.text, { type: 'textarea', full: true }) +
      A.field('perk', 'Perk', f.perk, { ph: '7 days free' }) + A.field('url', 'Link', f.url) +
      A.field('color', 'Background', f.color, { type: 'color' }) + A.field('ink', 'Text colour', f.ink, { type: 'color' }) +
      A.field('accent', 'Accent (optional, #hex)', f.accent || '', { ph: '#C8F75A' }) + A.sw('on', 'Show this slide', f.on) +
      '</form><div class="actions">' + (onDelete ? '<button class="btn ghost" data-del style="margin-right:auto">' + I('trash') + 'Remove</button>' : '') + '<button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>' + I('check') + 'Done</button></div>', { wide: true });
    m.el.querySelector('[data-no]').onclick = function () { m.close(); };
    var del = m.el.querySelector('[data-del]');
    if (del) del.onclick = function () { onDelete(); m.close(); SV.toast('Removed. Press “Save slides” to keep it.'); };
    m.el.querySelector('[data-ok]').onclick = function () {
      var b = A.read(m.el.querySelector('form'));
      b.key = f.key || b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      onSave(b); m.close(); SV.toast('Press “Save slides” to publish.');
    };
  }

  /* ======================= EMAILS ======================= */
  P['/admin/emails'] = function (view) {
    Promise.all([SV.get('/api/admin/emails'), SV.get('/api/admin/plans')]).then(function (r) {
      var d = r[0], plans = r[1].items, cur = (d.templates[0] || {}).name;
      view.innerHTML = A.head('Emails', 'Every email Spyvoo sends, in your design, with the Voo family strip at the bottom. Preview, test and send news.') +
        (d.configured ? '' : '<div class="note warn" style="margin-bottom:16px">Emails are only logged right now. Set MAIL_PROVIDER (resend, brevo or postmark) and MAIL_API_KEY on Railway to send for real. Sender: <b>' + esc(d.from) + '</b>.</div>') +
        '<div class="box"><div class="mail-grid"><div><div class="mail-list" id="mailList">' + d.templates.map(function (t) { return '<button data-t="' + esc(t.name) + '"><span>' + esc(t.name.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); })) + '</span><small>' + esc(t.subject) + '</small></button>'; }).join('') + '</div>' +
          '<form id="testF" class="stack" style="margin-top:14px;gap:8px"><input class="input" name="to" type="email" value="' + esc(A.me.email) + '" aria-label="Send test to"><button class="btn block" type="submit">' + I('bell') + 'Send me this email</button></form></div>' +
          '<iframe class="mail-frame" id="mailFrame" title="Email preview"></iframe></div></div>' +
        '<div class="g2" style="margin-top:16px"><div class="box"><h3>' + SV.tile('flag', 'var(--coral)', 28) + 'Send news to users</h3><p>Uses the announcement email. People who opted out are skipped.</p><form class="form" id="bcF">' +
          A.field('subject', 'Subject', '', { full: true, ph: 'New: TikTok ads are coming to Spyvoo' }) + A.field('body', 'Message', '', { type: 'textarea', full: true, ph: 'Write like you talk. Blank line = new paragraph.' }) +
          A.field('plan', 'Send to', '', { options: [['', 'Everyone']].concat(plans.map(function (p) { return [p.id, 'Only ' + p.name]; })) }) +
        '</form><div class="save-bar"><button class="btn" id="bcBtn">' + I('arrow') + 'Review and send</button></div></div>' +
        '<div class="box"><h3>' + SV.tile('clock', 'var(--blue)', 28) + 'Recent emails</h3><p>The last 100 sent (or logged).</p><div class="tbl-wrap"><table class="tbl"><tbody>' + d.log.slice(0, 30).map(function (l) { return '<tr><td><b>' + esc(l.template || '') + '</b><br><small class="mut">' + esc(l.to_email || l.email || '') + '</small></td><td>' + A.status(l.status || 'done') + '</td><td class="num">' + A.when(l.created_at) + '</td></tr>'; }).join('') + '</tbody></table></div></div></div>';
      $('#mailFrame').onload = function () { try { var d = this.contentDocument; if (d && d.body) this.style.height = Math.max(520, d.documentElement.scrollHeight + 8) + 'px'; } catch (e) {} };
      function show(name) { cur = name; SV.$$('[data-t]', view).forEach(function (b) { b.classList.toggle('on', b.dataset.t === name); }); $('#mailFrame').src = '/api/admin/emails/' + encodeURIComponent(name) + '/preview'; }
      SV.$$('[data-t]', view).forEach(function (b) { b.onclick = function () { show(b.dataset.t); }; });
      if (cur) show(cur);
      $('#testF').onsubmit = function (e) { e.preventDefault(); A.call('POST', '/api/admin/emails/test', { to: this.to.value, name: cur }, this.querySelector('button'), function (x) { return x.logged ? 'Logged to the server console (no email provider yet)' : 'Test email sent. Check the inbox and spam.'; }); };
      $('#bcBtn').onclick = function () {
        var b = A.read($('#bcF')), btn = this;
        if (!b.subject || !b.body) return SV.toast('Add a subject and a message', { bad: true });
        A.call('POST', '/api/admin/emails/broadcast', Object.assign({ dry: true }, b), btn).then(function (x) {
          SV.confirm('Send to ' + SV.n(x.recipients) + ' people?', '“' + b.subject + '” goes out now. This can’t be undone.', 'Send now').then(function (ok) { if (ok) A.call('POST', '/api/admin/emails/broadcast', b, btn, function (y) { return 'Sending to ' + SV.n(y.sent) + ' people'; }); });
        });
      };
    }).catch(SV.fail);
  };

  /* ======================= SETTINGS ======================= */
  P['/admin/settings'] = function (view) {
    A.load(view, '/api/admin/settings', function (s) {
      var c = s.company, sc = s.score, fl = s.flags, bl = s.billing;
      view.innerHTML = A.head('Settings', 'Company details, platforms, how winners are scored, niches and switches.') +
        '<div class="g2"><div class="box"><h3>' + SV.tile('flag', 'var(--coral)', 28) + 'Company</h3><p>Used in legal pages, emails and the footer.</p><form class="form" id="coF">' +
          A.field('name', 'Product name', c.name) + A.field('legal_name', 'Company', c.legal_name) + A.field('city', 'City', c.city) +
          A.field('support_email', 'Support email', c.support_email) + A.field('hello_email', 'Hello email', c.hello_email) + A.field('billing_email', 'Billing email', c.billing_email) +
          A.field('legal_email', 'Legal email', c.legal_email) + A.field('privacy_email', 'Privacy email', c.privacy_email) +
        '</form><div class="save-bar"><button class="btn" data-save="company" data-f="coF">' + I('check') + 'Save</button></div></div>' +
        '<div class="stack"><div class="box"><h3>' + SV.tile('globe', 'var(--blue)', 28) + 'Platforms</h3><p>Live = searchable. Soon = shown with a “coming soon” badge.</p><form class="stack" id="plF" style="gap:10px">' +
          Object.keys(s.platforms).map(function (k) { return '<div class="row-wrap" style="justify-content:space-between"><b>' + esc({ tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', snapchat: 'Snapchat', linkedin: 'LinkedIn', pinterest: 'Pinterest', google: 'Google', x: 'X' }[k] || k.charAt(0).toUpperCase() + k.slice(1)) + '</b><div class="seg" data-pl="' + esc(k) + '">' + ['live', 'soon', 'off'].map(function (v) { return '<button type="button" data-v="' + v + '"' + (s.platforms[k] === v ? ' class="on"' : '') + '>' + v + '</button>'; }).join('') + '</div></div>'; }).join('') +
        '</form><div class="save-bar"><button class="btn" id="plSave">' + I('check') + 'Save</button></div></div>' +
        '<div class="box"><h3>' + SV.tile('sliders', 'var(--violet)', 28) + 'Switches</h3><form class="stack" id="flF" style="gap:12px">' +
          A.sw('signups', 'New sign-ups open', fl.signups) + A.sw('public_search', 'Try-it search on the website', fl.public_search) + A.sw('maintenance', 'Maintenance mode', fl.maintenance, 'Users see a “back soon” page. Admins still get in.') +
          A.field('public_search_limit', 'Results shown before sign-up', fl.public_search_limit, { type: 'number' }) +
        '</form><div class="save-bar"><button class="btn" data-save="flags" data-f="flF">' + I('check') + 'Save</button></div></div></div></div>' +
        '<div class="g2" style="margin-top:16px"><div class="box"><h3>' + SV.tile('trophy', 'var(--orange)', 28) + 'Winner score</h3><p>How much each signal counts (weights) and where it maxes out (caps). Saving re-scores every ad.</p><form class="form" id="scF">' +
          A.field('w_days', 'Weight: days running', sc.w_days, { type: 'number' }) + A.field('days_cap', 'Cap: days', sc.days_cap, { type: 'number' }) +
          A.field('w_variations', 'Weight: variations', sc.w_variations, { type: 'number' }) + A.field('variations_cap', 'Cap: variations', sc.variations_cap, { type: 'number' }) +
          A.field('w_countries', 'Weight: countries', sc.w_countries, { type: 'number' }) + A.field('countries_cap', 'Cap: countries', sc.countries_cap, { type: 'number' }) +
          A.field('w_active', 'Weight: still active', sc.w_active, { type: 'number' }) +
        '</form><div class="save-bar"><button class="btn" data-save="score" data-f="scF">' + I('check') + 'Save and re-score</button></div></div>' +
        '<div class="stack"><div class="box"><h3>' + SV.tile('layers', 'var(--blue)', 28) + 'Niches</h3><p>The niche chips users filter by. Comma separated.</p><textarea class="input" id="niTxt">' + esc(s.niches.join(', ')) + '</textarea><div class="save-bar"><button class="btn" id="niSave">' + I('check') + 'Save</button></div></div>' +
        '<div class="box"><h3>' + SV.tile('card', 'var(--mint)', 28) + 'Billing</h3><form class="form" id="biF">' + A.field('renew_reminder_days', 'Remind before renewal (days)', bl.renew_reminder_days, { type: 'number' }) + A.field('grace_days', 'Grace after expiry (days)', bl.grace_days, { type: 'number' }) + A.field('pending_expire_days', 'Unpaid orders expire after (days)', bl.pending_expire_days || 7, { type: 'number', hint: 'Orders are never deleted; you can still approve an expired one.' }) +
        '</form><div class="save-bar"><button class="btn" data-save="billing" data-f="biF">' + I('check') + 'Save</button></div></div></div></div>';
      SV.$$('[data-save]', view).forEach(function (b) { b.onclick = function () { A.call('PATCH', '/api/admin/settings/' + b.dataset.save, { value: A.read($('#' + b.dataset.f)) }, b, 'Saved'); }; });
      SV.$$('[data-pl] button', view).forEach(function (b) { b.onclick = function () { SV.$$('button', b.parentNode).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $('#plSave').onclick = function () { var v = {}; SV.$$('[data-pl]', view).forEach(function (s) { var on = s.querySelector('.on'); v[s.dataset.pl] = on ? on.dataset.v : 'off'; }); A.call('PATCH', '/api/admin/settings/platforms', { value: v }, this, 'Saved'); };
      $('#niSave').onclick = function () { A.call('PATCH', '/api/admin/settings/niches', { value: $('#niTxt').value }, this, 'Saved'); };
    });
  };

  /* ======================= AUDIT ======================= */
  P['/admin/audit'] = function (view) {
    A.load(view, '/api/admin/audit', function (d) {
      view.innerHTML = A.head('Audit log', 'Every change made in this control room, newest first.') +
        '<div class="box">' + (d.items.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>' + d.items.map(function (l) { return '<tr><td>' + A.when(l.created_at) + '</td><td>' + esc(l.email || 'system') + '</td><td>' + A.tag(l.action.replace(/_/g, ' '), 'blue') + '</td><td class="mono" style="max-width:420px;word-break:break-word">' + esc(l.detail) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<div class="empty">' + SV.scene('guide', 'think') + '<h3>Nothing yet</h3><p>Changes you make show up here.</p></div>') + '</div>';
    });
  };
})();
