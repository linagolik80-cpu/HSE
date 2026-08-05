/* ==========================================================================
   Интро перед игрой: фотография превращается в пиксельного персонажа,
   после чего он падает в кадр начальной страницы.

   Пикселизация делается вживую: фото рисуется в маленький буферный канвас
   и растягивается обратно без сглаживания. Пиксели нигде не читаются
   (getImageData), поэтому сцена работает и при открытии с file://.
   ========================================================================== */

var Intro = (function () {
  var W = 960, H = 540;

  /* тайминги, секунды */
  var T_FRAME  = 0.55;   /* рамка прорисовалась            */
  var T_REVEAL = 1.70;   /* фото проявилось                */
  var T_PIXEL  = 3.70;   /* пикселизация закончилась       */
  var T_FLASH  = 4.05;   /* вспышка                        */
  var T_HOLD   = 4.70;   /* «персонаж создан»              */
  var T_LAND   = 5.45;   /* приземлился                    */
  var T_END    = 5.95;   /* конец сцены                    */

  /* сколько блоков по ширине на каждой ступени */
  var STEPS = [120, 76, 48, 30, 20, 13, 9];

  /* рамка с фотографией */
  var BOX = { w: 232, h: 315, cx: 480, top: 34 };
  var BOX_BOTTOM = BOX.top + BOX.h;

  /* куда персонаж приземляется — та же точка, где он стоит на титуле */
  var LAND_X = 730;
  var LAND_SCALE = 2.2;

  var t = 0;
  var finished = false;
  var off = null, offCtx = null;
  var dust = [];
  var dustMade = false;

  function buffer() {
    if (!off) {
      off = document.createElement('canvas');
      offCtx = off.getContext('2d');
    }
    return off;
  }

  function px(n) { return Math.round(n); }

  function ease(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }

  /* ------------------------------------------------------------------ */

  function drawFrame(ctx, C, alpha, grow) {
    var x = BOX.cx - BOX.w / 2, y = BOX.top;
    var w = BOX.w, h = BOX.h;
    ctx.save();
    ctx.globalAlpha = alpha;

    /* сама рамка — растёт от центра сторон наружу */
    ctx.fillStyle = C.ink;
    var gw = w * grow, gh = h * grow;
    ctx.fillRect(px(x + (w - gw) / 2), px(y), px(gw), 4);
    ctx.fillRect(px(x + (w - gw) / 2), px(y + h - 4), px(gw), 4);
    ctx.fillRect(px(x), px(y + (h - gh) / 2), 4, px(gh));
    ctx.fillRect(px(x + w - 4), px(y + (h - gh) / 2), 4, px(gh));

    /* угловые метки — как на кубе ВШЭ */
    if (grow > .96) {
      ctx.fillStyle = C.accent;
      var m = 12, s = 8;
      ctx.fillRect(px(x + m), px(y + m), s, s);
      ctx.fillRect(px(x + w - m - s), px(y + m), s, s);
      ctx.fillRect(px(x + m), px(y + h - m - s), s, s);
      ctx.fillRect(px(x + w - m - s), px(y + h - m - s), s, s);
    }
    ctx.restore();
  }

  /* фото, при blocks === 0 — без пикселизации */
  function drawPhoto(ctx, img, blocks, clipH) {
    var x = BOX.cx - BOX.w / 2 + 4, y = BOX.top + 4;
    var w = BOX.w - 8, h = BOX.h - 8;

    ctx.save();
    if (clipH !== undefined) {
      ctx.beginPath();
      ctx.rect(px(x), px(y), px(w), px(clipH));
      ctx.clip();
    }

    if (!blocks) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, px(x), px(y), px(w), px(h));
    } else {
      var buf = buffer();
      var ow = Math.max(2, blocks);
      var oh = Math.max(2, Math.round(blocks * h / w));
      buf.width = ow;
      buf.height = oh;
      offCtx.imageSmoothingEnabled = true;    /* усреднение даёт живой цвет */
      offCtx.clearRect(0, 0, ow, oh);
      offCtx.drawImage(img, 0, 0, ow, oh);
      ctx.imageSmoothingEnabled = false;      /* обратно — жёсткими блоками */
      ctx.drawImage(buf, 0, 0, ow, oh, px(x), px(y), px(w), px(h));
    }
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
  }

  function label(ctx, C, text, color) {
    ctx.fillStyle = color;
    ctx.font = '18px Chava, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, BOX.cx, BOX.top - 16);
  }

  /* индикатор из тех же семипиксельных кластеров, что и в интерфейсе */
  function progress(ctx, C, filled, total) {
    var s = 3, cw = s * 8, gap = 10;
    var all = total * cw + (total - 1) * gap;
    var x0 = BOX.cx - all / 2;
    var cells = [[0, 0], [2, 0], [0, 1], [1, 1], [3, 1], [0, 2], [2, 2]];
    for (var i = 0; i < total; i++) {
      ctx.fillStyle = i < filled ? C.accent : C.ink12;
      for (var c = 0; c < cells.length; c++) {
        ctx.fillRect(px(x0 + i * (cw + gap) + cells[c][0] * s * 2),
                     px(BOX_BOTTOM + 22 + cells[c][1] * s * 2), s, s);
      }
    }
  }

  function makeDust() {
    dust = [];
    for (var i = 0; i < 10; i++) {
      dust.push({
        x: LAND_X + (Math.random() - .5) * 40,
        y: GROUND_Y,
        vx: (Math.random() - .5) * 220,
        vy: -60 - Math.random() * 120,
        s: 4 + Math.round(Math.random()) * 4,
        life: .5
      });
    }
    dustMade = true;
  }

  function drawDust(ctx, C, dt) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vy += 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > GROUND_Y) { d.y = GROUND_Y; d.vy = 0; d.vx *= .5; }
      ctx.fillStyle = C.ink40;
      ctx.fillRect(px(d.x), px(d.y - d.s), d.s, d.s);
    }
  }

  /* ------------------------------------------------------------------ */

  return {
    reset: function () {
      t = 0;
      finished = false;
      dust = [];
      dustMade = false;
    },

    skip: function () { finished = true; },
    isDone: function () { return finished; },

    /* Возвращает true, когда сцена закончилась. */
    frame: function (ctx, dt, C, drawBase) {
      if (finished) return true;
      t += dt;

      var img = Sprites.get('photo');
      drawBase();

      /* --- рамка и фото --- */
      if (t < T_HOLD) {
        var grow = ease(t / T_FRAME);
        drawFrame(ctx, C, 1, grow);

        if (t >= T_FRAME && img && img.width) {
          if (t < T_REVEAL) {
            var p = ease((t - T_FRAME) / (T_REVEAL - T_FRAME));
            drawPhoto(ctx, img, 0, (BOX.h - 8) * p);
            label(ctx, C, 'ИСХОДНЫЕ ДАННЫЕ', C.ink40);
          } else if (t < T_PIXEL) {
            var q = (t - T_REVEAL) / (T_PIXEL - T_REVEAL);
            var i = Math.min(STEPS.length - 1, Math.floor(q * STEPS.length));
            drawPhoto(ctx, img, STEPS[i]);
            label(ctx, C, 'ОБРАБОТКА', C.ink);
            progress(ctx, C, i + 1, STEPS.length);
          } else if (t < T_FLASH) {
            /* идёт вспышка: подпись уже убрана, чтобы не наложиться
               на «ПЕРСОНАЖ СОЗДАН» */
            drawPhoto(ctx, img, STEPS[STEPS.length - 1]);
            progress(ctx, C, STEPS.length, STEPS.length);
          }
        }
      }

      /* --- вспышка и появление спрайта --- */
      if (t >= T_PIXEL && t < T_FLASH) {
        ctx.save();
        ctx.globalAlpha = 1 - (t - T_PIXEL) / (T_FLASH - T_PIXEL);
        ctx.fillStyle = C.accent;
        ctx.fillRect(px(BOX.cx - BOX.w / 2), px(BOX.top), px(BOX.w), px(BOX.h));
        ctx.restore();
      }

      if (t >= T_FLASH && t < T_HOLD) {
        var sc = BOX.h / Sprites.height('idle');
        Sprites.draw(ctx, 'idle', BOX.cx, BOX_BOTTOM - 6, false, sc);
        label(ctx, C, 'ПЕРСОНАЖ СОЗДАН', C.accent);
      }

      /* --- падение в кадр --- */
      if (t >= T_HOLD) {
        var fp = ease((t - T_HOLD) / (T_LAND - T_HOLD));
        var startScale = BOX.h / Sprites.height('idle');
        var scale = startScale + (LAND_SCALE - startScale) * fp;
        var x = BOX.cx + (LAND_X - BOX.cx) * fp;
        var y = (BOX_BOTTOM - 6) + (GROUND_Y - (BOX_BOTTOM - 6)) * (fp * fp);

        if (fp < 1) {
          Sprites.draw(ctx, 'jump', x, y, false, scale);
        } else {
          if (!dustMade) makeDust();
          /* приземление: короткий сквош, потом обычная стойка */
          var after = t - T_LAND;
          Sprites.draw(ctx, after < .18 ? 'idle-squash' : 'idle',
                       LAND_X, GROUND_Y, false, LAND_SCALE);
        }
        drawDust(ctx, C, dt);
      }

      /* --- подпись внизу --- */
      if (t < T_HOLD) {
        ctx.fillStyle = C.ink40;
        ctx.font = '14px Chava, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('АНГЕЛИНА ГОЛИК', BOX.cx, BOX_BOTTOM + 66);
      }

      if (t >= T_END) { finished = true; return true; }
      return false;
    }
  };
})();
