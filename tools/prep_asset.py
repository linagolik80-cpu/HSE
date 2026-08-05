#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Универсальная подготовка картинки-артефакта: вырезать область, уменьшить
методом ближайшего соседа, при желании обвести контуром.

    python3 tools/prep_asset.py ИСХОДНИК ВЫХОД --rect x0 y0 x1 y1 --width 46 [--outline]
    python3 tools/prep_asset.py ИСХОДНИК ВЫХОД --auto            # только уменьшить по нативной сетке

Работает только с PNG (jpeg сначала переводится через sips).
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prep_sprites import read_png, write_png, crop, detect_block, downscale  # noqa: E402

INK = (0x2F, 0x28, 0x02)


def nearest_resize(w, h, px, tw):
    th = max(1, int(round(h * tw / float(w))))
    out = bytearray(tw * th * 4)
    for y in range(th):
        sy = min(h - 1, int(y * h / th))
        for x in range(tw):
            sx = min(w - 1, int(x * w / tw))
            s = (sy * w + sx) * 4
            d = (y * tw + x) * 4
            out[d:d + 4] = px[s:s + 4]
    return tw, th, out


def add_outline(w, h, px):
    """Контур по внешней границе — предмет читается на любом фоне."""
    out = bytearray(px)
    for x in range(w):
        for y in (0, h - 1):
            i = (y * w + x) * 4
            if out[i + 3]:
                out[i:i + 4] = bytes(INK + (255,))
    for y in range(h):
        for x in (0, w - 1):
            i = (y * w + x) * 4
            if out[i + 3]:
                out[i:i + 4] = bytes(INK + (255,))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--rect', nargs=4, type=int, metavar=('X0', 'Y0', 'X1', 'Y1'))
    ap.add_argument('--width', type=int)
    ap.add_argument('--outline', action='store_true')
    ap.add_argument('--auto', action='store_true',
                    help='уменьшить по найденному размеру нативного пикселя')
    a = ap.parse_args()

    w, h, px = read_png(a.src)

    if a.rect:
        x0, y0, x1, y1 = a.rect
        w, h, px = crop(w, h, px, x0, y0, x1, y1)

    if a.auto:
        block = detect_block(w, h, px)
        print('нативный блок: %d' % block)
        if block > 1:
            w, h, px = downscale(w, h, px, block)

    if a.width and a.width < w:
        w, h, px = nearest_resize(w, h, px, a.width)

    if a.outline:
        px = add_outline(w, h, px)

    write_png(a.out, w, h, px)
    print('%s: %dx%d, %.1f КБ' % (a.out, w, h, os.path.getsize(a.out) / 1024))


if __name__ == '__main__':
    main()
