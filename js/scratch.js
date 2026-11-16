/* Міні-гра «Скретч-картка»: стираємо «іній» і отримуємо новорічний бонус.
   Бонуси — у data/bonuses.json. Публічний API: window.ScratchCard.show(), .stop(), .bestText() */
(function () {
  'use strict';

  var DATA_URL = 'data/bonuses.json';
  var SEEN_KEY = 'pmc2027:bonus:seen:v1';
  var THRESHOLD = 0.5; // частка стертого інею, після якої картка відкривається сама

  function $(id) { return document.getElementById(id); }

  var area = $('scratchArea');
  if (!area) return;
  var canvas = $('scratchCanvas');
  var ctx = canvas.getContext('2d');
  var prize = $('scratchPrize');
  var actions = $('scratchActions');
  var revealBtn = $('scratchRevealBtn');

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var dataPromise = null;
  var current = null;
  var revealed = false;
  var scratched = false;
  var drawing = false;
  var last = null;
  var W = 0, H = 0, dpr = 1, brush = 34;
  var checkTimer = null;
  var hideTimer = null;
  var memSeen = null;

  /* ---------- Дані ---------- */

  function loadData() {
    if (dataPromise) return dataPromise;
    dataPromise = fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.bonuses) || !d.bonuses.length) throw new Error('Порожня база бонусів');
        return d;
      });
    dataPromise.catch(function (err) {
      console.error('[bonuses]', err);
      dataPromise = null;
    });
    return dataPromise;
  }

  function readSeen() {
    try {
      var s = JSON.parse(window.localStorage.getItem(SEEN_KEY));
      if (s && Array.isArray(s.seen)) return s;
    } catch (e) { /* немає доступу */ }
    return memSeen || { seen: [], last: null, opened: 0 };
  }

  function writeSeen(s) {
    memSeen = s;
    try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* ігноруємо */ }
  }

  function randomIndex(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  // Без повторів, поки не відкрито всі бонуси
  function pick(d) {
    var s = readSeen();
    var seen = {};
    s.seen.forEach(function (id) { seen[id] = true; });
    var pool = d.bonuses.filter(function (b) { return !seen[b.id]; });
    if (!pool.length) {
      s.seen = [];
      pool = d.bonuses.filter(function (b) { return b.id !== s.last; });
      if (!pool.length) pool = d.bonuses;
    }
    var b = pool[randomIndex(pool.length)];
    s.seen.push(b.id);
    s.last = b.id;
    writeSeen(s);
    var t = (d.types && d.types[b.type]) || { kicker: 'Новорічний бонус', icon: '🎁' };
    return { id: b.id, kicker: t.kicker, icon: t.icon, title: b.title, text: b.text };
  }

  function bestText() {
    var s = readSeen();
    var n = s.opened || 0;
    if (!n) return '';
    var m10 = n % 10, m100 = n % 100;
    var word = (m10 === 1 && m100 !== 11) ? 'картку' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'картки' : 'карток';
    return 'Відкрито ' + n + ' ' + word;
  }

  /* ---------- Іній ---------- */

  function rand(a, b) { return a + Math.random() * (b - a); }

  function drawFlake(x, y, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, ' + alpha + ')';
    ctx.lineWidth = Math.max(1, size * 0.09);
    ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, -size); ctx.lineTo(0, size);
      ctx.moveTo(-size * 0.28, -size * 0.7); ctx.lineTo(0, -size * 0.45); ctx.lineTo(size * 0.28, -size * 0.7);
      ctx.moveTo(-size * 0.28, size * 0.7); ctx.lineTo(0, size * 0.45); ctx.lineTo(size * 0.28, size * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintFrost() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#eef4fc');
    g.addColorStop(0.45, '#c9d9ee');
    g.addColorStop(1, '#e3ebf7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // зернистість інею
    var grains = Math.round(W * H / 55);
    for (var i = 0; i < grains; i++) {
      ctx.fillStyle = Math.random() < 0.55
        ? 'rgba(255, 255, 255, ' + rand(0.35, 0.95).toFixed(2) + ')'
        : 'rgba(120, 150, 195, ' + rand(0.12, 0.35).toFixed(2) + ')';
      var s = rand(0.6, 1.8);
      ctx.fillRect(rand(0, W), rand(0, H), s, s);
    }

    // візерунок сніжинок
    var cols = 5, rows = 4;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = (c + 0.5 + (r % 2 ? 0.5 : 0)) * W / cols + rand(-8, 8);
        var y = (r + 0.5) * H / rows + rand(-8, 8);
        drawFlake(x, y, rand(7, 13), rand(0.45, 0.8));
      }
    }

    // напис по центру на «табличці»
    var cx = W / 2, cy = H / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    roundRect(cx - Math.min(W * 0.36, 130), cy - 42, Math.min(W * 0.72, 260), 84, 16);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#09346f';
    ctx.font = '800 ' + Math.round(Math.min(W * 0.075, 26)) + 'px "Roboto Slab", Rockwell, Georgia, serif';
    ctx.fillText('Зітри іній ❄', cx, cy - 10);
    ctx.fillStyle = 'rgba(9, 52, 111, 0.72)';
    ctx.font = '600 ' + Math.round(Math.min(W * 0.042, 14)) + 'px Manrope, "Segoe UI", sans-serif';
    ctx.fillText('пальцем або мишкою', cx, cy + 18);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function resizeAndPaint() {
    var rect = area.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    W = rect.width; H = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    brush = Math.max(28, Math.min(46, W * 0.11));
    scratched = false;
    paintFrost();
  }

  /* ---------- Стирання ---------- */

  function pointFrom(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function scratchLine(a, b) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x + 0.01, b.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    scratched = true;
  }

  function clearedRatio() {
    var w = canvas.width, h = canvas.height;
    if (!w || !h) return 0;
    var data = ctx.getImageData(0, 0, w, h).data;
    var step = Math.max(4, Math.round(6 * dpr));
    var total = 0, clear = 0;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        total++;
        if (data[(y * w + x) * 4 + 3] < 64) clear++;
      }
    }
    return total ? clear / total : 0;
  }

  function check() {
    checkTimer = null;
    if (revealed || !scratched) return;
    if (clearedRatio() >= THRESHOLD) reveal();
  }

  function scheduleCheck() {
    if (!checkTimer) checkTimer = window.setTimeout(check, 180);
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (revealed || !current) return;
    e.preventDefault();
    drawing = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    last = pointFrom(e);
    scratchLine(last, last);
    scheduleCheck();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pointFrom(e);
    scratchLine(last, p);
    last = p;
    scheduleCheck();
  });

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    check();
  }
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);
  canvas.addEventListener('lostpointercapture', endStroke);

  /* ---------- Стани ---------- */

  function fillPrize(b) {
    $('prizeKicker').textContent = b.kicker;
    $('prizeIcon').textContent = b.icon;
    $('prizeTitle').textContent = b.title;
    $('prizeText').textContent = b.text;
  }

  function reveal() {
    if (revealed || !current) return;
    revealed = true;
    drawing = false;
    area.classList.add('is-revealed');
    prize.removeAttribute('aria-hidden');
    revealBtn.hidden = true;
    actions.hidden = false;

    var s = readSeen();
    s.opened = (s.opened || 0) + 1;
    writeSeen(s);

    hideTimer = window.setTimeout(function () { canvas.hidden = true; }, reduceMotion ? 0 : 650);
    if (window.Sky && !reduceMotion) {
      var r = area.getBoundingClientRect();
      window.Sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 46, power: 6 });
    }
  }

  function newCard() {
    stop();
    revealed = false;
    current = null;
    area.classList.remove('is-revealed');
    canvas.hidden = false;
    prize.setAttribute('aria-hidden', 'true');
    actions.hidden = true;
    revealBtn.hidden = false;
    fillPrize({ kicker: '', icon: '', title: '', text: '' });
    resizeAndPaint(); // спершу іній, щоб відповідь не блиснула

    loadData().then(function (d) {
      current = pick(d);
      fillPrize(current);
      resizeAndPaint(); // висота могла змінитися під текст — перемальовуємо іній під новий розмір
    }).catch(function () {
      if (window.PMC) window.PMC.toast('Не вдалося завантажити бонуси. Онови сторінку, будь ласка 🙏');
    });
  }

  function stop() {
    drawing = false;
    if (checkTimer) window.clearTimeout(checkTimer);
    if (hideTimer) window.clearTimeout(hideTimer);
    checkTimer = hideTimer = null;
  }

  function share() {
    if (!current || !window.PMC) return;
    var url = window.location.origin + window.location.pathname;
    var msg = '🎟️ Мій новорічний бонус від Project Me Club:\n\n' +
      current.icon + ' ' + current.kicker + ': «' + current.title.replace(/«/g, '„').replace(/»/g, '“') + '»\n' +
      current.text + '\n\n' +
      'Зітри свою картку: ' + url;
    window.PMC.shareText(msg, 'Бонус скопійовано, можна ділитися ✨');
  }

  revealBtn.addEventListener('click', reveal);
  $('scratchAgain').addEventListener('click', function () {
    newCard();
    window.scrollTo(0, 0);
  });
  $('scratchShare').addEventListener('click', share);

  // Перемальовуємо іній після завантаження шрифтів і при зміні розміру (лише поки картку не почали стирати)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { if (!revealed && !scratched && area.offsetParent) resizeAndPaint(); });
  }
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (!revealed && area.offsetParent) resizeAndPaint();
    }, 150);
  });

  window.ScratchCard = { show: newCard, stop: stop, bestText: bestText };
})();
