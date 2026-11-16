/* «Стіна побажань»: побажання зберігаються в Google Таблиці через Google Apps Script.
   Публічний API: window.WishWall.show(), .stop() */
(function () {
  'use strict';

  // URL вебзастосунку Google Apps Script (…/exec). Як отримати — README, розділ «Стіна побажань».
  // Поки порожньо — демо-режим: побажання бачиш лише ти (зберігаються в цьому браузері).
  var WISHES_API_URL = 'https://script.google.com/macros/s/AKfycby0cacD69nxyFXRKyy_jO2glQF4bvIzTZwjY-XJchFRIQJKXMJRPe-dGmD_aBa2hk-Y/exec';

  var MAX_TEXT = 200;
  var MAX_NAME = 40;
  var COOLDOWN_MS = 30000;       // не частіше одного побажання на 30 секунд з браузера
  var REFRESH_MS = 60000;        // автооновлення стіни, поки вона відкрита
  var COOLDOWN_KEY = 'pmc2027:wall:last';
  var MINE_KEY = 'pmc2027:wall:mine';
  var DEMO_KEY = 'pmc2027:wall:demo';
  var DEFAULT_NAME = 'Учасник клубу';

  // Той самий фільтр, що й у tools/wishes-backend.gs (сервер перевіряє ще раз)
  var BAD_WORDS = /(хуй|хуя|хує|хуї|хуе[вн]|пизд|бляд|блят|мудак|мудил|гандон|підор|підар|пидор|пидар|шлюх|залуп|йобан|йоба)|(^|[^а-яіїєґё]|за|ви|від|на|по|до|у|під|роз|з|при)(еб|єб|їб)(ат|ан|ал|ну|ло)|(^|[^а-яіїєґё])(сук[аиуі]|сучар[а-яіїєґё]*|курв[аиі])(?![а-яіїєґё])/i;

  var DEMO_WISHES = [
    { id: 'd1', text: 'Бажаю всім у 2027 сміливих рішень і людей поруч, які в них вірять ✨', name: 'Команда Project Me' },
    { id: 'd2', text: 'Щоб кожна книжка клубу давала хоча б одну ідею, яка змінить тиждень.', name: '' },
    { id: 'd3', text: 'Менше мітингів, більше сенсу. І кави, звісно ☕', name: 'Олена' },
    { id: 'd4', text: 'Миру, тепла вдома і зустрічей наживо!', name: '' },
    { id: 'd5', text: 'Нехай 2027 буде роком, коли «колись» стане «вже».', name: 'Андрій' },
    { id: 'd6', text: 'Бажаю, щоб робота приносила радість, а вихідні були справжніми вихідними.', name: '' }
  ];

  function $(id) { return document.getElementById(id); }

  var form = $('wallForm');
  if (!form) return;
  var textEl = $('wallText');
  var nameEl = $('wallName');
  var hpEl = $('wallHp');
  var countEl = $('wallCount');
  var submitBtn = $('wallSubmit');
  var statusEl = $('wallStatus');
  var board = $('wallBoard');
  var emptyEl = $('wallEmpty');
  var totalEl = $('wallTotal');
  var demoEl = $('wallDemo');

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var isDemo = !WISHES_API_URL;
  var wishes = [];
  var timer = null;
  var sending = false;
  var mem = {};

  /* ---------- Утиліти ---------- */

  function store(key, value) {
    mem[key] = value;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ігноруємо */ }
  }

  function load(key, fallback) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key));
      if (v !== null && v !== undefined) return v;
    } catch (e) { /* немає доступу */ }
    return key in mem ? mem[key] : fallback;
  }

  function clean(value, max) {
    return String(value || '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max);
  }

  function hash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg || '';
    statusEl.className = 'wall-status' + (kind ? ' is-' + kind : '');
  }

  /* ---------- Стікери ---------- */

  function sticker(w, isNew) {
    var mine = load(MINE_KEY, []);
    var h = hash(String(w.id) + w.text);
    var el = document.createElement('article');
    el.className = 'sticker sticker--c' + (h % 4) + (isNew ? ' is-new' : '');
    el.style.setProperty('--rot', (((h >> 3) % 7) - 3) * 0.7 + 'deg');

    if (mine.indexOf(String(w.id)) !== -1) {
      var badge = document.createElement('span');
      badge.className = 'sticker-mine';
      badge.textContent = 'твоє ✨';
      el.appendChild(badge);
    }

    var p = document.createElement('p');
    p.className = 'sticker-text';
    p.textContent = w.text;                    // лише textContent — жодного HTML від користувачів
    el.appendChild(p);

    var sign = document.createElement('p');
    sign.className = 'sticker-sign';
    sign.textContent = '— ' + (w.name || DEFAULT_NAME);
    el.appendChild(sign);
    return el;
  }

  function render(newId) {
    board.innerHTML = '';
    emptyEl.hidden = wishes.length > 0;
    wishes.forEach(function (w) { board.appendChild(sticker(w, String(w.id) === String(newId))); });
    var n = wishes.length;
    totalEl.textContent = n ? 'На стіні ' + n + ' ' + plural(n, 'побажання', 'побажання', 'побажань') : '';
  }

  /* ---------- Дані ---------- */

  function fetchWishes(quiet) {
    if (isDemo) {
      wishes = load(DEMO_KEY, []).concat(DEMO_WISHES);
      render();
      return;
    }
    if (!quiet && !wishes.length) totalEl.textContent = 'Завантажуємо стіну…';
    fetch(WISHES_API_URL + (WISHES_API_URL.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok || !Array.isArray(d.wishes)) throw new Error('Bad response');
        wishes = d.wishes;
        render();
      })
      .catch(function (err) {
        console.error('[wall]', err);
        if (!wishes.length) totalEl.textContent = '';
        if (!quiet) setStatus('Не вдалося завантажити стіну. Спробуй оновити трохи пізніше.', 'error');
      });
  }

  function remember(id) {
    var mine = load(MINE_KEY, []);
    mine.push(String(id));
    store(MINE_KEY, mine.slice(-50));
  }

  function celebrate() {
    if (!window.Sky || reduceMotion) return;
    var first = board.firstElementChild || board;
    var r = first.getBoundingClientRect();
    window.Sky.burst(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60), { count: 36, power: 5 });
  }

  function addWish(w, pending) {
    remember(w.id);
    textEl.value = '';
    updateCount();
    store(COOLDOWN_KEY, Date.now());
    if (pending) {
      setStatus('Дякуємо! Побажання з’явиться на стіні після модерації 💌', 'ok');
      return;
    }
    wishes.unshift(w);
    render(w.id);
    setStatus('Готово! Твоє побажання вже на стіні 📌', 'ok');
    board.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    window.setTimeout(celebrate, reduceMotion ? 0 : 450);
  }

  /* ---------- Форма ---------- */

  function updateCount() {
    countEl.textContent = textEl.value.length + '/' + MAX_TEXT;
  }

  textEl.addEventListener('input', function () {
    updateCount();
    if (statusEl.classList.contains('is-error')) setStatus('');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;

    var text = clean(textEl.value, MAX_TEXT);
    var name = clean(nameEl.value, MAX_NAME).replace(/\n/g, ' ');

    if (text.length < 3) { setStatus('Напиши хоча б кілька слів ✍️', 'error'); textEl.focus(); return; }
    if (BAD_WORDS.test(text) || BAD_WORDS.test(name)) {
      setStatus('Схоже, тут є слова, які ми не можемо приклеїти на стіну. Спробуй переформулювати 🙏', 'error');
      return;
    }
    var wait = COOLDOWN_MS - (Date.now() - Number(load(COOLDOWN_KEY, 0)));
    if (wait > 0) {
      setStatus('Зачекай ще ' + Math.ceil(wait / 1000) + ' с перед наступним побажанням ⏳', 'error');
      return;
    }

    if (isDemo) {
      var w = { id: 'local-' + Date.now(), text: text, name: name };
      store(DEMO_KEY, [w].concat(load(DEMO_KEY, [])).slice(0, 30));
      addWish(w, false);
      return;
    }

    sending = true;
    submitBtn.disabled = true;
    setStatus('Приклеюємо…');
    fetch(WISHES_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // без preflight-запиту CORS
      body: JSON.stringify({ text: text, name: name, website: hpEl.value })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) {
          addWish(d.wish || { id: 'tmp-' + Date.now(), text: text, name: name }, !!d.pending);
        } else if (d && d.error === 'bad_words') {
          setStatus('Схоже, тут є слова, які ми не можемо приклеїти на стіну. Спробуй переформулювати 🙏', 'error');
        } else if (d && d.error === 'rate') {
          setStatus('Зараз дуже багато побажань. Спробуй за хвилинку ⏳', 'error');
        } else if (d && d.error === 'too_short') {
          setStatus('Напиши хоча б кілька слів ✍️', 'error');
        } else {
          throw new Error('Bad response');
        }
      })
      .catch(function (err) {
        console.error('[wall]', err);
        setStatus('Не вдалося надіслати. Перевір інтернет і спробуй ще раз 🙏', 'error');
      })
      .then(function () {
        sending = false;
        submitBtn.disabled = false;
      });
  });

  $('wallRefresh').addEventListener('click', function () { fetchWishes(false); });

  /* ---------- Стани ---------- */

  function show() {
    demoEl.hidden = !isDemo;
    setStatus('');
    updateCount();
    fetchWishes(false);
    stop();
    if (!isDemo) {
      timer = window.setInterval(function () {
        if (!document.hidden) fetchWishes(true);
      }, REFRESH_MS);
    }
  }

  function stop() {
    if (timer) window.clearInterval(timer);
    timer = null;
  }

  window.WishWall = { show: show, stop: stop };
})();
