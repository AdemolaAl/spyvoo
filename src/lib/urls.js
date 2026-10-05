'use strict';
// Links and media addresses that come from third parties (the ad library scraper) before they reach a page.
// http(s) only (never javascript:, data:, vbscript:...), no user:pass@, normalised by the URL parser, and with the
// characters that could break out of a CSS url('...') or an HTML attribute percent-encoded.
const CSS_UNSAFE = /['"()\\\s<>`]/g;
const enc = c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');

function httpUrl(raw, max = 2000) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s.length > max || !/^https?:\/\//i.test(s)) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || !u.hostname) return '';
  return u.href.replace(CSS_UNSAFE, enc);
}
// A media address for <img>/<video>/url(): an http(s) URL, or one of our own paths (/media/..., /img/...).
function mediaUrl(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (/^\/(?!\/)[A-Za-z0-9/_.,%~+-]*$/.test(s) && !s.includes('..')) return s;
  return httpUrl(s);
}

module.exports = { httpUrl, mediaUrl };
