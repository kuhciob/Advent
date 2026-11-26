/**
 * Адвент-календар Project Me Club — бекенд на Google Apps Script.
 *
 * Навіщо: контент комірок лежить у закритій Google Таблиці, а сайт отримує
 * текст комірки лише тоді, коли вона вже відкрилася за київським часом.
 * Перевірка часу — на сервері, тож переведений годинник на телефоні нічого не відкриє.
 *
 * Як підключити (детально — README, розділ «Адвент-календар»):
 *  1. Створи нову Google Таблицю (доступ — лише для команди, НЕ «всім, у кого є посилання»).
 *  2. Розширення → Apps Script → встав цей код замість Code.gs → збережи.
 *  3. Обери функцію setup → «Виконати» → дозволь доступ.
 *     Вона створить аркуш «Адвент», поставить часовий пояс Києва
 *     і згенерує секретний ключ тестування (дивись «Журнал виконання»).
 *  4. Файл → Імпорт → Завантажити → private/advent-content.csv →
 *     «Замінити поточний аркуш» (аркуш «Адвент» має бути відкритий).
 *  5. Розгорнути → Нове розгортання → «Вебзастосунок»:
 *       Виконувати від імені: «Я»;  Хто має доступ: «Будь-хто».
 *  6. URL вебзастосунку (…/exec) — у advent/js/advent.js → ADVENT_API_URL.
 *
 * Тестування до запуску:  …/advent/?preview=КЛЮЧ            — усі комірки відкриті
 *                          …/advent/?preview=КЛЮЧ&at=2026-12-05T10:00  — «як буде 5 грудня о 10:00»
 * Після зміни КОДУ: Розгорнути → Керувати розгортаннями → Редагувати → Нова версія.
 * Зміни ТЕКСТІВ у таблиці з'являються на сайті самі (до ~30 с).
 */

const SHEET_NAME = 'Адвент';
const HEADERS = ['day', 'opens', 'type', 'title', 'logo', 'cover', 'body',
                 'status', 'winner', 'result', 'hidden', 'note'];
const PUBLIC_FIELDS = ['type', 'title', 'logo', 'cover', 'body', 'status', 'winner', 'result'];
const CACHE_SEC = 30;
const KYIV_OFFSET_H = 2; // у грудні Київ = UTC+2 (літнього часу немає)

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Europe/Kiev');
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME, 0);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  sh.setColumnWidth(7, 480);
  sh.setColumnWidth(10, 320);

  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('PREVIEW_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('PREVIEW_KEY', key);
  }
  Logger.log('Ключ тестування: ' + key + '   → …/advent/?preview=' + key);
}

/** Новий ключ тестування (старий перестане працювати) */
function resetPreviewKey() {
  PropertiesService.getScriptProperties().deleteProperty('PREVIEW_KEY');
  setup();
}

function bool_(v) {
  if (v === true) return true;
  return /^(true|так|1|yes|x|\+)$/i.test(String(v || '').trim());
}

/** Час відкриття → мілісекунди UTC. Рядок трактуємо як київський час. */
function opensAt_(v) {
  if (v instanceof Date) return v.getTime(); // таблиця в поясі Києва (див. setup)
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1], m[2] - 1, +m[3], (+m[4] || 0) - KYIV_OFFSET_H, +m[5] || 0);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[3], m[2] - 1, +m[1], (+m[4] || 0) - KYIV_OFFSET_H, +m[5] || 0);
  return null;
}

function readCells_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getValues();
  const head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const cells = [];
  for (let r = 1; r < values.length; r++) {
    const row = {};
    head.forEach(function (h, i) { row[h] = values[r][i]; });
    const day = parseInt(row.day, 10);
    if (!day) continue;
    const c = { day: day, opens: opensAt_(row.opens), hidden: bool_(row.hidden) };
    PUBLIC_FIELDS.forEach(function (f) {
      const v = row[f];
      c[f] = (f === 'cover') ? bool_(v) : String(v == null ? '' : v).trim();
    });
    cells.push(c);
  }
  cells.sort(function (a, b) { return a.day - b.day; });
  return cells;
}

function json_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const key = PropertiesService.getScriptProperties().getProperty('PREVIEW_KEY');
  const preview = !!(key && p.preview && String(p.preview) === key);

  let now = Date.now();
  let openAll = preview;
  if (preview && p.at) {
    const t = opensAt_(String(p.at).replace('T', ' '));
    if (t) { now = t; openAll = false; }
  }

  // Звичайні відвідувачі отримують кешовану відповідь (≤30 с), тестувальники — завжди свіжу
  const cache = CacheService.getScriptCache();
  const cacheKey = 'advent_' + Math.floor(now / (CACHE_SEC * 1000));
  let cellsJson = preview ? null : cache.get(cacheKey);

  if (!cellsJson) {
    const out = readCells_().map(function (c) {
      const isOpen = openAll || (!c.hidden && c.opens != null && c.opens <= now);
      const item = { day: c.day, opens: c.opens, open: isOpen };
      if (preview && c.hidden) item.hidden = true;
      if (isOpen) PUBLIC_FIELDS.forEach(function (f) { item[f] = c[f]; });
      return item;
    });
    cellsJson = JSON.stringify(out);
    if (!preview) {
      try { cache.put(cacheKey, cellsJson, CACHE_SEC + 5); } catch (err) { /* завеликий — без кешу */ }
    }
  }

  return json_('{"ok":true,"now":' + now + ',"preview":' + preview + ',"cells":' + cellsJson + '}');
}
