#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Подготовка спрайтов для игры. Запускается один раз:

    python3 tools/prep_sprites.py

Что делает:
  1. читает исходные PNG из папки «персонаж» (1254x1254, арт нарисован в низком
     разрешении и растянут, вокруг много пустоты);
  2. обрезает прозрачные поля по альфа-каналу;
  3. определяет размер нативного пиксельного блока и уменьшает до нативной сетки
     методом ближайшего соседа;
  4. кладёт результат в assets/sprites/ и пишет assets/sprites/sprites.js
     с размерами и якорями (точка «под ногами»).

Без сторонних библиотек: только zlib и struct из стандартной поставки.
Обрезка делается заранее, а не в браузере: чтение пикселей с file:// помечает
canvas как tainted и getImageData падает.
"""

import io
import json
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'персонаж')
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')

# исходник -> имя на выходе
SOURCES = [
    ('персонаж без фона  copy.png', 'idle'),
    ('персонаж сплющенный  copy.png', 'idle-squash'),
    ('без фона профиль copy.png', 'run-a'),
    ('профиль сплющенный copy.png', 'run-b'),
    ('прыжок ноу фон copy.png', 'jump'),
    ('но фон copy.png', 'sit'),
    ('вышка куб@3x copy.png', 'hse-cube'),
]

# у куба ВШЭ нет прозрачных полей внутри — он сплошной квадрат,
# поэтому уменьшаем его отдельным коэффициентом
MAX_SIDE = 160


# --------------------------------------------------------------------------
# чтение PNG
# --------------------------------------------------------------------------

def read_png(path):
    """Возвращает (width, height, pixels) где pixels — bytearray RGBA."""
    with open(path, 'rb') as fh:
        data = fh.read()

    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('не PNG: %s' % path)

    pos = 8
    idat = io.BytesIO()
    width = height = bit_depth = color_type = None
    palette = None
    trns = None

    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length

        if ctype == b'IHDR':
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack('>IIBBBBB', chunk)
            if bit_depth != 8:
                raise ValueError('поддерживается только 8 бит на канал: %s' % path)
            if interlace:
                raise ValueError('interlaced PNG не поддерживается: %s' % path)
        elif ctype == b'PLTE':
            palette = chunk
        elif ctype == b'tRNS':
            trns = chunk
        elif ctype == b'IDAT':
            idat.write(chunk)
        elif ctype == b'IEND':
            break

    raw = zlib.decompress(idat.getvalue())
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    stride = width * channels

    # снятие фильтров
    out = bytearray(stride * height)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride

        if ftype == 1:      # Sub
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:    # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:    # Average
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:    # Paeth
            for i in range(stride):
                a = line[i - channels] if i >= channels else 0
                b = prev[i]
                c = prev[i - channels] if i >= channels else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                if pa <= pb and pa <= pc:
                    pr = a
                elif pb <= pc:
                    pr = b
                else:
                    pr = c
                line[i] = (line[i] + pr) & 0xFF
        elif ftype != 0:
            raise ValueError('неизвестный фильтр %d' % ftype)

        out[y * stride:(y + 1) * stride] = line
        prev = line

    # приведение к RGBA
    rgba = bytearray(width * height * 4)
    for i in range(width * height):
        s = i * channels
        d = i * 4
        if color_type == 6:
            rgba[d:d + 4] = out[s:s + 4]
        elif color_type == 2:
            rgba[d:d + 3] = out[s:s + 3]
            rgba[d + 3] = 255
        elif color_type == 0:
            g = out[s]
            rgba[d] = rgba[d + 1] = rgba[d + 2] = g
            rgba[d + 3] = 255
        elif color_type == 4:
            g = out[s]
            rgba[d] = rgba[d + 1] = rgba[d + 2] = g
            rgba[d + 3] = out[s + 1]
        elif color_type == 3:
            idx = out[s]
            rgba[d:d + 3] = palette[idx * 3:idx * 3 + 3]
            rgba[d + 3] = trns[idx] if trns and idx < len(trns) else 255

    return width, height, rgba


def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # фильтр None — картинки крошечные, сжимать сложнее незачем
        raw += rgba[y * stride:(y + 1) * stride]

    def chunk(tag, payload):
        return (struct.pack('>I', len(payload)) + tag + payload
                + struct.pack('>I', zlib.crc32(tag + payload) & 0xFFFFFFFF))

    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n')
        fh.write(chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)))
        fh.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b'IEND', b''))


# --------------------------------------------------------------------------
# обработка
# --------------------------------------------------------------------------

def alpha_bbox(width, height, rgba, threshold=8):
    """Границы непрозрачной области."""
    x0, y0, x1, y1 = width, height, -1, -1
    for y in range(height):
        row = y * width * 4
        for x in range(width):
            if rgba[row + x * 4 + 3] > threshold:
                if x < x0:
                    x0 = x
                if x > x1:
                    x1 = x
                if y < y0:
                    y0 = y
                if y > y1:
                    y1 = y
    if x1 < 0:
        return 0, 0, width, height
    return x0, y0, x1 + 1, y1 + 1


def crop(width, height, rgba, x0, y0, x1, y1):
    w, h = x1 - x0, y1 - y0
    out = bytearray(w * h * 4)
    for y in range(h):
        src = ((y0 + y) * width + x0) * 4
        dst = y * w * 4
        out[dst:dst + w * 4] = rgba[src:src + w * 4]
    return w, h, out


def detect_block(width, height, rgba):
    """Размер нативного пикселя: наибольший делитель, при котором картинка
    состоит из однородных блоков."""
    for block in range(min(width, height) // 4, 1, -1):
        if width % block or height % block:
            continue
        if uniform_blocks(width, height, rgba, block):
            return block
    return 1


def uniform_blocks(width, height, rgba, block):
    for by in range(0, height, block):
        for bx in range(0, width, block):
            first = rgba[(by * width + bx) * 4:(by * width + bx) * 4 + 4]
            for y in range(by, by + block):
                row = y * width
                for x in range(bx, bx + block):
                    p = (row + x) * 4
                    if rgba[p:p + 4] != first:
                        return False
    return True


def downscale(width, height, rgba, block):
    w, h = width // block, height // block
    out = bytearray(w * h * 4)
    half = block // 2
    for y in range(h):
        for x in range(w):
            src = ((y * block + half) * width + x * block + half) * 4
            dst = (y * w + x) * 4
            out[dst:dst + 4] = rgba[src:src + 4]
    return w, h, out


def foot_anchor(width, height, rgba, threshold=8):
    """Горизонтальный центр «ступней» — середина непрозрачных пикселей в нижних
    рядах. Спрайты обрезаны по разным габаритам (у бега волосы летят назад,
    у прыжка руки в стороны), поэтому выравнивать их по центру рамки нельзя:
    персонаж будет прыгать по горизонтали при смене кадра."""
    rows = max(2, height // 12)
    xs = []
    for y in range(height - rows, height):
        row = y * width * 4
        for x in range(width):
            if rgba[row + x * 4 + 3] > threshold:
                xs.append(x)
    if not xs:
        return width // 2
    return (min(xs) + max(xs) + 1) // 2


def fit(width, height, rgba, max_side):
    """Целочисленное уменьшение до max_side, если картинка всё ещё большая."""
    factor = 1
    while (width // (factor + 1)) > max_side or (height // (factor + 1)) > max_side:
        factor += 1
    if factor == 1:
        return width, height, rgba
    w, h = width // factor, height // factor
    out = bytearray(w * h * 4)
    for y in range(h):
        for x in range(w):
            src = ((y * factor) * width + x * factor) * 4
            dst = (y * w + x) * 4
            out[dst:dst + 4] = rgba[src:src + 4]
    return w, h, out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = {}

    for src_name, out_name in SOURCES:
        src_path = os.path.join(SRC_DIR, src_name)
        if not os.path.exists(src_path):
            print('  ПРОПУСК (нет файла): %s' % src_name)
            continue

        w, h, px = read_png(src_path)
        x0, y0, x1, y1 = alpha_bbox(w, h, px)
        w, h, px = crop(w, h, px, x0, y0, x1, y1)

        block = detect_block(w, h, px)
        if block > 1:
            w, h, px = downscale(w, h, px, block)
        w, h, px = fit(w, h, px, MAX_SIDE)

        out_path = os.path.join(OUT_DIR, out_name + '.png')
        write_png(out_path, w, h, px)
        meta[out_name] = {'w': w, 'h': h, 'anchorX': foot_anchor(w, h, px)}
        print('  %-14s -> %-14s %4dx%-4d  блок %d  якорь x=%-3d  %6.1f КБ'
              % (src_name, out_name + '.png', w, h, block, meta[out_name]['anchorX'],
                 os.path.getsize(out_path) / 1024))

    js_path = os.path.join(OUT_DIR, 'sprites.js')
    with open(js_path, 'w', encoding='utf-8') as fh:
        fh.write('// Сгенерировано tools/prep_sprites.py — не редактировать вручную.\n')
        fh.write('window.SPRITE_META = %s;\n' % json.dumps(meta, ensure_ascii=False, indent=2))
    print('\nМетаданные: %s' % js_path)


if __name__ == '__main__':
    main()
