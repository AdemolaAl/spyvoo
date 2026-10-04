'use strict';
// The one door to ad data. The app never calls a scraper directly: it asks for the active provider here.
// Add a provider: copy template.js, then add it to REGISTRY.
const config = require('../config');
const settings = require('../services/settings');
const { decrypt } = require('../lib/security');

const REGISTRY = {
  apify: require('./apify'),
  demo: require('./demo')
  // serpapi: require('./serpapi'),
};

function tokenFor(id) {
  const p = settings.get('provider');
  if (id === 'apify') { try { return (p.apify_token_enc && decrypt(p.apify_token_enc)) || config.apify.token; } catch { return config.apify.token; } }
  return '';
}

function get(id) {
  const p = settings.get('provider');
  const key = id || p.active;
  const mod = REGISTRY[key] || REGISTRY.demo;
  return mod.create({ token: tokenFor(key), actor: key === 'apify' ? (p.actor || config.apify.actor) : undefined });
}

const list = () => Object.keys(REGISTRY).map(id => { const p = get(id); return { id, label: p.label, configured: p.configured() }; });

module.exports = { get, list, REGISTRY };
