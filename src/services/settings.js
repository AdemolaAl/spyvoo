'use strict';
// Everything Ejiro may want to change without code lives here, edited from the admin panel.
// Each group is stored as one JSON row and merged over the defaults, so new keys appear automatically.
const db = require('../db');

const DAY = 864e5;
const DEFAULTS = {
  company: {
    name: 'Spyvoo', legal_name: 'Zedapex Limited', city: 'Lagos',
    support_email: 'support@spyvoo.com', hello_email: 'hello@spyvoo.com', billing_email: 'billing@spyvoo.com',
    legal_email: 'legal@spyvoo.com', privacy_email: 'privacy@spyvoo.com', logo_url: '/img/logo-mark.png'
  },
  provider: {
    active: 'apify',              // apify | demo (sample data only)
    apify_token_enc: '',          // encrypted; APIFY_TOKEN env var also works
    actor: '',                    // empty = APIFY_ACTOR env or the official Facebook Ads Library scraper
    daily_budget_usd: 5,          // stop scraping for the day once this is spent
    interval_hours: 6,            // default for new tracking rules
    results_per_rule: 100,
    download_media: true,
    analyze_new: false,           // false = analyse only when a user opens the ad (cheaper)
    inactive_after_days: 3        // not seen for this long = inactive
  },
  score: { w_days: 45, w_variations: 25, w_countries: 15, w_active: 15, days_cap: 90, variations_cap: 10, countries_cap: 8 },
  platforms: { facebook: 'live', instagram: 'live', messenger: 'live', tiktok: 'soon', youtube: 'off' },
  niches: ['E-commerce', 'Trading', 'Crypto', 'iGaming', 'Apps', 'Fintech', 'Lead gen', 'Health', 'Beauty', 'Education', 'Travel', 'Fashion', 'Food', 'SaaS', 'Real estate', 'Coaching'],
  announcement: { on: false, text: '', link: '', tone: 'info' },
  offer: {
    on: true, badge: '-50%', title: 'Launch offer',
    text: 'Half price on your first month of Starter, Pro or Agency.',
    code: 'SPYLAUNCH', ends_at: '', // empty = no countdown
    plans: ['starter', 'pro', 'agency']
  },
  // The swipe slides that sell the other Voo tools (dashboard, landing page and emails).
  family: [
    { key: 'joinvoo', name: 'Joinvoo', tag: 'Tracking', title: 'Track every lead. Kill every fake.', text: 'Tracks every real Telegram join, sign-up and deposit and feeds it back to Meta, TikTok and Snapchat, so your ads buy quality, not noise.', perk: 'First 500 joins free', url: 'https://joinvoo.com', color: '#5B3DF5', ink: '#FFFFFF', on: true },
    { key: 'replyvoo', name: 'Replyvoo', tag: 'New', title: 'Sky-rocket your sales. On autopilot.', text: 'AI Closers answer every chat in seconds, qualify every lead and send the payment link while you sleep.', perk: '30 free chats a month', url: 'https://replyvoo.com', color: '#121110', ink: '#FFFFFF', accent: '#FFC21A', on: true },
    { key: 'castvoo', name: 'Castvoo', tag: 'Telegram', title: 'Turn your Telegram into a sales machine.', text: 'Welcomes every new subscriber, follows up on time and sends each group the message written for them.', perk: '7 days free', url: 'https://castvoo.com', color: '#2F6BFF', ink: '#FFFFFF', on: true },
    { key: 'vooads', name: 'Vooads', tag: 'AI ads', title: 'Realistic UGC ads. 50+ a week.', text: 'Paste your product, pick a creator and a country. Vooads writes the hooks and hands you ready-to-run videos.', perk: 'Free credits to start', url: 'https://vooads.com', color: '#F25C2A', ink: '#FFFFFF', on: true },
    { key: 'gatevoo', name: 'Gatevoo', tag: 'Payments', title: 'Get paid in crypto. Straight to your wallet.', text: 'USDT and Bitcoin checkout for your products, with no middleman holding your money.', perk: 'Join the waitlist', url: 'https://gatevoo.com', color: '#0F9D6C', ink: '#FFFFFF', on: true },
    { key: 'affleego', name: 'Affleego', tag: 'Deals', title: 'The best affiliate deals. One place.', text: 'Compare CPA and RevShare offers from top trading, betting and app programs, and apply in one tap.', perk: 'Free to join', url: 'https://affleego.com', color: '#F5CF3D', ink: '#141210', accent: '#141210', on: true },
    { key: 'voosquare', name: 'VooSquare', tag: 'One account', title: 'Media buying, squared.', text: 'One login for every Voo tool, one dashboard for all your numbers.', perk: 'Free with every tool', url: 'https://voosquare.com', color: '#0A1A14', ink: '#FFFFFF', accent: '#C8F75A', on: true }
  ],
  billing: { renew_reminder_days: 3, grace_days: 2 },
  flags: { maintenance: false, signups: true, public_search: true, public_search_limit: 6 }
};

let cache = null;
function load() {
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of db.all('SELECT key, value FROM settings')) {
    const v = db.json(r.value, null);
    if (v == null) continue;
    out[r.key] = Array.isArray(DEFAULTS[r.key]) || Array.isArray(v) || typeof v !== 'object' ? v : { ...(DEFAULTS[r.key] || {}), ...v };
  }
  return out;
}
function all() { if (!cache) cache = load(); return cache; }
function get(group) { return all()[group]; }
function set(group, value) {
  if (!(group in DEFAULTS)) throw new Error('Unknown settings group ' + group);
  const merged = Array.isArray(DEFAULTS[group]) ? value : { ...get(group), ...value };
  db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', group, JSON.stringify(merged), db.now());
  cache = null;
  return get(group);
}
function reset() { cache = null; }

// The live offer, or null when it is off or over.
function offer() {
  const o = get('offer');
  if (!o.on || !o.code) return null;
  if (o.ends_at && new Date(o.ends_at).getTime() < Date.now()) return null;
  return o;
}

module.exports = { DEFAULTS, get, set, all, reset, offer, DAY };
