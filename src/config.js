'use strict';
// Loads settings from .env (if present) and the process environment.
// Every variable is listed, with an explanation, in .env.example.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const env = (k, d = '') => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const bool = (k, d = false) => { const v = env(k, ''); return v === '' ? d : /^(1|true|yes|on)$/i.test(v); };
const isProd = env('NODE_ENV', 'development') === 'production';
// A bare host ("https://gatevoo.com", as the other Voo apps take it) gets Gatevoo's API path appended.
function gatevooApiUrl(raw) {
  const s = String(raw).trim().replace(/\/+$/, '');
  try { const u = new URL(s); if (u.pathname === '/' || u.pathname === '') return s + '/api/v1'; } catch { /* reported by Test connection */ }
  return s;
}

const config = {
  root: ROOT,
  env: env('NODE_ENV', 'development'),
  isProd,
  port: Number(env('PORT', '3000')),
  // APP_URL wins. On Railway, the service's public domain is used when APP_URL is not set yet.
  appUrl: env('APP_URL', env('RAILWAY_PUBLIC_DOMAIN') ? 'https://' + env('RAILWAY_PUBLIC_DOMAIN') : 'http://localhost:' + env('PORT', '3000')).replace(/\/+$/, ''),
  secret: env('APP_SECRET', ''),
  dbPath: path.resolve(ROOT, env('DATABASE_PATH', './data/spyvoo.db')),
  adminEmail: env('ADMIN_EMAIL', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),

  // Ad data. The provider is picked in Admin → Ad data & AI; the token can be saved there (encrypted) or here.
  apify: {
    token: env('APIFY_TOKEN'),
    actor: env('APIFY_ACTOR', 'apify~facebook-ads-scraper'),
    apiUrl: env('APIFY_API_URL', 'https://api.apify.com/v2').replace(/\/+$/, '')
  },

  // Where downloaded ad videos and images live. "local" = the /app/data volume. "r2" = Cloudflare R2 (S3 API).
  media: {
    driver: env('MEDIA_DRIVER', env('R2_BUCKET') ? 'r2' : 'local'),
    dir: path.resolve(ROOT, env('MEDIA_DIR', path.join(path.dirname(env('DATABASE_PATH', './data/spyvoo.db')), 'media'))),
    r2: {
      accountId: env('R2_ACCOUNT_ID'),
      bucket: env('R2_BUCKET'),
      accessKey: env('R2_ACCESS_KEY_ID'),
      secretKey: env('R2_SECRET_ACCESS_KEY'),
      endpoint: env('R2_ENDPOINT', env('R2_ACCOUNT_ID') ? 'https://' + env('R2_ACCOUNT_ID') + '.r2.cloudflarestorage.com' : ''),
      publicUrl: env('R2_PUBLIC_URL').replace(/\/+$/, '')
    }
  },

  // AI text (breakdowns, scripts, plain-English search, niche reports). AI_PROVIDER picks who answers:
  // anthropic (default, Claude direct), openrouter (one key, hundreds of models) or openai. Admin → Ad data & AI can
  // override the provider, the OpenRouter model and the key. The *_BASE_URL overrides are for tests/mocks only and
  // are ignored in production, so a key can never be sent anywhere but the real API.
  ai: {
    provider: env('AI_PROVIDER', 'anthropic').toLowerCase(),
    key: env('ANTHROPIC_API_KEY'),
    model: env('AI_MODEL', 'claude-haiku-4-5-20251001'),
    openrouter: {
      key: env('OPENROUTER_API_KEY'),
      model: env('OPENROUTER_MODEL', 'anthropic/claude-sonnet-4.5'),
      fallbacks: env('OPENROUTER_FALLBACK_MODELS'),
      baseUrl: (!isProd && env('OPENROUTER_BASE_URL')) ? env('OPENROUTER_BASE_URL').replace(/\/+$/, '') : 'https://openrouter.ai/api/v1'
    },
    openai: {
      key: env('OPENAI_API_KEY'),
      model: env('OPENAI_MODEL', 'gpt-4o-mini'),
      baseUrl: (!isProd && env('OPENAI_BASE_URL')) ? env('OPENAI_BASE_URL').replace(/\/+$/, '') : 'https://api.openai.com/v1'
    },
    timeoutMs: Number(env('AI_TIMEOUT_MS', '60000')) || 60000,
    retries: Number.isFinite(Number(env('AI_RETRIES', '2'))) ? Math.max(0, Math.min(5, Math.floor(Number(env('AI_RETRIES', '2'))))) : 2,
    retryBaseMs: Number(env('AI_RETRY_BASE_MS', '800')) || 800,
    transcribeUrl: env('TRANSCRIBE_API_URL', 'https://api.openai.com/v1/audio/transcriptions'),
    transcribeKey: env('TRANSCRIBE_API_KEY'),
    transcribeModel: env('TRANSCRIBE_MODEL', 'whisper-1')
  },

  mail: {
    provider: env('MAIL_PROVIDER', 'log'),
    key: env('MAIL_API_KEY'),
    from: env('MAIL_FROM', 'Spyvoo <hello@spyvoo.com>'),
    replyTo: env('MAIL_REPLY_TO', 'support@spyvoo.com')
  },

  pay: {
    // Demo checkout: lets you test plans without real money. Always OFF in production unless you force it.
    demo: bool('PAYMENTS_DEMO', !isProd)
  },
  // Gatevoo lives at gatevoo.com with its merchant API under /api/v1 (the same address Joinvoo, Castvoo and VooSquare
  // use). The old default, api.gatevoo.com, does not exist in DNS, so every checkout failed with "could not be reached".
  gatevoo: {
    apiUrl: gatevooApiUrl(env('GATEVOO_API_URL') || env('GATEVOO_URL') || 'https://gatevoo.com'),
    apiKey: env('GATEVOO_API_KEY').trim(),
    webhookSecret: env('GATEVOO_WEBHOOK_SECRET').trim()
  },

  // VooSquare (Voo Connect kit in ./voo-connect): one account for every Zedapex tool. "Continue with Voo ID" turns on
  // when VOO_BASE, VOO_CLIENT_ID and VOO_CLIENT_SECRET are set; events and the summary card need VOO_API_KEY.
  // VOO_CONNECT=off switches everything off at once (feature flag) without removing the credentials.
  voo: {
    on: bool('VOO_CONNECT', true),
    base: env('VOO_BASE').replace(/\/+$/, ''),
    serverBase: env('VOO_SERVER_BASE').replace(/\/+$/, ''),
    clientId: env('VOO_CLIENT_ID'),
    clientSecret: env('VOO_CLIENT_SECRET'),
    apiKey: env('VOO_API_KEY'),
    signalSecret: env('VOO_SIGNAL_SECRET'),
    redirectUri: env('VOO_REDIRECT_URI', env('APP_URL', env('RAILWAY_PUBLIC_DOMAIN') ? 'https://' + env('RAILWAY_PUBLIC_DOMAIN') : 'http://localhost:' + env('PORT', '3000')).replace(/\/+$/, '') + '/auth/voosquare/callback'),
    widget: bool('VOO_WIDGET', true),
    slug: 'spyvoo',
    eventPrefix: 'sv',
    flushMs: Number(env('VOO_FLUSH_MS', '5000')) || 5000
  },

  // Fill an empty database with sample ads so the dashboard is never empty on first launch.
  demoAds: bool('DEMO_ADS', true),
  // Behind Railway's edge the last X-Forwarded-For entry is the visitor. Anywhere else the header is the visitor's own
  // words, so it is ignored unless TRUST_PROXY=true (rate limits would otherwise be bypassed with a fake header).
  trustProxy: bool('TRUST_PROXY', !!env('RAILWAY_ENVIRONMENT', '')),
  scheduler: bool('SCHEDULER', true)
};

if (isProd && config.secret && config.secret.length < 32) {
  console.error('APP_SECRET is too short. Use at least 32 random characters (openssl rand -hex 32).');
  process.exit(1);
}
if (!config.secret) {
  if (isProd) {
    console.error('APP_SECRET is missing. Set a long random APP_SECRET before starting in production.');
    process.exit(1);
  }
  config.secret = 'dev-only-secret-do-not-use-in-production-0123456789';
}
if (isProd && config.pay.demo) console.warn('WARNING: PAYMENTS_DEMO=true in production. Anyone can get paid plans for free. Turn it off.');

config.gatevooApiUrl = gatevooApiUrl;
module.exports = config;
