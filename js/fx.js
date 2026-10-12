/* Фоновая анимация: падающие лепестки, мерцающие золотые искры и салют при открытии конверта. */
(function (root) {
  'use strict';

  var canvas = document.getElementById('petals');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!canvas || reduce) {
    root.WeddingFx = { start: function () {}, burst: function () {} };
    if (canvas) canvas.style.display = 'none';
    return;
  }

  var ctx = canvas.getContext('2d');
  var PETAL_COLORS = ['#f3cdc7', '#f7dcd7', '#ebb8b0', '#fbe9e4', '#e9cfa0'];
  var GOLD_COLORS = ['#e7cf9b', '#d6b46c', '#f2e2b9', '#c99f52'];

  var w = 0, h = 0, t = 0, last = 0, raf = 0;
  var petals = [], sparks = [], bits = [];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }

  function makePetal(initial) {
    return {
      x: rand(0, w),
      y: initial ? rand(-h * 0.1, h) : rand(-40, -10),
      s: rand(6, 12),
      vy: rand(22, 46),
      sw: rand(0.5, 1.2),
      amp: rand(14, 40),
      ph: rand(0, 6.28),
      rot: rand(0, 6.28),
      vr: rand(-0.9, 0.9),
      tum: rand(0, 6.28),
      tv: rand(1, 2.4),
      a: rand(0.45, 0.85),
      c: pick(PETAL_COLORS)
    };
  }

  function makeSpark() {
    return { x: rand(0, w), y: rand(0, h), r: rand(0.8, 2.2), sp: rand(0.8, 2.2), ph: rand(0, 6.28) };
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var petalCount = Math.round(Math.min(34, Math.max(14, w / 38)));
    while (petals.length < petalCount) petals.push(makePetal(true));
    petals.length = petalCount;

    var sparkCount = Math.round(Math.min(30, Math.max(12, w / 50)));
    while (sparks.length < sparkCount) sparks.push(makeSpark());
    sparks.length = sparkCount;
  }

  function drawPetal(p) {
    var s = p.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.cos(p.tum)); // «переворачивание» лепестка в воздухе
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.6, 0, s);
    ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.9, -s * 0.6, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  function drawSpark(s) {
    var a = 0.12 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
    ctx.fillStyle = 'rgba(214,180,108,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.2832);
    ctx.fill();
    if (s.r > 1.6) {
      ctx.strokeStyle = 'rgba(214,180,108,' + (a * 0.8).toFixed(3) + ')';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(s.x - s.r * 3, s.y); ctx.lineTo(s.x + s.r * 3, s.y);
      ctx.moveTo(s.x, s.y - s.r * 3); ctx.lineTo(s.x, s.y + s.r * 3);
      ctx.stroke();
    }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    t += dt;

    ctx.clearRect(0, 0, w, h);

    sparks.forEach(drawSpark);

    petals.forEach(function (p) {
      p.y += p.vy * dt;
      p.x += (Math.cos(t * p.sw + p.ph) * p.amp + 6) * dt;
      p.rot += p.vr * dt;
      p.tum += p.tv * dt;
      if (p.y > h + 20 || p.x > w + 40 || p.x < -40) Object.assign(p, makePetal(false));
      drawPetal(p);
    });

    for (var i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.life -= dt;
      if (b.life <= 0) { bits.splice(i, 1); continue; }
      b.vx *= 0.985;
      b.vy = b.vy * 0.985 + 120 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      ctx.globalAlpha = Math.max(0, b.life / b.max);
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (raf) return;
    resize();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // Золотой «салют» из точки (x, y) — при открытии конверта
  function burst(x, y) {
    for (var i = 0; i < 46; i++) {
      var angle = rand(0, 6.2832);
      var speed = rand(80, 260);
      var life = rand(0.9, 1.8);
      bits.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        r: rand(1.4, 3.6),
        life: life, max: life,
        c: Math.random() < 0.7 ? pick(GOLD_COLORS) : pick(PETAL_COLORS)
      });
    }
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else { start(); }
  });

  root.WeddingFx = { start: start, burst: burst };
})(window);
