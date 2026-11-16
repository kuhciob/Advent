/* Міні-гра «Знайди пару» (memory).
   Публічний API: window.MemoryGame.newGame(), window.MemoryGame.stop() */
(function () {
  'use strict';

  var PAIRS = 6;
  var BEST_KEY = 'pmc2027:memory:best:v1';

  var N = '#09346f', G = '#d6ba8b', B = '#6b1e40', B2 = '#4a1733';

  // Іконки у фірмових кольорах (viewBox 0 0 48 48)
  var ICONS = {
    tree: {
      label: 'Ялинка',
      svg: '<path d="M24 6l9 12h-5l8 11h-5l9 12H8l9-12h-5l8-11h-5z" fill="' + N + '"/>' +
        '<rect x="21" y="41" width="6" height="5" rx="1" fill="' + B + '"/>' +
        '<circle cx="20" cy="24" r="1.9" fill="' + G + '"/><circle cx="28" cy="31" r="1.9" fill="' + G + '"/>' +
        '<circle cx="18" cy="36" r="1.9" fill="#c0587e"/><circle cx="31" cy="38" r="1.9" fill="' + G + '"/>' +
        '<path d="M24 1.5l1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="' + G + '"/>'
    },
    snowflake: {
      label: 'Сніжинка',
      svg: '<g stroke="' + N + '" stroke-width="2.6" stroke-linecap="round" fill="none">' +
        '<g><path d="M24 5v38"/><path d="M19 9.5l5 5 5-5M19 38.5l5-5 5 5"/></g>' +
        '<g transform="rotate(60 24 24)"><path d="M24 5v38"/><path d="M19 9.5l5 5 5-5M19 38.5l5-5 5 5"/></g>' +
        '<g transform="rotate(120 24 24)"><path d="M24 5v38"/><path d="M19 9.5l5 5 5-5M19 38.5l5-5 5 5"/></g>' +
        '</g><circle cx="24" cy="24" r="3.2" fill="' + G + '"/>'
    },
    gift: {
      label: 'Подарунок',
      svg: '<rect x="8" y="21" width="32" height="22" rx="2" fill="' + B + '"/>' +
        '<rect x="6" y="15" width="36" height="8" rx="2" fill="#8a2a52"/>' +
        '<rect x="21" y="15" width="6" height="28" fill="' + G + '"/>' +
        '<path d="M24 15c-3-6-11-8-11-3 0 3 6 3 11 3zM24 15c3-6 11-8 11-3 0 3-6 3-11 3z" fill="none" stroke="' + G + '" stroke-width="2.6" stroke-linejoin="round"/>'
    },
    star: {
      label: 'Зірка',
      svg: '<path d="M24 5l5.6 11.6 12.8 1.8-9.3 9 2.3 12.7L24 34l-11.4 6.1 2.3-12.7-9.3-9 12.8-1.8z" fill="' + G + '" stroke="' + N + '" stroke-width="2.4" stroke-linejoin="round"/>'
    },
    coffee: {
      label: 'Кава',
      svg: '<path d="M10 20h24v8a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" fill="' + N + '"/>' +
        '<path d="M34 23h3a5 5 0 0 1 0 10h-4" fill="none" stroke="' + N + '" stroke-width="3"/>' +
        '<rect x="7" y="40" width="30" height="3" rx="1.5" fill="' + B + '"/>' +
        '<path d="M17 7c-2 3 2 5 0 8M24 5c-2 3 2 5 0 8M31 7c-2 3 2 5 0 8" stroke="' + G + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>'
    },
    laptop: {
      label: 'Ноутбук',
      svg: '<rect x="9" y="10" width="30" height="21" rx="2.5" fill="' + N + '"/>' +
        '<rect x="12" y="13" width="24" height="15" rx="1" fill="#1d4f94"/>' +
        '<path d="M20 17l-3.5 3.5L20 24M28 17l3.5 3.5L28 24" stroke="' + G + '" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M4 34h40l-3 5H7z" fill="' + B + '"/>'
    },
    book: {
      label: 'Книга клубу',
      svg: '<rect x="11" y="6" width="26" height="36" rx="2.5" fill="' + B + '"/>' +
        '<rect x="11" y="6" width="6" height="36" rx="2" fill="' + B2 + '"/>' +
        '<rect x="20" y="11" width="14" height="2" fill="' + G + '"/><rect x="20" y="35" width="14" height="2" fill="' + G + '"/>' +
        '<text x="27" y="30" text-anchor="middle" font-family="Roboto Slab, Rockwell, Georgia, serif" font-weight="800" font-size="15" fill="' + G + '">P</text>'
    },
    bauble: {
      label: 'Ялинкова кулька',
      svg: '<path d="M24 3v6" stroke="' + G + '" stroke-width="2" stroke-linecap="round"/>' +
        '<rect x="20" y="9" width="8" height="5" rx="1" fill="' + G + '"/>' +
        '<circle cx="24" cy="29" r="15" fill="' + N + '"/>' +
        '<path d="M9.6 26c9 4 19.8 4 28.8 0v6c-9 4-19.8 4-28.8 0z" fill="' + G + '"/>' +
        '<circle cx="18" cy="21" r="3" fill="#fff" opacity=".35"/>'
    }
  };
  var RANKS = [
    { max: 9,  text: 'Пам’ять рівня Senior ✨ Тобі можна довірити всі паролі (але краще не треба).' },
    { max: 13, text: 'Впевнений Middle 💪 Ще трохи — і пам’ятатимеш навіть, де лежать новорічні прикраси.' },
    { max: 18, text: 'Перспективний Junior 🌱 Потенціал видно неозброєним оком.' },
    { max: Infinity, text: 'Стажер новорічної магії 🎄 Головне, що весело, а пам’ять натренуємо у 2027.' }
  ];

  function $(id) { return document.getElementById(id); }

  var grid = $('memoryGrid');
  if (!grid) return;
  var board = $('gameBoard');
  var win = $('gameWin');
  var movesEl = $('gMoves');
  var timeEl = $('gTime');
  var bestEl = $('gBest');

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var state = null;
  var timer = null;
  var memBest = null;

  function randomIndex(n) {
    if (window.crypto && window.crypto.getRandomValues) {
      var buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randomIndex(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function readBest() {
    try {
      var b = JSON.parse(window.localStorage.getItem(BEST_KEY));
      if (b && b.moves) return b;
    } catch (e) { /* немає доступу */ }
    return memBest;
  }

  function writeBest(b) {
    memBest = b;
    try { window.localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { /* ігноруємо */ }
  }

  function isBetter(a, b) {
    if (!b) return true;
    return a.moves < b.moves || (a.moves === b.moves && a.seconds < b.seconds);
  }

  function renderBest() {
    var b = readBest();
    bestEl.textContent = b ? b.moves + ' · ' + fmtTime(b.seconds) : '—';
  }

  function updateStats() {
    movesEl.textContent = state.moves;
    timeEl.textContent = fmtTime(state.seconds);
  }

  function startTimer() {
    state.started = true;
    state.startAt = Date.now();
    timer = window.setInterval(function () {
      state.seconds = Math.floor((Date.now() - state.startAt) / 1000);
      timeEl.textContent = fmtTime(state.seconds);
    }, 250);
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  function burstAt(el, count, power) {
    if (!window.Sky || !el) return;
    var r = el.getBoundingClientRect();
    window.Sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: count, power: power });
  }

  function newGame() {
    stop();
    state = { first: null, lock: false, moves: 0, matched: 0, started: false, seconds: 0, startAt: 0 };

    var keys = shuffle(Object.keys(ICONS)).slice(0, PAIRS);
    var deck = shuffle(keys.concat(keys));

    grid.innerHTML = '';
    deck.forEach(function (key, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-card';
      btn.dataset.key = key;
      btn.style.setProperty('--i', i);
      btn.setAttribute('aria-label', 'Картка ' + (i + 1) + ', закрита');
      btn.innerHTML =
        '<span class="m-inner">' +
          '<span class="m-face m-back" aria-hidden="true"><span>P</span></span>' +
          '<span class="m-face m-front" aria-hidden="true"><svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">' + ICONS[key].svg + '</svg></span>' +
        '</span>';
      btn.addEventListener('click', onFlip);
      grid.appendChild(btn);
    });

    updateStats();
    renderBest();
    win.hidden = true;
    board.hidden = false;

    grid.classList.remove('is-dealing');
    if (!reduceMotion) {
      void grid.offsetWidth;
      grid.classList.add('is-dealing');
      window.setTimeout(function () { grid.classList.remove('is-dealing'); }, 1100);
    }
  }

  function onFlip(e) {
    var card = e.currentTarget;
    if (state.lock || card.classList.contains('is-flipped') || card.classList.contains('is-matched')) return;
    if (!state.started) startTimer();

    var key = card.dataset.key;
    card.classList.add('is-flipped');
    card.setAttribute('aria-label', ICONS[key].label);

    if (!state.first) { state.first = card; return; }

    var a = state.first, b = card;
    state.first = null;
    state.moves++;
    updateStats();

    if (a.dataset.key === key) {
      state.lock = true;
      window.setTimeout(function () {
        [a, b].forEach(function (c) {
          c.classList.remove('is-flipped');
          c.classList.add('is-matched');
          c.setAttribute('aria-label', ICONS[key].label + ', пару знайдено');
          c.setAttribute('aria-disabled', 'true');
        });
        burstAt(b, 16, 3.2);
        state.matched++;
        state.lock = false;
        if (state.matched === PAIRS) finish();
      }, reduceMotion ? 0 : 380);
    } else {
      state.lock = true;
      window.setTimeout(function () {
        a.classList.add('is-wrong');
        b.classList.add('is-wrong');
      }, reduceMotion ? 0 : 420);
      window.setTimeout(function () {
        [a, b].forEach(function (c) {
          c.classList.remove('is-flipped', 'is-wrong');
          c.setAttribute('aria-label', 'Картка ' + (Array.prototype.indexOf.call(grid.children, c) + 1) + ', закрита');
        });
        state.lock = false;
      }, reduceMotion ? 700 : 1000);
    }
  }

  function finish() {
    stop();
    state.seconds = state.started ? Math.max(1, Math.round((Date.now() - state.startAt) / 1000)) : 0;
    updateStats();

    var result = { moves: state.moves, seconds: state.seconds };
    var prevBest = readBest();
    var record = isBetter(result, prevBest);
    if (record) writeBest(result);
    renderBest();

    var rank = RANKS.filter(function (r) { return state.moves <= r.max; })[0];
    $('winRank').textContent = rank.text;
    $('winStats').textContent = state.moves + ' ' + plural(state.moves, 'хід', 'ходи', 'ходів') + ' · ' + fmtTime(state.seconds);
    var recEl = $('winRecord');
    if (record && prevBest) {
      recEl.textContent = 'Новий рекорд! 🏆';
    } else if (record) {
      recEl.textContent = 'Перший результат записано 🏆';
    } else {
      recEl.textContent = 'Твій рекорд: ' + prevBest.moves + ' ' + plural(prevBest.moves, 'хід', 'ходи', 'ходів') + ' · ' + fmtTime(prevBest.seconds);
    }

    window.setTimeout(function () {
      board.hidden = true;
      win.hidden = false;
      var winCard = $('winCard');
      if (!reduceMotion) {
        winCard.classList.remove('is-entering');
        void winCard.offsetWidth;
        winCard.classList.add('is-entering');
        window.setTimeout(function () { burstAt(winCard, 50, 6); }, 300);
      }
      try { $('winTitle').focus({ preventScroll: true }); } catch (e) { $('winTitle').focus(); }
    }, reduceMotion ? 200 : 900);
  }

  $('gRestart').addEventListener('click', newGame);
  $('gPlayAgain').addEventListener('click', newGame);

  function bestText() {
    var b = readBest();
    return b ? 'Рекорд: ' + b.moves + ' ' + plural(b.moves, 'хід', 'ходи', 'ходів') + ' · ' + fmtTime(b.seconds) : '';
  }

  window.MemoryGame = { newGame: newGame, stop: stop, bestText: bestText };
})();
