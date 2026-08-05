#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Делает пиксельный спрайт книги «Основы маркетинга» Котлера из фотографии
книга.jpg — той самой книги, что лежала на родительской полке.

Запуск (jpeg сначала уменьшается через sips, см. README):

    python3 tools/prep_book.py

Что делает: отделяет книгу от деревянного стола по цвету (обложка синяя,
стол — тёплый), приводит палитру к семи цветам, обводит контуром цвета
--ink и сохраняет assets/sprites/book.png.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_sprites import read_png, write_png, alpha_bbox, crop   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'sprites', 'book.png')

# Палитра: синие обложки, белый текст заголовка и контур из дизайн-системы.
PALETTE = [
    (0x2F, 0x28, 0x02),   # контур (--ink)
    (0x0E, 0x20, 0x35),   # тень обложки
    (0x1B, 0x3A, 0x5C),   # обложка
    (0x2E, 0x5C, 0x86),   # блик обложки
    (0xF1, 0xF1, 0xF9),   # текст на обложке (--bg)
    (0xC8, 0xC8, 0xD4),   # текст в тени
    (0x7A, 0x6A, 0x50),   # торец страниц
]


def nearest(r, g, b):
    best, bd = PALETTE[0], None
    for c in PALETTE:
        d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2
        if bd is None or d < bd:
            bd, best = d, c
    return best


def is_book(r, g, b):
    """Обложка синяя, стол тёплый. Белый текст тоже оставляем."""
    if b > r + 12:
        return True
    if r > 150 and g > 150 and b > 150 and abs(r - b) < 55:
        return True
    return False


def majority_filter(mask, w, h):
    """Убирает одиночные точки и дырки: пиксель принимает мнение соседей."""
    out = mask[:]
    for y in range(h):
        for x in range(w):
            n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                        n += 1
            if n >= 6:
                out[y * w + x] = 1
            elif n <= 2:
                out[y * w + x] = 0
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src or not os.path.exists(src):
        print('Укажите путь к уменьшенному PNG книги:\n'
              '  sips -c 660 880 книга.jpg --out /tmp/b.png -s format png\n'
              '  sips -z 42 56 /tmp/b.png --out /tmp/bs.png\n'
              '  python3 tools/prep_book.py /tmp/bs.png')
        return 1

    w, h, px = read_png(src)

    mask = [0] * (w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        mask[i] = 1 if is_book(r, g, b) else 0
    mask = majority_filter(mask, w, h)

    out = bytearray(w * h * 4)
    for i in range(w * h):
        if not mask[i]:
            continue
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        c = nearest(r, g, b)
        out[i * 4:i * 4 + 4] = bytes((c[0], c[1], c[2], 255))

    # контур цвета --ink по краю книги
    ink = PALETTE[0]
    edge = []
    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                continue
            near = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                        near = True
            if near:
                edge.append(y * w + x)
    for i in edge:
        out[i * 4:i * 4 + 4] = bytes((ink[0], ink[1], ink[2], 255))

    x0, y0, x1, y1 = alpha_bbox(w, h, out)
    w, h, out = crop(w, h, out, x0, y0, x1, y1)

    # Книга на фотографии выходит за край кадра, поэтому справа и снизу
    # контура нет. Дорисовываем его по границе спрайта — иначе предмет
    # выглядит обрезанным, а не цельным.
    for x in range(w):
        for y in (0, h - 1):
            i = (y * w + x) * 4
            if out[i + 3]:
                out[i:i + 4] = bytes(ink + (255,))
    for y in range(h):
        for x in (0, w - 1):
            i = (y * w + x) * 4
            if out[i + 3]:
                out[i:i + 4] = bytes(ink + (255,))

    write_png(OUT, w, h, out)
    print('book.png: %dx%d, %.1f КБ' % (w, h, os.path.getsize(OUT) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
