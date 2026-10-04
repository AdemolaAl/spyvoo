'use strict';
// Template for a new ad data provider (for example SerpApi, a different Apify actor or your own scraper).
// 1. Copy this file to src/providers/<name>.js and fill in search().
// 2. Register it in src/providers/index.js.
// 3. Pick it in Admin → Ad data & AI. Nothing else in the app changes: it only reads the normalised Ad shape below.
//
// Normalised Ad shape (every field except library_id and page_id/page_name is optional):
// {
//   library_id: '1234567890',            // Meta Ad Library ID (unique key; ads are upserted by it)
//   page_id: '102938', page_name: 'Lumora Skin', page_logo: 'https://…', page_url: 'https://facebook.com/…', category: 'Beauty',
//   platforms: ['facebook', 'instagram'], countries: ['BR', 'MX'], is_active: true,
//   start_date: '2026-07-01' | unix seconds, end_date: null,
//   collation_id: '…', variation_count: 3,  // ads sharing one creative
//   cta_text: 'Sign up', cta_type: 'SIGN_UP', landing_url: 'https://…',
//   primary_text: '…', headline: '…', description: '…', language: 'pt',
//   media_type: 'video' | 'image' | 'carousel',
//   media: [{ type: 'video', url: 'https://…mp4', poster: 'https://…jpg' }, { type: 'image', url: 'https://…jpg' }]
// }

function create(/* { token } */) {
  return {
    id: 'template', label: 'Template (not a real provider)',
    configured: () => false,
    // Must return { ads: NormalisedAd[], credits: <USD spent>, runs: [<provider run ids>] }
    async search(/* { type: 'keyword'|'advertiser'|'domain', value, countries: ['BR'], limit: 100, activeOnly: true } */) {
      throw new Error('This provider is a template. Copy it and implement search().');
    },
    async searchByKeyword(value, o = {}) { return this.search({ ...o, type: 'keyword', value }); },
    async searchByAdvertiser(pageId, o = {}) { return this.search({ ...o, type: 'advertiser', value: pageId }); },
    async fetchAdDetails(/* libraryId */) { return null; },
    async ping() { return 'Template provider: nothing to connect.'; }
  };
}

module.exports = { create };
