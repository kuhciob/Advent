/**
 * «Стіна побажань» Project Me Club — бекенд на Google Apps Script.
 *
 * Як підключити (детально — у README, розділ «Стіна побажань»):
 *  1. Створи Google Таблицю → Розширення → Apps Script.
 *  2. Встав цей код замість вмісту Code.gs і збережи.
 *  3. Розгорнути → Нове розгортання → Тип «Вебзастосунок»:
 *       Виконувати від імені: «Я»;  Хто має доступ: «Будь-хто».
 *  4. Скопіюй URL вебзастосунку (…/exec) і встав у js/wall.js → WISHES_API_URL.
 *
 * Модерація — прямо в таблиці, аркуш «Побажання»:
 *  • «Сховати» (галочка) — побажання зникає зі стіни.
 *  • Якщо PREMODERATION = true, на стіні показуються лише рядки з галочкою «Показати».
 * Після зміни коду: Розгорнути → Керувати розгортаннями → Редагувати → Нова версія.
 */

const SHEET_NAME = 'Побажання';
const PREMODERATION = false; // true — спершу схвалюєш у таблиці, потім побажання з'являється
const MAX_TEXT = 200;
const MAX_NAME = 40;
const MAX_RETURN = 300;           // скільки останніх побажань віддавати на стіну
const RATE_LIMIT_PER_MIN = 30;    // загальний ліміт нових побажань за хвилину (захист від спаму)

// Базовий фільтр лайки (корені слів). Решту модеруй галочкою «Сховати».
const BAD_WORDS = /(хуй|хуя|хує|хуї|хуе[вн]|пизд|бляд|блят|мудак|мудил|гандон|підор|підар|пидор|пидар|шлюх|залуп|йобан|йоба)|(^|[^а-яіїєґё]|за|ви|від|на|по|до|у|під|роз|з|при)(еб|єб|їб)(ат|ан|ал|ну|ло)|(^|[^а-яіїєґё])(сук[аиуі]|сучар[а-яіїєґё]*|курв[аиі])(?![а-яіїєґё])/i;

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Час', 'Побажання', 'Ім’я', 'Сховати', 'Показати']);
    sh.setFrozenRows(1);
    sh.getRange('A1:E1').setFontWeight('bold');
    sh.setColumnWidth(2, 420);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

// Щоб текст на кшталт «=…» не став формулою в таблиці
function safeCell_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** GET — список побажань для стіни */
function doGet() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return json_({ ok: true, wishes: [] });

  const rows = sh.getRange(2, 1, last - 1, 5).getValues();
  const wishes = [];
  for (let i = rows.length - 1; i >= 0 && wishes.length < MAX_RETURN; i--) {
    const [ts, text, name, hidden, approved] = rows[i];
    if (!text || hidden === true) continue;
    if (PREMODERATION && approved !== true) continue;
    wishes.push({
      id: i + 2, // номер рядка
      text: String(text),
      name: String(name || ''),
      ts: ts instanceof Date ? ts.getTime() : null
    });
  }
  return json_({ ok: true, premoderation: PREMODERATION, wishes: wishes });
}

/** POST — нове побажання (тіло: JSON як text/plain) */
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { /* порожньо */ }

  if (body.website) return json_({ ok: true, pending: true }); // honeypot: бот заповнив приховане поле

  const text = clean_(body.text, MAX_TEXT);
  const name = clean_(body.name, MAX_NAME).replace(/\n/g, ' ');
  if (text.length < 3) return json_({ ok: false, error: 'too_short' });
  if (BAD_WORDS.test(text) || BAD_WORDS.test(name)) return json_({ ok: false, error: 'bad_words' });

  // Простий загальний ліміт частоти
  const cache = CacheService.getScriptCache();
  const key = 'rate_' + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(key) || 0);
  if (count >= RATE_LIMIT_PER_MIN) return json_({ ok: false, error: 'rate' });
  cache.put(key, String(count + 1), 120);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getSheet_();
    sh.appendRow([new Date(), safeCell_(text), safeCell_(name), false, false]);
    const row = sh.getLastRow();
    sh.getRange(row, 4, 1, 2).insertCheckboxes();
    return json_({
      ok: true,
      pending: PREMODERATION,
      wish: { id: row, text: text, name: name, ts: Date.now() }
    });
  } finally {
    lock.releaseLock();
  }
}
