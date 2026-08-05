#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Растеризует записанные shot.js вызовы канваса в PNG — так кадр уровня можно
увидеть, не открывая браузер.

    python3 tools/headless/raster.py --sizes     # обновить таблицу размеров
    python3 tools/headless/raster.py [масштаб]   # frame.json -> frame.png

Текст рисуется серой плашкой примерной ширины: настоящие шрифты тут не
нужны, важно видеть, куда попадает подпись и не налезает ли она на декорации.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE)) + '/'
sys.path.insert(0, os.path.join(SITE, 'tools'))

from prep_sprites import read_png, write_png   # noqa: E402

W, H = 960, 540          # переопределяются размерами из frame.json
BG = (241, 241, 249)


def build_sizes():
    sizes = {}
    for root, _, files in os.walk(os.path.join(SITE, 'assets')):
        for f in files:
            if f.endswith('.png'):
                p = os.path.join(root, f)
                w, h, _ = read_png(p)
                sizes[os.path.relpath(p, SITE)] = [w, h]
    photo = os.path.join(SITE, 'assets', 'photo.jpg')
    if os.path.exists(photo):
        sizes['assets/photo.jpg'] = [412, 560]
    json.dump(sizes, open(os.path.join(HERE, 'sizes.json'), 'w'))
    print('размеров: %d' % len(sizes))


def parse_color(c):
    c = (c or '').strip()
    m = re.match(r'#([0-9a-fA-F]{6})$', c)
    if m:
        v = int(m.group(1), 16)
        return ((v >> 16) & 255, (v >> 8) & 255, v & 255, 1.0)
    m = re.match(r'rgba?\(([^)]+)\)', c)
    if m:
        p = [x.strip() for x in m.group(1).split(',')]
        return (int(float(p[0])), int(float(p[1])), int(float(p[2])),
                float(p[3]) if len(p) > 3 else 1.0)
    return (0, 0, 0, 1.0)


buf = bytearray(list(BG) + [255]) * (W * H)
cache = {}


def blend(x, y, r, g, b, a):
    if a <= 0 or x < 0 or y < 0 or x >= W or y >= H:
        return
    i = (y * W + x) * 4
    if a >= 1:
        buf[i] = r; buf[i + 1] = g; buf[i + 2] = b
        return
    buf[i] = int(buf[i] + (r - buf[i]) * a)
    buf[i + 1] = int(buf[i + 1] + (g - buf[i + 1]) * a)
    buf[i + 2] = int(buf[i + 2] + (b - buf[i + 2]) * a)


def fill_rect(x, y, w, h, col, alpha=1.0):
    r, g, b, a = col
    a *= alpha
    for yy in range(int(round(y)), int(round(y + h))):
        for xx in range(int(round(x)), int(round(x + w))):
            blend(xx, yy, r, g, b, a)


def fill_poly(pts, col, alpha):
    r, g, b, a = col
    a *= alpha
    ys = [p[1] for p in pts]
    for yy in range(int(min(ys)), int(max(ys)) + 1):
        xs = []
        n = len(pts)
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= yy < y2) or (y2 <= yy < y1):
                xs.append(x1 + (yy - y1) * (x2 - x1) / float(y2 - y1))
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            for xx in range(int(xs[k]), int(xs[k + 1]) + 1):
                blend(xx, yy, r, g, b, a)


def draw_img(src, x, y, w, h, alpha):
    if src not in cache:
        p = os.path.join(SITE, src)
        cache[src] = read_png(p) if (src.endswith('.png') and os.path.exists(p)) else None
    img = cache[src]
    if not img:
        fill_rect(x, y, w, h, (120, 120, 140, 1.0), alpha * .5)
        return
    iw, ih, px = img
    for yy in range(int(h)):
        sy = min(ih - 1, int(yy * ih / h))
        for xx in range(int(w)):
            sx = min(iw - 1, int(xx * iw / w))
            s = (sy * iw + sx) * 4
            a = px[s + 3] / 255.0 * alpha
            if a > .02:
                blend(int(x) + xx, int(y) + yy, px[s], px[s + 1], px[s + 2], a)


def draw_text(t, x, y, font, align, col, alpha):
    m = re.search(r'(\d+)px', font or '')
    size = int(m.group(1)) if m else 12
    w = len(t) * size * .62
    if align == 'center':
        x -= w / 2
    elif align == 'right':
        x -= w
    fill_rect(x, y - size * .78, w, size * .82, col, alpha * .55)


def main():
    if '--sizes' in sys.argv:
        build_sizes()
        return

    scale = 1
    for a in sys.argv[1:]:
        if a.isdigit():
            scale = int(a)

    global W, H, buf
    data = json.load(open(os.path.join(HERE, 'frame.json')))
    if isinstance(data, dict):
        W, H = data['w'], data['h']
        ops = data['ops']
        buf = bytearray(list(BG) + [255]) * (W * H)
    else:
        ops = data
    for o in ops:
        alpha = o.get('a', 1)
        if o['op'] == 'rect':
            fill_rect(o['x'], o['y'], o['w'], o['h'], parse_color(o['fill']), alpha)
        elif o['op'] == 'poly':
            fill_poly(o['pts'], parse_color(o['fill']), alpha)
        elif o['op'] == 'img':
            draw_img(o['src'], o['x'], o['y'], o['w'], o['h'], alpha)
        elif o['op'] == 'text':
            draw_text(o['text'], o['x'], o['y'], o['font'], o.get('align'),
                      parse_color(o['fill']), alpha)

    out, ow, oh = buf, W, H
    if scale > 1:
        ow, oh = W * scale, H * scale
        big = bytearray(ow * oh * 4)
        for y in range(oh):
            for x in range(ow):
                s = ((y // scale) * W + (x // scale)) * 4
                d = (y * ow + x) * 4
                big[d:d + 4] = buf[s:s + 4]
        out = big

    path = os.path.join(HERE, 'frame.png')
    write_png(path, ow, oh, out)
    print('frame.png %dx%d' % (ow, oh))


if __name__ == '__main__':
    main()
