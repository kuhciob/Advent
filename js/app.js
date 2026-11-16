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

  var views = {
    intro: $('intro'), loading: $('loading'), result: $('result'),
    games: $('games'), memory: $('memory'), catcher: $('catcher'), scratch: $('scratch'),
    wall: $('wall')
  };
  var currentView = 'intro';
  var originView = 'intro'; // звідки відкрили ігри: головний екран чи картка
  var deck = $('deck');
  var card = $('card');
  var cardText = $('cardText');
  var loadingText = $('loadingText');
  var toastEl = $('toast');

  var current = null;
  var busy = false;

  /* ---------- Дані ---------- */

  var DATA_TIMEOUT = 10000; // мс: довше не чекаємо, щоб перемішування не крутилося вічно
  var dataPromise = null;

  // Завантажує базу один раз; якщо не вдалося — наступне натискання спробує знову
  function loadData() {
    if (dataPromise) return dataPromise;
    var request = fetch(DATA_URL, { cache: 'no-cache' })
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
    var timeout = new Promise(function (_, reject) {
      window.setTimeout(function () { reject(new Error('Таймаут завантаження бази')); }, DATA_TIMEOUT);
    });
    dataPromise = Promise.race([request, timeout]);
    dataPromise.catch(function (err) {
      console.error('[predictions]', err);
      dataPromise = null;
    });
    return dataPromise;
  }
  loadData();

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
      if (!v) return; // екрана немає в розмітці (напр. стара сторінка з кешу) — не падаємо
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

  var NEW_YEAR = new Date(2027, 0, 1, 0, 0, 0).getTime(); // північ за місцевим часом

  function statusFinalText() {
    return Date.now() >= NEW_YEAR ? 'Твій 2027 уже запущено 🚀' : 'Твій 2027 майже готовий до запуску';
  }

  function runStatus() {
    var box = $('status');
    var label = $('statusLabel');
    var pct = $('statusPct');
    var bar = $('statusBar');
    function finish() {
      bar.style.width = '99%';
      label.textContent = statusFinalText();
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

    var stopPhrases = function () {};
    function fail(err) {
      if (err) console.error('[reveal]', err);
      stopPhrases();
      try { showView('intro'); } catch (e) { /* остання лінія оборони */ }
      toast('Не вдалося завантажити передбачення. Спробуй ще раз або онови сторінку 🙏');
      busy = false;
    }

    try {
      deck.classList.remove('is-revealing');
      showView('loading');
      stopPhrases = cyclePhrases();
    } catch (err) {
      fail(err);
      return;
    }
    var minDelay = reduceMotion ? 700 : (isRepeat ? 2100 : 2700);

    Promise.all([loadData(), wait(minDelay)])
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
      .then(function () { busy = false; }, fail);
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
    shareText(shareMessage(), 'Передбачення скопійовано, можна ділитися ✨');
  }

  // Спільне «Поділитися» для передбачень та ігор
  function shareText(message, copiedMsg) {
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
        .then(function () { toast(copiedMsg || 'Скопійовано, можна ділитися ✨'); })
        .catch(function () { toast('Не вдалося скопіювати 😔'); });
    }
  }

  window.PMC = { shareText: shareText, toast: toast };

  /* ---------- Старт ---------- */

  buildSeal();
  runStatus();

  $('openBtn').addEventListener('click', function () { reveal(false); });
  $('againBtn').addEventListener('click', function () { reveal(true); });
  $('shareBtn').addEventListener('click', share);

  /* ---------- Ігри ---------- */

  function focusEl(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function stopGames() {
    if (window.MemoryGame) window.MemoryGame.stop();
    if (window.StarCatcher) window.StarCatcher.stop();
    if (window.ScratchCard) window.ScratchCard.stop();
    if (window.WishWall) window.WishWall.stop();
  }

  function openWall() {
    if (busy || !window.WishWall) return;
    if (currentView === 'intro' || currentView === 'result') originView = currentView;
    stopGames();
    showView('wall');
    window.WishWall.show();
    focusEl($('wallTitle'));
  }

  function setText(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function openGames() {
    if (busy) return;
    if (currentView === 'intro' || currentView === 'result') originView = currentView;
    stopGames();
    setText('tileBestMemory', window.MemoryGame ? window.MemoryGame.bestText() : '');
    setText('tileBestCatcher', window.StarCatcher ? window.StarCatcher.bestText() : '');
    setText('tileBestScratch', window.ScratchCard ? window.ScratchCard.bestText() : '');
    showView('games');
    focusEl($('gamesTitle'));
  }

  function openGame(name) {
    if (name === 'memory' && window.MemoryGame) {
      showView('memory');
      window.MemoryGame.newGame();
      focusEl($('memoryTitle'));
    } else if (name === 'catcher' && window.StarCatcher) {
      showView('catcher');
      window.StarCatcher.show();
      focusEl($('catcherTitle'));
    } else if (name === 'scratch' && window.ScratchCard) {
      showView('scratch');
      window.ScratchCard.show();
      focusEl($('scratchTitle'));
    }
  }

  function backToOrigin() {
    stopGames();
    showView(originView);
    focusEl(originView === 'result' ? card : $('openBtn'));
  }

  function bindAll(selector, handler) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (btn) {
      btn.addEventListener('click', handler);
    });
  }

  bindAll('.js-open-games', openGames);
  bindAll('.js-open-wall', openWall);
  bindAll('.js-game-back', openGames);
  bindAll('.js-to-origin', backToOrigin);
  bindAll('.game-tile', function (e) { openGame(e.currentTarget.dataset.game); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; // не закривати посеред набору тексту
    if (currentView === 'memory' || currentView === 'catcher' || currentView === 'scratch') openGames();
    else if (currentView === 'games' || currentView === 'wall') backToOrigin();
  });

  /* ---------- Зворотний відлік до Нового року ---------- */

  function runCountdown() {
    var box = $('countdown');
    if (!box) return;
    var target = NEW_YEAR;
    var els = { d: $('cdDays'), du: $('cdDaysUnit'), h: $('cdHours'), m: $('cdMins'), s: $('cdSecs') };
    var sr = $('countdownSr');
    var timer = null;
    var celebrated = false;

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function plural(n, one, few, many) {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return one;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
      return many;
    }

    function celebrate(live) {
      if (celebrated) return;
      celebrated = true;
      box.classList.add('is-done');
      $('countdownLabel').textContent = 'З Новим 2027 роком! 🎉';
      $('countdownRow').hidden = true;
      sr.textContent = 'Новий 2027 рік настав!';
      if ($('status').classList.contains('is-ready')) $('statusLabel').textContent = statusFinalText();
      if (live && window.Sky) {
        var r = box.getBoundingClientRect();
        window.Sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 70, power: 7 });
      }
    }

    function tick(live) {
      var diff = target - Date.now();
      if (diff <= 0) {
        if (timer) window.clearInterval(timer);
        celebrate(live);
        return;
      }
      var sec = Math.floor(diff / 1000);
      var d = Math.floor(sec / 86400);
      var h = Math.floor((sec % 86400) / 3600);
      var m = Math.floor((sec % 3600) / 60);
      var s = sec % 60;
      els.d.textContent = d;
      els.du.textContent = plural(d, 'день', 'дні', 'днів');
      els.h.textContent = pad(h);
      els.m.textContent = pad(m);
      els.s.textContent = pad(s);
      // для скрінрідерів — без секунд, щоб не «говорило» щосекунди
      sr.textContent = 'До Нового року: ' + d + ' ' + plural(d, 'день', 'дні', 'днів') + ', ' + h + ' год ' + m + ' хв';
    }

    tick(false);
    box.hidden = false; // показуємо лише з реальними цифрами
    if (!celebrated) timer = window.setInterval(function () { tick(true); }, 1000);
  }

  runCountdown();
})();
