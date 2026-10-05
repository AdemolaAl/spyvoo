'use strict';
// Small server-rendered pages (notices, legal, shared boards, test checkouts) in the Spyvoo look.
const { esc } = require('../lib/md');
const vooApp = () => ((require('../config').voo.base) || 'https://voosquare.com') + '/app';

const MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="26" y="27" width="12" height="7" rx="3" fill="#fff" opacity=".9"/><circle cx="20" cy="33" r="12" fill="#fff"/><circle cx="44" cy="33" r="12" fill="#fff"/><circle cx="21.5" cy="33" r="5.4" fill="#0A1638"/><circle cx="45.5" cy="33" r="5.4" fill="#0A1638"/><circle cx="23.3" cy="31" r="1.7" fill="#fff"/><circle cx="47.3" cy="31" r="1.7" fill="#fff"/></svg>';

function page(title, body, { wide = false, head = '', robots = 'noindex' } = {}) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(title) + ' · Spyvoo</title><meta name="robots" content="' + robots + '"><link rel="icon" href="/favicon.svg" type="image/svg+xml">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Manrope:wght@500;600;700;800&display=swap">' +
    '<link rel="stylesheet" href="/css/page.css">' + head + '</head><body>' +
    '<header class="pg-top"><a class="pg-brand" href="/"><span class="pg-mark">' + MARK + '</span><span>Spy<b>voo</b></span></a></header>' +
    '<main class="pg-main' + (wide ? ' wide' : '') + '">' + body + '</main>' +
    '<footer class="pg-foot">© ' + new Date().getFullYear() + ' Zedapex Limited · <a href="' + esc(vooApp()) + '" target="_blank" rel="noopener">Part of VooSquare</a> · <a href="/legal/terms">Terms</a> · <a href="/legal/privacy">Privacy</a> · <a href="/legal/refunds">Refunds</a></footer></body></html>';
}

function notice(title, heading, text, status = '') {
  return page(title, '<div class="pg-card center"><div class="pg-eyes">' + MARK + '</div>' + (status ? '<span class="tag">' + esc(status) + '</span>' : '') + '<h1>' + esc(heading) + '</h1><p>' + esc(text) + '</p><a class="btn" href="/">Back to Spyvoo</a></div>');
}

module.exports = { page, notice, MARK };
