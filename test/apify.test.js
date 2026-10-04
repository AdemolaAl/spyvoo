'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let env, apify, ingest;
before(async () => { env = await h.boot({ demo: false }); apify = require('../src/providers/apify'); ingest = require('../src/services/ingest'); });
after(async () => { await env.close(); });

const CAMEL = {
  adArchiveID: '1234567890', pageID: '555', pageName: 'Nilo Pay', isActive: true, startDate: Math.floor(Date.now() / 1000) - 40 * 86400,
  publisherPlatform: ['FACEBOOK', 'INSTAGRAM'], reachedCountries: ['EG', 'AE'], collationCount: 4,
  snapshot: { body: { text: 'Send money home in 60 seconds.' }, title: 'Zero fees this week', ctaText: 'Install now', ctaType: 'INSTALL_MOBILE_APP', linkUrl: 'https://nilopay.example/app', displayFormat: 'IMAGE', images: [{ originalImageUrl: 'https://cdn.example/a.jpg' }], pageProfilePictureUrl: 'https://cdn.example/logo.jpg' }
};
const SNAKE = {
  ad_archive_id: '999', page_id: '777', page_name: 'Rio Bets', is_active: false, start_date: '2026-08-01', end_date: '2026-09-01',
  publisher_platform: ['facebook'], snapshot: { body: { text: 'Bet on the derby' }, cta_text: 'Sign up', cta_type: 'SIGN_UP', link_url: 'https://riobets.example', display_format: 'VIDEO', videos: [{ video_hd_url: 'https://cdn.example/v.mp4', video_preview_image_url: 'https://cdn.example/p.jpg' }] }
};

test('normalise reads the camelCase actor output', () => {
  const n = apify.normalise(CAMEL);
  assert.equal(n.library_id, '1234567890');
  assert.equal(n.page_name, 'Nilo Pay');
  assert.deepEqual(n.platforms, ['facebook', 'instagram']);
  assert.deepEqual(n.countries, ['EG', 'AE']);
  assert.equal(n.variation_count, 4);
  assert.equal(n.primary_text, 'Send money home in 60 seconds.');
  assert.equal(n.media[0].type, 'image');
});

test('normalise reads the snake_case actor output', () => {
  const n = apify.normalise(SNAKE, { country: 'BR' });
  assert.equal(n.library_id, '999');
  assert.equal(n.is_active, false);
  assert.deepEqual(n.countries, ['BR']);
  assert.equal(n.media_type, 'video');
  assert.equal(n.media[0].poster, 'https://cdn.example/p.jpg');
});

test('saving the same ad twice updates it instead of duplicating', () => {
  const db = require('../src/db');
  const a = apify.normalise(CAMEL);
  const r1 = ingest.save([a], { source: 'apify' });
  const r2 = ingest.save([{ ...a, variation_count: 7 }], { source: 'apify' });
  assert.equal(r1.created, 1);
  assert.equal(r2.created, 0);
  const row = db.one("SELECT * FROM ads WHERE library_id = '1234567890'");
  assert.equal(row.variation_count, 7);
  assert.ok(row.days_running >= 39);
  assert.ok(row.winner_score > 0);
});

test('scrape tick does nothing (and spends nothing) without a token', async () => {
  const before = h.outbound.length;
  await ingest.tick();
  assert.equal(h.outbound.filter((x, i) => i >= before && /apify/.test(x.url)).length, 0);
});
