/* ==========================================================================
   Загрузка спрайтов и отрисовка с якорем.
   Размеры и якоря приходят из assets/sprites/sprites.js (генерирует
   tools/prep_sprites.py). Якорь — точка «под ступнями»: кадры обрезаны по
   разным габаритам, поэтому по центру рамки их выравнивать нельзя.
   ========================================================================== */

var Sprites = (function () {
  var NAMES = ['idle', 'idle-squash', 'run-a', 'run-b', 'jump', 'sit', 'hse-cube'];

  /* Файлы не из набора спрайтов: фото для интро, артефакты и логотип РЭУ. */
  var EXTRA = {
    photo: 'assets/photo.jpg',
    book: 'assets/sprites/book.png',
    cert: 'assets/sprites/cert.png',
    reu: 'assets/sprites/reu.png',
    research: 'assets/sprites/research.png',
    diploma: 'assets/sprites/diploma.png'
  };

  var images = {};
  var meta = window.SPRITE_META || {};

  /* Высота персонажа в игровых единицах. Все кадры масштабируются одним
     коэффициентом от роста idle, поэтому «сплющенные» кадры остаются
     сплющенными — это и есть squash & stretch, задуманный в арте. */
  var BASE_H = 96;
  var scale = meta.idle ? BASE_H / meta.idle.h : 1;

  return {
    load: function (done) {
      var jobs = [];
      NAMES.forEach(function (name) {
        jobs.push([name, 'assets/sprites/' + name + '.png']);
      });
      for (var key in EXTRA) jobs.push([key, EXTRA[key]]);

      var left = jobs.length;
      if (!left) return done();
      jobs.forEach(function (job) {
        var img = new Image();
        img.onload = img.onerror = function () {
          if (--left === 0) done();
        };
        img.src = job[1];
        images[job[0]] = img;
      });
    },

    get: function (name) { return images[name]; },
    meta: function (name) { return meta[name]; },
    scale: function () { return scale; },
    height: function (name) {
      var m = meta[name];
      return m ? m.h * scale : BASE_H;
    },
    width: function (name) {
      var m = meta[name];
      return m ? m.w * scale : BASE_H / 2;
    },

    /* Рисует кадр так, чтобы точка (x, y) оказалась под ступнями.
       flip — отражение по горизонтали (бег влево). */
    draw: function (ctx, name, x, y, flip, sc) {
      var img = images[name];
      var m = meta[name];
      if (!img || !m || !img.width) return;
      var s = (sc || 1) * scale;
      var w = m.w * s;
      var h = m.h * s;
      var ax = m.anchorX * s;

      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, Math.round(-ax), Math.round(-h), Math.round(w), Math.round(h));
      ctx.restore();
    }
  };
})();
