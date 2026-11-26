/* Адвент-календар Project Me Club.
   Контент комірок — у закритій Google Таблиці; Apps Script (tools/advent-backend.gs)
   віддає текст лише тих комірок, що вже відкрилися за київським часом.
   Тестування: ?preview=КЛЮЧ (усі комірки) або ?preview=КЛЮЧ&at=2026-12-05T10:00 */
(function () {
  'use strict';

  // URL вебзастосунку Apps Script (…/exec). Як отримати — README, розділ «Адвент-календар».
  var ADVENT_API_URL = 'https://script.google.com/macros/s/AKfycbxd0glWQiWxMK3_j5FvvJ4YDpY0FU4xLAQZXv10hnR_mcf0o6JTfrsZykjJ1XGN-Md8fg/exec';
  // Лише на localhost: файл із tools/advent_import.py (папка private/ у git не потрапляє)
  var LOCAL_URL = '../private/advent.local.json';

  var YEAR = 2026;
  var TOTAL = 24;
  var KYIV_OFFSET = 2 * 3600 * 1000; // у грудні Київ = UTC+2
  var FETCH_TIMEOUT = 15000;
  var MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня',
    'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

  var ICONS = { special: '🔮', raffle: '🏆', promo: '🎟️', video: '🎬', prompts: '✨', wallpaper: '📱', gift: '🎁' };
  var TYPE_TITLES = {
    special: 'Сюрприз на початок грудня', raffle: 'Розіграш', promo: 'Подарунок від партнера',
    video: 'Запис для тебе', prompts: 'Добірка промптів', wallpaper: 'Святкові заставки', gift: 'Подарунок'
  };
  // Форма вікон — трохи асиметрії, як у старому будинку
  var SHAPES = ['arch', 'rect', 'arch', 'rect', 'round', 'arch', 'rect', 'arch',
    'arch', 'rect', 'twin', 'rect', 'rect', 'arch', 'rect', 'arch',
    'arch', 'round', 'rect', 'arch', 'rect', 'arch', 'twin', 'arch'];
  var SHUTTERS = { 1: 1, 7: 1, 12: 1, 13: 1, 22: 1 };
  var BALCONY = { 4: 1, 9: 1, 15: 1, 21: 1 };

  function $(id) { return document.getElementById(id); }

  var params = (function () {
    var out = {};
    window.location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      var k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      out[k] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return out;
  })();

  var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  var isPreview = 'preview' in params && (!!params.preview || isLocalHost);
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var SUFFIX = isPreview ? ':preview' : '';
  var KEY_OPENED = 'pmc2027:advent:opened' + SUFFIX;
  var KEY_UNWRAP = 'pmc2027:advent:unwrapped' + SUFFIX;
  var KEY_CACHE = 'pmc2027:advent:cache';

  var listEl = $('windows');
  var statusEl = $('advStatus');
  var progressEl = $('advProgress');
  var modal = $('modal');
  var modalCard = $('modalCard');
  var modalBody = $('modalBody');
  var toastEl = $('toast');

  var cells = {};          // day → дані комірки
  var winEls = {};         // day → кнопка-вікно
  var offset = 0;          // серверний час − час пристрою
  var loaded = false;
  var source = 'none';     // api | local | cache | none
  var refreshTimer = null;
  var mem = {};

  /* ---------- Сховище ---------- */

  function load(key, fallback) {
    try {
      var v = JSON.parse(window.localStorage.getItem(key));
      if (v !== null && v !== undefined) return v;
    } catch (e) { /* немає доступу */ }
    return key in mem ? mem[key] : fallback;
  }

  function store(key, value) {
    mem[key] = value;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватний режим */ }
  }

  var opened = toSet(load(KEY_OPENED, []));
  var unwrapped = toSet(load(KEY_UNWRAP, []));

  function toSet(arr) {
    var s = {};
    (Array.isArray(arr) ? arr : []).forEach(function (d) { s[d] = true; });
    return s;
  }
  function setToArr(s) { return Object.keys(s).map(Number).sort(function (a, b) { return a - b; }); }

  /* ---------- Час (Київ) ---------- */

  function now() { return Date.now() + offset; }

  function simulatedNow() {
    if (!isPreview || !params.at) return null;
    var m = String(params.at).match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    return Date.UTC(+m[1], m[2] - 1, +m[3], +m[4] || 0, +m[5] || 0) - KYIV_OFFSET;
  }

  function kyiv(ms) {
    var d = new Date(ms + KYIV_OFFSET);
    return { day: d.getUTCDate(), month: d.getUTCMonth(), h: d.getUTCHours(), m: d.getUTCMinutes() };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(ms) { var k = kyiv(ms); return k.day + ' ' + MONTHS[k.month]; }
  function fmtDateTime(ms) { var k = kyiv(ms); return fmtDate(ms) + ' о ' + pad(k.h) + ':' + pad(k.m); }
  function defaultOpens(day) { return Date.UTC(YEAR, 11, day, 0, 0) - KYIV_OFFSET; }

  function plural(n, one, few, many) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  }

  function fmtLeft(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor(s % 86400 / 3600);
    var m = Math.floor(s % 3600 / 60);
    var sec = s % 60;
    var hms = pad(h) + ':' + pad(m) + ':' + pad(sec);
    return d > 0 ? d + ' ' + plural(d, 'день', 'дні', 'днів') + ' ' + hms : hms;
  }

  /* ---------- Тост ---------- */

  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, text.length); } catch (e) { /* iOS */ }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function onCopy(value, btn) {
    copyText(value).then(function () {
      toast(value.length > 30 ? 'Скопійовано ✨' : 'Скопійовано: ' + value + ' ✨');
      btn.classList.add('is-copied');
      window.setTimeout(function () { btn.classList.remove('is-copied'); }, 1600);
    }, function () { toast('Не вдалося скопіювати 😔 Спробуй виділити текст вручну'); });
  }

  /* ---------- Будинок ---------- */

  function buildWindows() {
    for (var day = 1; day <= TOTAL; day++) {
      var li = document.createElement('li');
      li.className = 'win-slot';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'win win--' + SHAPES[day - 1] + (SHUTTERS[day] ? ' has-shutters' : '') + (BALCONY[day] ? ' has-balcony' : '');
      b.dataset.day = day;
      b.style.setProperty('--i', day);

      var num = document.createElement('span');
      num.className = 'win-num';
      num.textContent = pad(day);
      b.appendChild(num);

      var frame = document.createElement('span');
      frame.className = 'win-frame';
      frame.innerHTML = '<span class="win-pane"><span class="win-inside"></span>' +
        '<span class="win-leaf win-leaf--l"></span><span class="win-leaf win-leaf--r"></span></span>';
      b.appendChild(frame);

      var sill = document.createElement('span');
      sill.className = 'win-sill';
      b.appendChild(sill);

      b.addEventListener('click', onWindowClick);
      li.appendChild(b);
      listEl.appendChild(li);
      winEls[day] = b;
    }
  }

  function cellFor(day) {
    return cells[day] || { day: day, opens: defaultOpens(day), open: false };
  }

  function isNew(c, t) {
    return c.open && c.opens && c.opens <= t && t - c.opens < 24 * 3600 * 1000;
  }

  function paintWindow(day) {
    var c = cellFor(day);
    var b = winEls[day];
    var t = now();
    var isOpened = c.open && opened[day];
    b.classList.toggle('is-locked', !c.open);
    b.classList.toggle('is-ready', c.open && !opened[day]);
    b.classList.toggle('is-opened', !!isOpened);
    b.classList.toggle('is-new', !!(isNew(c, t) && !opened[day]));

    var inside = b.querySelector('.win-inside');
    inside.textContent = '';
    if (c.open) {
      if (c.logo) {
        var img = document.createElement('img');
        img.src = c.logo; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.onerror = function () { inside.textContent = ICONS[c.type] || ICONS.gift; };
        inside.appendChild(img);
      } else {
        inside.textContent = ICONS[c.type] || ICONS.gift;
      }
    }

    var label = 'Комірка ' + day + ', ';
    if (!c.open) label += c.opens ? 'відкриється ' + fmtDateTime(c.opens) : 'ще зачинена';
    else label += opened[day] ? 'переглянуто' : 'вже можна відкрити';
    b.setAttribute('aria-label', label);
  }

  function paintAll() {
    for (var d = 1; d <= TOTAL; d++) paintWindow(d);
    updateProgress();
  }

  function openCount() {
    var n = 0;
    for (var d = 1; d <= TOTAL; d++) if (cellFor(d).open) n++;
    return n;
  }

  function nextOpening() {
    var t = now(), best = null;
    for (var d = 1; d <= TOTAL; d++) {
      var c = cellFor(d);
      if (!c.open && c.opens && c.opens > t && (!best || c.opens < best.opens)) best = c;
    }
    return best;
  }

  function updateProgress() {
    var avail = openCount();
    var seen = 0;
    for (var d = 1; d <= TOTAL; d++) if (cellFor(d).open && opened[d]) seen++;
    progressEl.textContent = avail ? 'Переглянуто: ' + seen + ' з ' + avail + ' відкритих' : '';
  }

  function tickStatus() {
    if (!loaded) return;
    var avail = openCount();
    var next = nextOpening();
    var t = now();
    var text;
    if (!next) {
      text = avail >= TOTAL ? 'Усі ' + TOTAL + ' комірок уже відкрито 💗' : 'Відкрито комірок: ' + avail + ' з ' + TOTAL;
    } else if (avail === 0) {
      text = 'Перша комірка відкриється ' + fmtDate(next.opens) + ' · через ' + fmtLeft(next.opens - t);
    } else {
      text = 'Відкрито ' + avail + ' з ' + TOTAL + ' · наступна через ' + fmtLeft(next.opens - t);
    }
    statusEl.textContent = text;

    if (next && next.opens <= t) onOpeningReached();
  }

  var reachedLock = false;
  function onOpeningReached() {
    if (reachedLock) return;
    reachedLock = true;
    // Невелика випадкова затримка, щоб усі не стукали в Таблицю в одну секунду
    var delay = source === 'api' ? 1500 + Math.random() * 12000 : 300;
    window.setTimeout(function () {
      refresh().then(function () { reachedLock = false; });
    }, delay);
  }

  /* ---------- Дані ---------- */

  function fetchJson(url) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT);
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { window.clearTimeout(timer); return data; },
        function (err) { window.clearTimeout(timer); throw err; });
  }

  function normalize(c) {
    var day = parseInt(c.day, 10);
    if (!(day >= 1 && day <= TOTAL)) return null;
    return {
      day: day,
      opens: typeof c.opens === 'number' ? c.opens : parseOpens(c.opens) || defaultOpens(day),
      open: !!c.open,
      hidden: !!c.hidden,
      type: String(c.type || 'gift'),
      title: String(c.title || ''),
      logo: String(c.logo || ''),
      cover: c.cover === true || /^(true|так|1)$/i.test(String(c.cover || '')),
      body: String(c.body || ''),
      status: String(c.status || '').toLowerCase(),
      winner: String(c.winner || ''),
      result: String(c.result || '')
    };
  }

  function parseOpens(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4] || 0, +m[5] || 0) - KYIV_OFFSET : null;
  }

  function applyCells(list) {
    var next = {};
    (list || []).forEach(function (raw) {
      var c = normalize(raw);
      if (c) next[c.day] = c;
    });
    cells = next;
  }

  function fromApi() {
    var url = ADVENT_API_URL + (ADVENT_API_URL.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now();
    if (isPreview && params.preview) url += '&preview=' + encodeURIComponent(params.preview);
    if (isPreview && params.at) url += '&at=' + encodeURIComponent(params.at);
    return fetchJson(url).then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.cells)) throw new Error('bad data');
      if (isPreview && params.preview && !data.preview) toast('Ключ тестування не підходить — показуємо звичайний режим');
      offset = typeof data.now === 'number' ? data.now - Date.now() : 0; // з ?at= сервер повертає «симульований» час
      applyCells(data.cells);
      source = 'api';
      if (!data.preview) {
        store(KEY_CACHE, { savedAt: Date.now(), cells: data.cells.filter(function (c) { return c.open; }) });
      }
    });
  }

  // Локальна перевірка: ті самі правила відкриття, що й на сервері
  function fromLocal() {
    return fetchJson(LOCAL_URL + '?t=' + Date.now()).then(function (rows) {
      var sim = simulatedNow();
      if (sim) offset = sim - Date.now();
      var openAll = isPreview && !sim;
      var t = now();
      applyCells(rows.map(function (r) {
        var opens = parseOpens(r.opens) || defaultOpens(r.day);
        var hidden = r.hidden === true || /^(true|так|1)$/i.test(String(r.hidden || ''));
        var isOpen = openAll || (!hidden && opens <= t);
        var c = { day: r.day, opens: opens, open: isOpen, hidden: isPreview && hidden };
        if (isOpen) {
          ['type', 'title', 'logo', 'cover', 'body', 'status', 'winner', 'result'].forEach(function (f) { c[f] = r[f]; });
        }
        return c;
      }));
      source = 'local';
    });
  }

  function fromCache() {
    var cached = load(KEY_CACHE, null);
    if (!cached || !Array.isArray(cached.cells)) return false;
    applyCells(cached.cells);
    source = 'cache';
    return true;
  }

  function refresh() {
    var p;
    if (ADVENT_API_URL) p = fromApi();
    else if (isLocalHost) p = fromLocal();
    else p = Promise.reject(new Error('no source'));

    return p.then(function () {
      loaded = true;
      paintAll();
      tickStatus();
    }, function () {
      if (!loaded) {
        if (!isPreview && fromCache()) toast('Немає зв’язку — показуємо збережені комірки');
        loaded = true;
        paintAll();
        tickStatus();
        if (ADVENT_API_URL) statusEl.textContent = 'Не вдалося оновити календар. Перевір інтернет і онови сторінку 🙏';
      }
    });
  }

  /* ---------- Відкриття комірки ---------- */

  function onWindowClick(e) {
    var b = e.currentTarget;
    var day = +b.dataset.day;
    var c = cellFor(day);
    if (!c.open) {
      b.classList.remove('is-shake');
      void b.offsetWidth;
      b.classList.add('is-shake');
      toast(loaded && c.opens
        ? 'Комірка ' + pad(day) + ' відкриється ' + fmtDateTime(c.opens) + ' 🔒'
        : 'Ця комірка ще зачинена 🔒');
      return;
    }
    var first = !opened[day];
    if (first) {
      opened[day] = true;
      store(KEY_OPENED, setToArr(opened));
      if (window.Sky && !reduceMotion) {
        var r = b.getBoundingClientRect();
        window.Sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 34, power: 5 });
      }
    }
    paintWindow(day);
    updateProgress();
    window.setTimeout(function () { openModal(day, b); }, first && !reduceMotion ? 520 : 0);
  }

  var HEAD_RE = /^🎁\s*(?:\*\*)?\s*комірка\s*\d+\s*(?:\*\*)?\s*(?:[—–-]\s*(.+))?$/i;

  function splitHead(body) {
    var lines = body.split('\n');
    var sub = '';
    if (lines.length && HEAD_RE.test(lines[0].trim())) {
      sub = (lines[0].trim().match(HEAD_RE)[1] || '').trim();
      lines.shift();
    }
    return { sub: sub, body: lines.join('\n').replace(/^\s+/, '') };
  }

  var lastFocus = null;
  var skipPop = false;

  // Окремий запис в історії: системна кнопка «Назад» (Android, Telegram) закриває вікно, а не сторінку
  function isModalState() {
    try { return !!(window.history.state && window.history.state.adventModal); } catch (e) { return false; }
  }
  function ensureHistoryEntry() {
    if (isModalState() || !window.history || !window.history.pushState) return;
    try { window.history.pushState({ adventModal: true }, ''); } catch (e) { /* ігноруємо */ }
  }

  function openModal(day, fromEl) {
    var c = cellFor(day);
    var parts = splitHead(c.body || '');
    lastFocus = fromEl || document.activeElement;

    $('modalNum').textContent = pad(day);
    $('modalKicker').textContent = 'Комірка ' + pad(day) + ' · ' + fmtDate(c.opens);
    $('modalTitle').textContent = c.title || capitalize(parts.sub) || TYPE_TITLES[c.type] || TYPE_TITLES.gift;
    modalBody.textContent = '';

    if (c.hidden) modalBody.appendChild(note('Тестовий режим: комірку приховано галочкою hidden — учасники її поки не бачать.', 'is-test'));

    var content = document.createElement('div');
    content.className = 'modal-content';
    if (parts.body.trim()) {
      window.AdventText.render(parts.body, content, { winner: c.winner, onCopy: onCopy });
    } else {
      content.appendChild(note('Подарунок ще пакуємо — зазирни трохи згодом 🎀'));
    }

    var raffle = raffleBlock(c);
    if (raffle) content.appendChild(raffle);

    if (c.cover && !unwrapped[day]) {
      content.hidden = true;
      modalBody.appendChild(wrapCover(day, content));
    }
    modalBody.appendChild(content);

    modal.hidden = false;
    document.documentElement.classList.add('is-modal-open');
    modalCard.scrollTop = 0;
    modal.scrollTop = 0;
    if (!reduceMotion) {
      modal.classList.remove('is-entering');
      void modal.offsetWidth;
      modal.classList.add('is-entering');
    }
    modalCard.focus({ preventScroll: true });

    if (!skipPop) ensureHistoryEntry();
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function note(text, cls) {
    var p = document.createElement('p');
    p.className = 'modal-note' + (cls ? ' ' + cls : '');
    p.textContent = text;
    return p;
  }

  function raffleBlock(c) {
    var finished = c.status === 'finished' || c.status === 'завершено' || (!!c.winner && c.status !== 'active');
    var active = !finished && (c.status === 'active' || c.status === 'триває');
    if (!finished && !active) return null;

    var box = document.createElement('section');
    box.className = 'raffle ' + (finished ? 'is-finished' : 'is-active');
    var head = document.createElement('p');
    head.className = 'raffle-head';
    head.textContent = finished ? '🏆 Розіграш завершено' : '🎟 Розіграш триває';
    box.appendChild(head);

    if (finished) {
      if (c.result) {
        var res = document.createElement('div');
        res.className = 'raffle-result';
        window.AdventText.render(c.result, res, { winner: c.winner, onCopy: onCopy });
        box.appendChild(res);
      } else if (c.winner) {
        var w = document.createElement('p');
        w.className = 'raffle-winner';
        w.appendChild(document.createTextNode('Переможець: '));
        var s = document.createElement('strong');
        s.textContent = c.winner;
        w.appendChild(s);
        w.appendChild(document.createTextNode(' — вітаємо 💗'));
        box.appendChild(w);
      }
    } else {
      var p = document.createElement('p');
      p.className = 'raffle-sub';
      p.textContent = 'Ім’я переможця з’явиться тут після підбиття підсумків ✨';
      box.appendChild(p);
    }
    return box;
  }

  function wrapCover(day, content) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gift-wrap';
    b.innerHTML = '<span class="gift-ribbon-v" aria-hidden="true"></span><span class="gift-ribbon-h" aria-hidden="true"></span><span class="gift-bow" aria-hidden="true">🎀</span>';
    var label = document.createElement('span');
    label.className = 'gift-label';
    label.textContent = 'Подарунок загорнуто. Натисни, щоб розгорнути';
    b.appendChild(label);
    b.addEventListener('click', function () {
      unwrapped[day] = true;
      store(KEY_UNWRAP, setToArr(unwrapped));
      var r = b.getBoundingClientRect();
      if (window.Sky && !reduceMotion) window.Sky.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 40, power: 6 });
      function done() {
        if (b.parentNode) b.parentNode.removeChild(b);
        content.hidden = false;
        content.classList.add('is-unwrapped');
        modalCard.focus({ preventScroll: true });
      }
      if (reduceMotion) done();
      else { b.classList.add('is-opening'); window.setTimeout(done, 450); }
    });
    return b;
  }

  function closeModal(fromPop) {
    if (modal.hidden) return;
    modal.hidden = true;
    modal.classList.remove('is-entering');
    document.documentElement.classList.remove('is-modal-open');
    if (!fromPop && isModalState()) {
      skipPop = true; // popstate від нашого ж back() не має закрити наступне вікно
      try { window.history.back(); } catch (e) { skipPop = false; }
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  modal.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== modal) {
      if (t.hasAttribute && t.hasAttribute('data-close')) { closeModal(false); return; }
      t = t.parentNode;
    }
  });

  window.addEventListener('popstate', function () {
    if (skipPop) {
      skipPop = false;
      if (!modal.hidden) ensureHistoryEntry(); // вікно встигли відкрити знову
      return;
    }
    if (!modal.hidden) closeModal(true);
  });

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') { closeModal(false); return; }
    if (e.key === 'Tab') {
      var f = modalCard.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]');
      var vis = Array.prototype.filter.call(f, function (n) { return n.offsetParent !== null; });
      if (!vis.length) return;
      var first = vis[0], last = vis[vis.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modalCard)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Старт ---------- */

  function showPreviewBar() {
    if (!isPreview) return;
    var bar = $('previewBar');
    var sim = simulatedNow();
    bar.textContent = sim
      ? 'Режим тестування · час: ' + fmtDateTime(sim) + ' · прогрес окремо від справжнього'
      : 'Режим тестування · усі комірки відкриті · прогрес окремо від справжнього';
    bar.hidden = false;
    document.body.classList.add('has-preview');
  }

  function openFromHash() {
    var m = window.location.hash.match(/^#(\d{1,2})$/);
    if (!m) return;
    var day = +m[1];
    // прибираємо #N, щоб «Назад» закривав вікно, а не відкривав його знову
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignore */ }
    if (day >= 1 && day <= TOTAL && cellFor(day).open) {
      opened[day] = true;
      store(KEY_OPENED, setToArr(opened));
      paintWindow(day);
      updateProgress();
      openModal(day, winEls[day]);
    }
  }

  buildWindows();
  showPreviewBar();
  if (!isPreview) fromCache();
  paintAll();

  refresh().then(openFromHash);
  window.setInterval(tickStatus, 1000);

  // Повернення у вкладку (Telegram часто «присипляє» сторінку) — оновлюємо дані
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !loaded) return;
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 400);
  });
})();
