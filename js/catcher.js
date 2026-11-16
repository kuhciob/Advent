/* Міні-гра «Зірколов»: 30 секунд ловимо зірки й подарунки, оминаємо баги.
   Публічний API: window.StarCatcher.show(), .stop(), .bestText() */
(function () {
  'use strict';

  var DURATION = 30;                       // секунд
  var BEST_KEY = 'pmc2027:catcher:best:v1';
  var POINTS = { star: 1, gift: 3, bug: -3 };

  var RANKS = [
    { min: 50, text: 'Тімлід Святого Миколая 🎁 Далі тільки посада CTO новорічної магії.' },
    { min: 35, text: 'Senior зореловець ✨ Всесвіт розглядає твою кандидатуру на підвищення.' },
    { min: 20, text: 'Middle збирач зірок 💫 Зірки вже передають одна одній твоє ім’я.' },
    { min: 10, text: 'Junior зореловець 🌟 Стабільно, впевнено й з потенціалом.' },
    { min: -Infinity, text: 'Стажер новорічної магії 🌱 Зірки ще звикають до тебе. Спробуй ще раз!' }
  ];

  function $(id) { return document.getElementById(id); }

  var stage = $('catcherStage');
  if (!stage) return;
  var canvas = $('catcherCanvas');
  var ctx = canvas.getContext('2d');
  var board = $('catcherBoard');
  var introEl = $('catcherIntro');
  var countEl = $('catcherCount');
  var winEl = $('catcherWin');
  var scoreEl = $('cScore');
  var timeEl = $('cTime');
  var timeBox = $('cTimeBox');
  var bestEl = $('cBest');

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var W = 0, H = 0, dpr = 1, scale = 1;
  var items = [], sparks = [], floats = [];
  var raf = null, lastT = 0, running = false;
  var elapsed = 0, spawnAcc = 0, score = 0;
  var caught = { star: 0, gift: 0, bug: 0 };
  var pending = [];
  var memBest = null;

  /* ---------- Утиліти ---------- */

  function rand(a, b) { return a + Math.random() * (b - a); }

  function later(fn, ms) { pending.push(window.setTimeout(fn, ms)); }

  function plural(n, one, few, many) {
    var a = Math.abs(n), m10 = a % 10, m100 = a % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function readBest() {
    try {
      var b = JSON.parse(window.localStorage.getItem(BEST_KEY));
      if (b && typeof b.score === 'number') return b;
    } catch (e) { /* немає доступу */ }
    return memBest;
  }

  function writeBest(b) {
    memBest = b;
    try { window.localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* ігноруємо */ }
  }

  function bestText() {
    var b = readBest();
    return b ? 'Рекорд: ' + b.score + ' ' + plural(b.score, 'очко', 'очки', 'очок') : '';
  }

  function renderBest() {
    var b = readBest();
    bestEl.textContent = b ? String(b.score) : '—';
  }

  /* ---------- Малювання предметів ---------- */

  function starPath(c, r) {
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 === 0 ? r : r * 0.45;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      c[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
  }

  function drawStar(c, r) {
    c.shadowColor = 'rgba(241, 220, 174, 0.9)';
    c.shadowBlur = r * 0.9;
    starPath(c, r);
    c.fillStyle = '#f1dcae';
    c.fill();
    c.shadowBlur = 0;
    starPath(c, r * 0.55);
    c.fillStyle = '#fff6df';
    c.fill();
  }

  function drawGift(c, r) {
    c.shadowColor = 'rgba(214, 186, 139, 0.6)';
    c.shadowBlur = r * 0.6;
    c.fillStyle = '#8a2a52';
    c.fillRect(-r * 0.8, -r * 0.45, r * 1.6, r * 1.25);
    c.shadowBlur = 0;
    c.fillStyle = '#a63a66';
    c.fillRect(-r * 0.92, -r * 0.75, r * 1.84, r * 0.38);
    c.fillStyle = '#d6ba8b';
    c.fillRect(-r * 0.14, -r * 0.75, r * 0.28, r * 1.55);
    c.strokeStyle = '#d6ba8b';
    c.lineWidth = Math.max(2, r * 0.14);
    c.beginPath();
    c.ellipse(-r * 0.32, -r * 0.9, r * 0.3, r * 0.18, -0.4, 0, Math.PI * 2);
    c.ellipse(r * 0.32, -r * 0.9, r * 0.3, r * 0.18, 0.4, 0, Math.PI * 2);
    c.stroke();
  }

  function drawBug(c, r, t) {
    var ink = '#0b2550';
    c.rotate(Math.sin(t * 9) * 0.12);
    c.strokeStyle = ink;
    c.lineWidth = Math.max(1.5, r * 0.1);
    c.lineCap = 'round';
    // лапки
    c.beginPath();
    for (var i = -1; i <= 1; i++) {
      var y = i * r * 0.38;
      var wig = Math.sin(t * 14 + i) * r * 0.08;
      c.moveTo(-r * 0.5, y); c.lineTo(-r * 0.95, y + r * 0.12 * i + wig);
      c.moveTo(r * 0.5, y); c.lineTo(r * 0.95, y + r * 0.12 * i - wig);
    }
    // вусики
    c.moveTo(-r * 0.15, -r * 1.05); c.quadraticCurveTo(-r * 0.3, -r * 1.45, -r * 0.55, -r * 1.45);
    c.moveTo(r * 0.15, -r * 1.05); c.quadraticCurveTo(r * 0.3, -r * 1.45, r * 0.55, -r * 1.45);
    c.stroke();
    // тіло
    c.beginPath();
    c.ellipse(0, r * 0.1, r * 0.62, r * 0.82, 0, 0, Math.PI * 2);
    c.fillStyle = '#7ed957';
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(0, -r * 0.55); c.lineTo(0, r * 0.88);
    c.stroke();
    // голова
    c.beginPath();
    c.arc(0, -r * 0.82, r * 0.36, 0, Math.PI * 2);
    c.fillStyle = '#5bb33a';
    c.fill();
    c.stroke();
    // очі
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(-r * 0.14, -r * 0.88, r * 0.11, 0, Math.PI * 2);
    c.arc(r * 0.14, -r * 0.88, r * 0.11, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = ink;
    c.beginPath();
    c.arc(-r * 0.12, -r * 0.86, r * 0.05, 0, Math.PI * 2);
    c.arc(r * 0.16, -r * 0.86, r * 0.05, 0, Math.PI * 2);
    c.fill();
  }

  function drawItem(c, it, t) {
    c.save();
    c.translate(it.x, it.y);
    if (it.type === 'star') { c.rotate(it.rot); drawStar(c, it.r); }
    else if (it.type === 'gift') { c.rotate(Math.sin(it.rot) * 0.25); drawGift(c, it.r); }
    else { drawBug(c, it.r, t + it.ph); }
    c.restore();
  }

  // Іконки в легенді правил — тим самим кодом, що й у грі
  function drawLegend() {
    var list = document.querySelectorAll('.legend-icon');
    var pr = Math.min(window.devicePixelRatio || 1, 2);
    Array.prototype.forEach.call(list, function (cv) {
      var size = 40;
      cv.width = size * pr; cv.height = size * pr;
      var c = cv.getContext('2d');
      c.setTransform(pr, 0, 0, pr, 0, 0);
      c.translate(size / 2, size / 2 + (cv.dataset.type === 'bug' ? 3 : 1));
      var type = cv.dataset.type;
      if (type === 'star') drawStar(c, 14);
      else if (type === 'gift') drawGift(c, 14);
      else drawBug(c, 12, 0);
    });
  }

  /* ---------- Ігровий цикл ---------- */

  function resize() {
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width; H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.max(0.75, Math.min(1.25, H / 480));
    if (!running) draw(0);
  }

  function spawn(p) {
    var bugChance = 0.17 + 0.1 * p;
    var giftChance = 0.07;
    var roll = Math.random();
    var type = roll < bugChance ? 'bug' : roll < bugChance + giftChance ? 'gift' : 'star';
    var r = (type === 'star' ? rand(14, 18) : 17) * scale;
    var base = type === 'bug' ? rand(115, 165) : type === 'gift' ? rand(175, 225) : rand(105, 160);
    items.push({
      type: type,
      x: rand(r + 8, W - r - 8),
      y: -r * 1.6,
      vy: base * (1 + 0.75 * p) * scale,
      r: r,
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.6, 1.6),
      sway: rand(12, 34),
      swayF: rand(1.2, 2.6),
      ph: rand(0, Math.PI * 2)
    });
  }

  function update(dt) {
    var p = Math.min(1, elapsed / DURATION);
    spawnAcc += (1.15 + 1.7 * p) * dt;
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(p); }

    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      it.y += it.vy * dt;
      it.x += Math.sin(elapsed * it.swayF + it.ph) * it.sway * dt;
      it.x = Math.max(it.r, Math.min(W - it.r, it.x));
      it.rot += it.spin * dt;
      if (it.y - it.r * 1.6 > H) items.splice(i, 1);
    }
    for (var j = sparks.length - 1; j >= 0; j--) {
      var s = sparks[j];
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 260 * dt;
      s.life -= dt * 1.8;
      if (s.life <= 0) sparks.splice(j, 1);
    }
    for (var k = floats.length - 1; k >= 0; k--) {
      var f = floats[k];
      f.y -= 46 * dt;
      f.life -= dt * 1.3;
      if (f.life <= 0) floats.splice(k, 1);
    }
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < items.length; i++) drawItem(ctx, items[i], t);

    for (var j = 0; j < sparks.length; j++) {
      var s = sparks[j];
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.5 + s.life * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var k = 0; k < floats.length; k++) {
      var f = floats[k];
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.5));
      ctx.font = '800 ' + Math.round(22 * scale) + 'px "Roboto Slab", Rockwell, Georgia, serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4, 19, 48, 0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    elapsed += dt;
    update(dt);
    draw(elapsed);
    updateHud();
    if (elapsed >= DURATION) { end(); return; }
    raf = window.requestAnimationFrame(frame);
  }

  function updateHud() {
    scoreEl.textContent = score;
    var left = Math.max(0, Math.ceil(DURATION - elapsed));
    timeEl.textContent = left;
    timeBox.classList.toggle('is-hurry', running && left <= 5);
  }

  /* ---------- Взаємодія ---------- */

  function burst(x, y, colors, count, power) {
    for (var i = 0; i < count; i++) {
      var a = rand(0, Math.PI * 2), sp = rand(power * 0.4, power);
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - power * 0.3, life: 1, size: rand(1.5, 3.5), color: colors[i % colors.length] });
    }
  }

  function catchItem(it) {
    var pts = POINTS[it.type];
    score = Math.max(0, score + pts);
    caught[it.type]++;
    if (it.type === 'bug') {
      floats.push({ x: it.x, y: it.y, text: '−3', color: '#ff9aa8', life: 1 });
      burst(it.x, it.y, ['#7ed957', '#ff9aa8'], 12, 160);
      if (!reduceMotion) {
        stage.classList.remove('is-hit');
        void stage.offsetWidth;
        stage.classList.add('is-hit');
      }
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
    } else {
      floats.push({ x: it.x, y: it.y, text: '+' + pts, color: '#f1dcae', life: 1 });
      burst(it.x, it.y, it.type === 'gift' ? ['#f1dcae', '#a63a66', '#ffffff'] : ['#f1dcae', '#ffffff'], it.type === 'gift' ? 18 : 10, it.type === 'gift' ? 220 : 160);
    }
    updateHud();
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!running) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var extra = e.pointerType === 'mouse' ? 8 : 18;
    var best = -1, bestD = Infinity;
    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var d = Math.sqrt((it.x - x) * (it.x - x) + (it.y - y) * (it.y - y));
      if (d < it.r + extra && d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) catchItem(items.splice(best, 1)[0]);
  });

  /* ---------- Стани гри ---------- */

  function reset() {
    items = []; sparks = []; floats = [];
    elapsed = 0; spawnAcc = 0; score = 0;
    caught = { star: 0, gift: 0, bug: 0 };
    lastT = 0;
    updateHud();
  }

  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = null;
    pending.forEach(function (id) { window.clearTimeout(id); });
    pending = [];
    stage.classList.remove('is-hit');
    timeBox.classList.remove('is-hurry');
  }

  function show() {
    stop();
    reset();
    renderBest();
    winEl.hidden = true;
    board.hidden = false;
    introEl.hidden = false;
    countEl.hidden = true;
    resize();
    draw(0);
  }

  function countdown() {
    introEl.hidden = true;
    reset();
    resize();
    draw(0);
    var n = 3;
    countEl.hidden = false;
    (function tick() {
      if (n === 0) {
        countEl.hidden = true;
        running = true;
        lastT = 0;
        raf = window.requestAnimationFrame(frame);
        return;
      }
      countEl.textContent = n;
      countEl.classList.remove('is-pop');
      void countEl.offsetWidth;
      countEl.classList.add('is-pop');
      n--;
      later(tick, 700);
    })();
    // На телефоні — підкрутити, щоб поле було повністю видно
    try { stage.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (e) { /* старі браузери */ }
  }

  function end() {
    stop();
    elapsed = DURATION;
    updateHud();

    var prev = readBest();
    var record = !prev || score > prev.score;
    if (record) writeBest({ score: score });
    renderBest();

    var rank = RANKS.filter(function (r) { return score >= r.min; })[0];
    $('cWinStats').textContent = score + ' ' + plural(score, 'очко', 'очки', 'очок');
    $('cWinDetail').textContent = '⭐ ' + caught.star + '  ·  🎁 ' + caught.gift + '  ·  🐛 ' + caught.bug;
    $('cWinRank').textContent = rank.text;
    $('cWinRecord').textContent = record
      ? (prev ? 'Новий рекорд! 🏆' : 'Перший результат записано 🏆')
      : 'Твій рекорд: ' + prev.score + ' ' + plural(prev.score, 'очко', 'очки', 'очок');

    later(function () {
      board.hidden = true;
      winEl.hidden = false;
      var card = $('cWinCard');
      if (!reduceMotion) {
        card.classList.remove('is-entering');
        void card.offsetWidth;
        card.classList.add('is-entering');
        later(function () {
          if (window.Sky) {
            var r = card.getBoundingClientRect();
            window.Sky.burst(r.left + r.width / 2, r.top + r.height * 0.3, { count: 50, power: 6 });
          }
        }, 300);
      }
      window.scrollTo(0, 0);
      try { $('cWinTitle').focus({ preventScroll: true }); } catch (e) { $('cWinTitle').focus(); }
    }, 700);
  }

  $('catcherStart').addEventListener('click', countdown);
  $('cPlayAgain').addEventListener('click', function () { show(); countdown(); });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { if (!board.hidden && stage.offsetParent) resize(); }, 120);
  });
  document.addEventListener('visibilitychange', function () {
    // rAF у фоні зупиняється сам; dt обмежено, тож час гри не «перескакує»
    if (!document.hidden && running) lastT = 0;
  });

  drawLegend();

  window.StarCatcher = { show: show, stop: stop, bestText: bestText };
})();
