'use strict';
// Apify "Facebook Ads Library Scraper" (official actor apify/facebook-ads-scraper by default).
// Swap the actor in Admin → Ad data & AI (or APIFY_ACTOR); normalise() reads both camelCase and snake_case output.
const config = require('../config');

const TERMINAL = ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'];
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== '');
const str = (...v) => { const x = first(...v); return x === undefined ? '' : String(x); };

function libraryUrl({ type, value, country, activeOnly = true, media = 'all' }) {
  const q = new URLSearchParams({ active_status: activeOnly ? 'active' : 'all', ad_type: 'all', country: country && country !== 'ALL' ? country : 'ALL', media_type: media });
  if (type === 'advertiser' && /^\d+$/.test(String(value))) { q.set('view_all_page_id', String(value)); q.set('search_type', 'page'); }
  else { q.set('q', String(value)); q.set('search_type', 'keyword_unordered'); }
  return 'https://www.facebook.com/ads/library/?' + q.toString();
}

function text(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.text) return String(v.text);
  if (v.markup && v.markup.__html) return String(v.markup.__html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"');
  return '';
}
// Meta fills dynamic-creative text with {{product.name}} placeholders; those are not useful to show.
const clean = s => String(s || '').replace(/\{\{[^}]+\}\}/g, '').trim();

function normalise(it, ctx = {}) {
  if (!it || typeof it !== 'object') return null;
  const s = it.snapshot || {};
  const card0 = (s.cards || [])[0] || {};
  const media = [];
  for (const v of s.videos || []) {
    const url = first(v.videoHdUrl, v.video_hd_url, v.videoSdUrl, v.video_sd_url);
    if (url) media.push({ type: 'video', url, poster: first(v.videoPreviewImageUrl, v.video_preview_image_url, '') });
  }
  for (const c of s.cards || []) {
    const vurl = first(c.videoHdUrl, c.video_hd_url, c.videoSdUrl, c.video_sd_url);
    if (vurl) media.push({ type: 'video', url: vurl, poster: first(c.videoPreviewImageUrl, c.video_preview_image_url, '') });
    else { const iurl = first(c.originalImageUrl, c.original_image_url, c.resizedImageUrl, c.resized_image_url); if (iurl) media.push({ type: 'image', url: iurl }); }
  }
  for (const im of s.images || []) { const u = first(im.originalImageUrl, im.original_image_url, im.resizedImageUrl, im.resized_image_url); if (u) media.push({ type: 'image', url: u }); }
  const fmt = String(first(s.displayFormat, s.display_format, '')).toUpperCase();
  const platforms = (first(it.publisherPlatform, it.publisher_platform, it.publisherPlatforms, []) || []).map(p => String(p).toLowerCase());
  const countries = first(it.reachedCountries, it.reached_countries, it.targetedOrReachedCountries, it.targeted_or_reached_countries, null) || (ctx.country ? [ctx.country] : []);
  return {
    library_id: str(it.adArchiveID, it.adArchiveId, it.ad_archive_id, it.adid, it.id, ''),
    page_id: str(it.pageID, it.pageId, it.page_id, s.pageId, s.page_id, ''),
    page_name: first(it.pageName, it.page_name, s.pageName, s.page_name, ''),
    page_logo: first(s.pageProfilePictureUrl, s.page_profile_picture_url, ''),
    page_url: first(s.pageProfileUri, s.page_profile_uri, ''),
    category: [].concat(first(s.pageCategories, s.page_categories, []) || [])[0] || '',
    platforms: platforms.length ? platforms : ['facebook'],
    countries: [].concat(countries).map(c => String(c).toUpperCase()),
    is_active: first(it.isActive, it.is_active, true) !== false,
    start_date: first(it.startDate, it.start_date, it.startDateFormatted, it.ad_delivery_start_time, null),
    end_date: first(it.endDate, it.end_date, it.endDateFormatted, it.ad_delivery_stop_time, null),
    collation_id: str(it.collationID, it.collationId, it.collation_id, ''),
    variation_count: Number(first(it.collationCount, it.collation_count, 1)) || 1,
    cta_text: first(s.ctaText, s.cta_text, card0.ctaText, card0.cta_text, ''),
    cta_type: first(s.ctaType, s.cta_type, card0.ctaType, card0.cta_type, ''),
    landing_url: first(s.linkUrl, s.link_url, card0.linkUrl, card0.link_url, ''),
    primary_text: clean(text(s.body) || text(card0.body)),
    headline: clean(first(s.title, card0.title, '')),
    description: clean(first(s.linkDescription, s.link_description, card0.linkDescription, card0.link_description, s.caption, '')),
    language: '',
    media_type: fmt === 'VIDEO' ? 'video' : fmt === 'CAROUSEL' || fmt === 'DCO' ? (media.some(m => m.type === 'video') ? 'video' : 'carousel') : undefined,
    media
  };
}

function create({ token, actor } = {}) {
  const tok = () => token || config.apify.token;
  const act = () => String(actor || config.apify.actor).replace('/', '~');
  const api = async (method, p, body) => {
    const res = await fetch(config.apify.apiUrl + p, { method, headers: { Authorization: 'Bearer ' + tok(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(90000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((data.error && data.error.message) || ('Apify HTTP ' + res.status)); e.status = res.status; throw e; }
    return data.data !== undefined ? data.data : data;
  };

  async function run(input, { maxWaitMs = 12 * 60e3 } = {}) {
    let r = await api('POST', '/acts/' + act() + '/runs?waitForFinish=60', input);
    const until = Date.now() + maxWaitMs;
    while (!TERMINAL.includes(r.status) && Date.now() < until) r = await api('GET', '/actor-runs/' + r.id + '?waitForFinish=60');
    if (r.status !== 'SUCCEEDED') {
      if (!TERMINAL.includes(r.status)) await api('POST', '/actor-runs/' + r.id + '/abort').catch(() => {});
      throw new Error('Apify run ' + r.id + ' ended with ' + r.status);
    }
    const items = await api('GET', '/datasets/' + r.defaultDatasetId + '/items?clean=true&format=json&limit=' + (input.resultsLimit || 100) * Math.max(1, (input.startUrls || []).length) * 2);
    return { items: Array.isArray(items) ? items : [], credits: Number(r.usageTotalUsd) || 0, runId: r.id };
  }

  // One run for every country of a rule. Returns { ads, credits, runs }.
  async function search({ type = 'keyword', value, countries = ['ALL'], limit = 100, activeOnly = true }) {
    const list = countries.length ? countries : ['ALL'];
    const startUrls = list.map(c => ({ url: libraryUrl({ type, value, country: c, activeOnly }) }));
    const per = Math.max(10, Math.ceil(limit / list.length));
    const { items, credits, runId } = await run({ startUrls, resultsLimit: per, activeStatus: activeOnly ? 'active' : '', isDetailsPerAd: false, onlyTotal: false });
    const country = list.length === 1 ? list[0] : '';
    const ads = items.map(it => normalise(it, { country: country === 'ALL' ? '' : country })).filter(a => a && a.library_id);
    // Several countries in one run: an ad's country is the country URL it came from, when the actor tells us.
    items.forEach((it, i) => { const u = it.inputUrl || it.input_url || it.url; const m = u && /[?&]country=([A-Z]{2})/.exec(u); if (m && ads[i] && !ads[i].countries.length) ads[i].countries = [m[1]]; });
    return { ads, credits, runs: [runId] };
  }

  return {
    id: 'apify', label: 'Apify · Facebook Ads Library',
    configured: () => !!tok(),
    search,
    searchByKeyword: (value, o = {}) => search({ ...o, type: 'keyword', value }),
    searchByAdvertiser: (pageId, o = {}) => search({ ...o, type: 'advertiser', value: pageId }),
    async fetchAdDetails(libraryId) {
      const { items } = await run({ startUrls: [{ url: 'https://www.facebook.com/ads/library/?id=' + encodeURIComponent(libraryId) }], resultsLimit: 1, isDetailsPerAd: true });
      return items[0] ? normalise(items[0]) : null;
    },
    async ping() { const me = await api('GET', '/users/me'); return 'Connected as ' + (me.username || me.email || 'Apify user') + (me.plan ? ' (' + (me.plan.id || me.plan) + ' plan)' : ''); }
  };
}

module.exports = { create, normalise, libraryUrl };
