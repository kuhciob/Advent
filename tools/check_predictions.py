"""Перевірка бази передбачень data/predictions.json.

Запуск:  python tools/check_predictions.py
Перевіряє: унікальність id і текстів, схожі тексти, довжину (1–3 речення),
заборонені фрази, ймовірні родові форми («ти зробив/зробила»), дати, баланс категорій.
"""
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "predictions.json"

MAX_CHARS = 260
SIMILARITY = 0.72

BANNED = [
    "на тебе чекає успіх", "тебе чекає успіх", "успіх чекає", "гарантовано", "гарантую",
    "обов'язково", "обов’язково", "100%", "неодмінно", "100 відсотків",
    "хвороб", "смерт", "помреш", "втратиш", "розлуч", "звільнять", "банкрут", "аварі",
]
# Ймовірні родові форми минулого часу після «ти» / «сам» / «сама»
GENDERED = re.compile(
    r"\b(ти|тобі здалося, що ти)\s+(\w+(?:в|ла|лася|вся|ний|на))\b|\b(сам|сама|готовий|готова|рад|рада)\b",
    re.IGNORECASE,
)
DATE_LIKE = re.compile(
    r"\b(\d{1,2}\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)"
    r"|(січні|лютому|березні|квітні|травні|червні|липні|серпні|вересні|жовтні|листопаді|грудні))\b",
    re.IGNORECASE,
)
# Слова, що закінчуються на -ла/-в, але не є дієсловами минулого часу (щоб не шуміти)
GENDER_ALLOW = {"ти нова", "ти справжня", "ти чудова"}


def norm(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def sentences(text: str) -> int:
    parts = [p for p in re.split(r"(?<=[.!?…])\s+", text.strip()) if p]
    return len(parts)


def main() -> int:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    items = data["predictions"]
    cats = data.get("categories", {})
    errors, warnings = [], []

    ids = Counter(p["id"] for p in items)
    for i, n in ids.items():
        if n > 1:
            errors.append(f"id {i} повторюється {n} разів")

    seen = {}
    for p in items:
        key = norm(p["text"])
        if key in seen:
            errors.append(f"#{p['id']} дублює #{seen[key]}")
        seen[key] = p["id"]
        if p.get("category") not in cats:
            errors.append(f"#{p['id']}: невідома категорія {p.get('category')!r}")

        t = p["text"]
        low = t.lower()
        if len(t) > MAX_CHARS:
            warnings.append(f"#{p['id']}: задовге ({len(t)} симв.)")
        n_sent = sentences(t)
        if n_sent > 3:
            warnings.append(f"#{p['id']}: {n_sent} речень")
        for b in BANNED:
            if b in low:
                errors.append(f"#{p['id']}: заборонене «{b}»")
        m = GENDERED.search(t)
        if m and m.group(0).lower() not in GENDER_ALLOW:
            warnings.append(f"#{p['id']}: можлива родова форма «{m.group(0)}»")
        if DATE_LIKE.search(t):
            warnings.append(f"#{p['id']}: схоже на конкретну дату/місяць")
        if "ти" not in re.findall(r"\w+", low) and not re.search(r"\b(тебе|тобі|твій|твоя|твоє|твої|тобою|твого|твоїх|твоєму|твоїй|твою)\b", low) and not re.search(r"\w+(еш|иш|ешся|ишся)\b", low):
            warnings.append(f"#{p['id']}: немає звернення на «ти»")

    # Схожі тексти
    normed = [(p["id"], norm(p["text"])) for p in items]
    for a in range(len(normed)):
        for b in range(a + 1, len(normed)):
            r = SequenceMatcher(None, normed[a][1], normed[b][1]).ratio()
            if r >= SIMILARITY:
                warnings.append(f"#{normed[a][0]} і #{normed[b][0]} схожі ({r:.2f})")

    by_cat = Counter(p.get("category") for p in items)
    print(f"Усього: {len(items)}")
    for k, title in cats.items():
        print(f"  {title:<28} {by_cat.get(k, 0)}")
    print()
    for e in errors:
        print("ПОМИЛКА:", e)
    for w in warnings:
        print("увага:  ", w)
    print(f"\nПомилок: {len(errors)}, попереджень: {len(warnings)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
