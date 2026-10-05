'use strict';
// Content-Security-Policy for every HTML page. Ad text, names and links come from third parties (Meta Ad Library via
// the scraper): the pages escape them, and this policy is the second lock: no inline script runs unless it is one of
// ours (allowed by its SHA-256 hash), no plugin, no <base> hijack, no framing by other sites.
// The VooSquare support widget (VOO_BASE/widget.js) is allowed to load and to call VooSquare.
const crypto = require('node:crypto');
const config = require('../config');

const hashes = new Map();
const INLINE = /<script(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;
function inlineHashes(body) {
  const out = new Set();
  for (const m of String(body).matchAll(INLINE)) {
    if (/type\s*=\s*["']?application\/(ld\+)?json/i.test(m[1])) continue; // data blocks never execute
    let h = hashes.get(m[2]);
    if (!h) { h = "'sha256-" + crypto.createHash('sha256').update(m[2], 'utf8').digest('base64') + "'"; if (hashes.size < 200) hashes.set(m[2], h); }
    out.add(h);
  }
  return [...out];
}

function csp(body = '') {
  const voo = config.voo.on && config.voo.base ? config.voo.base : '';
  const r2 = config.media.r2 && config.media.r2.publicUrl ? config.media.r2.publicUrl : '';
  return [
    "default-src 'self'",
    ["script-src 'self'", ...inlineHashes(body), voo].filter(Boolean).join(' '),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    ["img-src 'self' data: blob: https:", voo, r2].filter(Boolean).join(' '),
    ["media-src 'self' blob: https:", r2].filter(Boolean).join(' '),
    ["connect-src 'self'", voo].filter(Boolean).join(' '),
    "frame-src 'self'",
    "frame-ancestors 'self'",
    ["form-action 'self'", voo].filter(Boolean).join(' '),
    "base-uri 'self'",
    "object-src 'none'"
  ].join('; ');
}

module.exports = { csp, inlineHashes };
