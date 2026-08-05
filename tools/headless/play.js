/* ==========================================================================
   Полный прогон игры без браузера: интро, три уровня, финал.
   Бот прыгает не наугад, а когда впереди препятствие — пороги выведены из
   физики движка, поэтому прогон заодно проверяет проходимость геометрии.

   Запуск из корня проекта:
       osascript -l JavaScript tools/headless/play.js
       osascript -l JavaScript -e 'var PICK=1' -e "$(cat tools/headless/play.js)"

   PICK — какой вариант выбирать на развилках (0 или 1).
   TEXT — если задан, печатает транскрипт всех реплик.
   ========================================================================== */

ObjC.import('Foundation');
var _site = $.NSFileManager.defaultManager.currentDirectoryPath.js;
if (_site.charAt(_site.length - 1) !== '/') _site += '/';
(0, eval)($.NSString.stringWithContentsOfFileEncodingError(
  $(_site + 'tools/headless/dom.js'), $.NSUTF8StringEncoding, null).js);

var PICK_AT = (typeof PICK === 'undefined') ? 0 : PICK;
var log = [], transcript = [], seen = {};

loadGame();

var dlgText = document.getElementById('dlgText');
var choices = document.getElementById('dlgChoices');
var scrCard = document.getElementById('scrCard');
var scrEnd = document.getElementById('scrEnd');
var scrTitle = document.getElementById('scrTitle');

function pumpDialogue() {
  var guard = 0;
  while (UI.isBusy() && guard++ < 400) {
    if (!choices.hidden && choices.children.length) {
      var i = Math.min(PICK_AT, choices.children.length - 1);
      transcript.push('   [выбор] ' + choices.children[i].innerHTML.replace(/<[^>]+>/g, ''));
      choices.children[i].fire('click');
    } else {
      var t = dlgText.innerHTML.replace(/<[^>]+>/g, '');
      if (t && !seen[t]) { seen[t] = 1; transcript.push('   ' + t); }
      UI.advance();
    }
  }
  if (guard >= 400) log.push('! диалог не завершился за 400 шагов');
}

/* --- интро должно доиграть само и открыть титул --- */
var introFrames = 0;
while (scrTitle.hidden && introFrames < 900) { frame(); introFrames++; }
log.push(scrTitle.hidden
  ? '! ИНТРО НЕ ЗАВЕРШИЛОСЬ за 900 кадров'
  : 'Интро: ' + introFrames + ' кадров (~' + (introFrames / 60).toFixed(1) + ' с) → титул');

document.getElementById('btnStart').fire('click');
pumpDialogue();
if (scrCard.hidden) log.push('! после пролога не показалась карточка уровня');

var levelIndex = -1, branchNow = null, jumpHeld = false;
var totalFrames = 0, levelFrames = 0, deaths = 0;
var lastX = 0, stuckFor = 0;

/* Дальность прыжка 193 px: через препятствие шириной w нужно
   оттолкнуться не дальше чем за (193 - w) px до него. */
function needJump() {
  var lv = LEVELS[levelIndex];
  if (!lv) return false;
  var x = Engine.playerX();
  for (var i = 0; i < lv.ents.length; i++) {
    var e = lv.ents[i];
    if (e.only && e.only !== branchNow) continue;
    var d = e.x - x;
    if (d <= 0) continue;
    if (e.t === 'spike' && d < 100 && d > 25) return true;
    if (e.t === 'pit' && d < 85 && d > 25) return true;
    if (e.t === 'block' && d < 95 && d > 20) return true;
    if (e.t === 'wall' && d < 90) return true;
  }
  return false;
}

function setJump(on) { if (on !== jumpHeld) { jumpHeld = on; key('jump', on); } }

for (var loop = 0; loop < 400000; loop++) {
  if (!scrEnd.hidden) break;

  if (!scrCard.hidden) {
    if (levelIndex >= 0) {
      log.push('  пройден за ' + Math.round(levelFrames / 60) + ' с бега, откатов: ' + deaths);
    }
    log.push('  → ' + document.getElementById('cardTitle').textContent);
    levelFrames = 0; deaths = 0; levelIndex++; branchNow = null;
    document.getElementById('cardGo').fire('click');
    key('right', true);
    continue;
  }

  if (UI.isBusy()) {
    key('right', false); setJump(false);
    var before = transcript.length;
    pumpDialogue();
    var said = transcript.slice(before).join(' ');
    if (said.indexOf('Маркетинговое агентство') >= 0) branchNow = 'agency';
    if (said.indexOf('Цифровой продукт') >= 0) branchNow = 'product';
    key('right', true);
    continue;
  }

  setJump(needJump());
  frame();
  totalFrames++; levelFrames++;

  var x = Engine.playerX();
  if (x < lastX - 100) deaths++;
  if (Math.abs(x - lastX) < 0.5) stuckFor++; else stuckFor = 0;
  if (stuckFor > 600) {
    log.push('! ЗАСТРЯЛ на x=' + Math.round(x) + ' (уровень ' + (levelIndex + 1) + ')');
    break;
  }
  lastX = x;
  if (totalFrames > 60000) { log.push('! игра не завершилась'); break; }
}

if (levelIndex >= 0 && !scrEnd.hidden) {
  log.push('  пройден за ' + Math.round(levelFrames / 60) + ' с бега, откатов: ' + deaths);
}

log.push('');
log.push(scrEnd.hidden ? 'ФИНАЛ НЕ ДОСТИГНУТ' : 'Финальный экран показан');
log.push('Реплик: ' + transcript.length +
         ' · предметов: ' + document.getElementById('endItems').children.length);

console.log(log.join('\n'));
if (typeof TEXT !== 'undefined') console.log('\n--- ТРАНСКРИПТ ---\n' + transcript.join('\n'));
