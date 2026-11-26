"""Перетворює експорт контент-плану адвенту з Notion (Markdown-таблиця) на дані для сайту.

Запуск (з кореня репозиторію):
    python tools/advent_import.py "Year Wrap ....md"

Результат — у папці private/ (вона в .gitignore, у репозиторій НЕ потрапляє):
    private/advent-content.csv   — імпорт у Google Таблицю (аркуш «Адвент»)
    private/advent.local.json    — для локального тестування сторінки advent/ без Таблиці

Скрипт лише адаптує технічне форматування (Notion → розмітка сайту) і нічого не вигадує:
    **жирний**  __курсив__  ||прихований текст||  [текст](посилання)
    [[copy:КОД]] або [[copy:ТЕКСТ|Підпис кнопки]] — кнопка копіювання
    [[button:Підпис|посилання]] — окремим рядком, велика кнопка
    ![опис](посилання-на-картинку) — окремим рядком, зображення
    {winner} — підставляється ім'я переможця з колонки winner
Колонка note — внутрішні нотатки з Notion, на сайт не віддається.
"""

import csv
import json
import re
import sys
from pathlib import Path

YEAR = 2026
OPEN_TIME = '00:00'  # о котрій (за Києвом) відкривається комірка за замовчуванням

COLUMNS = ['day', 'opens', 'type', 'title', 'logo', 'cover', 'body',
           'status', 'winner', 'result', 'hidden', 'note']

ROW_START = re.compile(r'^\|\s*(\d{2})\.(\d{2})\s*\|')
CELL_SPLIT = re.compile(r'(?<!\|)\|(?!\|)')  # «|» між колонками, але не «||спойлер||»


def read_rows(path):
    text = Path(path).read_text(encoding='utf-8')
    rows, cur = [], None
    for line in text.splitlines():
        if ROW_START.match(line):
            if cur is not None:
                rows.append(cur)
            cur = line
        elif cur is not None:
            if line.startswith('![') or line.startswith('# '):
                rows.append(cur)
                cur = None
            else:
                cur += '\n' + line
    if cur is not None:
        rows.append(cur)

    parsed = []
    for raw in rows:
        body = raw.strip()
        if body.startswith('|'):
            body = body[1:]
        if body.endswith('|'):
            body = body[:-1]
        cells = [c.strip() for c in CELL_SPLIT.split(body)]
        cells += [''] * (8 - len(cells))
        date, event, notes, branch, chat = cells[0], cells[1], cells[2], cells[3], cells[4]
        m = re.match(r'(\d{2})\.(\d{2})', date)
        parsed.append({
            'dd': int(m.group(1)), 'mm': int(m.group(2)),
            'event': event, 'notes': notes, 'chat': chat,
        })
    return parsed


def fix_bold(s):
    # Notion: «**Заголовок:\n  •** пункт» → «**Заголовок:**\n• пункт»
    s = re.sub(r'\n([ \t]*)•\*\*', r'**\n\1•', s)
    # жирне на кілька рядків → жирне в кожному рядку окремо
    def per_line(m):
        inner = m.group(1)
        if '\n' not in inner:
            return m.group(0)
        out = []
        for ln in inner.split('\n'):
            core = ln.strip()
            out.append('**' + core + '**' if core else '')
        return '\n'.join(out)
    return re.sub(r'\*\*(.+?)\*\*', per_line, s, flags=re.S)


PROMO = re.compile(r'(?<![\w/=.\[:])(PROJECT\.ME(?:\d+|\.[A-Z]+))(?![\w.])')


def adapt(s):
    s = s.replace('\r', '')
    s = '\n'.join(ln.rstrip() for ln in s.split('\n'))
    s = fix_bold(s)
    s = re.sub(r'^[ \t]+(•|\d+\.)', r'\1', s, flags=re.M)     # відступи перед пунктами
    s = re.sub(r'\*\*(PROJECT\.ME(?:\d+|\.[A-Z]+))\*\*', r'\1', s)          # код окремою кнопкою, без жирного
    s = PROMO.sub(r'[[copy:\1]]', s)
    s = re.sub(r'(промокодом\s+)(project_me)\b', r'\1[[copy:\2]]', s)
    s = s.replace('[ім’я]', '{winner}').replace("[ім'я]", '{winner}')
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


def add_prompt_copy(s):
    """У добірках промптів — кнопка «Скопіювати промпт» під кожним пунктом «-…»."""
    out = []
    for para in s.split('\n\n'):
        out.append(para)
        m = re.match(r'^\s*[-—–]\s*(?:\*\*[^*]+\*\*\s*)?(.+)$', para, flags=re.S)
        if m and '\n' not in para.strip() and len(m.group(1)) > 80:
            prompt = m.group(1).strip().replace('|', '/').replace(']]', '] ]')
            out.append('[[copy:' + prompt + '|Скопіювати промпт]]')
    return '\n\n'.join(out)


def guess_type(notes, body):
    t = (notes + ' ' + body).lower()
    if 'розіграш' in t or 'розіграємо' in t or 'оберемо переможця' in t:
        return 'raffle'
    if re.search(r'PROJECT\.ME', notes + ' ' + body):
        return 'promo'
    if 'промпт' in t:
        return 'prompts'
    if 'заставк' in t:
        return 'wallpaper'
    if 'запис' in t or 'вебінар' in t or 'майстер-клас' in t:
        return 'video'
    if 'передбачен' in t:
        return 'special'
    if 'project.me' in t.replace('project.me.club', '') or 'промокод' in t:
        return 'promo'
    return 'gift'


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    rows = read_rows(sys.argv[1])

    cells, results = {}, {}
    for r in rows:
        ev = r['event'].lower()
        win = re.search(r'переможця\s+комірки\s+(\d+)', ev)
        if win:
            results[int(win.group(1))] = adapt(r['chat'])
            continue
        if ev.strip() != 'адвент':
            continue
        m = re.search(r'комірк[аиу]\s*(\d+)', r['chat'])
        day = int(m.group(1)) if m else (1 if 'першу комірку' in r['chat'] else None)
        if day is None:
            print('! не вдалося визначити номер комірки:', r['dd'], r['mm'], r['chat'][:40])
            continue
        body = adapt(r['chat'])
        typ = guess_type(r['notes'], r['chat'])
        if typ == 'prompts':
            body = add_prompt_copy(body)
        if typ == 'special':
            body += '\n\n[[button:Отримати передбачення ✨|../]]'
        cells[day] = {
            'day': day,
            'opens': '%04d-%02d-%02d %s' % (YEAR, r['mm'], r['dd'], OPEN_TIME),
            'type': typ,
            'title': '',
            'logo': '',
            'cover': False,
            'body': body,
            'status': 'active' if typ == 'raffle' else '',
            'winner': '',
            'result': '',
            'hidden': False,
            'note': re.sub(r'\s+', ' ', r['notes'].replace('**', '')).strip(),
        }

    for day, text in results.items():
        if day in cells:
            cells[day]['result'] = text
        else:
            print('! результат для неіснуючої комірки', day)

    ordered = [cells[d] for d in sorted(cells)]
    missing = [d for d in range(1, 25) if d not in cells]

    out = Path('private')
    out.mkdir(exist_ok=True)
    with open(out / 'advent-content.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for c in ordered:
            row = dict(c)
            row['cover'] = 'TRUE' if c['cover'] else 'FALSE'
            row['hidden'] = 'TRUE' if c['hidden'] else 'FALSE'
            w.writerow(row)
    with open(out / 'advent.local.json', 'w', encoding='utf-8') as f:
        json.dump(ordered, f, ensure_ascii=False, indent=1)

    print('Комірок:', len(ordered), '| результатів розіграшів:', len(results))
    if missing:
        print('Немає комірок:', missing)
    for c in ordered:
        flags = []
        if len(c['body']) < 40:
            flags.append('порожній текст')
        if re.search(r'\[\.|\[промокод\]|\[додати|\[приєднатися', c['body'] + c['result']):
            flags.append('є заглушка')
        print('  %02d  %s  %-9s %s' % (c['day'], c['opens'], c['type'], ', '.join(flags)))
    print('Готово → private/advent-content.csv, private/advent.local.json')


if __name__ == '__main__':
    main()
