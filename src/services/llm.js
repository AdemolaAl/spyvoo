'use strict';
// One door to every AI text model: complete({ system, messages, maxTokens, temperature, json, feature }).
// It routes to the provider picked in Admin → Ad data & AI, or AI_PROVIDER (default anthropic = Claude direct):
//   anthropic   POST https://api.anthropic.com/v1/messages        (the original path, unchanged)
//   openrouter  POST https://openrouter.ai/api/v1/chat/completions (OpenAI format; one key, many models, fallbacks)
//   openai      POST https://api.openai.com/v1/chat/completions
// Every answer comes back as { text, usage: { input_tokens, output_tokens, cost }, model, provider } and is counted
// in ai_usage (per day, provider, model and feature; no user ids, no prompts). Keys and prompts are never logged.
const config = require('../config');
const db = require('../db');
const settings = require('./settings');
const { checkApiUrl } = require('../lib/netguard');
const { encrypt, decrypt } = require('../lib/security');

const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY', url: () => 'https://api.anthropic.com/v1', key: () => config.ai.key, model: () => config.ai.model },
  openrouter: { label: 'OpenRouter', envKey: 'OPENROUTER_API_KEY', url: () => config.ai.openrouter.baseUrl, key: () => config.ai.openrouter.key, model: () => config.ai.openrouter.model },
  openai: { label: 'OpenAI', envKey: 'OPENAI_API_KEY', url: () => config.ai.openai.baseUrl, key: () => config.ai.openai.key, model: () => config.ai.openai.model }
};
const FIXED = { anthropic: 'https://api.anthropic.com/v1', openrouter: 'https://openrouter.ai/api/v1', openai: 'https://api.openai.com/v1' };
// OpenRouter model ids look like "anthropic/claude-sonnet-4.5", "openai/gpt-4o-mini" or "~anthropic/claude-sonnet-latest".
const MODEL_RE = /^~?[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

class AiError extends Error { constructor(msg, extra = {}) { super(msg); Object.assign(this, extra); } }

const csv = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const origin = u => { try { return new URL(u).origin; } catch { return ''; } };
const bindingFor = provider => provider + ' ' + origin(PROVIDERS[provider].url());

function providerName() {
  const s = settings.get('ai') || {};
  if (PROVIDERS[s.provider]) return s.provider;
  return PROVIDERS[config.ai.provider] ? config.ai.provider : 'anthropic';
}

// The provider, model, fallbacks and key that the next call will use.
function resolve() {
  const s = settings.get('ai') || {};
  const provider = providerName();
  const p = PROVIDERS[provider];
  let saved = '';
  // A key saved in admin is only ever sent to the endpoint it was saved for.
  if (s.key_enc && s.key_for === bindingFor(provider)) { try { saved = decrypt(s.key_enc); } catch { saved = ''; } }
  const key = saved || p.key() || '';
  const model = provider === 'openrouter' ? (s.openrouter_model || p.model()) : p.model();
  const fallbacks = provider === 'openrouter' ? csv(s.fallback_models || config.ai.openrouter.fallbacks).filter(m => m !== model) : [];
  return { provider, label: p.label, envKey: p.envKey, url: p.url(), key, keySource: saved ? 'admin' : key ? 'env' : '', model, fallbacks };
}
const ready = () => !!resolve().key;

// What the admin page may see: never the key itself, only where it comes from and its last 4 characters.
function publicInfo() {
  const r = resolve();
  const s = settings.get('ai') || {};
  return {
    provider: r.provider, label: r.label, provider_from: PROVIDERS[s.provider] ? 'admin' : 'env', env_provider: config.ai.provider,
    model: r.model, fallbacks: r.fallbacks, openrouter_model: s.openrouter_model || '', fallback_models: s.fallback_models || '',
    default_openrouter_model: config.ai.openrouter.model, default_fallbacks: config.ai.openrouter.fallbacks,
    has_key: !!r.key, key_source: r.keySource, key_hint: r.key ? '…' + r.key.slice(-4) : '', key_env: r.envKey,
    saved_key_other_endpoint: !!s.key_enc && s.key_for !== bindingFor(r.provider),
    endpoint: origin(r.url), test_endpoint: origin(r.url) !== origin(FIXED[r.provider]),
    providers: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, env_key: !!p.key() }))
  };
}

// Admin changes. Returns { patch, notes } for the audit log (names only, never values).
function update(b) {
  const cur = settings.get('ai') || {};
  const patch = {}; const notes = [];
  if (b.provider !== undefined) {
    const v = String(b.provider || '').toLowerCase();
    if (v && !PROVIDERS[v]) throw new AiError('Pick Anthropic, OpenRouter or OpenAI.', { status: 400 });
    patch.provider = v;
  }
  if (b.openrouter_model !== undefined) {
    const v = String(b.openrouter_model || '').trim();
    if (v && (v.length > 100 || !MODEL_RE.test(v))) throw new AiError('Use an OpenRouter model id like anthropic/claude-sonnet-4.5 (copy it from openrouter.ai/models).', { status: 400 });
    patch.openrouter_model = v;
  }
  if (b.fallback_models !== undefined) {
    const list = csv(b.fallback_models);
    if (list.length > 5) throw new AiError('Add at most 5 fallback models.', { status: 400 });
    const bad = list.find(m => m.length > 100 || !MODEL_RE.test(m));
    if (bad) throw new AiError('“' + bad.slice(0, 60) + '” is not an OpenRouter model id.', { status: 400 });
    patch.fallback_models = list.join(',');
  }
  const nextProvider = patch.provider !== undefined ? (PROVIDERS[patch.provider] ? patch.provider : (PROVIDERS[config.ai.provider] ? config.ai.provider : 'anthropic')) : providerName();
  const key = b.key !== undefined ? String(b.key || '').trim() : '';
  if (key) {
    if (key.length > 300 || /\s/.test(key)) throw new AiError('That key doesn’t look right. Paste it again.', { status: 400 });
    patch.key_enc = encrypt(key); patch.key_for = bindingFor(nextProvider); notes.push('key saved for ' + nextProvider);
  } else if (b.clear_key) {
    patch.key_enc = ''; patch.key_for = ''; notes.push('key removed');
  } else if (cur.key_enc && cur.key_for !== bindingFor(nextProvider)) {
    // The endpoint changed: the saved key is dropped and has to be typed again for the new one.
    patch.key_enc = ''; patch.key_for = ''; notes.push('key cleared (endpoint changed)');
  }
  settings.set('ai', patch);
  return { patch: Object.keys(patch).filter(k => k !== 'key_enc' && k !== 'key_for'), notes, key_cleared: notes.some(n => /cleared/.test(n)) };
}

/* ---------- message formats ---------- */
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b && (b.type === 'text' || typeof b.text === 'string')).map(b => b.text).join('\n\n') : String(c || '');
// Anthropic: a separate system field (string or text blocks) and user/assistant turns.
function anthropicBody({ system, messages, maxTokens, temperature }, model) {
  const body = { model, max_tokens: maxTokens, system, messages };
  if (temperature !== undefined) body.temperature = temperature;
  return body;
}
// OpenAI / OpenRouter: the system prompt becomes the first message with role "system".
function chatBody({ system, messages, maxTokens, temperature, json }, model, provider, fallbacks) {
  const msgs = [];
  if (system && (typeof system === 'string' ? system.trim() : system.length)) {
    // OpenRouter understands Anthropic-style cache_control on text parts; plain OpenAI gets one string.
    if (Array.isArray(system) && provider === 'openrouter') msgs.push({ role: 'system', content: system.map(b => ({ type: 'text', text: String(b.text || ''), ...(b.cache_control ? { cache_control: b.cache_control } : {}) })) });
    else msgs.push({ role: 'system', content: textOf(system) });
  }
  for (const m of messages) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: textOf(m.content) });
  const body = { model, messages: msgs, max_tokens: maxTokens };
  if (temperature !== undefined) body.temperature = temperature;
  if (json) body.response_format = { type: 'json_object' };
  if (provider === 'openrouter' && fallbacks.length) body.models = [model, ...fallbacks];
  return body;
}

/* ---------- transport ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const redact = (s, key) => { let t = String(s || '').slice(0, 300); if (key) t = t.split(key).join('[key]'); return t.replace(/sk-[a-z0-9_-]{8,}/gi, '[key]'); };
const RETRY = new Set([408, 429, 500, 502, 503, 504, 529]);

async function post(url, headers, body, { retries, key }) {
  for (let attempt = 0; ; attempt++) {
    let res, data, netErr;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(config.ai.timeoutMs) });
      data = await res.json().catch(() => ({}));
    } catch (e) { netErr = e; }
    const status = netErr ? 0 : res.status;
    // OpenRouter can answer 200 with { error } when a model fails after the request was accepted.
    const bodyErr = !netErr && data && data.error && !(data.choices && data.choices.length) ? data.error : null;
    if (!netErr && res.ok && !bodyErr) return data;
    const code = bodyErr ? Number(bodyErr.code) || 502 : status;
    const retryable = netErr || RETRY.has(code);
    if (retryable && attempt < retries) {
      const ra = !netErr && Number(res.headers.get('retry-after'));
      const wait = ra > 0 ? Math.min(ra * 1000, 10000) : config.ai.retryBaseMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await sleep(wait);
      continue;
    }
    const msg = netErr ? (netErr.name === 'TimeoutError' ? 'timed out' : 'could not be reached') : redact((bodyErr || data.error || {}).message || ('HTTP ' + code), key);
    throw new AiError(msg, { status: code || 502, retryable: !!retryable, attempts: attempt + 1 });
  }
}

function record({ provider, model, feature, usage }) {
  try {
    db.insert('ai_usage', { day: new Date().toISOString().slice(0, 10), provider, model: String(model || '').slice(0, 120), feature: String(feature || 'other').slice(0, 40), input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: usage.cost, created_at: db.now() });
  } catch (e) { console.error('[ai] usage not recorded:', e.message); }
}

async function complete({ system = '', messages = [], maxTokens = 900, temperature, json = false, feature = 'other' } = {}) {
  const r = resolve();
  if (!r.key) throw new AiError(r.label + ' is selected for AI but no API key is set. Add ' + r.envKey + ' (or save the key in Admin → Ad data & AI).', { status: 503, code: 'ai_not_configured' });
  const u = checkApiUrl(r.url, { allowOverride: !config.isProd && origin(r.url) !== origin(FIXED[r.provider]) });
  const base = u.toString().replace(/\/+$/, '');
  let data, text, usage, model;
  if (r.provider === 'anthropic') {
    // Exactly the request Spyvoo always sent to Claude (one try, 60 s timeout).
    data = await post(base + '/messages', { 'x-api-key': r.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, anthropicBody({ system, messages, maxTokens, temperature }, r.model), { retries: 0, key: r.key })
      .catch(e => { throw new AiError('Claude: ' + e.message, e); });
    text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    usage = { input_tokens: Number((data.usage || {}).input_tokens) || 0, output_tokens: Number((data.usage || {}).output_tokens) || 0, cost: 0 };
    model = data.model || r.model;
  } else {
    const headers = { Authorization: 'Bearer ' + r.key, 'Content-Type': 'application/json' };
    if (r.provider === 'openrouter') { headers['HTTP-Referer'] = config.appUrl; headers['X-Title'] = 'Spyvoo'; headers['X-OpenRouter-Title'] = 'Spyvoo'; }
    data = await post(base + '/chat/completions', headers, chatBody({ system, messages, maxTokens, temperature, json }, r.model, r.provider, r.fallbacks), { retries: config.ai.retries, key: r.key })
      .catch(e => { throw new AiError(r.label + ': ' + e.message, e); });
    const msg = ((data.choices || [])[0] || {}).message || {};
    text = textOf(msg.content);
    const us = data.usage || {};
    usage = { input_tokens: Number(us.prompt_tokens) || 0, output_tokens: Number(us.completion_tokens) || 0, cost: Number(us.cost) || 0 };
    model = data.model || r.model;
  }
  record({ provider: r.provider, model, feature, usage });
  return { text, usage, model, provider: r.provider };
}

// Today's AI calls, tokens and cost (admin page).
function usageToday() {
  try { return db.one('SELECT COUNT(*) calls, COALESCE(SUM(input_tokens), 0) input_tokens, COALESCE(SUM(output_tokens), 0) output_tokens, COALESCE(SUM(cost_usd), 0) cost_usd FROM ai_usage WHERE day = ?', new Date().toISOString().slice(0, 10)); }
  catch { return { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }; }
}

module.exports = { complete, resolve, ready, publicInfo, update, usageToday, chatBody, anthropicBody, PROVIDERS, AiError, MODEL_RE };
