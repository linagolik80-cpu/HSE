/* ==========================================================================
   Движок: игровой цикл, физика AABB, камера, чекпоинты, ввод, отрисовка.
   Мир 960x540 в логических единицах, канвас растягивается средствами CSS.
   ========================================================================== */

var Engine = (function () {
  var W = 960, H = 540;

  var canvas, ctx, level, cb;
  var raf = null, last = 0, paused = false;

  /* Что сейчас на канвасе: 'none' — ничего, 'intro' — вступительная сцена,
     'title' — персонаж стоит на титульном экране, 'play' — идёт уровень. */
  var scene = 'none';
  var sceneDone = null;
  var TITLE_X = 730;

  var C = {};                       /* цвета из CSS-переменных */
  var P = {};                       /* палитра текущего уровня (js/content.js) */

  var player = {
    x: 60, y: GROUND_Y, vx: 0, vy: 0,
    w: 44, h: 90, onGround: true, face: 1, idleTime: 0, animT: 0
  };

  var cam = 0;
  var lastCp = 60;
  var branch = null;
  var fired = {};                   /* сработавшие триггеры и собранные предметы */
  var openWalls = {};
  var hitAt = -999;
  var timeNow = 0;

  var keys = { left: false, right: false, jump: false };

  /* Физика подобрана под геометрию уровней:
       высота прыжка = JUMP_V² / (2·GRAVITY) ≈ 156 px
       время в воздухе = 2·JUMP_V/GRAVITY ≈ 0.79 с
       дальность = 193 px
     Все платформы ниже 156 px и все разрывы уже 193 px: проиграть в игре
     нельзя, поэтому непроходимых мест быть не должно в принципе. */
  var GRAVITY = 2000;
  var SPEED = 245;
  var JUMP_V = -790;

  /* ------------------------------------------------------------------ */
  /* цвета                                                               */
  /* ------------------------------------------------------------------ */

  function readColors() {
    var s = getComputedStyle(document.documentElement);
    C.bg = s.getPropertyValue('--bg').trim() || '#F1F1F9';
    C.ink = s.getPropertyValue('--ink').trim() || '#2F2802';
    C.accent = s.getPropertyValue('--accent').trim() || '#C63A02';
    C.hse = s.getPropertyValue('--hse').trim() || '#102D69';
    C.ink06 = 'rgba(47,40,2,.06)';
    C.ink12 = 'rgba(47,40,2,.12)';
    C.ink20 = 'rgba(47,40,2,.2)';
    C.ink40 = 'rgba(47,40,2,.4)';
  }

  /* ------------------------------------------------------------------ */
  /* ввод                                                                */
  /* ------------------------------------------------------------------ */

  function keyName(e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A' || k === 'ф' || k === 'Ф') return 'left';
    if (k === 'ArrowRight' || k === 'd' || k === 'D' || k === 'в' || k === 'В') return 'right';
    if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'ц' || k === 'Ц') return 'jump';
    return null;
  }

  function onKeyDown(e) {
    var k = keyName(e);
    if (!k) return;
    if (k === 'jump') e.preventDefault();
    keys[k] = true;
  }

  function onKeyUp(e) {
    var k = keyName(e);
    if (k) keys[k] = false;
  }

  function bindTouch() {
    var pad = document.getElementById('touch');
    if (!pad) return;
    Array.prototype.forEach.call(pad.querySelectorAll('button'), function (btn) {
      var k = btn.getAttribute('data-key');
      var press = function (e) { e.preventDefault(); keys[k] = true; };
      var release = function (e) { e.preventDefault(); keys[k] = false; };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  /* ------------------------------------------------------------------ */
  /* сущности                                                            */
  /* ------------------------------------------------------------------ */

  function visible(e) {
    if (!e.only) return true;
    return e.only === branch;
  }

  function each(type, fn) {
    for (var i = 0; i < level.ents.length; i++) {
      var e = level.ents[i];
      if (e.t === type && visible(e)) fn(e, i);
    }
  }

  function solids() {
    var out = [];
    each('block', function (e) { out.push(e); });
    each('wall', function (e) {
      if (!openWalls[e.id]) {
        out.push({ x: e.x, y: GROUND_Y - 300, w: 40, h: 300, isWall: true });
      }
    });
    return out;
  }

  function inPit(x) {
    var hit = null;
    each('pit', function (e) {
      if (x > e.x && x < e.x + e.w) hit = e;
    });
    return hit;
  }

  /* ------------------------------------------------------------------ */
  /* физика                                                              */
  /* ------------------------------------------------------------------ */

  function step(dt) {
    var speed = SPEED;
    each('zone', function (e) {
      if (player.x >= e.x && player.x <= e.x + e.w) speed *= e.speed;
    });

    var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    player.vx = dir * speed;
    if (dir) { player.face = dir; player.idleTime = 0; }
    else player.idleTime += dt;

    if (keys.jump && player.onGround) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.idleTime = 0;
      Audio8.sfx('jump');
    }

    player.vy += GRAVITY * dt;
    if (player.vy > 1400) player.vy = 1400;

    /* --- горизонталь --- */
    var nx = player.x + player.vx * dt;
    var half = player.w / 2;
    var list = solids();
    var wallBumped = false;

    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var top = player.y - player.h;
      /* сбоку не пускаем; если ступни выше верхней грани — блок можно перепрыгнуть */
      if (player.y > b.y && top < b.y + b.h &&
          nx + half > b.x && nx - half < b.x + b.w) {
        if (player.vx > 0) nx = b.x - half;
        else if (player.vx < 0) nx = b.x + b.w + half;
        if (b.isWall && !wallBumped) {
          wallBumped = true;
          Audio8.sfx('deny');
        }
      }
    }

    player.x = Math.max(half, Math.min(level.length, nx));

    /* --- вертикаль --- */
    var ny = player.y + player.vy * dt;
    player.onGround = false;

    for (var j = 0; j < list.length; j++) {
      var s = list[j];
      if (player.x + half > s.x && player.x - half < s.x + s.w) {
        if (player.vy >= 0 && player.y <= s.y + 1 && ny >= s.y) {
          ny = s.y;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0 && player.y - player.h >= s.y + s.h - 1 &&
                   ny - player.h <= s.y + s.h) {
          ny = s.y + s.h + player.h;
          player.vy = 0;
        }
      }
    }

    var pit = inPit(player.x);
    if (!pit && player.vy >= 0 && player.y <= GROUND_Y + 1 && ny >= GROUND_Y) {
      ny = GROUND_Y;
      player.vy = 0;
      player.onGround = true;
    }

    player.y = ny;

    if (player.y > H + 120) hit();

    /* --- камера --- */
    var want = player.x - W * 0.38;
    cam += (want - cam) * Math.min(1, dt * 7);
    cam = Math.max(0, Math.min(level.length - W + 120, cam));

    checkOverlaps();
  }

  function checkOverlaps() {
    var half = player.w / 2;

    each('cp', function (e) {
      if (player.x >= e.x && e.x > lastCp) lastCp = e.x;
    });

    each('spike', function (e) {
      if (timeNow - hitAt < .9) return;
      /* Хитбокс уже и ниже нарисованного шипа. Столкновение засчитывается,
         только когда персонаж действительно внизу — иначе окно прыжка
         получается около 0.2 с, а это уже не игра, а испытание. */
      if (player.x + 14 > e.x && player.x - 14 < e.x + e.w &&
          player.y > GROUND_Y - 18 && player.y - player.h < GROUND_Y) hit();
    });

    each('item', function (e) {
      if (fired['i:' + e.id]) return;
      if (player.x + half > e.x - 6 && player.x - half < e.x + 54 &&
          player.y > e.y - 10 && player.y - player.h < e.y + 54) {
        fired['i:' + e.id] = true;
        Audio8.sfx(ITEMS[e.id] && ITEMS[e.id].locked ? 'deny' : 'pick');
        if (cb.onItem) cb.onItem(e);
      }
    });

    each('trig', function (e) {
      if (fired['t:' + e.id] || player.x < e.x) return;
      fired['t:' + e.id] = true;
      if (cb.onTrigger) cb.onTrigger(e.id);
    });

    each('goal', function (e) {
      if (fired['goal'] || player.x < e.x) return;
      fired['goal'] = true;
      if (cb.onGoal) cb.onGoal();
    });
  }

  function hit() {
    if (timeNow - hitAt < .9) return;
    hitAt = timeNow;
    Audio8.sfx('hit');
    player.x = lastCp;
    player.y = GROUND_Y;
    player.vx = player.vy = 0;
    player.onGround = true;
    cam = Math.max(0, lastCp - W * 0.38);
    if (cb.onHit) cb.onHit();
  }

  /* ------------------------------------------------------------------ */
  /* отрисовка                                                           */
  /* ------------------------------------------------------------------ */

  function px(n) { return Math.round(n); }

  /* Подписи на канвасе: кириллицу умеет только Chava, а знак ₽ — только
     Bricolage. Выбираем шрифт по самой строке, чтобы нигде не всплыл
     системный запасной вариант. */
  var CYR = /[А-Яа-яЁё]/;
  function labelFont(text, size) {
    return CYR.test(text) ? size + 'px Chava, sans-serif'
                          : '800 ' + size + 'px Bricolage, sans-serif';
  }

  function drawFrame(x, y, w, h, fill, line) {
    ctx.fillStyle = fill;
    ctx.fillRect(px(x), px(y), px(w), px(h));
    ctx.fillStyle = line;
    ctx.fillRect(px(x), px(y), px(w), 4);
    ctx.fillRect(px(x), px(y + h - 4), px(w), 4);
    ctx.fillRect(px(x), px(y), 4, px(h));
    ctx.fillRect(px(x + w - 4), px(y), 4, px(h));
  }

  /* кластер из семи пикселей — та же супрграфика, что и в интерфейсе */
  function sevenPixels(x, y, s, color) {
    ctx.fillStyle = color;
    var cells = [[0, 0], [2, 0], [0, 1], [1, 1], [3, 1], [0, 2], [2, 2]];
    for (var i = 0; i < cells.length; i++) {
      ctx.fillRect(px(x + cells[i][0] * s * 2), px(y + cells[i][1] * s * 2), px(s), px(s));
    }
  }

  /* Фон, паттерн и земля — общие для интро, титула и уровней. */
  function drawBackdrop(shift) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    /* Каждый уровень красит воздух в свой цвет: стены школы, зал
       Плехановки, небо над Вышкой. Цвета приглушены, чтобы тёмный
       силуэт персонажа оставался самым контрастным пятном в кадре. */
    if (P.air) {
      ctx.fillStyle = P.air;
      ctx.fillRect(0, 0, W, GROUND_Y);
    }

    ctx.fillStyle = P.dots || C.ink12;
    var gs = 24;
    var offset = -((shift || 0) * .25) % gs;
    for (var gx = offset; gx < W; gx += gs) {
      for (var gy = 40; gy < GROUND_Y - 20; gy += gs) {
        ctx.fillRect(px(gx), px(gy), 4, 4);
      }
    }
  }

  /* Земля: тёмная масса плюс тонкая полоса покрытия — паркет, мрамор,
     асфальт. Основной массив остаётся тёмным, иначе персонаж потеряется. */
  function drawGround(from, to) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(px(from), GROUND_Y, px(to - from), H - GROUND_Y);
    if (P.floor) {
      ctx.fillStyle = P.floor;
      ctx.fillRect(px(from), GROUND_Y, px(to - from), 9);
    }
  }

  /* Титульный экран: тот же мир, персонаж стоит и дышит. */
  function drawTitleScene() {
    drawBackdrop(0);
    drawGround(0, W);

    var name = (Math.floor(timeNow * 1.8) % 2) ? 'idle-squash' : 'idle';
    ctx.fillStyle = C.ink20;
    ctx.fillRect(px(TITLE_X - 46), GROUND_Y - 6, 92, 6);
    Sprites.draw(ctx, name, TITLE_X, GROUND_Y, false, 2.2);
  }

  function drawIntroBase() {
    drawBackdrop(0);
    drawGround(0, W);
  }

  /* ------------------------------------------------------------------ */
  /* декорации                                                           */
  /* Рисуются оттенками --ink: фон остаётся фоном и не спорит с игровыми
     объектами, которые единственные носят акцентный цвет. Дальний слой
     движется медленнее — так появляется глубина.                        */
  /* ------------------------------------------------------------------ */

  var FAR = 0.55;

  /* Ступенчатая арка: тело плюс пять сужающихся полос сверху. */
  function archShape(ax, ay, aw, ah, color) {
    ctx.fillStyle = color;
    ctx.fillRect(px(ax), px(ay + 34), px(aw), px(ah - 34));
    var insets = [0, 6, 14, 24, 38];
    for (var s = 0; s < insets.length; s++) {
      var k = Math.min(insets[s], aw / 2 - 4);
      ctx.fillRect(px(ax + k), px(ay + 34 - (s + 1) * 7), px(aw - k * 2), 7);
    }
  }

  /* Цвет из палитры уровня; если уровень его не задал — запасной. */
  function col(name, fallback) {
    return (P && P[name]) || fallback;
  }

  function deco(e, ox) {
    var x = (ox === undefined) ? e.x : ox;

    switch (e.kind) {

      /* ---------------- школьный коридор ---------------- */

      case 'rail': {                         /* линия потолка или плинтуса */
        ctx.fillStyle = col('trim', C.ink20);
        ctx.fillRect(px(x), px(e.y), px(e.w || 3600), 5);
        ctx.fillStyle = col('trimSoft', C.ink12);
        for (var r = 0; r < (e.w || 3600) / 60; r++) {
          ctx.fillRect(px(x + r * 60), px(e.y - 8), 4, 8);
        }
        break;
      }

      case 'window': {                       /* окно с тёплым светом */
        var h = e.h || 190, w = e.w || 86, top = e.y || 92;
        ctx.fillStyle = col('glass', '#FBF3DF');
        ctx.fillRect(px(x), px(top), px(w), px(h));
        ctx.fillStyle = col('frame', '#9C7B58');
        ctx.fillRect(px(x), px(top), px(w), 5);
        ctx.fillRect(px(x), px(top + h - 5), px(w), 5);
        ctx.fillRect(px(x), px(top), 5, px(h));
        ctx.fillRect(px(x + w - 5), px(top), 5, px(h));
        ctx.fillRect(px(x + w / 2 - 2), px(top), 4, px(h));
        ctx.fillRect(px(x), px(top + h / 2 - 2), px(w), 4);
        break;
      }

      case 'radiator': {                     /* батарея под окном */
        ctx.fillStyle = col('metal', '#CBB59A');
        for (var i = 0; i < 7; i++) ctx.fillRect(px(x + i * 10), px(e.y), 6, 40);
        ctx.fillRect(px(x), px(e.y + 4), 66, 5);
        ctx.fillRect(px(x), px(e.y + 30), 66, 5);
        break;
      }

      case 'portrait': {                     /* портрет в раме */
        ctx.fillStyle = col('frame', '#9C7B58');
        ctx.fillRect(px(x), px(e.y), 44, 58);
        ctx.fillStyle = col('canvasCol', '#E4D8C6');
        ctx.fillRect(px(x + 5), px(e.y + 5), 34, 48);
        ctx.fillStyle = col('frame', '#9C7B58');
        ctx.fillRect(px(x + 15), px(e.y + 13), 15, 15);
        ctx.fillRect(px(x + 11), px(e.y + 33), 23, 15);
        break;
      }

      case 'door': {                         /* двустворчатая дверь */
        ctx.fillStyle = col('door', '#F3EFE7');
        ctx.fillRect(px(x), px(e.y), 96, 190);
        ctx.fillStyle = col('frame', '#9C7B58');
        ctx.fillRect(px(x), px(e.y), 96, 5);
        ctx.fillRect(px(x), px(e.y), 5, 190);
        ctx.fillRect(px(x + 91), px(e.y), 5, 190);
        ctx.fillRect(px(x + 46), px(e.y), 4, 190);
        ctx.fillStyle = col('doorPanel', '#E2D8C8');
        ctx.fillRect(px(x + 13), px(e.y + 16), 24, 60);
        ctx.fillRect(px(x + 60), px(e.y + 16), 24, 60);
        ctx.fillRect(px(x + 13), px(e.y + 108), 24, 60);
        ctx.fillRect(px(x + 60), px(e.y + 108), 24, 60);
        ctx.fillStyle = col('metal', '#CBB59A');
        ctx.fillRect(px(x + 37), px(e.y + 96), 8, 8);
        ctx.fillRect(px(x + 52), px(e.y + 96), 8, 8);
        break;
      }

      case 'board': {                        /* школьная доска */
        ctx.fillStyle = col('boardFrame', '#8A6B45');
        ctx.fillRect(px(x), px(e.y), 220, 126);
        ctx.fillStyle = col('board', '#3E5F52');
        ctx.fillRect(px(x + 6), px(e.y + 6), 208, 100);
        ctx.fillStyle = col('chalk', '#DCE8E2');
        ctx.fillRect(px(x + 22), px(e.y + 28), 120, 5);
        ctx.fillRect(px(x + 22), px(e.y + 48), 160, 5);
        ctx.fillRect(px(x + 22), px(e.y + 68), 90, 5);
        ctx.fillStyle = col('boardFrame', '#8A6B45');
        ctx.fillRect(px(x + 6), px(e.y + 112), 208, 8);
        break;
      }

      case 'desk': {                         /* парта */
        ctx.fillStyle = col('deskTop', '#C9A87C');
        ctx.fillRect(px(x), px(GROUND_Y - 62), 104, 11);
        ctx.fillStyle = col('metal', '#CBB59A');
        ctx.fillRect(px(x + 8), px(GROUND_Y - 51), 8, 51);
        ctx.fillRect(px(x + 88), px(GROUND_Y - 51), 8, 51);
        ctx.fillRect(px(x + 24), px(GROUND_Y - 34), 56, 6);
        break;
      }

      case 'plant': {                        /* цветок в горшке */
        ctx.fillStyle = col('pot', '#B5714C');
        ctx.fillRect(px(x), px(e.y + 26), 30, 22);
        ctx.fillRect(px(x + 4), px(e.y + 20), 22, 8);
        ctx.fillStyle = col('leaf', '#7F9E58');
        ctx.fillRect(px(x + 13), px(e.y + 4), 5, 18);
        ctx.fillRect(px(x + 2), px(e.y + 10), 12, 5);
        ctx.fillRect(px(x + 17), px(e.y + 6), 12, 5);
        ctx.fillStyle = col('bloom', C.accent);
        ctx.fillRect(px(x + 11), px(e.y), 9, 8);
        break;
      }

      /* ---------------- атриум Плехановки ---------------- */

      case 'column': {                       /* колонна с капителью */
        var ch = e.h || 268;
        ctx.fillStyle = col('column', '#AFC0C8');
        ctx.fillRect(px(x), px(GROUND_Y - ch), 34, ch);
        ctx.fillStyle = col('columnHi', '#CBD8DE');
        ctx.fillRect(px(x + 10), px(GROUND_Y - ch + 20), 5, ch - 44);
        ctx.fillRect(px(x + 21), px(GROUND_Y - ch + 20), 5, ch - 44);
        ctx.fillStyle = col('stone', '#DCE2DC');
        ctx.fillRect(px(x - 8), px(GROUND_Y - ch), 50, 13);
        ctx.fillRect(px(x - 8), px(GROUND_Y - 16), 50, 13);
        break;
      }

      case 'arch': {                         /* арочный проём */
        var aw = e.w || 110, ah = e.h || 150, ay = e.y || 232;
        archShape(x, ay, aw, ah, col('stone', '#DCE2DC'));
        archShape(x + 5, ay + 5, aw - 10, ah - 5, col('glass', '#DCE8EE'));
        ctx.fillStyle = col('mint', '#AFCEBE');
        ctx.fillRect(px(x + aw / 2 - 2), px(ay + 30), 4, ah - 34);
        ctx.fillRect(px(x + 12), px(ay + 66), aw - 24, 4);
        ctx.fillStyle = col('mint', '#AFCEBE');
        ctx.fillRect(px(x - 4), px(ay + ah - 6), px(aw + 8), 6);
        break;
      }

      case 'vault': {                        /* стеклянный свод */
        ctx.fillStyle = col('glass', '#DCE8EE');
        for (var v = 0; v < 9; v++) {
          var len = 20 + Math.round(58 * Math.sin(Math.PI * v / 8));
          ctx.fillRect(px(x + v * 46), 42, 8, len);
        }
        ctx.fillStyle = col('stone', '#DCE2DC');
        ctx.fillRect(px(x), 36, 414, 6);
        break;
      }

      case 'chandelier': {                   /* люстра */
        ctx.fillStyle = col('gold', '#C9A227');
        ctx.fillRect(px(x + 26), 42, 5, 42);
        ctx.fillRect(px(x), 84, 58, 8);
        ctx.fillRect(px(x + 8), 92, 42, 8);
        ctx.fillStyle = col('lamp', '#F2DE9B');
        ctx.fillRect(px(x + 6), 100, 7, 7);
        ctx.fillRect(px(x + 26), 104, 7, 7);
        ctx.fillRect(px(x + 46), 100, 7, 7);
        break;
      }

      case 'gallery': {                      /* балюстрада второго яруса */
        var gw = e.w || 260;
        ctx.fillStyle = col('stone', '#DCE2DC');
        ctx.fillRect(px(x), px(e.y), px(gw), 7);
        ctx.fillRect(px(x), px(e.y + 40), px(gw), 7);
        ctx.fillStyle = col('mint', '#AFCEBE');
        for (var b = 0; b < gw / 22; b++) {
          ctx.fillRect(px(x + 6 + b * 22), px(e.y + 7), 6, 33);
        }
        break;
      }

      /* ---------------- корпус Высшей школы бизнеса ---------------- */

      case 'cloud': {                        /* облако */
        ctx.fillStyle = col('cloud', '#EDF3F9');
        var cw = e.w || 120;
        ctx.fillRect(px(x), px(e.y + 14), px(cw), 18);
        ctx.fillRect(px(x + cw * .2), px(e.y + 4), px(cw * .35), 14);
        ctx.fillRect(px(x + cw * .55), px(e.y), px(cw * .3), 18);
        ctx.fillRect(px(x + cw * .1), px(e.y + 30), px(cw * .8), 8);
        break;
      }

      case 'facade': {                       /* кирпичный корпус с окнами */
        var fw = e.w || 300, fy = e.y || 84, fh = GROUND_Y - fy;
        ctx.fillStyle = col('brick', '#9C5344');
        ctx.fillRect(px(x), px(fy), px(fw), px(fh));
        ctx.fillStyle = col('brickHi', '#AD6555');
        for (var by = 0; by < fh; by += 16) {                /* кладка */
          ctx.fillRect(px(x), px(fy + by), px(fw), 3);
        }
        ctx.fillStyle = col('cornice', '#E4E0D8');
        ctx.fillRect(px(x), px(fy), px(fw), 9);
        /* два ряда высоких окон */
        for (var row = 0; row < 2; row++) {
          for (var cwi = 0; cwi < Math.floor(fw / 100); cwi++) {
            var wx = x + 26 + cwi * 100, wy = fy + 34 + row * 132, ww = 56, wh2 = 96;
            ctx.fillStyle = col('frame', '#EDEDE9');
            ctx.fillRect(px(wx - 4), px(wy - 4), ww + 8, wh2 + 8);
            ctx.fillStyle = col('glass', '#BFD2DE');
            ctx.fillRect(px(wx), px(wy), ww, wh2);
            ctx.fillStyle = col('frame', '#EDEDE9');
            ctx.fillRect(px(wx + ww / 2 - 2), px(wy), 4, wh2);
            ctx.fillRect(px(wx), px(wy + wh2 / 3), ww, 4);
          }
        }
        break;
      }

      case 'lamp': {                         /* круглый фонарь на стене */
        ctx.fillStyle = col('lampPost', '#4B4744');
        ctx.fillRect(px(x + 12), px(e.y + 10), 6, 26);
        ctx.fillStyle = col('lampGlow', '#F4EFD8');
        ctx.fillRect(px(x + 4), px(e.y - 6), 22, 20);
        ctx.fillRect(px(x), px(e.y), 30, 8);
        break;
      }

      case 'grass': {                        /* газон перед корпусом */
        ctx.fillStyle = col('grass', '#7E9C55');
        ctx.fillRect(px(x), px(GROUND_Y - 14), px(e.w || 400), 14);
        ctx.fillStyle = col('grassHi', '#93B268');
        for (var g = 0; g < (e.w || 400) / 18; g++) {
          ctx.fillRect(px(x + g * 18), px(GROUND_Y - 20), 5, 8);
        }
        break;
      }

      case 'letters': {                      /* объёмные буквы у входа */
        ctx.fillStyle = col('letterPlinth', '#D6D2CC');
        ctx.fillRect(px(x), px(GROUND_Y - 22), px(e.w || 470), 12);
        ctx.font = '34px Chava, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = col('letterWhite', '#FFFFFF');
        ctx.fillText('ВЫСШАЯ ШКОЛА', px(x + 8), px(GROUND_Y - 80));
        ctx.fillStyle = C.accent;
        ctx.fillText('БИЗНЕСА ВШЭ', px(x + 8), px(GROUND_Y - 34));
        break;
      }
    }
  }
  function decoRun(e) {
    var n = e.repeat || 1;
    for (var i = 0; i < n; i++) deco(e, e.x + i * (e.step || 0));
  }

  function draw() {
    drawBackdrop(cam);

    /* дальний слой декораций */
    ctx.save();
    ctx.translate(-px(cam * FAR), 0);
    each('deco', function (e) { if (e.far) decoRun(e); });
    ctx.restore();

    ctx.save();
    ctx.translate(-px(cam), 0);

    /* ближний слой декораций — стоит на той же земле, что и персонаж */
    each('deco', function (e) { if (!e.far) decoRun(e); });

    /* надписи на фоне */
    /* Названия секций — акцентным цветом поверх декораций: фон теперь
       цветной, и приглушённый текст на нём просто терялся. */
    each('sign', function (e) {
      ctx.fillStyle = C.accent;
      ctx.font = '26px Chava, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(e.text, px(e.x), 128);
    });

    /* земля с провалами */
    var from = cam - 100, to = cam + W + 100;
    var cursor = from;
    var pits = [];
    each('pit', function (e) { pits.push(e); });
    pits.sort(function (a, b) { return a.x - b.x; });
    for (var p = 0; p < pits.length; p++) {
      var pit = pits[p];
      if (pit.x + pit.w < from || pit.x > to) continue;
      if (pit.x > cursor) drawGround(cursor, pit.x);
      cursor = pit.x + pit.w;
      ctx.fillStyle = C.accent;
      ctx.font = labelFont(pit.label || '', 22);
      ctx.textAlign = 'center';
      ctx.fillText(pit.label || '', px(pit.x + pit.w / 2), GROUND_Y + 46);
    }
    if (cursor < to) drawGround(cursor, to);

    /* платформы */
    each('block', function (e) {
      drawFrame(e.x, e.y, e.w, e.h, C.bg, C.ink);
      if (e.course) {
        /* курсы латиницей и дисциплины кириллицей — шрифт по содержимому */
        ctx.fillStyle = C.accent;
        ctx.font = labelFont(e.course, 13);
        ctx.textAlign = 'center';
        ctx.fillText(e.course, px(e.x + e.w / 2), px(e.y - 14));
      }
    });

    /* препятствия */
    each('spike', function (e) {
      ctx.fillStyle = C.accent;
      var n = Math.max(2, Math.round(e.w / 18));
      var step = e.w / n;
      for (var i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(px(e.x + i * step), GROUND_Y);
        ctx.lineTo(px(e.x + i * step + step / 2), GROUND_Y - 42);
        ctx.lineTo(px(e.x + (i + 1) * step), GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = labelFont(e.label || '', 16);
      ctx.textAlign = 'center';
      ctx.fillText(e.label || '', px(e.x + e.w / 2), GROUND_Y - 58);
    });

    /* стена */
    each('wall', function (e) {
      if (openWalls[e.id]) {
        ctx.fillStyle = C.ink20;
        ctx.fillRect(px(e.x), GROUND_Y - 12, 40, 12);
        return;
      }
      ctx.fillStyle = C.ink;
      ctx.fillRect(px(e.x), GROUND_Y - 300, 40, 300);
      ctx.fillStyle = C.bg;
      for (var i = 0; i < 8; i++) ctx.fillRect(px(e.x + 12), GROUND_Y - 280 + i * 36, 16, 16);
      ctx.fillStyle = C.accent;
      ctx.font = '17px Chava, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(e.label || '', px(e.x + 20), GROUND_Y - 316);
    });

    /* Предметы. Осязаемый артефакт (книга, сертификат) показывается сам —
       без подписи. Неосязаемое (ценность, практика) остаётся текстом.
       Собранное не рисуется вообще: ни предмет, ни подпись. */
    each('item', function (e) {
      if (fired['i:' + e.id]) return;

      var info = ITEMS[e.id] || {};
      var locked = info.locked;
      var y = e.y + Math.sin(timeNow * 3 + e.x) * 4;
      var spr = info.sprite && Sprites.get(info.sprite);

      if (spr && spr.width) {
        var box = 58;
        var k = box / Math.max(spr.width, spr.height);
        var sw = spr.width * k, sh = spr.height * k;
        ctx.drawImage(spr, px(e.x + 23 - sw / 2), px(y + 46 - sh), px(sw), px(sh));
        return;
      }

      if (locked) {
        drawFrame(e.x, y, 46, 46, C.bg, C.ink20);
        ctx.strokeStyle = C.ink40;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px(e.x + 12), px(y + 12));
        ctx.lineTo(px(e.x + 34), px(y + 34));
        ctx.moveTo(px(e.x + 34), px(y + 12));
        ctx.lineTo(px(e.x + 12), px(y + 34));
        ctx.stroke();
      } else {
        drawFrame(e.x, y, 46, 46, C.accent, C.ink);
        sevenPixels(e.x + 12, y + 13, 5, C.bg);
      }

      /* Подпись над предметом: под ним она ложилась бы на платформу,
         на которую этот предмет и поставлен. */
      ctx.fillStyle = C.accent;
      ctx.font = '14px Chava, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText((e.label || info.label || '').toUpperCase(), px(e.x + 23), px(y - 12));
    });

    /* Финиш — логотип университета. Подпись не нужна, знак говорит сам. */
    each('goal', function (e) {
      var reu = e.logo === 'reu';
      var img = Sprites.get(reu ? 'reu' : 'hse-cube');
      if (!img || !img.width) return;
      var w = reu ? 340 : 150;
      var h = w * img.height / img.width;
      /* центрируем по точке финиша: игрок вбегает в середину знака,
         а не упирается в его левый край */
      ctx.drawImage(img, px(e.x - w / 2), px(GROUND_Y - h - 58 + Math.sin(timeNow * 2) * 6),
                    px(w), px(h));
    });

    drawPlayer();
    ctx.restore();
  }

  function drawPlayer() {
    var name = 'idle';
    var flip = player.face < 0;

    if (!player.onGround) {
      name = 'jump';
    } else if (Math.abs(player.vx) > 5) {
      player.animT += 1;
      name = (Math.floor(timeNow * 9) % 2) ? 'run-b' : 'run-a';
    } else if (player.idleTime > 4) {
      name = 'sit';
    } else {
      name = (Math.floor(timeNow * 2) % 2) ? 'idle-squash' : 'idle';
    }

    /* тень тем меньше, чем выше персонаж */
    var lift = Math.max(0, GROUND_Y - player.y);
    ctx.fillStyle = C.ink20;
    var sw = Math.max(18, 46 - lift * .12);
    ctx.fillRect(px(player.x - sw / 2), GROUND_Y - 6, px(sw), 6);

    if (timeNow - hitAt < .9 && Math.floor(timeNow * 16) % 2) return;
    Sprites.draw(ctx, name, player.x, player.y, flip);
  }

  /* ------------------------------------------------------------------ */
  /* цикл                                                                */
  /* ------------------------------------------------------------------ */

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    var dt = Math.min(.05, (ts - last) / 1000);
    last = ts;
    timeNow += dt;

    if (scene === 'intro') {
      if (Intro.frame(ctx, dt, C, drawIntroBase)) {
        scene = 'none';
        var fn = sceneDone;
        sceneDone = null;
        if (fn) fn();
      }
      return;
    }

    if (scene === 'title') { drawTitleScene(); return; }
    if (scene !== 'play') return;

    if (!paused) step(dt);
    draw();
  }

  /* ------------------------------------------------------------------ */
  /* публичный интерфейс                                                 */
  /* ------------------------------------------------------------------ */

  return {
    init: function (el, callbacks) {
      canvas = el;
      ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      cb = callbacks || {};
      readColors();
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', function () {
        keys.left = keys.right = keys.jump = false;
      });
      bindTouch();
      raf = requestAnimationFrame(loop);
    },

    load: function (lv) {
      level = lv;
      P = lv.palette || {};
      fired = {};
      openWalls = {};
      branch = null;
      lastCp = 60;
      player.x = 60;
      player.y = GROUND_Y;
      player.vx = player.vy = 0;
      player.face = 1;
      player.idleTime = 0;
      player.onGround = true;
      cam = 0;
      hitAt = -999;
      keys.left = keys.right = keys.jump = false;
    },

    run: function (on) { scene = on ? 'play' : 'none'; last = 0; },

    /* 'intro' | 'title' | 'none'. Для интро можно передать колбэк завершения. */
    scene: function (name, onDone) {
      scene = name;
      sceneDone = onDone || null;
      last = 0;
      if (name === 'intro') Intro.reset();
    },

    skipIntro: function () {
      if (scene !== 'intro') return false;
      Intro.skip();
      return true;
    },

    pause: function (on) {
      paused = on;
      if (on) keys.left = keys.right = keys.jump = false;
    },
    isPaused: function () { return paused; },

    /* Сущности ветки до выбора невидимы, поэтому их триггеры и предметы
       ни разу не проверялись — сбрасывать ничего не нужно. */
    branch: function (name) { branch = name; },

    openWall: function (id) { openWalls[id] = true; },

    teleport: function (x, y) {
      player.x = x;
      player.y = (y === undefined ? GROUND_Y : y);
      player.vx = player.vy = 0;
      player.onGround = true;
      lastCp = x;
      cam = Math.max(0, x - W * .38);
    },

    progress: function () {
      if (!level) return 0;
      return Math.max(0, Math.min(1, player.x / level.length));
    },

    playerX: function () { return player.x; }
  };
})();
