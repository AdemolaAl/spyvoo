'use strict';
// Ad videos and images. Meta's media links expire within days, so new media is downloaded soon after each scrape
// and kept forever. Drivers: "local" (files on the /app/data volume, served at /media/...) or "r2" (Cloudflare R2).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const config = require('../config');
const db = require('../db');

const MAX_BYTES = 120 * 1024 * 1024;
const TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const cfg = () => config.media;
const driver = () => (cfg().driver === 'r2' && cfg().r2.bucket && cfg().r2.accessKey ? 'r2' : 'local');

function url(key) {
  if (!key) return '';
  if (/^https?:|^\//.test(key)) return key; // already a URL or a bundled file (sample ads)
  // After switching to R2, files saved earlier on the volume keep being served from disk.
  if (driver() === 'r2' && cfg().r2.publicUrl && !onDisk(key)) return cfg().r2.publicUrl + '/' + key.split('/').map(encodeURIComponent).join('/');
  return '/media/' + key;
}
function onDisk(key) { try { return fs.existsSync(localPath(key)); } catch { return false; } }
function localPath(key) {
  const p = path.resolve(cfg().dir, key);
  if (!p.startsWith(path.resolve(cfg().dir) + path.sep)) throw new Error('Bad media key');
  return p;
}

/* ---------- Cloudflare R2 (S3 API, Signature V4) ---------- */
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const hm = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
function s3(method, key, body, type) {
  const r2 = cfg().r2;
  const u = new URL(r2.endpoint);
  const pathName = '/' + r2.bucket + '/' + key.split('/').map(s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha(body || '');
  const headers = { host: u.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (type) headers['content-type'] = type;
  const names = Object.keys(headers).sort();
  const canonical = [method, pathName, '', names.map(n => n + ':' + headers[n]).join('\n') + '\n', names.join(';'), payloadHash].join('\n');
  const scope = day + '/auto/s3/aws4_request';
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kSign = hm(hm(hm(hm('AWS4' + r2.secretKey, day), 'auto'), 's3'), 'aws4_request');
  const sig = crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
  const auth = 'AWS4-HMAC-SHA256 Credential=' + r2.accessKey + '/' + scope + ', SignedHeaders=' + names.join(';') + ', Signature=' + sig;
  const h = { ...headers, Authorization: auth }; delete h.host;
  return fetch(u.origin + pathName, { method, headers: h, body: body || undefined, signal: AbortSignal.timeout(120000) });
}

// A short-lived signed R2 link that makes the browser save the file (Content-Disposition: attachment) instead of
// playing it. Query-string Signature V4, so the file goes straight from R2 to the user with no server bandwidth.
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function presign(key, { filename = '', expires = 600, now = new Date(), region = 'auto', creds } = {}) {
  const r2 = creds || cfg().r2;
  const u = new URL(r2.endpoint);
  const pathName = (r2.bucket ? '/' + r2.bucket : '') + '/' + key.split('/').map(enc).join('/');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = day + '/' + region + '/s3/aws4_request';
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': r2.accessKey + '/' + scope, 'X-Amz-Date': amzDate, 'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': 'host' };
  if (filename) q['response-content-disposition'] = 'attachment; filename="' + String(filename).replace(/["\\\r\n]/g, '') + '"';
  const qs = Object.keys(q).sort().map(k => enc(k) + '=' + enc(q[k])).join('&');
  const canonical = ['GET', pathName, qs, 'host:' + u.host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonical)].join('\n');
  const kSign = hm(hm(hm(hm('AWS4' + r2.secretKey, day), region), 's3'), 'aws4_request');
  return u.origin + pathName + '?' + qs + '&X-Amz-Signature=' + crypto.createHmac('sha256', kSign).update(toSign).digest('hex');
}
// Where a download button should point: the volume route, or a signed R2 link.
function downloadUrl(key, filename) {
  if (!key || /^https?:|^\//.test(key)) return key || '';
  if (driver() === 'r2' && !onDisk(key)) return presign(key, { filename });
  return '/dl/' + key;
}

async function put(key, buf, type) {
  if (driver() === 'r2') {
    const res = await s3('PUT', key, buf, type);
    if (!res.ok) throw new Error('R2 upload failed: HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return key;
  }
  const p = localPath(key);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
  return key;
}
async function remove(key) {
  if (!key || /^https?:|^\//.test(key)) return;
  if (driver() === 'r2') { await s3('DELETE', key).catch(() => {}); return; }
  try { fs.unlinkSync(localPath(key)); } catch { /* already gone */ }
}

// Ad media come from addresses a third party chose (the scraper's output): only public http(s) hosts, capped size,
// each redirect re-checked (lib/netguard). MEDIA_ALLOW_PRIVATE=true lifts the host check outside production (tests).
async function fetchBytes(src) {
  const { buf, type } = await require('../lib/netguard').safeGet(src, { maxBytes: MAX_BYTES, timeoutMs: 90000, allowPrivate: allowPrivate() });
  if (!buf.length) throw new Error('Empty file');
  return { buf, type };
}
const allowPrivate = () => !config.isProd && /^(1|true|yes)$/i.test(process.env.MEDIA_ALLOW_PRIVATE || '');
function sniff(buf, type) {
  if (TYPES[type]) return type;
  if (buf.slice(4, 8).toString() === 'ftyp') return 'video/mp4';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf.slice(1, 4).toString() === 'PNG') return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return type || 'application/octet-stream';
}

// Download one pending media row (and its poster). Retries 3 times with backoff, then marks it failed.
async function download(m) {
  const now = Date.now();
  try {
    const base = 'ads/' + m.ad_id + '/' + m.id + '-' + crypto.randomBytes(4).toString('hex');
    const patch = {};
    if (m.source_url && !m.storage_key) {
      const { buf, type } = await fetchBytes(m.source_url);
      const t = sniff(buf, type);
      if (!TYPES[t]) throw new Error('Unexpected file type ' + t);
      patch.storage_key = await put(base + TYPES[t], buf, t);
      patch.bytes = buf.length;
    }
    if (m.poster_source_url && !m.poster_key) {
      try {
        const { buf, type } = await fetchBytes(m.poster_source_url);
        const t = sniff(buf, type);
        if (/^image\//.test(t)) { patch.poster_key = await put(base + '-poster' + (TYPES[t] || '.jpg'), buf, t); patch.bytes = (patch.bytes || 0) + buf.length; }
      } catch { /* a missing poster is not fatal: the card falls back to the video's first frame */ }
    }
    db.update('ad_media', m.id, { ...patch, status: 'done', error: '', attempts: m.attempts + 1 });
    return true;
  } catch (e) {
    const attempts = m.attempts + 1;
    // An address that is never allowed (private network, not http) fails at once: retrying cannot help.
    db.update('ad_media', m.id, { attempts, error: String(e.message).slice(0, 300), status: attempts >= 3 || e.blocked ? 'failed' : 'pending', next_at: new Date(now + 60e3 * 5 ** attempts).toISOString() });
    return false;
  }
}

// Background job: download what is due, a few at a time.
async function work(limit = 12) {
  const due = db.all("SELECT * FROM ad_media WHERE status = 'pending' AND (next_at IS NULL OR next_at <= ?) ORDER BY id LIMIT ?", db.now(), limit);
  if (!due.length) return { done: 0, failed: 0 };
  const job = db.insert('jobs', { kind: 'media', status: 'running', detail: due.length + ' files', started_at: db.now(), created_at: db.now() });
  let done = 0; let failed = 0;
  for (let i = 0; i < due.length; i += 2) {
    const r = await Promise.all(due.slice(i, i + 2).map(download));
    r.forEach(ok => (ok ? done++ : failed++));
  }
  db.update('jobs', job, { status: failed && !done ? 'failed' : 'done', ads_found: done, detail: done + ' saved, ' + failed + ' failed', finished_at: db.now(), error: failed ? failed + ' file(s) will be retried' : '' });
  return { done, failed };
}

function usage() {
  const r = db.one("SELECT COUNT(*) files, COALESCE(SUM(bytes), 0) bytes, SUM(CASE WHEN type = 'video' AND status = 'done' THEN 1 ELSE 0 END) videos, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) failed, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) pending FROM ad_media");
  return { driver: driver(), ...r };
}

module.exports = { url, put, remove, download, work, usage, driver, localPath, sniff, s3, presign, downloadUrl, fetchBytes, TYPES };
