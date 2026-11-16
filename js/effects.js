/* Фонове небо: мерехтливі зірки, сніг і золоті іскри.
   Публічний API: window.Sky.burst(x, y, options) */
(function () {
  'use strict';

  var canvas = document.getElementById('sky');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var GOLD = '241, 220, 174';
  var WHITE = '255, 255, 255';

  var W = 0, H = 0, dpr = 1;
  var flakes = [], stars = [], sparks = [];
  var raf = null, lastT = 0;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeFlake(anywhere) {
    var depth = Math.random();           // 0 — далеко, 1 — близько
    return {
      x: rand(0, W),
      y: anywhere ? rand(0, H) : rand(-20, -4),
      r: 0.6 + depth * 1.9,
      vy: 0.22 + depth * 0.85,
      amp: 0.25 + depth * 0.7,
      phase: rand(0, Math.PI * 2),
      freq: rand(0.0006, 0.0016),
      a: 0.3 + depth * 0.55
    };
  }

  function makeStar() {
    return {
      x: rand(0, W),
      y: rand(0, H * 0.62),
      r: rand(0.4, 1.3),
      base: rand(0.25, 0.7),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.0008, 0.0025),
      sparkle: Math.random() < 0.12
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var area = W * H;
    var nFlakes = Math.round(Math.max(40, Math.min(150, area / 9000)));
    var nStars = Math.round(Math.max(30, Math.min(110, area / 12000)));
    flakes = [];
    for (var i = 0; i < nFlakes; i++) flakes.push(makeFlake(true));
    stars = [];
    for (var j = 0; j < nStars; j++) stars.push(makeStar());

    if (reduceQuery.matches) drawStatic();
  }

  // Чотирипроменева зірочка-блискітка
  function sparkleShape(x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.18, -size * 0.18, size, 0);
    ctx.quadraticCurveTo(size * 0.18, size * 0.18, 0, size);
    ctx.quadraticCurveTo(-size * 0.18, size * 0.18, -size, 0);
    ctx.quadraticCurveTo(-size * 0.18, -size * 0.18, 0, -size);
    ctx.fill();
    ctx.restore();
  }

  function drawStars(t) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = reduceQuery.matches ? 0.5 : (Math.sin(t * s.speed + s.phase) + 1) / 2;
      var a = s.base * (0.45 + 0.55 * tw);
      if (s.sparkle) {
        ctx.fillStyle = 'rgba(' + GOLD + ',' + (a * 0.9).toFixed(3) + ')';
        sparkleShape(s.x, s.y, 2.2 + tw * 2.2, 0);
      } else {
        ctx.fillStyle = 'rgba(' + WHITE + ',' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawFlakes(t, dt) {
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (dt) {
        f.y += f.vy * dt;
        f.x += Math.sin(t * f.freq + f.phase) * f.amp * 0.45 * dt;
        if (f.y > H + 6) { flakes[i] = f = makeFlake(false); }
        if (f.x < -6) f.x = W + 6;
        if (f.x > W + 6) f.x = -6;
      }
      ctx.fillStyle = 'rgba(' + WHITE + ',' + f.a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSparks(dt) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.035 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + p.color + ',' + Math.min(1, p.life * 1.4).toFixed(3) + ')';
      sparkleShape(p.x, p.y, p.size * (0.4 + p.life * 0.6), p.rot);
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawStars(0);
    drawFlakes(0, 0);
  }

  function frame(t) {
    var dt = lastT ? Math.min(3, (t - lastT) / 16.667) : 1;
    lastT = t;
    ctx.clearRect(0, 0, W, H);
    drawStars(t);
    drawFlakes(t, dt);
    drawSparks(dt);
    raf = window.requestAnimationFrame(frame);
  }

  function start() {
    if (raf || reduceQuery.matches) return;
    lastT = 0;
    raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = null;
  }

  function burst(x, y, opts) {
    if (reduceQuery.matches) return;
    opts = opts || {};
    var count = opts.count || 40;
    var power = opts.power || 5;
    for (var i = 0; i < count; i++) {
      var ang = rand(0, Math.PI * 2);
      var sp = rand(power * 0.35, power);
      sparks.push({
        x: x + rand(-6, 6),
        y: y + rand(-6, 6),
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - power * 0.25,
        size: rand(2.5, 6.5),
        rot: rand(0, Math.PI),
        spin: rand(-0.08, 0.08),
        life: 1,
        decay: rand(0.011, 0.022),
        color: Math.random() < 0.72 ? GOLD : WHITE
      });
    }
    start();
  }

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 150);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  var onReduceChange = function () {
    if (reduceQuery.matches) { stop(); sparks = []; drawStatic(); } else { start(); }
  };
  if (reduceQuery.addEventListener) reduceQuery.addEventListener('change', onReduceChange);
  else if (reduceQuery.addListener) reduceQuery.addListener(onReduceChange);

  resize();
  start();

  window.Sky = { burst: burst };
})();
