/* Illustrations: the binoculars logo and the animated "agents" (people) used across the dashboard.
   Every person is drawn in SVG and animated with CSS (breathing, blinking, waving, looking through binoculars). */
(function () {
  'use strict';
  var SV = window.SV;

  SV.MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="26" y="27" width="12" height="7" rx="3" fill="#fff" opacity=".9"/>' +
    '<circle cx="20" cy="33" r="12" fill="#fff"/><circle cx="44" cy="33" r="12" fill="#fff"/>' +
    '<g class="pup"><circle cx="21.5" cy="33" r="5.4" fill="#0A1638"/><circle cx="45.5" cy="33" r="5.4" fill="#0A1638"/><circle cx="23.3" cy="31" r="1.7" fill="#fff"/><circle cx="47.3" cy="31" r="1.7" fill="#fff"/></g>' +
    '<rect class="lid" x="8" y="21" width="48" height="24" rx="12" fill="currentColor"/></svg>';

  var SKIN = ['#F2C9A5', '#E3AD84', '#C98D62', '#A86B43', '#7A4A2A', '#5C3A22'];
  var HAIRC = ['#1B1210', '#2A1A10', '#5A3418', '#8A5A2B', '#D9A066', '#3A2A4A'];
  var COATS = ['#1F5BFF', '#7B5CFF', '#0A1638', '#FF3D8B', '#14B88A', '#FF9F1C'];
  var STYLES = ['short', 'long', 'curly', 'bun', 'short', 'long'];

  // A stable "person" for a seed (user id, name...), so everyone keeps the same avatar.
  SV.persona = function (seed, extra) {
    var h = 0; String(seed || 'agent').split('').forEach(function (c) { h = (h * 33 + c.charCodeAt(0)) >>> 0; });
    var p = { skin: SKIN[h % SKIN.length], hair: HAIRC[(h >> 3) % HAIRC.length], style: STYLES[(h >> 5) % STYLES.length], coat: COATS[(h >> 7) % COATS.length], glasses: (h >> 9) % 4 === 0, hat: false, bg: ['#E8EFFF', '#FFE3EC', '#E6FBF4', '#FFF1D0', '#F1EDFF'][(h >> 11) % 5] };
    for (var k in extra || {}) p[k] = extra[k];
    return p;
  };

  function hairBack(p) {
    if (p.style === 'long') return '<path d="M66 82c-4-34 12-56 34-56s38 22 34 56l4 50H62z" fill="' + p.hair + '"/>';
    if (p.style === 'bun') return '<circle cx="100" cy="38" r="15" fill="' + p.hair + '"/>';
    return '';
  }
  function hairFront(p) {
    if (p.hat) return '<path d="M71 74c0-6 2-12 5-16h48c3 4 5 10 5 16-4-6-10-9-14-10H85c-4 1-10 4-14 10z" fill="' + p.hair + '"/>';
    if (p.style === 'curly') return '<g fill="' + p.hair + '"><circle cx="78" cy="58" r="12"/><circle cx="92" cy="48" r="13"/><circle cx="108" cy="48" r="13"/><circle cx="122" cy="58" r="12"/><circle cx="72" cy="72" r="8"/><circle cx="128" cy="72" r="8"/></g>';
    if (p.style === 'long') return '<path d="M71 80c-1-24 12-40 29-40s30 16 29 40c-6-10-14-15-22-17-6 6-22 12-36 17z" fill="' + p.hair + '"/>';
    return '<path d="M71 76c-2-22 10-36 29-36 20 0 31 14 29 36-3-7-7-11-11-13-8 4-26 4-36 1-5 2-9 6-11 12z" fill="' + p.hair + '"/>';
  }
  function hat(p) {
    if (!p.hat) return '';
    return '<g class="hat"><ellipse cx="100" cy="58" rx="44" ry="8" fill="#0A1638"/><path d="M74 58c0-22 10-30 26-30s26 8 26 30z" fill="#0A1638"/><rect x="74" y="48" width="52" height="7" fill="' + (p.band || '#FF3D8B') + '"/></g>';
  }
  function face(p, mood) {
    var eyes = mood === 'sleep'
      ? '<path d="M84 80q5 4 10 0M106 80q5 4 10 0" stroke="#0A1638" stroke-width="2.6" fill="none" stroke-linecap="round"/>'
      : p.glasses
        ? '<g class="eyes"><rect x="80" y="73" width="17" height="12" rx="5" fill="#0A1638"/><rect x="103" y="73" width="17" height="12" rx="5" fill="#0A1638"/><rect x="96" y="77" width="8" height="2.5" fill="#0A1638"/><rect x="83" y="75" width="6" height="2.5" rx="1" fill="#fff" opacity=".6"/><rect x="106" y="75" width="6" height="2.5" rx="1" fill="#fff" opacity=".6"/></g>'
        : '<g class="eyes"><ellipse cx="89" cy="80" rx="3.6" ry="4.4" fill="#0A1638"/><ellipse cx="111" cy="80" rx="3.6" ry="4.4" fill="#0A1638"/><circle cx="90.2" cy="78.6" r="1.2" fill="#fff"/><circle cx="112.2" cy="78.6" r="1.2" fill="#fff"/></g>';
    var mouth = mood === 'wow' ? '<ellipse cx="100" cy="98" rx="5" ry="6" fill="#5A1F22"/>'
      : mood === 'sleep' ? '<path d="M95 98q5 3 10 0" stroke="#5A1F22" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
        : '<path d="M89 93q11 12 22 0z" fill="#5A1F22"/><path d="M92 95q8 5 16 0" fill="#fff" opacity=".9"/>';
    return eyes + (mood === 'sleep' || p.glasses ? '' : '<path d="M82 70l9-2M109 68l9 2" stroke="' + p.hair + '" stroke-width="2.8" stroke-linecap="round"/>') +
      '<ellipse cx="80" cy="90" rx="5" ry="3" fill="#FF7A8A" opacity=".35"/><ellipse cx="120" cy="90" rx="5" ry="3" fill="#FF7A8A" opacity=".35"/>' + mouth;
  }
  function arm(x1, y1, cx, cy, x2, y2, p) {
    return '<path d="M' + x1 + ' ' + y1 + 'Q' + cx + ' ' + cy + ' ' + x2 + ' ' + y2 + '" stroke="' + p.coat + '" stroke-width="19" fill="none" stroke-linecap="round"/><circle cx="' + x2 + '" cy="' + y2 + '" r="9" fill="' + p.skin + '"/>';
  }

  /* agent({pose: wave|bino|cheer|point|think|sleep|phone, ...persona}) */
  SV.agent = function (p, opts) {
    p = p || SV.persona('x'); opts = opts || {};
    var pose = opts.pose || 'wave';
    var cls = 'agent ' + (pose === 'wave' ? 'wave' : pose === 'bino' ? 'look' : pose === 'cheer' ? 'cheer' : '');
    var coatDark = 'rgba(0,0,0,.18)';
    var body = '<g class="body"><path d="M50 250C50 176 66 130 100 126c34 4 50 50 50 124z" fill="' + p.coat + '"/>' +
      '<path d="M100 126c-10 1-18 4-24 9l24 40 24-40c-6-5-14-8-24-9z" fill="#fff"/><path d="M100 140l-4 4 4 34 4-34z" fill="' + (p.tie || '#FF3D8B') + '"/>' +
      '<path d="M76 135l24 40-14-6-16 12 6-46zM124 135l-24 40 14-6 16 12-6-46z" fill="' + coatDark + '"/>' +
      '<circle cx="100" cy="196" r="3" fill="' + coatDark + '"/><circle cx="100" cy="214" r="3" fill="' + coatDark + '"/></g>';
    var arms = '';
    if (pose === 'wave') arms = arm(60, 150, 50, 182, 56, 210, p) + '<g class="arm-r" style="transform-origin:140px 146px;transform-box:view-box">' + arm(140, 146, 164, 128, 166, 92, p) + '</g>';
    else if (pose === 'point') arms = arm(60, 150, 50, 182, 56, 210, p) + '<g class="arm-r" style="transform-origin:140px 146px;transform-box:view-box">' + arm(140, 146, 168, 150, 190, 136, p) + '</g>';
    else if (pose === 'cheer') arms = '<g class="arm-l" style="transform-origin:60px 146px;transform-box:view-box">' + arm(60, 146, 36, 120, 40, 84, p) + '</g><g class="arm-r" style="transform-origin:140px 146px;transform-box:view-box">' + arm(140, 146, 164, 120, 160, 84, p) + '</g>';
    else if (pose === 'think') arms = arm(60, 150, 50, 182, 56, 210, p) + arm(140, 150, 150, 130, 116, 108, p);
    else if (pose === 'phone') arms = arm(60, 150, 66, 170, 88, 158, p) + arm(140, 150, 134, 170, 112, 158, p) + '<rect x="86" y="132" width="28" height="44" rx="6" fill="#0A1638"/><rect x="89" y="136" width="22" height="34" rx="3" fill="#6FA0FF"><animate attributeName="fill" values="#6FA0FF;#FF8AB8;#9FF0D6;#6FA0FF" dur="3s" repeatCount="indefinite"/></rect>';
    else if (pose === 'bino') arms = arm(60, 150, 56, 112, 84, 96, p) + arm(140, 150, 144, 112, 116, 96, p);
    else arms = arm(60, 150, 50, 182, 56, 210, p) + arm(140, 150, 150, 182, 144, 210, p);
    var bino = pose === 'bino' ? '<g class="bino"><rect x="92" y="74" width="16" height="9" rx="3" fill="#0A1638"/><circle cx="87" cy="80" r="13" fill="#0A1638"/><circle cx="113" cy="80" r="13" fill="#0A1638"/><circle cx="87" cy="80" r="8" fill="#1F5BFF"/><circle cx="113" cy="80" r="8" fill="#1F5BFF"/><circle cx="84" cy="77" r="3" fill="#fff" opacity=".8"><animate attributeName="opacity" values=".8;.2;.8" dur="2s" repeatCount="indefinite"/></circle><circle cx="110" cy="77" r="3" fill="#fff" opacity=".8"><animate attributeName="opacity" values=".8;.2;.8" dur="2s" begin=".4s" repeatCount="indefinite"/></circle></g>' : '';
    var zz = pose === 'sleep' ? '<text class="zz" x="140" y="54">z</text><text class="zz" x="152" y="40" style="animation-delay:.8s">z</text>' : '';
    var vb = opts.crop ? '58 22 84 84' : '0 0 200 250';
    return '<svg class="' + cls + '" viewBox="' + vb + '" aria-hidden="true">' +
      (opts.crop ? '<rect x="0" y="0" width="200" height="250" fill="' + p.bg + '"/>' : '<ellipse cx="100" cy="246" rx="62" ry="6" fill="rgba(10,22,56,.12)"/>') +
      body + '<g class="head">' + hairBack(p) +
      '<rect x="91" y="104" width="18" height="24" rx="8" fill="' + p.skin + '"/>' +
      '<circle cx="70" cy="84" r="7" fill="' + p.skin + '"/><circle cx="130" cy="84" r="7" fill="' + p.skin + '"/>' +
      '<ellipse cx="100" cy="82" rx="30" ry="33" fill="' + p.skin + '"/>' + hairFront(p) + face(p, pose === 'sleep' ? 'sleep' : opts.mood) + hat(p) + bino + '</g>' + arms + zz + '</svg>';
  };

  // Square avatar (head and shoulders) for a seed.
  SV.avatar = function (seed, extra) { return SV.agent(SV.persona(seed, extra), { crop: true, pose: 'idle' }); };

  // The cast used across the dashboard.
  SV.cast = {
    host: SV.persona('host', { skin: '#C98D62', hair: '#1B1210', style: 'curly', coat: '#1F5BFF', hat: true, band: '#FFC21A', glasses: false, bg: '#E8EFFF' }),
    guide: SV.persona('guide', { skin: '#DDA47A', hair: '#1B1210', style: 'long', coat: '#7B5CFF', hat: false, glasses: false, tie: '#14C894', bg: '#E2DAFF' }),
    spy: SV.persona('spy', { skin: '#F2C9A5', hair: '#5A3418', style: 'short', coat: '#0A1638', hat: true, band: '#FF3D8B', glasses: true, bg: '#FFE3EC' }),
    fan: SV.persona('fan', { skin: '#7A4A2A', hair: '#1B1210', style: 'bun', coat: '#FF3D8B', glasses: false, tie: '#FFC21A', bg: '#FFF1D0' })
  };

  // Empty-state scene: a person plus floating props.
  SV.scene = function (who, pose, props) {
    return '<div class="art" style="position:relative">' + SV.agent(SV.cast[who] || SV.cast.host, { pose: pose }) +
      (props || []).map(function (pr, i) { return '<span style="position:absolute;' + pr.pos + ';width:' + (pr.w || 34) + 'px;height:' + (pr.w || 34) + 'px;border-radius:10px;display:grid;place-items:center;color:#fff;background:' + pr.c + ';box-shadow:0 10px 20px -10px rgba(0,0,0,.4);animation:bob ' + (3 + i) + 's ease-in-out infinite">' + (SV.G ? SV.G(pr.i) : SV.I(pr.i)) + '</span>'; }).join('') + '</div>';
  };
})();
