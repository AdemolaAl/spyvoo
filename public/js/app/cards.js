/* Ad cards: the same card everywhere (home strips, search results, boards). Click opens the ad; the heart saves it. */
(function () {
  'use strict';
  var SV = window.SV, esc = SV.esc, I = SV.I;

  function logo(adv) { return SV.logo(adv); }

  SV.adCard = function (a, opts) {
    opts = opts || {};
    var s = a.score || 0, col = SV.scoreColor(s);
    var flags = (a.countries || []).filter(function (c) { return c !== 'ALL'; }).slice(0, 3).map(SV.flag).join('') || '🌍';
    var kind = a.media_type === 'video' ? 'video' : a.media_type === 'carousel' ? 'layers' : 'image';
    var plats = (a.platforms || []).map(function (p) { return p === 'instagram' ? 'IG' : p === 'facebook' ? 'FB' : p === 'messenger' ? 'MSG' : p.slice(0, 3).toUpperCase(); }).join(' + ');
    var cap = (a.headline || a.text || '').split(/(?<=[.!?])\s/)[0].slice(0, 70);
    return '<article class="ad' + (opts.compact ? ' compact' : '') + '" data-ad="' + a.id + '"' + (a.video && /\.(mp4|webm|mov)(\?|$)/i.test(a.video) ? ' data-video="' + esc(a.video) + '"' : '') + ' tabindex="0" aria-label="' + esc(a.advertiser.name) + ', ' + a.days + ' days running, score ' + s + '">' +
      '<div class="ad-top">' + logo(a.advertiser) + '<span class="who"><b>' + esc(a.advertiser.name) + '</b><small>' + SV.plat(a.platforms) + esc(a.niche || 'Sponsored') + '</small></span>' +
      '<span class="score" style="background:conic-gradient(' + col + ' ' + s + '%, var(--line) 0)" title="Winner score"><span>' + s + '</span></span></div>' +
      '<div class="thumb">' + (a.thumb ? '<img src="' + esc(a.thumb) + '" alt="" loading="lazy" decoding="async">' : '') +
      '<span class="tag' + (a.status === 'active' ? '' : ' off') + '"><i></i>' + (a.status === 'active' ? 'Active' : 'Stopped') + '</span>' +
      '<span class="kind" title="' + kind + '">' + I(kind) + '</span>' + (a.media_type === 'video' ? '<span class="play">' + I('play') + '</span>' : '') +
      '<span class="cap">' + esc(cap) + '</span><span class="meta"><span class="flags">' + flags + '</span></span><span class="pb"></span>' +
      (a.sample && SV.isAdmin() ? '<span class="sample">Sample</span>' : '') + '</div>' +
      '<button class="save' + (a.saved ? ' on' : '') + '" type="button" data-save="' + a.id + '" aria-label="' + (a.saved ? 'Saved' : 'Save') + '">' + I('heart', a.saved ? ' fill="currentColor"' : '') + '</button>' +
      '<p class="txt">' + esc(a.text || a.headline) + '</p>' +
      (opts.note ? '<p class="note">' + esc(opts.note) + '</p>' : '') +
      '<div class="ad-foot"><span class="days' + (a.days < 7 ? ' new' : '') + '">' + (a.days < 1 ? 'New today' : a.days + ' days') + '</span>' +
      (function () { var cs = (a.countries || []).filter(function (c) { return c !== 'ALL'; }); return cs.slice(0, 2).map(function (c) { return '<span class="cc">' + esc(c) + '</span>'; }).join('') + (cs.length > 2 ? '<span class="cc more">+' + (cs.length - 2) + '</span>' : ''); })() +
      '<span class="cta">' + esc(a.cta || 'Learn more') + '</span></div></article>';
  };

  SV.skelCards = function (n) {
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="ad skel-card"><div class="ad-top"><span class="logo skel"></span><span class="who"><span class="skel" style="display:block;height:12px;width:70%;border-radius:6px"></span></span></div><div class="thumb skel"></div><span class="skel" style="height:12px;border-radius:6px;margin:0 4px"></span><span class="skel" style="height:22px;width:60%;border-radius:999px;margin:0 4px 4px"></span></div>';
    return out;
  };

  // One listener for every card on the page.
  document.addEventListener('click', function (e) {
    var sv = e.target.closest('[data-save]');
    if (sv) {
      e.preventDefault(); e.stopPropagation();
      var on = !sv.classList.contains('on');
      sv.classList.toggle('on', on); sv.classList.remove('pop'); void sv.offsetWidth; sv.classList.add('pop');
      sv.innerHTML = I('heart', on ? ' fill="currentColor"' : '');
      // Inside a board, the heart removes the ad from this board only.
      if (!on && SV.state.boardId) {
        var cardEl = sv.closest('[data-ad]');
        SV.api('DELETE', '/api/app/boards/' + SV.state.boardId + '/items/' + Number(sv.dataset.save)).then(function () {
          if (cardEl) { cardEl.style.transition = 'opacity .3s, transform .3s'; cardEl.style.opacity = '0'; cardEl.style.transform = 'scale(.94)'; setTimeout(function () { cardEl.remove(); var left = SV.$$('#bitems [data-ad]').length, bc = document.getElementById('bcount'); if (!left) SV.render(); else if (bc) bc.textContent = left + ' saved ad' + (left === 1 ? '' : 's'); }, 300); }
          SV.toast('Removed from this board', { icon: 'heart' });
        }).catch(function (err) { sv.classList.add('on'); sv.innerHTML = I('heart', ' fill="currentColor"'); SV.fail(err); });
        return;
      }
      SV.post('/api/app/quick-save', { ad_id: Number(sv.dataset.save), on: on }).then(function (r) {
        if (on) { SV.toast('Saved to ' + (r.board ? r.board.name : 'your board'), { icon: 'heart', link: { href: '/app/boards', label: 'Open' } }); var b = sv.getBoundingClientRect(); SV.confetti(b.left + b.width / 2, b.top, 26); }
        SV.$$('[data-save="' + sv.dataset.save + '"]').forEach(function (x) { x.classList.toggle('on', on); x.innerHTML = I('heart', on ? ' fill="currentColor"' : ''); });
        SV.refreshMeter && SV.refreshMeter();
      }).catch(function (err) { sv.classList.toggle('on', !on); sv.innerHTML = I('heart', !on ? ' fill="currentColor"' : ''); SV.fail(err); });
      return;
    }
    var card = e.target.closest('[data-ad]');
    if (card && !e.target.closest('a')) SV.openAd(Number(card.dataset.ad));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-ad]')) SV.openAd(Number(e.target.dataset.ad));
  });
  // Video previews play on hover (desktop) — only for ads with a real video file.
  document.addEventListener('mouseover', function (e) {
    var card = e.target.closest && e.target.closest('[data-ad][data-video]');
    if (!card || card.querySelector('video') || SV.phone()) return;
    var v = document.createElement('video');
    v.src = card.dataset.video; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    card.querySelector('.thumb').appendChild(v);
    card.addEventListener('mouseleave', function () { v.remove(); }, { once: true });
  });
})();
