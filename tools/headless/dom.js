/* ==========================================================================
   Заглушка DOM для запуска игры без браузера.

   Браузера для автопроверки в системе нет, зато есть JavaScriptCore
   (osascript -l JavaScript). Этот файл поднимает минимальный DOM и канвас,
   чтобы код игры выполнялся как есть: так ловятся ошибки логики, а не только
   синтаксиса. Канвас умеет записывать вызовы отрисовки — их потом
   растеризует raster.py, и кадр можно увидеть глазами.

   Подключается из play.js и shot.js, отдельно не запускается.
   ========================================================================== */

ObjC.import('Foundation');

var SITE = $.NSFileManager.defaultManager.currentDirectoryPath.js;
if (SITE.charAt(SITE.length - 1) !== '/') SITE += '/';
var HL = SITE + 'tools/headless/';

function readFile(p) {
  return $.NSString.stringWithContentsOfFileEncodingError($(p), $.NSUTF8StringEncoding, null).js;
}

function writeFile(p, s) {
  $(s).writeToFileAtomicallyEncodingError($(p), true, $.NSUTF8StringEncoding, null);
}

/* ------------------------------------------------------------ канвас */

var REC = { on: false, ops: [] };
var tf = { tx: 0, ty: 0, sx: 1 };
var tfStack = [];

var ctx2d = {
  imageSmoothingEnabled: false,
  globalAlpha: 1,
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  font: '12px sans',
  textAlign: 'left',
  _path: [],

  save: function () {
    tfStack.push({ tx: tf.tx, ty: tf.ty, sx: tf.sx, a: this.globalAlpha, f: this.fillStyle });
  },
  restore: function () {
    var s = tfStack.pop();
    if (!s) return;
    tf.tx = s.tx; tf.ty = s.ty; tf.sx = s.sx;
    this.globalAlpha = s.a; this.fillStyle = s.f;
  },
  translate: function (x, y) { tf.tx += x * tf.sx; tf.ty += y; },
  setTransform: function (a, b, c, d, e, f) { tf.sx = a; tf.tx = e; tf.ty = f; },
  scale: function (x) { tf.sx *= x; },

  clearRect: function () {},
  strokeRect: function () {},
  stroke: function () {},
  clip: function () {},
  rect: function () {},
  closePath: function () {},
  beginPath: function () { this._path = []; },
  moveTo: function (x, y) { this._path.push([x, y]); },
  lineTo: function (x, y) { this._path.push([x, y]); },

  fill: function () {
    if (REC.on && this._path.length >= 3) {
      var pts = this._path.map(function (p) { return [tf.tx + p[0] * tf.sx, tf.ty + p[1]]; });
      REC.ops.push({ op: 'poly', pts: pts, fill: this.fillStyle, a: this.globalAlpha });
    }
    this._path = [];
  },

  fillRect: function (x, y, w, h) {
    if (!REC.on) return;
    var k = Math.abs(tf.sx);
    var X = tf.tx + (tf.sx < 0 ? -(x + w) : x) * k;
    REC.ops.push({ op: 'rect', x: X, y: tf.ty + y, w: w * k, h: h,
                   fill: this.fillStyle, a: this.globalAlpha });
  },

  fillText: function (t, x, y) {
    if (!REC.on) return;
    REC.ops.push({ op: 'text', text: t, x: tf.tx + x * tf.sx, y: tf.ty + y,
                   font: this.font, align: this.textAlign,
                   fill: this.fillStyle, a: this.globalAlpha });
  },

  drawImage: function (img) {
    if (!REC.on) return;
    var a = Array.prototype.slice.call(arguments);
    var d = a.length >= 9 ? a.slice(5) : a.slice(1);
    var x = d[0], y = d[1], w = d[2], h = d[3];
    if (w === undefined) { w = img.width; h = img.height; }
    var k = Math.abs(tf.sx);
    var X = tf.tx + (tf.sx < 0 ? -(x + w) : x) * k;
    REC.ops.push({ op: 'img', src: img.src || '', x: X, y: tf.ty + y,
                   w: w * k, h: h, a: this.globalAlpha });
  }
};

/* --------------------------------------------------------------- DOM */

function El(tag) {
  this.tagName = tag || 'div';
  this.hidden = false;
  this._text = ''; this._html = ''; this.className = '';
  this.children = []; this.style = {}; this.attrs = {}; this.handlers = {};
  this.offsetWidth = 100; this.width = 960; this.height = 540;
  var self = this;
  this.classList = {
    add: function (c) { if (self.className.indexOf(c) < 0) self.className += ' ' + c; },
    remove: function (c) {
      self.className = self.className.split(' ').filter(function (x) { return x !== c; }).join(' ');
    },
    contains: function (c) { return self.className.indexOf(c) >= 0; }
  };
}

Object.defineProperty(El.prototype, 'textContent', {
  get: function () { return this._text; },
  set: function (v) { this._text = String(v); }
});
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); if (v === '') this.children = []; }
});

El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (t, h) { (this.handlers[t] = this.handlers[t] || []).push(h); };
El.prototype.removeEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
El.prototype.getAttribute = function (k) { return this.attrs[k]; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.closest = function () { return null; };
El.prototype.getContext = function () { return ctx2d; };
/* Размер рамки задаётся снаружи (VIEW_W/VIEW_H) — так можно снять кадр
   в пропорциях телефона, а не только монитора. */
El.prototype.getBoundingClientRect = function () {
  return { width: (typeof VIEW_W !== 'undefined' ? VIEW_W : 960),
           height: (typeof VIEW_H !== 'undefined' ? VIEW_H : 540) };
};
El.prototype.fire = function (type, ev) {
  var list = this.handlers[type] || [];
  ev = ev || { target: { closest: function () { return null; } },
               preventDefault: function () {}, stopPropagation: function () {} };
  for (var i = 0; i < list.length; i++) list[i].call(this, ev);
};

var nodes = {};
var document = {
  readyState: 'complete',
  fonts: null,
  documentElement: new El('html'),
  getElementById: function (id) { return nodes[id] || (nodes[id] = new El('div')); },
  createElement: function (t) { return new El(t); },
  addEventListener: function () {}
};

var winHandlers = {};
var rafCb = null;
var window = {
  addEventListener: function (t, h) { (winHandlers[t] = winHandlers[t] || []).push(h); },
  matchMedia: function () { return { matches: false }; },
  requestAnimationFrame: function (cb) { rafCb = cb; return 1; },
  AudioContext: undefined
};

function requestAnimationFrame(cb) { rafCb = cb; return 1; }
function getComputedStyle() { return { getPropertyValue: function () { return ''; } }; }
function setInterval() { return 1; }
function setTimeout() { return 1; }
function clearTimeout() {}

/* Размеры картинок берём из таблицы: без неё разметка кадра поедет.
   Таблицу готовит raster.py --sizes. */
var SIZES = {};
try { SIZES = JSON.parse(readFile(HL + 'sizes.json')); } catch (e) {}

function Image() {
  var self = this;
  this.width = 0; this.height = 0;
  var src = '';
  Object.defineProperty(this, 'src', {
    get: function () { return src; },
    set: function (v) {
      src = v;
      var d = SIZES[v];
      if (d) { self.width = d[0]; self.height = d[1]; }
      else { self.width = 100; self.height = 100; }
      if (self.onload) self.onload();
    }
  });
}

/* --------------------------------------------------- загрузка игры */

var G = this;
G.document = document;
G.window = window;
G.requestAnimationFrame = requestAnimationFrame;
G.getComputedStyle = getComputedStyle;
G.setInterval = setInterval;
G.setTimeout = setTimeout;
G.clearTimeout = clearTimeout;
G.Image = Image;

var GAME_FILES = ['assets/sprites/sprites.js', 'js/audio.js', 'js/sprites.js',
                  'js/content.js', 'js/intro.js', 'js/engine.js', 'js/ui.js', 'js/main.js'];

function loadGame() {
  GAME_FILES.forEach(function (f) { (0, eval)(readFile(SITE + f)); });
}

var clock = 0;
function frame() {
  var cb = rafCb;
  rafCb = null;
  if (cb) cb(clock);
  clock += 16.7;
}

function key(name, down) {
  var map = { right: 'ArrowRight', left: 'ArrowLeft', jump: ' ' };
  (winHandlers[down ? 'keydown' : 'keyup'] || []).forEach(function (h) {
    h({ key: map[name], preventDefault: function () {} });
  });
}
