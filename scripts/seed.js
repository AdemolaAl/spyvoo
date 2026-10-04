'use strict';
// Fills a fresh database: plans, payment methods, the launch coupon, example tracking rules, the admin
// (from ADMIN_EMAIL / ADMIN_PASSWORD) and sample ads. Safe to run again: it only adds what is missing.
// Usage: npm run seed            (add missing data)
//        npm run seed -- --demo  (re-add the sample ads)
const config = require('../src/config');
const db = require('../src/db');
const { hashPassword } = require('../src/lib/security');

const PLANS = [
  { id: 'free', name: 'Free', tagline: 'Try it and find your first winner.', price_month: 0, price_year: 0, searches_per_day: 10, saves_limit: 20, ai_per_month: 5, downloads_per_month: 0, scripts_per_month: 1, follows_limit: 1, seats: 1, features: ['10 searches a day', '20 saved ads', '5 AI breakdowns a month', 'Facebook + Instagram'], sort: 0 },
  { id: 'starter', name: 'Starter', tagline: 'Solo media buyers and affiliates.', price_month: 29, price_year: 290, searches_per_day: 100, saves_limit: 500, ai_per_month: 100, downloads_per_month: 50, scripts_per_month: 10, follows_limit: 10, seats: 1, features: ['100 searches a day', '500 saved ads', '100 AI breakdowns a month', '50 video downloads a month', 'Follow 10 advertisers'], sort: 1 },
  { id: 'pro', name: 'Pro', tagline: 'Full-time buyers scaling every week.', price_month: 79, price_year: 790, searches_per_day: -1, saves_limit: -1, ai_per_month: 1000, downloads_per_month: 500, scripts_per_month: 100, follows_limit: 100, seats: 1, popular: 1, features: ['Unlimited searches and saves', '1,000 AI breakdowns a month', '500 video downloads a month', '“Make it mine” scripts', 'Advertiser and search alerts'], sort: 2 },
  { id: 'agency', name: 'Agency', tagline: 'Teams running many accounts.', price_month: 199, price_year: 1990, searches_per_day: -1, saves_limit: -1, ai_per_month: 5000, downloads_per_month: -1, scripts_per_month: 500, follows_limit: -1, seats: 3, features: ['Unlimited searches, saves and downloads', '5,000 AI breakdowns a month', '3 team seats', 'Shared boards', 'Priority support'], sort: 3 }
];

const RULES = [
  ['keyword', 'crypto', ['BR'], 'Crypto'], ['keyword', 'skincare', ['MX'], 'Beauty'], ['keyword', 'trading app', ['EG'], 'Trading'],
  ['keyword', 'money transfer', ['AE'], 'Fintech'], ['keyword', 'online course', ['IN'], 'Education']
];

function seed({ demo = false } = {}) {
  const now = db.now();
  db.tx(() => {
    for (const p of PLANS) {
      if (db.one('SELECT id FROM plans WHERE id = ?', p.id)) continue;
      db.insert('plans', { ...p, features: JSON.stringify(p.features), popular: p.popular || 0, currency: 'USD', active: 1 });
    }
    if (!db.one('SELECT id FROM payment_methods LIMIT 1')) {
      db.insert('payment_methods', { name: 'Crypto (USDT or Bitcoin)', provider: 'gatevoo', scope: 'global', description: 'Pay with USDT on TRON or Bitcoin through Gatevoo. Your plan switches on as soon as the payment confirms.', config: JSON.stringify({ coins: ['USDT_TRC20', 'BTC'] }), active: 1, sort: 0 });
      db.insert('payment_methods', { name: 'Bank transfer', provider: 'manual', scope: 'local', countries: '', description: 'Pay by local bank transfer. We switch your plan on when the money arrives (usually within a few hours).', config: JSON.stringify({ instructions: 'Send the exact amount to the account shown here, with your order reference as the payment note. Then email billing@spyvoo.com.' }), active: 0, sort: 1 });
    }
    if (!db.one("SELECT code FROM coupons WHERE code = 'SPYLAUNCH'")) {
      db.insert('coupons', { code: 'SPYLAUNCH', percent: 50, amount_off: 0, plans: 'starter,pro,agency', intervals: 'month', first_purchase_only: 1, max_uses: 0, uses: 0, active: 1, created_at: now });
    }
    if (!db.one('SELECT id FROM tracking_rules LIMIT 1')) {
      for (const [type, value, cc, niche] of RULES) db.insert('tracking_rules', { type, value, countries: ',' + cc.join(',') + ',', platforms: ',facebook,instagram,', niche, results_limit: 50, active: 1, interval_hours: 12, created_at: now });
    }
    if (config.adminEmail && config.adminPassword && !db.one('SELECT id FROM users WHERE email = ?', config.adminEmail.toLowerCase())) {
      db.insert('users', { email: config.adminEmail.toLowerCase(), name: 'Admin', password_hash: hashPassword(config.adminPassword), email_verified: 1, role: 'admin', plan_id: 'agency', plan_renews_at: '2099-12-31T00:00:00.000Z', onboarding: JSON.stringify({ tour_seen: false }), created_at: now });
      console.log('Admin created: ' + config.adminEmail);
    }
  });
  const ingest = require('../src/services/ingest');
  if (config.demoAds || demo) { const n = ingest.seedDemo({ force: demo }); if (n) console.log('Sample ads added: ' + n); }
}

if (require.main === module) {
  db.open();
  seed({ demo: process.argv.includes('--demo') });
  console.log('Seed complete.');
}

module.exports = { seed, PLANS };
