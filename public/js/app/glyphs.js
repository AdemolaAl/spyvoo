/* Spyvoo glyphs: the house icon set. Duotone, filled, drawn on a 24px grid with soft corners.
   Layer "a" is the body (tinted), layer "b" is the detail (solid). Used for navigation, section
   headers, tiles and empty states. Small action buttons keep the thin line icons from core.js. */
(function () {
  'use strict';
  var SV = window.SV = window.SV || {};
  if (!SV.esc) SV.esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = ' fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  var G = {
    home: ['<path d="M3.6 10.2 10.7 4.3a2 2 0 0 1 2.6 0l7.1 5.9a1.6 1.6 0 0 1 .6 1.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7.6c0-.5.2-.9.6-1.2z"/>', '<path d="M9.5 21v-4.2a2.5 2.5 0 0 1 5 0V21z"/>'],
    search: ['<circle cx="10.5" cy="10.5" r="7.5"/>', '<rect x="14.6" y="17.1" width="7.6" height="3.6" rx="1.8" transform="rotate(45 18.4 18.9)"/><path d="M7 10.2a3.6 3.6 0 0 1 3.2-3.5"' + S + ' stroke-width="2"/>'],
    compass: ['<circle cx="12" cy="12" r="9.5"/>', '<path d="M16.4 7.6 13.8 13a1.8 1.8 0 0 1-.8.8l-5.4 2.6 2.6-5.4a1.8 1.8 0 0 1 .8-.8z"/>'],
    boards: ['<rect x="3" y="3" width="8" height="10.5" rx="2.6"/><rect x="13" y="10.5" width="8" height="10.5" rx="2.6"/>', '<rect x="13" y="3" width="8" height="5.5" rx="2.6"/><rect x="3" y="15.5" width="8" height="5.5" rx="2.6"/>'],
    bell: ['<path d="M12 2.8a6.2 6.2 0 0 0-6.2 6.2v3.3l-1.5 3a1.2 1.2 0 0 0 1 1.8h13.4a1.2 1.2 0 0 0 1-1.8l-1.5-3V9A6.2 6.2 0 0 0 12 2.8z"/>', '<path d="M9.2 18.6h5.6a2.8 2.8 0 0 1-5.6 0z"/><circle cx="17.8" cy="5.2" r="2.6"/>'],
    wand: ['<rect x="1.8" y="13.3" width="15.5" height="4.2" rx="2.1" transform="rotate(-45 9.5 15.4)"/>', '<path d="M17.2 2.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1zM7.6 2.8l.6 1.5 1.5.6-1.5.6-.6 1.5L7 5.5l-1.5-.6L7 4.3zM20 13.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/>'],
    crown: ['<rect x="4.5" y="17" width="15" height="4" rx="2"/>', '<path d="M3.4 7.6a.7.7 0 0 1 1.1-.6l3.6 3.1 3.3-5.6a.7.7 0 0 1 1.2 0l3.3 5.6 3.6-3.1a.7.7 0 0 1 1.1.6l-1.4 7.4a1 1 0 0 1-1 .8H5.8a1 1 0 0 1-1-.8z"/>'],
    user: ['<path d="M3.8 20.2c.5-3.7 3.9-6.2 8.2-6.2s7.7 2.5 8.2 6.2a.7.7 0 0 1-.7.8H4.5a.7.7 0 0 1-.7-.8z"/>', '<circle cx="12" cy="7.8" r="4.3"/>'],
    eye: ['<path d="M1.8 12C4 7.5 7.7 4.8 12 4.8s8 2.7 10.2 7.2C20 16.5 16.3 19.2 12 19.2S4 16.5 1.8 12z"/>', '<circle cx="12" cy="12" r="3.8"/>'],
    spark: ['<path d="M10 2.5l2.2 5.9 5.9 2.2-5.9 2.2L10 18.7l-2.2-5.9-5.9-2.2 5.9-2.2z"/>', '<path d="M18.2 13.6l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/>'],
    trend: ['<path d="M3 21v-4.6l5.6-5.6 4 3.6L20.5 6.6V21z"/>', '<path d="M3 15.4l5.6-5.6 4 3.6 7.6-7.6"' + S + ' stroke-width="2.6"/><path d="M14.6 4.6h6.2v6.2z"/>'],
    trophy: ['<path d="M7 5H4.6a.6.6 0 0 0-.6.6c0 3 1.6 4.8 3.8 5.2zM17 5h2.4a.6.6 0 0 1 .6.6c0 3-1.6 4.8-3.8 5.2z"/><rect x="7.5" y="18.6" width="9" height="2.6" rx="1.3"/>', '<path d="M7 3.2h10V9a5 5 0 0 1-10 0z"/><rect x="10.8" y="13.4" width="2.4" height="5.6" rx="1"/>'],
    fire: ['<path d="M12.4 2.4c.6 3.3 2.9 5 4.5 6.9a7.6 7.6 0 1 1-11.5 3.4c.5-2.2 1.8-3.4 2.8-4.4.2 1.7 1 2.6 2 3-.4-3.4.9-6.3 2.2-8.9z"/>', '<path d="M12 11.6c1.7 1.5 3.1 2.7 3.1 4.8a3.1 3.1 0 0 1-6.2 0c0-1.7 1.2-2.8 3.1-4.8z"/>'],
    clock: ['<circle cx="12" cy="12" r="9.5"/>', '<path d="M12 6.8v5.4l3.6 2.2"' + S + ' stroke-width="2.6"/>'],
    radar: ['<circle cx="12" cy="12" r="9.5"/>', '<path d="M12 12V2.5a9.5 9.5 0 0 1 8.2 4.7z"/><circle cx="12" cy="12" r="2.2"/><circle cx="16.3" cy="15.6" r="1.6"/>'],
    layers: ['<path d="M2.6 13.3 12 18.6l9.4-5.3-2.6-1.5L12 15.6l-6.8-3.8z"/><path d="M2.6 17.2 12 22.5l9.4-5.3-2.2-1.2L12 20l-7.2-4z" opacity=".55"/>', '<path d="M12 2.2l9 5.1a.6.6 0 0 1 0 1L12 13.4 3 8.3a.6.6 0 0 1 0-1z"/>'],
    image: ['<rect x="2.5" y="3.5" width="19" height="17" rx="4"/>', '<path d="M2.6 16.6l5.1-5.1a1.4 1.4 0 0 1 2 0l3.6 3.6 2.3-2.3a1.4 1.4 0 0 1 2 0l3.8 3.8v.4a4 4 0 0 1-4 4h-11a4 4 0 0 1-3.8-3z"/><circle cx="15.6" cy="8.4" r="2"/>'],
    video: ['<rect x="2" y="5" width="14.5" height="14" rx="4"/>', '<path d="M17.6 10.2l3.6-2.4a.6.6 0 0 1 .9.5v7.4a.6.6 0 0 1-.9.5l-3.6-2.4z"/><path d="M7.6 9.4v5.2a.5.5 0 0 0 .8.4l3.9-2.6a.5.5 0 0 0 0-.8L8.4 9a.5.5 0 0 0-.8.4z"/>'],
    globe: ['<circle cx="12" cy="12" r="9.5"/>', '<path d="M2.8 12h18.4M12 2.6c3 3.2 3 15.6 0 18.8M12 2.6c-3 3.2-3 15.6 0 18.8"' + S + ' stroke-width="2"/>'],
    card: ['<rect x="2" y="4.5" width="20" height="15" rx="3.6"/>', '<rect x="2" y="8.2" width="20" height="3.2"/><rect x="5" y="14.4" width="5.4" height="2.4" rx="1.2"/>'],
    gift: ['<rect x="3.6" y="11" width="16.8" height="10" rx="2.2"/>', '<rect x="2.5" y="7.4" width="19" height="4.4" rx="1.6"/><rect x="10.9" y="7.4" width="2.2" height="13.6"/><path d="M12 7.4C10.6 3.8 6.5 3.4 6.5 5.6S10 7.4 12 7.4zm0 0c1.4-3.6 5.5-4 5.5-1.8S14 7.4 12 7.4z"/>'],
    team: ['<circle cx="17" cy="8.6" r="2.9"/><path d="M14.2 14.4c.9-.4 1.8-.6 2.8-.6 2.7 0 4.9 1.9 5.4 5.4a.7.7 0 0 1-.7.8h-5.2c-.3-2.2-1-4.1-2.3-5.6z"/>', '<circle cx="9" cy="7.8" r="3.8"/><path d="M2.4 19.5c.6-3.8 3.3-6.2 6.6-6.2s6 2.4 6.6 6.2a.7.7 0 0 1-.7.8H3.1a.7.7 0 0 1-.7-.8z"/>'],
    sliders: ['<rect x="3" y="4.9" width="18" height="2.6" rx="1.3"/><rect x="3" y="10.7" width="18" height="2.6" rx="1.3"/><rect x="3" y="16.5" width="18" height="2.6" rx="1.3"/>', '<circle cx="15.5" cy="6.2" r="2.9"/><circle cx="8.5" cy="12" r="2.9"/><circle cx="17" cy="17.8" r="2.9"/>'],
    play: ['<circle cx="12" cy="12" r="10"/>', '<path d="M9.6 7.9v8.2a.7.7 0 0 0 1.1.6l6.2-4.1a.7.7 0 0 0 0-1.2l-6.2-4.1a.7.7 0 0 0-1.1.6z"/>'],
    flag: ['<rect x="3.6" y="2.6" width="2.6" height="18.8" rx="1.3"/>', '<path d="M7.4 3.8h11.4a.6.6 0 0 1 .5.9l-2.5 3.8 2.5 3.8a.6.6 0 0 1-.5.9H7.4z"/>'],
    heart: ['<path d="M12 20.6S3 15.4 3 9.2A4.8 4.8 0 0 1 12 6.8a4.8 4.8 0 0 1 9 2.4c0 6.2-9 11.4-9 11.4z"/>', '<path d="M6.8 8.6a2 2 0 0 1 2-1.6"' + S + ' stroke-width="2"/>'],
    lock: ['<path d="M7.2 10V7.8a4.8 4.8 0 0 1 9.6 0V10" ' + S.slice(1) + ' stroke-width="2.6"/>', '<rect x="4" y="10" width="16" height="11.5" rx="3.4"/>'],
    bolt: ['<circle cx="12" cy="12" r="10"/>', '<path d="M13.2 4.6 7.4 13h4.2l-.8 6.4 5.8-8.4h-4.2z"/>'],
    mail: ['<rect x="2" y="4.5" width="20" height="15" rx="3.6"/>', '<path d="M3.2 7.4 12 13l8.8-5.6"' + S + ' stroke-width="2.4"/>'],
    chart: ['<rect x="2.5" y="2.5" width="19" height="19" rx="4.5"/>', '<rect x="6.4" y="11" width="2.8" height="6.6" rx="1.4"/><rect x="10.6" y="6.4" width="2.8" height="11.2" rx="1.4"/><rect x="14.8" y="13" width="2.8" height="4.6" rx="1.4"/>'],
    shield: ['<path d="M12 2.4 4.6 5.2v6.2c0 4.6 3.1 8.4 7.4 10.2 4.3-1.8 7.4-5.6 7.4-10.2V5.2z"/>', '<path d="M8.4 11.8l2.5 2.5 4.9-4.9"' + S + ' stroke-width="2.4"/>']
  };
  G.link = ['<rect x="1.6" y="8.6" width="13" height="6.8" rx="3.4" transform="rotate(-45 8.1 12)"/>', '<rect x="9.4" y="8.6" width="13" height="6.8" rx="3.4" transform="rotate(-45 15.9 12)"/>'];
  G.share = ['<path d="M7.5 12 16.5 6.5M7.5 12l9 5.5"' + S + ' stroke-width="2.4"/>', '<circle cx="6" cy="12" r="3.6"/><circle cx="17.5" cy="5.6" r="3.2"/><circle cx="17.5" cy="18.4" r="3.2"/>'];
  G.magnet = ['<path d="M6 6.5v6a6 6 0 0 0 12 0v-6"' + S + ' stroke-width="5"/>', '<rect x="3.5" y="2.6" width="5" height="4.6" rx="1.4"/><rect x="15.5" y="2.6" width="5" height="4.6" rx="1.4"/>'];
  G.check = ['<circle cx="12" cy="12" r="10"/>', '<path d="M7.4 12.4l3.2 3.2 6-6.4"' + S + ' stroke-width="2.8"/>'];
  G.download = ['<path d="M2.8 14.4h4.6l1.6 2.6h6l1.6-2.6h4.6v4.1a2.5 2.5 0 0 1-2.5 2.5H5.3a2.5 2.5 0 0 1-2.5-2.5z"/>', '<path d="M12 3.2v9"' + S + ' stroke-width="2.6"/><path d="M7.8 9.4 12 13.6l4.2-4.2z"/>'];
  G.copy = ['<rect x="8.2" y="8.2" width="13" height="13" rx="3.4"/>', '<rect x="2.8" y="2.8" width="13" height="13" rx="3.4"/>'];
  G.filter = ['<path d="M3 4.6a1 1 0 0 1 .8-1.6h16.4a1 1 0 0 1 .8 1.6l-6.2 8.1H9.2z"/>', '<path d="M9.2 12.7h5.6v6.1a1 1 0 0 1-.5.9l-3.6 2a1 1 0 0 1-1.5-.9z"/>'];
  G.cursor = ['<circle cx="15" cy="15" r="7" opacity=".7"/>', '<path d="M3.6 3.1 18.4 9.2a.6.6 0 0 1 0 1.1l-6 2.1-2.1 6a.6.6 0 0 1-1.1 0z"/>'];
  // aliases so screens can ask for the same names as the line set
  G.discover = G.compass; G.alerts = G.bell; G.scripts = G.wand; G.money = G.card;

  SV.G = function (name, opts) {
    opts = opts || {};
    var g = G[name] || G.spark;
    return '<svg class="g' + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '') + '><g class="ga">' + g[0] + '</g><g class="gb">' + g[1] + '</g></svg>';
  };
  // A glossy tile with a glyph: section headers, KPI tiles, saved-search rows.
  SV.tile = function (name, color, size) {
    return '<span class="gtile" style="--c:' + (color || 'var(--blue)') + (size ? ';--s:' + size + 'px' : '') + '">' + SV.G(name) + '</span>';
  };
  SV.hasGlyph = function (n) { return !!G[n]; };

  // Advertiser marks: a brand-like squircle per advertiser (two-tone gradient, a geometric cut, a monogram).
  var PAL = [['#1F5BFF', '#7B5CFF'], ['#FF3D8B', '#FF9F1C'], ['#14C894', '#0FA3B1'], ['#7B5CFF', '#FF3D8B'], ['#0A1638', '#1F5BFF'], ['#FF9F1C', '#FFC21A'], ['#0FA3B1', '#1F5BFF'], ['#E5484D', '#FF3D8B']];
  function hash(s) { var h = 0; String(s || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return h; }
  var CUTS = [
    '<circle cx="30" cy="30" r="17" fill="#fff" opacity=".16"/>',
    '<path d="M0 32 32 0v32z" fill="#fff" opacity=".14"/>',
    '<circle cx="16" cy="16" r="11" fill="none" stroke="#fff" stroke-width="5" opacity=".16"/>',
    '<rect x="17" y="-6" width="20" height="20" rx="6" transform="rotate(45 27 4)" fill="#fff" opacity=".16"/>',
    '<path d="M-2 24c8-2 14-8 34-6v16H-2z" fill="#fff" opacity=".15"/>'
  ];
  SV.logo = function (adv) {
    var name = (adv && adv.name) || '?';
    if (adv && adv.logo) return '<span class="logo" style="background-image:url(\'' + SV.esc(adv.logo) + '\')"></span>';
    var h = hash(name), p = PAL[h % PAL.length];
    return '<span class="logo mono" style="background:linear-gradient(140deg,' + p[0] + ',' + p[1] + ')"><svg viewBox="0 0 32 32" aria-hidden="true">' + CUTS[(h >> 3) % CUTS.length] + '</svg><b>' + SV.esc(name.replace(/[^A-Za-z0-9]/g, '')[0] || '?') + '</b></span>';
  };

  // Real platform marks (small, for cards, filters and the drawer).
  var PL = {
    facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M15.6 15.4l.5-3.4h-3.3V9.8c0-.9.5-1.8 1.9-1.8h1.5V5.1s-1.4-.2-2.6-.2c-2.7 0-4.4 1.6-4.4 4.5V12H6.2v3.4h3V24h3.6v-8.6z" fill="#fff"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><defs><linearGradient id="igl" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FDB750"/><stop offset=".45" stop-color="#FD1D5C"/><stop offset="1" stop-color="#833AB4"/></linearGradient></defs><rect width="24" height="24" rx="6.5" fill="url(#igl)"/><rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4.2" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16.3" cy="7.7" r="1.1" fill="#fff"/></svg>',
    messenger: '<svg viewBox="0 0 24 24"><defs><linearGradient id="msl" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0099FF"/><stop offset=".6" stop-color="#A033FF"/><stop offset="1" stop-color="#FF5280"/></linearGradient></defs><path d="M12 1.5C6.1 1.5 1.5 5.8 1.5 11.6c0 3 1.2 5.6 3.3 7.4V22.5l3.2-1.8c1.2.3 2.5.5 4 .5 5.9 0 10.5-4.3 10.5-10.1S17.9 1.5 12 1.5z" fill="url(#msl)"/><path d="M5.6 14.6l3.3-5.2 3.3 2.6 3.1-2.6-3.3 5.2-3.3-2.6z" fill="#fff"/></svg>',
    audience_network: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6.5" fill="#0A1638"/><circle cx="12" cy="12" r="5" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="#fff"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6.5" fill="#0B0B0F"/><path d="M13.4 5.2h2.2c.2 1.6 1.2 2.8 2.9 3v2.3c-1.1 0-2.1-.3-2.9-.9v4.7a4.1 4.1 0 1 1-4.1-4.1h.4v2.3a1.9 1.9 0 1 0 1.5 1.8z" fill="#fff"/></svg>'
  };
  SV.plat = function (list) {
    return '<span class="plats">' + (list || []).filter(function (p) { return PL[p]; }).map(function (p) { return '<i class="pl" title="' + p.replace('_', ' ') + '">' + PL[p] + '</i>'; }).join('') + '</span>';
  };
})();
