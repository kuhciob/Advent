"""Збирає ілюстрацію будинку для advent/ з вихідного малюнка.

Запуск (з кореня репозиторію):
    python tools/build_house.py img.png

Що робить:
  1. Додає ще один поверх (дзеркальна копія 2-го), щоб вікон вистачило на 24 комірки.
  2. Обрізає зайве небо по боках.
  3. Знаходить скло вікон і робить дві версії:
       advent/img/house-dark.webp — скло комірок «нічне» (комірка ще зачинена)
       advent/img/house-lit.webp  — усі вікна світяться (як в оригіналі)
  4. Друкує координати вікон (у відсотках) для advent/js/advent.js → WINDOWS.
Вихідний PNG у репозиторій не комітимо (≈10 МБ).
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT_W = 1100              # ширина готової картинки, px
BAND = (1125, 1455)       # поверх, який дублюємо (y від–до в оригіналі)
MIRROR_AXIS = 1097        # вісь симетрії фасаду в оригіналі, px
CROP_X = (330, 1840)      # що лишаємо по ширині (після вставки поверху)
EDGE_KEEP = (515, 1660)   # смужки біля стін фасаду беремо з оригіналу (x до/після)


def add_floor(a):
    """Вставляє дзеркальну копію поверху. Дзеркалимо по осі вікон (MIRROR_AXIS),
    а краї фасаду лишаємо з оригіналу — вони симетричні відносно іншої осі."""
    y0, y1 = BAND
    band = a[y0:y1].astype(np.float32)
    flipped = band[:, ::-1]
    shift = 2 * MIRROR_AXIS - (a.shape[1] - 1)
    mir = band.copy()
    if shift >= 0:
        mir[:, shift:] = flipped[:, :flipped.shape[1] - shift]
    else:
        mir[:, :shift] = flipped[:, -shift:]
    # вага дзеркальної версії: 0 біля стін, 1 у середині (переходи по 30 px у стіні)
    x = np.arange(a.shape[1], dtype=np.float32)
    wl = np.clip((x - EDGE_KEEP[0]) / 30.0, 0, 1)
    wr = np.clip((EDGE_KEEP[1] - x) / 30.0, 0, 1)
    w = (wl * wr)[None, :, None]
    out = (mir * w + band * (1 - w)).astype(np.uint8)
    return np.concatenate([a[:y1], out, a[y1:]], axis=0)


def detect_glass(a):
    rgb = a[..., :3].astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    warm = (r > 190) & (g > 110) & (b < 125) & (r - b > 100)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(warm, iterations=10))
    lab, _ = ndimage.label(m)
    boxes = []
    for i, s in enumerate(ndimage.find_objects(lab)):
        area = int((lab[s] == i + 1).sum())
        if area < 4000:
            continue
        boxes.append([s[1].start, s[0].start, s[1].stop, s[0].stop])  # x0 y0 x1 y1
    # склеюємо подвійні вікна (дві половинки поруч)
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                A, B = boxes[i], boxes[j]
                vert = min(A[3], B[3]) - max(A[1], B[1])
                gap = max(A[0], B[0]) - min(A[2], B[2])
                if vert > 0.6 * min(A[3] - A[1], B[3] - B[1]) and gap < 70 and (A[2] - A[0]) < 70:
                    boxes[i] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3])]
                    boxes.pop(j)
                    merged = True
                    break
                if vert > 0.6 * min(A[3] - A[1], B[3] - B[1]) and gap < 70 and (B[2] - B[0]) < 70:
                    boxes[i] = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3])]
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break
    return boxes


def classify(boxes):
    """Повертає (комірки по порядку 1..24, декор)."""
    boxes = sorted(boxes, key=lambda b: (b[1], b[0]))
    roof = [b for b in boxes if b[1] < 800]
    rest = [b for b in boxes if b[1] >= 800]
    # фасад: вікна заввишки > 100 px; низ: перший поверх; дрібне — лампи й вікно над дверима
    big = [b for b in rest if (b[3] - b[1]) > 100]
    small = [b for b in rest if (b[3] - b[1]) <= 100]
    rows = []
    for b in sorted(big, key=lambda b: b[1]):
        if rows and abs(rows[-1][0][1] - b[1]) < 90:
            rows[-1].append(b)
        else:
            rows.append([b])
    rows = [sorted(r, key=lambda b: b[0]) for r in rows]
    facade = [b for r in rows if len(r) == 4 for b in r]
    ground = [b for r in rows if len(r) == 2 for b in r]
    roof = sorted(roof, key=lambda b: b[0])
    cells = facade + ground + [roof[0], roof[-1]]
    decor = [roof[1]] if len(roof) == 3 else []
    decor += small
    return cells, decor, rows


def darken(a, box, pad=6):
    x0, y0, x1, y1 = box
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(a.shape[1], x1 + pad), min(a.shape[0], y1 + pad)
    reg = a[y0:y1, x0:x1, :3].astype(np.float32)
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    warmth = np.clip((r - b - 45) / 110.0, 0, 1)        # наскільки піксель — тепле скло
    lum = (0.3 * r + 0.55 * g + 0.15 * b) / 255.0
    night = np.stack([
        18 + 70 * lum ** 1.6,
        30 + 85 * lum ** 1.6,
        62 + 110 * lum ** 1.4,
    ], axis=-1)
    w = warmth[..., None]
    reg = reg * (1 - w) + night * w
    a[y0:y1, x0:x1, :3] = np.clip(reg, 0, 255).astype(np.uint8)
    return [x0, y0, x1, y1]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else 'img.png'
    a = np.array(Image.open(src).convert('RGBA'))
    a = add_floor(a)
    a = a[:, CROP_X[0]:CROP_X[1]].copy()
    a[..., 3] = 255

    boxes = detect_glass(a)
    cells, decor, rows = classify(boxes)
    print('рядів фасаду:', [len(r) for r in rows], '| комірок:', len(cells), '| декор:', len(decor))
    if len(cells) != 24:
        print('! очікувалось 24 вікна — перевір BAND / CROP_X')

    lit = a.copy()
    dark = a.copy()
    regions = [darken(dark, b) for b in cells]

    H, W = a.shape[:2]
    scale = OUT_W / W
    size = (OUT_W, round(H * scale))
    out = Path('advent/img')
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(lit[..., :3]).resize(size, Image.LANCZOS).save(out / 'house-lit.webp', quality=80, method=6)
    Image.fromarray(dark[..., :3]).resize(size, Image.LANCZOS).save(out / 'house-dark.webp', quality=80, method=6)

    # двері: під вікном-віялом над ними (найширший «дрібний» блок на першому поверсі)
    fan = max((b for b in decor if b[1] > H * 0.7), key=lambda b: b[2] - b[0])
    door = [fan[0] - 10, fan[1] - 10, fan[2] + 10, min(H, fan[3] + int((fan[2] - fan[0]) * 1.75))]

    def pct(b):
        x0, y0, x1, y1 = b
        return [round(x0 / W * 100, 2), round(y0 / H * 100, 2), round((x1 - x0) / W * 100, 2), round((y1 - y0) / H * 100, 2)]

    data = {'ratio': round(W / H, 4), 'windows': [pct(b) for b in regions], 'door': pct(door)}
    print(json.dumps(data))
    for f in ('house-lit.webp', 'house-dark.webp'):
        print(f, (out / f).stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
