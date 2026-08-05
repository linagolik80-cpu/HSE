/* ==========================================================================
   Снимок одного кадра уровня: записывает вызовы отрисовки в frame.json,
   который потом растеризует raster.py.

   Запуск из корня проекта:
       osascript -l JavaScript -e 'var LVL=0, ATX=900' -e "$(cat tools/headless/shot.js)"

   LVL — номер уровня с нуля, ATX — где поставить персонажа.
   ========================================================================== */

ObjC.import('Foundation');
var _site = $.NSFileManager.defaultManager.currentDirectoryPath.js;
if (_site.charAt(_site.length - 1) !== '/') _site += '/';
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(
  $(_site + 'tools/headless/dom.js'), $.NSUTF8StringEncoding, null).js);

var LEVEL = (typeof LVL === 'undefined') ? 0 : LVL;
var AT_X = (typeof ATX === 'undefined') ? 400 : ATX;

loadGame();

/* пропускаем интро */
for (var i = 0; i < 5; i++) frame();
key('jump', true);
key('jump', false);
frame();

if (LEVEL >= 0) {
  Engine.load(LEVELS[LEVEL]);
  Engine.run(true);
  Engine.pause(true);
  Engine.teleport(AT_X);
} else {
  Engine.scene('title');        /* LVL = -1 — снимок титульного экрана */
}
for (var j = 0; j < 5; j++) frame();

REC.on = true;
frame();
REC.on = false;

writeFile(HL + 'frame.json', JSON.stringify(REC.ops));
console.log('операций: ' + REC.ops.length +
            ' (уровень ' + (LEVEL + 1) + ', x=' + AT_X + ')');
