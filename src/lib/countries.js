'use strict';
// Countries Meta serves ads in: ISO code, English name, extra names people type (for AI search).
const LIST = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria', 'algerie'], ['AO', 'Angola'], ['AR', 'Argentina'], ['AM', 'Armenia'], ['AU', 'Australia'], ['AT', 'Austria', 'österreich'],
  ['AZ', 'Azerbaijan'], ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BY', 'Belarus'], ['BE', 'Belgium', 'belgique'], ['BJ', 'Benin'], ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'],
  ['BW', 'Botswana'], ['BR', 'Brazil', 'brasil'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['CL', 'Chile'],
  ['CO', 'Colombia'], ['CR', 'Costa Rica'], ['CI', 'Côte d’Ivoire', 'ivory coast|cote divoire'], ['HR', 'Croatia'], ['CY', 'Cyprus'], ['CZ', 'Czechia', 'czech republic'], ['CD', 'DR Congo', 'congo kinshasa'], ['DK', 'Denmark'],
  ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt', 'misr'], ['SV', 'El Salvador'], ['EE', 'Estonia'], ['ET', 'Ethiopia'], ['FI', 'Finland'], ['FR', 'France'],
  ['GA', 'Gabon'], ['GE', 'Georgia'], ['DE', 'Germany', 'deutschland'], ['GH', 'Ghana'], ['GR', 'Greece'], ['GT', 'Guatemala'], ['GN', 'Guinea'], ['HN', 'Honduras'],
  ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IQ', 'Iraq'], ['IE', 'Ireland'], ['IL', 'Israel'],
  ['IT', 'Italy', 'italia'], ['JM', 'Jamaica'], ['JP', 'Japan'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'],
  ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LY', 'Libya'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MG', 'Madagascar'], ['MW', 'Malawi'],
  ['MY', 'Malaysia'], ['ML', 'Mali'], ['MT', 'Malta'], ['MU', 'Mauritius'], ['MX', 'Mexico', 'méxico'], ['MD', 'Moldova'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MA', 'Morocco', 'maroc'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NP', 'Nepal'], ['NL', 'Netherlands', 'holland'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'],
  ['NE', 'Niger'], ['NG', 'Nigeria'], ['MK', 'North Macedonia'], ['NO', 'Norway'], ['OM', 'Oman'], ['PK', 'Pakistan'], ['PS', 'Palestine'], ['PA', 'Panama'],
  ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland', 'polska'], ['PT', 'Portugal'], ['PR', 'Puerto Rico'], ['QA', 'Qatar'], ['RO', 'Romania'],
  ['RW', 'Rwanda'], ['SA', 'Saudi Arabia', 'ksa|saudi'], ['SN', 'Senegal'], ['RS', 'Serbia'], ['SG', 'Singapore'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['ZA', 'South Africa'],
  ['KR', 'South Korea', 'korea'], ['ES', 'Spain', 'españa|espana'], ['LK', 'Sri Lanka'], ['SE', 'Sweden'], ['CH', 'Switzerland', 'schweiz|suisse'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'],
  ['TH', 'Thailand'], ['TG', 'Togo'], ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Türkiye', 'turkey|turkiye'], ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates', 'uae|emirates|dubai|abu dhabi'],
  ['GB', 'United Kingdom', 'uk|britain|england'], ['US', 'United States', 'usa|america|united states of america'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'], ['VE', 'Venezuela'], ['VN', 'Vietnam', 'viet nam'], ['YE', 'Yemen'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe']
];

const BY_CODE = Object.fromEntries(LIST.map(([c, n]) => [c, n]));
const flag = c => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65)) : '🌍');
const name = c => BY_CODE[c] || (c === 'ALL' ? 'All countries' : c);
const valid = c => !!BY_CODE[String(c || '').toUpperCase()];
const list = () => LIST.map(([code, n]) => ({ code, name: n, flag: flag(code) }));

// Every way a country might be typed, longest first, for AI search: [{re, code}]
const strip = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const MATCHERS = LIST.flatMap(([code, n, alt]) => [n, ...(alt ? alt.split('|') : [])].map(w => ({ w: strip(w).replace(/[’']/g, ''), code })))
  .sort((a, b) => b.w.length - a.w.length)
  .map(({ w, code }) => ({ re: new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z])', 'i'), code, w }));

module.exports = { LIST, BY_CODE, flag, name, valid, list, MATCHERS, strip };
