/* Project Me Club · Передбачення на 2027 — логіка сторінки */
(function () {
  'use strict';

  var DATA_URL = 'data/predictions.json';
  var STORAGE_KEY = 'pmc2027:seen:v1';

  var LOADING_PHRASES = [
    'Перемішуємо зірки…',
    'Звіряємося з календарем комет…',
    'Компілюємо твій 2027…',
    'Додаємо трохи магії…'
  ];

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(id) { return document.getElementById(id); }

  var views = { intro: $('intro'), loading: $('loading'), result: $('result'), game: $('game') };
  var currentView = 'intro';
  var viewBeforeGame = 'intro';
  var deck = $('deck');
  var card = $('card');
  var cardText = $('cardText');
  var loadingText = $('loadingText');
  var toastEl = $('toast');

  var current = null;
  var busy = false;

  /* ---------- Дані ---------- */

  var dataReady = fetch(DATA_URL, { cache: 'no-cache' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.predictions) || [];
      list = list.filter(function (p) { return p && p.id != null && typeof p.text === 'string' && p.text.trim(); });
      if (!list.length) throw new Error('Порожня база передбачень');
      return list;
    });
  dataReady.catch(function (err) { console.error('[predictions]', err); });

  /* ---------- Без повторів, поки не переглянуто всі ---------- */

  var memoryState = null; // запасний варіант, якщо localStorage недоступний

  function readState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.seen)) return parsed;
      }
    } catch (e) { /* приватний режим тощо */ }
    return memoryState || { seen: [], last: null };
  }

  function writeState(state) {
    memoryState = state;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ігноруємо */ }
  }

  function randomIndex(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function pickPrediction(list) {
    var state = readState();
    var seen = {};
    state.seen.forEach(function (id) { seen[id] = true; });

    var pool = list.filter(function (p) { return !seen[p.id]; });
    var startedOver = false;

    if (!pool.length) {
      // Усе переглянуто — нове коло, але без повтору щойно показаного
      state.seen = [];
      pool = list.filter(function (p) { return p.id !== state.last; });
      if (!pool.length) pool = list;
      startedOver = state.last != null;
    }

    var choice = pool[randomIndex(pool.length)];
    state.seen.push(choice.id);
    state.last = choice.id;
    writeState(state);
    return { prediction: choice, startedOver: startedOver, total: list.length };
  }

  /* ---------- Допоміжне ---------- */

  function wait(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }

  function showView(name) {
    currentView = name;
    Object.keys(views).forEach(function (key) {
      var v = views[key];
      var active = key === name;
      v.hidden = !active;
      v.classList.remove('is-entering');
      if (active && !reduceMotion) {
        void v.offsetWidth; // перезапуск анімації
        v.classList.add('is-entering');
      }
    });
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3200);
  }

  function burstAt(el, opts) {
    if (!window.Sky || !el) return;
    var r = el.getBoundingClientRect();
    window.Sky.burst(r.left + r.width / 2, r.top + r.height * 0.35, opts);
  }

  /* ---------- Статус «Завантаження нового року…» ---------- */

  function runStatus() {
    var box = $('status');
    var label = $('statusLabel');
    var pct = $('statusPct');
    var bar = $('statusBar');
    var finalText = 'Твій 2027 майже готовий до запуску';

    function finish() {
      bar.style.width = '99%';
      label.textContent = finalText;
      box.classList.add('is-ready');
    }

    if (reduceMotion) { finish(); return; }

    var duration = 3600;
    var startT = null;
    function step(t) {
      if (startT === null) startT = t;
      var k = Math.min(1, (t - startT) / duration);
      var eased = 1 - Math.pow(1 - k, 3);
      var value = Math.floor(eased * 99);
      pct.textContent = value + '%';
      bar.style.width = value + '%';
      if (k < 1) window.requestAnimationFrame(step);
      else window.setTimeout(finish, 450);
    }
    window.setTimeout(function () { window.requestAnimationFrame(step); }, 500);
  }

  /* ---------- Печатка ---------- */

  function buildSeal() {
    var bumps = '';
    var n = 22;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      bumps += '<circle cx="' + (50 + 41 * Math.cos(a)).toFixed(2) + '" cy="' + (50 + 41 * Math.sin(a)).toFixed(2) + '" r="7.5"/>';
    }
    $('seal').innerHTML =
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
        '<defs><radialGradient id="wax" gradientUnits="userSpaceOnUse" cx="38" cy="34" r="66">' +
          '<stop offset="0" stop-color="#93325c"/><stop offset="0.55" stop-color="#6b1e40"/><stop offset="1" stop-color="#3a0e26"/>' +
        '</radialGradient></defs>' +
        '<g fill="url(#wax)"><circle cx="50" cy="50" r="43"/>' + bumps + '</g>' +
        '<circle cx="50" cy="50" r="32" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1.6"/>' +
        '<circle cx="50" cy="50" r="28.5" fill="none" stroke="rgba(30,4,16,0.35)" stroke-width="1.2"/>' +
        '<text x="50" y="64" text-anchor="middle" font-family="Roboto Slab, Rockwell, Georgia, serif" font-weight="800" font-size="40" fill="#e9cf9f">P</text>' +
      '</svg>';
  }

  /* ---------- Основний сценарій ---------- */

  function cyclePhrases() {
    var i = 0;
    loadingText.textContent = LOADING_PHRASES[0];
    var timer = window.setInterval(function () {
      i = (i + 1) % LOADING_PHRASES.length;
      loadingText.textContent = LOADING_PHRASES[i];
      if (!reduceMotion) {
        loadingText.classList.remove('is-swapping');
        void loadingText.offsetWidth;
        loadingText.classList.add('is-swapping');
      }
    }, 750);
    return function () { window.clearInterval(timer); };
  }

  function reveal(isRepeat) {
    if (busy) return;
    busy = true;

    deck.classList.remove('is-revealing');
    showView('loading');
    var stopPhrases = cyclePhrases();
    var minDelay = reduceMotion ? 700 : (isRepeat ? 2100 : 2700);

    Promise.all([dataReady, wait(minDelay)])
      .then(function (res) {
        var result = pickPrediction(res[0]);
        current = result.prediction;
        stopPhrases();

        deck.classList.add('is-revealing');
        return wait(reduceMotion ? 0 : 420).then(function () { return result; });
      })
      .then(function (result) {
        cardText.textContent = current.text;
        showView('result');

        card.classList.remove('is-entering');
        if (!reduceMotion) {
          void card.offsetWidth;
          card.classList.add('is-entering');
          window.setTimeout(function () { burstAt(card, { count: 46, power: 6 }); }, 380);
        }
        try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }

        if (result.startedOver) {
          window.setTimeout(function () {
            toast('Усі ' + result.total + ' передбачень переглянуто! Починаємо нове коло ✨');
          }, 900);
        }
      })
      .catch(function () {
        stopPhrases();
        showView('intro');
        toast('Не вдалося завантажити передбачення. Онови сторінку, будь ласка 🙏');
      })
      .then(function () { busy = false; });
  }

  /* ---------- Поділитися ---------- */

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function shareMessage() {
    var url = window.location.origin + window.location.pathname;
    // Внутрішні лапки — „…“, щоб не було «…«…»…»
    var quoted = current.text.replace(/«/g, '„').replace(/»/g, '“');
    return '✨ Моє передбачення на 2027 від Project Me Club:\n\n' +
      '«' + quoted + '»\n\n' +
      'Дізнайся своє: ' + url;
  }

  function share() {
    if (!current) return;
    var message = shareMessage();
    var isHttp = /^https?:/.test(window.location.protocol);
    // Системне меню «Поділитися» — лише на сенсорних пристроях (телефони, планшети).
    // На компʼютері одразу копіюємо: вікно поширення Windows незручне і часто бере тільки посилання.
    var isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (navigator.share && isHttp && isTouch) {
      // Посилання навмисно всередині text, без окремого поля url:
      // інакше «Копіювати» в меню iOS/Android копіює лише посилання без передбачення.
      navigator.share({ text: message }).catch(function (err) {
        if (err && err.name !== 'AbortError') copyMessage();
      });
      return;
    }
    copyMessage();

    function copyMessage() {
      copyText(message)
        .then(function () { toast('Передбачення скопійовано, можна ділитися ✨'); })
        .catch(function () { toast('Не вдалося скопіювати 😔'); });
    }
  }

  /* ---------- Старт ---------- */

  buildSeal();
  runStatus();

  $('openBtn').addEventListener('click', function () { reveal(false); });
  $('againBtn').addEventListener('click', function () { reveal(true); });
  $('shareBtn').addEventListener('click', share);

  /* ---------- Міні-гра ---------- */

  function openGame() {
    if (busy || !window.MemoryGame) return;
    viewBeforeGame = currentView === 'result' ? 'result' : 'intro';
    showView('game');
    window.MemoryGame.newGame();
    try { $('gameTitle').focus({ preventScroll: true }); } catch (e) { $('gameTitle').focus(); }
  }

  function closeGame() {
    if (window.MemoryGame) window.MemoryGame.stop();
    showView(viewBeforeGame);
    var target = viewBeforeGame === 'result' ? card : $('openBtn');
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.js-open-game'), function (btn) {
    btn.addEventListener('click', openGame);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.js-game-back'), function (btn) {
    btn.addEventListener('click', closeGame);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && currentView === 'game') closeGame();
  });
})();
