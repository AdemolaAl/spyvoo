'use strict';
// Public API for the website: live stats, plans, the offer, featured winners and the try-it search.
const db = require('../db');
const ads = require('../services/ads');
const account = require('../services/account');
const settings = require('../services/settings');
const countries = require('../lib/countries');
const { rateLimit } = require('../lib/http');

module.exports = function (app) {
  const searchLimit = rateLimit('public-search', 30, 600e3);

  app.get('/api/public/site', () => {
    const o = settings.offer();
    return {
      stats: ads.stats(), plans: account.plans().map(p => ({ id: p.id, name: p.name, tagline: p.tagline, price_month: p.price_month, price_year: p.price_year, features: p.features, popular: p.popular, seats: p.seats })),
      offer: o ? { badge: o.badge, title: o.title, text: o.text, code: o.code, ends_at: o.ends_at || null } : null,
      family: settings.get('family').filter(f => f.on), platforms: settings.get('platforms'), signups: settings.get('flags').signups,
      company: { name: settings.get('company').legal_name, city: settings.get('company').city, support_email: settings.get('company').support_email }
    };
  });

  app.get('/api/public/plans-full', () => {
    const o = settings.offer();
    return {
      plans: account.plans().map(p => ({ id: p.id, name: p.name, tagline: p.tagline, price_month: p.price_month, price_year: p.price_year, popular: p.popular, seats: p.seats, features: p.features,
        searches_per_day: p.searches_per_day, saves_limit: p.saves_limit, ai_per_month: p.ai_per_month, downloads_per_month: p.downloads_per_month, scripts_per_month: p.scripts_per_month, follows_limit: p.follows_limit })),
      offer: o ? { title: o.title, text: o.text, code: o.code } : null
    };
  });

  app.get('/api/public/featured', () => {
    let items = ads.search({ featured: 1, sort: 'score', limit: 12 }).items;
    if (items.length < 6) items = ads.search({ sort: 'score', status: 'active', limit: 12 }).items;
    return { items: items.map(a => ({ id: a.id, advertiser: a.advertiser.name, text: a.text, headline: a.headline, thumb: a.thumb, days: a.days, score: a.score, countries: a.countries, cta: a.cta, niche: a.niche, media_type: a.media_type })) };
  });

  // Try-it search on the landing page: the first results are visible, the rest come back blurred (no text).
  app.get('/api/public/search', searchLimit, req => {
    const flags = settings.get('flags');
    if (!flags.public_search) return { items: [], locked: 0, total: 0 };
    const show = Math.max(1, Math.min(12, flags.public_search_limit || 6));
    const parsed = ads.parseQuery(String(req.query.q || '').slice(0, 200));
    const r = ads.search({ ...parsed, limit: show + 6, sort: parsed.sort || 'score', relax: true });
    const items = r.items.map((a, i) => (i < show
      ? { id: a.id, advertiser: a.advertiser.name, text: a.text, headline: a.headline, thumb: a.thumb, days: a.days, score: a.score, countries: a.countries, cta: a.cta, niche: a.niche, media_type: a.media_type }
      : { locked: true, thumb: a.thumb, days: a.days, score: a.score }));
    return { items, total: r.total, filters: parsed, relaxed: !!r.relaxed };
  });

  app.get('/api/public/countries', () => ({ items: countries.list() }));
  app.get('/api/public/coupon', req => {
    const r = require('../services/payments').coupon(String(req.query.code || '').slice(0, 40), { plan: req.query.plan ? String(req.query.plan) : undefined });
    const c = r.ok ? r.coupon : null;
    return c ? { code: c.code, percent: c.percent, amount_off: c.amount_off } : { code: null, reason: r.reason };
  });
};
