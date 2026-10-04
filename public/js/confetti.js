/* Tiny confetti burst: window.svConfetti(x, y, count). */
(function () {
  var cv = document.getElementById('confetti'); if (!cv) return;
  var cx = cv.getContext('2d'), parts = [], raf = 0, C = ['#1F5BFF', '#7B5CFF', '#FF3D8B', '#FF9F1C', '#14D3A0', '#FFC21A', '#4AA8FF'];
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { window.svConfetti = function () {}; return; }
  window.svConfetti = function (x, y, n) {
    cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
    for (var i = 0; i < (n || 120); i++) { var a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 6 + Math.random() * 9; parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: .3, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: C[i % C.length], life: 0 }); }
    if (!raf) raf = requestAnimationFrame(tick);
  };
  function tick() {
    var d = devicePixelRatio; cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.life < 220 && p.y < innerHeight + 40; });
    parts.forEach(function (p) { p.life++; p.vy += p.g; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; cx.save(); cx.translate(p.x * d, p.y * d); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w * d / 2, -p.h * d / 2, p.w * d, p.h * d * Math.abs(Math.cos(p.life / 6))); cx.restore(); });
    raf = parts.length ? requestAnimationFrame(tick) : 0;
  }
})();
