'use strict';
// Server-side downloads of addresses that come from third parties (ad images and videos found by the scraper).
// They may only reach the public internet: http(s) on ports 80/443, no user:pass@, and every address the host name
// resolves to must be public (no localhost, private networks, link-local / cloud metadata, multicast...). The check runs
// inside the socket's DNS lookup, so a host cannot pass the check and then resolve somewhere else (DNS rebinding).
// Redirects are followed by hand (at most 3) and each hop is checked again. Bodies are capped while streaming.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');

function v4ToInt(ip) { return ip.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0; }
const V4_BLOCK = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
].map(([b, m]) => [v4ToInt(b), m]);
function privateIp(ip) {
  if (net.isIPv4(ip)) { const n = v4ToInt(ip); return V4_BLOCK.some(([b, m]) => ((n ^ b) >>> (32 - m)) === 0); }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (mapped) return privateIp(mapped[1]);
    if (s === '::' || s === '::1') return true;
    if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || /^2001:db8:/.test(s) || /^64:ff9b:/.test(s) || /^2002:/.test(s)) return true;
    return false;
  }
  return true;
}

class BlockedError extends Error { constructor(msg) { super(msg); this.blocked = true; } }

// Throws BlockedError when a URL can never be fetched (before any network use).
function checkUrl(raw, { allowPrivate = false } = {}) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new BlockedError('Not a valid address'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BlockedError('Only http(s) addresses can be downloaded');
  if (u.username || u.password) throw new BlockedError('Addresses with a user name are not allowed');
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!allowPrivate && port !== 80 && port !== 443) throw new BlockedError('Only ports 80 and 443 are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivate && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || (net.isIP(host) && privateIp(host)))) throw new BlockedError('Private addresses are not allowed');
  return u;
}

function guardedLookup(allowPrivate) {
  return (hostname, options, cb) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err);
      const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: options.family || 4 }];
      if (!allowPrivate && (!list.length || list.some(a => privateIp(a.address)))) return cb(new BlockedError('Private addresses are not allowed (' + hostname + ')'));
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  };
}

// GET a public URL. Resolves { buf, type, url } or throws (BlockedError for addresses that are never allowed).
function safeGet(raw, { maxBytes = 120 * 1024 * 1024, timeoutMs = 90000, maxRedirects = 3, allowPrivate = false, headers = {} } = {}) {
  const deadline = Date.now() + timeoutMs;
  // allowPrivate: true/false, or a function(url) deciding per hop (tests use it to prove redirects are re-checked).
  const hop = (url, left) => new Promise((resolve, reject) => {
    let u;
    const allow = typeof allowPrivate === 'function' ? !!allowPrivate(url) : !!allowPrivate;
    try { u = checkUrl(url, { allowPrivate: allow }); } catch (e) { return reject(e); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpyvooBot/1.0)', Accept: '*/*', ...headers }, lookup: guardedLookup(allow), timeout: Math.max(1000, deadline - Date.now()) }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (left <= 0) return reject(new Error('Too many redirects'));
        let next; try { next = new URL(res.headers.location, u).toString(); } catch { return reject(new Error('Bad redirect')); }
        return hop(next, left - 1).then(resolve, reject);
      }
      if (res.statusCode < 200 || res.statusCode > 299) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const len = Number(res.headers['content-length'] || 0);
      if (len > maxBytes) { res.destroy(); return reject(new Error('File too large (' + Math.round(len / 1e6) + ' MB)')); }
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > maxBytes) { res.destroy(new Error('File too large')); return; } chunks.push(c); });
      res.on('error', reject);
      res.on('end', () => resolve({ buf: Buffer.concat(chunks), type: String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase(), url: u.toString() }));
    });
    req.on('timeout', () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
    req.end();
  });
  return hop(String(raw), maxRedirects);
}

// API calls that carry one of our secret keys (AI providers) may only go to their fixed hosts over https.
// Outside production a test/mock address (e.g. http://127.0.0.1:4971) is allowed when allowOverride is true.
const API_HOSTS = ['api.anthropic.com', 'openrouter.ai', 'api.openai.com'];
function checkApiUrl(raw, { hosts = API_HOSTS, allowOverride = false } = {}) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new BlockedError('Not a valid API address'); }
  if (u.username || u.password) throw new BlockedError('API addresses with a user name are not allowed');
  if (allowOverride) return u;
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || !hosts.includes(u.hostname)) throw new BlockedError('API calls may only go to ' + hosts.join(', '));
  return u;
}

module.exports = { safeGet, checkUrl, checkApiUrl, privateIp, BlockedError, API_HOSTS };
