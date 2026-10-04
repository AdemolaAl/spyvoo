'use strict';
// Sample data provider. Seeds a fresh install so the dashboard is never empty, and lets admins try the
// pipeline before an Apify token is added. Every sample ad is marked "Sample" in the app.
// Brands are invented; pictures are bundled in /public/img/ads.

const DAY = 864e5;
const BRANDS = [
  { id: 'demo-lumora', name: 'Lumora Skin', cat: 'Beauty', img: [0], domain: 'lumoraskin.com', niche: 'Beauty', cc: ['MX', 'BR', 'CO', 'CL'], ads: [
    ['Our Vitamin C serum sold out 3 times. It’s back, 40% off today only.', 'Glow in 7 days or your money back', 'SHOP_NOW', 74, 9, 'video'],
    ['Dermatologists told me to stop scrubbing. This is what I use instead.', 'The 2-minute morning routine', 'SHOP_NOW', 41, 4, 'video'],
    ['Free shipping on every order this week. Your skin will thank you.', 'Bestsellers bundle', 'SHOP_NOW', 12, 2, 'image']
  ] },
  { id: 'demo-tradenest', name: 'TradeNest', cat: 'Financial service', img: [1], domain: 'tradenest.app', niche: 'Trading', cc: ['BR', 'EG', 'IN', 'TR', 'ID'], ads: [
    ['Start trading with $10. Copy top traders in one tap.', 'I almost quit trading. Then I copied one person.', 'SIGN_UP', 121, 14, 'video'],
    ['3 trades a day, 10 minutes each. Here’s the exact setup I follow.', 'Free demo account with $10,000', 'SIGN_UP', 66, 7, 'video'],
    ['No experience? Start on a free demo first, switch to real when you’re ready.', 'Practice free, forever', 'INSTALL_MOBILE_APP', 23, 3, 'image']
  ] },
  { id: 'demo-kora', name: 'Kora Coffee', cat: 'Coffee shop', img: [3], domain: 'koracoffee.com.br', niche: 'Food', cc: ['BR', 'AR'], ads: [
    ['The smoothest cold brew in São Paulo, at your door in 45 minutes.', 'Cold brew, delivered cold', 'ORDER_NOW', 33, 3, 'video'],
    ['Buy 2, get the third free. Every Friday.', 'Friday cold brew deal', 'ORDER_NOW', 9, 1, 'image']
  ] },
  { id: 'demo-pixelpay', name: 'PixelPay', cat: 'Financial service', img: [5], domain: 'pixelpay.money', niche: 'Fintech', cc: ['AE', 'EG', 'PH', 'IN', 'PK'], ads: [
    ['Send money home with $0 fees. Your first transfer is free.', 'Zero fees. Real exchange rate.', 'INSTALL_MOBILE_APP', 92, 11, 'video'],
    ['Your salary lands, your family gets it in 30 seconds.', 'Instant transfers to 40 countries', 'INSTALL_MOBILE_APP', 57, 6, 'image'],
    ['Get a free virtual card in 2 minutes. No paperwork.', 'Free virtual card', 'SIGN_UP', 18, 2, 'image']
  ] },
  { id: 'demo-skillforge', name: 'SkillForge', cat: 'Education', img: [7], domain: 'skillforge.io', niche: 'Education', cc: ['IN', 'ID', 'EG', 'PH', 'MX'], ads: [
    ['Free masterclass: land a remote tech job in 90 days.', 'Remote tech jobs, no degree needed', 'SIGN_UP', 64, 8, 'video'],
    ['I was a cashier 6 months ago. Now I build websites for clients in Dubai.', 'Watch the free class', 'LEARN_MORE', 38, 5, 'video']
  ] },
  { id: 'demo-coinharbor', name: 'CoinHarbor', cat: 'Cryptocurrency', img: [9], domain: 'coinharbor.finance', niche: 'Crypto', cc: ['MX', 'BR', 'TR', 'VN', 'AR'], ads: [
    ['Earn up to 8% on stablecoins. Withdraw anytime.', 'Your dollars, working for you', 'SIGN_UP', 88, 10, 'video'],
    ['Buy Bitcoin with your local card in under a minute.', 'Bitcoin in 60 seconds', 'SIGN_UP', 47, 5, 'image'],
    ['New here? Get $5 in BTC when you verify your account.', 'Sign-up bonus', 'SIGN_UP', 6, 1, 'image']
  ] },
  { id: 'demo-fitpulse', name: 'FitPulse', cat: 'App page', img: [2], domain: 'fitpulse.fit', niche: 'Health', cc: ['BR', 'MX', 'ES', 'CO'], ads: [
    ['I lost 9kg without a gym. Here’s the 12-minute plan.', '12 minutes a day, at home', 'INSTALL_MOBILE_APP', 46, 6, 'video'],
    ['No equipment, no excuses. Try 7 days free.', '7-day free trial', 'INSTALL_MOBILE_APP', 15, 2, 'video']
  ] },
  { id: 'demo-voyago', name: 'Voyago', cat: 'Travel company', img: [4], domain: 'voyago.travel', niche: 'Travel', cc: ['AE', 'SA', 'EG', 'IN'], ads: [
    ['Bali, 5 nights from $699 with flights. Only 40 seats left.', 'Bali for less than your rent', 'LEARN_MORE', 58, 7, 'image'],
    ['Weekend in the Maldives? Flights, villa and breakfast in one price.', 'Maldives weekend deal', 'BOOK_TRAVEL', 21, 3, 'video']
  ] },
  { id: 'demo-nomad', name: 'Nomad Bags', cat: 'Shopping & retail', img: [6], domain: 'nomadbags.co', niche: 'Fashion', cc: ['DE', 'FR', 'ES', 'IT', 'JP'], ads: [
    ['The carry-on that fits 7 days of clothes. No checked bag fees.', 'Pack for a week. Carry it on.', 'SHOP_NOW', 27, 3, 'video'],
    ['It survived 40 flights. Lifetime warranty.', 'Built for 100 trips', 'SHOP_NOW', 72, 5, 'image']
  ] },
  { id: 'demo-bloomly', name: 'Bloomly', cat: 'Florist', img: [8], domain: 'bloomly.shop', niche: 'E-commerce', cc: ['MX', 'CL', 'PE'], ads: [
    ['Fresh flowers tomorrow morning. 20% off your first order.', 'Flowers that last 2 weeks', 'SHOP_NOW', 19, 2, 'image'],
    ['Forgot an anniversary? Same-day delivery until 6pm.', 'Same-day flowers', 'ORDER_NOW', 34, 4, 'video']
  ] },
  { id: 'demo-quizly', name: 'Quizly Arena', cat: 'Games', img: [9, 1], domain: 'quizlyarena.com', niche: 'Apps', cc: ['ID', 'PH', 'VN', 'TH'], ads: [
    ['Answer 10 questions, climb the weekly leaderboard. Free to play.', 'Are you smarter than your city?', 'INSTALL_MOBILE_APP', 52, 9, 'video']
  ] },
  { id: 'demo-ledgerly', name: 'Ledgerly', cat: 'Software', img: [7, 5], domain: 'ledgerly.app', niche: 'SaaS', cc: ['DE', 'ES', 'PL', 'TR'], ads: [
    ['Invoices that chase themselves. Get paid 2x faster.', 'Stop chasing clients for money', 'SIGN_UP', 81, 6, 'image'],
    ['Freelancer? Your tax report is ready in one click.', 'Taxes, sorted', 'LEARN_MORE', 29, 3, 'video']
  ] }
];

function sampleAds({ now = Date.now(), query = '', countries: want = [] } = {}) {
  const out = [];
  BRANDS.forEach((b, bi) => b.ads.forEach((a, ai) => {
    const [text, headline, cta, days, variations, type] = a;
    const img = b.img[ai % b.img.length];
    const cc = b.cc.slice(0, Math.max(1, Math.min(b.cc.length, 1 + Math.round(variations / 3))));
    out.push({
      library_id: 'sample-' + b.id + '-' + ai,
      page_id: b.id, page_name: b.name, category: b.cat, page_logo: '',
      platforms: ai % 3 === 2 ? ['facebook'] : ['facebook', 'instagram'], countries: cc, is_active: !(bi === 7 && ai === 1),
      start_date: new Date(now - days * DAY).toISOString(), collation_id: 'sample-col-' + b.id + '-' + ai, variation_count: variations,
      cta_type: cta, landing_url: 'https://' + b.domain + '/?utm_source=facebook', primary_text: text, headline, description: '', language: '',
      media_type: type, niche: b.niche,
      media: [{ type: type === 'video' ? 'video' : 'image', key: '/img/ads/' + img + '.webp', poster_key: '/img/ads/' + img + '.webp' }]
    });
  }));
  const q = String(query || '').toLowerCase();
  return out.filter(a => (!q || (a.primary_text + ' ' + a.headline + ' ' + a.page_name + ' ' + a.niche).toLowerCase().includes(q)) && (!want.length || want.includes('ALL') || a.countries.some(c => want.includes(c))));
}

function create() {
  return {
    id: 'demo', label: 'Sample data (no real ads)',
    configured: () => true,
    async search({ value, countries = [] } = {}) { return { ads: sampleAds({ query: value, countries }), credits: 0, runs: [] }; },
    async searchByKeyword(value, o = {}) { return this.search({ ...o, value }); },
    async searchByAdvertiser() { return { ads: [], credits: 0, runs: [] }; },
    async fetchAdDetails() { return null; },
    async ping() { return 'Sample data provider: no account needed.'; }
  };
}

module.exports = { create, sampleAds, BRANDS };
