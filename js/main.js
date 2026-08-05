/* ==========================================================================
   Машина состояний: титул → пролог → уровни → финал.
   ========================================================================== */

(function () {
  var $ = function (id) { return document.getElementById(id); };

  var screens = {
    title: $('scrTitle'),
    card: $('scrCard'),
    help: $('scrHelp'),
    pick: $('scrPick'),
    end: $('scrEnd')
  };

  var state = {
    index: 0,
    collected: [],       /* [{id, label, locked}] */
    margin: 100,
    marginOn: false,
    started: false
  };

  /* ------------------------------------------------------------------ */
  /* экраны                                                              */
  /* ------------------------------------------------------------------ */

  function show(name) {
    for (var k in screens) screens[k].hidden = (k !== name);
    if (name) {
      UI.hideHud();
      Engine.pause(true);
      /* под титулом канвас продолжает рисовать персонажа, под остальными
         экранами рисовать нечего */
      Engine.scene(name === 'title' ? 'title' : 'none');
    }
  }

  function hideScreens() {
    for (var k in screens) screens[k].hidden = true;
  }

  function isTouch() {
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }

  function toPlay() {
    hideScreens();
    Engine.pause(false);
  }

  /* ------------------------------------------------------------------ */
  /* предметы и HUD                                                      */
  /* ------------------------------------------------------------------ */

  function refreshItems() {
    var list = state.collected.slice();
    if (state.marginOn) {
      list.unshift({ label: 'Маржа ' + state.margin + '%', locked: state.margin < 50 });
    }
    UI.setItems(list);
  }

  function give(id) {
    var info = ITEMS[id];
    if (!info) return;
    for (var i = 0; i < state.collected.length; i++) {
      if (state.collected[i].id === id) return;
    }
    state.collected.push({ id: id, label: info.label, locked: !!info.locked });
    refreshItems();
    UI.toast(info.locked ? info.label + ' — заперто' : info.label + ' получено');
  }

  /* ------------------------------------------------------------------ */
  /* команды из реплик                                                   */
  /* ------------------------------------------------------------------ */

  function handleAction(act, done) {
    var parts = act.split(':');
    var name = parts[0], arg = parts[1];

    if (name === 'give') {
      give(arg);
    } else if (name === 'flash') {
      UI.flash();
      Audio8.sfx('hit');
    } else if (name === 'open') {
      Engine.openWall(arg);
      UI.toast('Проход открыт');
      Audio8.sfx('win');
    } else if (name === 'branch') {
      Engine.branch(arg);
      if (arg === 'agency') {
        state.marginOn = true;
        state.margin = 100;
        refreshItems();
      }
    } else if (name === 'backfork') {
      Engine.branch(null);
      state.marginOn = false;
      refreshItems();
      Engine.teleport(620);
      /* сразу переигрываем развилку — вариант с агентством уже отпал */
      UI.insert(LEVELS[state.index].talk.fork2);
    }

    done();
  }

  /* ------------------------------------------------------------------ */
  /* уровни                                                              */
  /* ------------------------------------------------------------------ */

  var pendingIndex = 0;

  function showCard(index) {
    pendingIndex = index;
    var lv = LEVELS[index];
    $('cardNum').textContent = lv.num;
    $('cardTitle').textContent = lv.title;
    $('cardSub').textContent = lv.sub;
    show('card');
  }

  function beginLevel(index) {
    state.index = index;
    var lv = LEVELS[index];
    Engine.load(lv);
    Engine.run(true);
    UI.setLevel(lv, index, LEVELS.length);
    refreshItems();
    toPlay();
  }

  function finishLevel() {
    Engine.pause(true);
    Audio8.sfx('win');
    if (state.index + 1 < LEVELS.length) {
      showCard(state.index + 1);
    } else {
      showEnd();
    }
  }

  /* ------------------------------------------------------------------ */
  /* финал                                                               */
  /* ------------------------------------------------------------------ */

  function showEnd() {
    var skills = $('endSkills');
    skills.innerHTML = '';
    ENDING.skills.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'skill';
      var bar = '';
      for (var i = 0; i < 5; i++) bar += '<i class="' + (i < s.v ? 'on' : '') + '"></i>';
      row.innerHTML = '<span>' + s.name + '</span>' +
                      '<span class="t-num">' + s.v + '/5</span>' +
                      '<span class="skill__bar">' + bar + '</span>';
      skills.appendChild(row);
    });

    var items = $('endItems');
    items.innerHTML = '';
    state.collected.forEach(function (it) {
      var info = ITEMS[it.id] || {};
      var li = document.createElement('li');
      li.innerHTML = '<span>' + it.label + (info.note ? ' — ' + info.note : '') + '</span>';
      items.appendChild(li);
    });
    if (!state.collected.length) {
      items.innerHTML = '<li><span>Ничего не собрано — попробуйте пройти уровни целиком.</span></li>';
    }

    var gaps = $('endGaps');
    gaps.innerHTML = '';
    ENDING.gaps.forEach(function (g) {
      var li = document.createElement('li');
      li.innerHTML = '<span>' + g + '</span>';
      gaps.appendChild(li);
    });

    $('endLine').textContent = ENDING.line;
    show('end');
  }

  /* ------------------------------------------------------------------ */
  /* выбор уровня                                                        */
  /* ------------------------------------------------------------------ */

  function buildPick() {
    var box = $('pickList');
    box.innerHTML = '';
    LEVELS.forEach(function (lv, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (i === 0 ? ' btn--primary' : '');
      btn.innerHTML = '<span class="seven"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
                      '<span><span class="t-lvl">' + lv.num + '</span> · ' + lv.title + '</span>';
      btn.addEventListener('click', function () {
        Audio8.sfx('ui');
        beginLevel(i);
      });
      box.appendChild(btn);
    });
  }

  /* ------------------------------------------------------------------ */
  /* кнопки                                                              */
  /* ------------------------------------------------------------------ */

  function bind() {
    $('btnStart').addEventListener('click', function () {
      Audio8.unlock();
      Audio8.sfx('ui');
      state.started = true;
      hideScreens();
      Engine.load(LEVELS[0]);
      Engine.run(true);
      Engine.pause(true);
      UI.play(PROLOGUE, function () { showCard(0); });
    });

    $('btnHelp').addEventListener('click', function () { Audio8.sfx('ui'); show('help'); });
    $('helpBack').addEventListener('click', function () { Audio8.sfx('ui'); show('title'); });
    $('btnPick').addEventListener('click', function () { Audio8.sfx('ui'); show('pick'); });
    $('pickBack').addEventListener('click', function () { Audio8.sfx('ui'); show('title'); });
    $('endPick').addEventListener('click', function () { Audio8.sfx('ui'); show('pick'); });

    $('cardGo').addEventListener('click', function () {
      Audio8.sfx('ui');
      beginLevel(pendingIndex);
    });

    $('endAgain').addEventListener('click', function () {
      Audio8.sfx('ui');
      state.collected = [];
      state.margin = 100;
      state.marginOn = false;
      state.index = 0;
      show('title');
    });

    $('soundBtn').addEventListener('click', function () {
      Audio8.unlock();
      var on = Audio8.toggle();
      this.textContent = on ? 'Звук вкл' : 'Звук выкл';
      this.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    $('btnSkip').addEventListener('click', function (e) {
      e.stopPropagation();
      endIntro();
    });

    window.addEventListener('keydown', function (e) {
      if (endIntro()) { e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === 'Escape') {
        if (UI.isBusy()) { e.preventDefault(); UI.advance(); }
      }
    });

    $('stage').addEventListener('pointerdown', function () { endIntro(); });
  }

  /* ------------------------------------------------------------------ */
  /* интро                                                               */
  /* ------------------------------------------------------------------ */

  function endIntro() {
    if (!Engine.skipIntro()) return false;
    afterIntro();
    return true;
  }

  function afterIntro() {
    $('btnSkip').hidden = true;
    show('title');
  }

  /* ------------------------------------------------------------------ */
  /* старт                                                               */
  /* ------------------------------------------------------------------ */

  function boot() {
    UI.init({ onAction: handleAction });
    buildPick();
    bind();

    Engine.init($('scene'), {
      onTrigger: function (id) {
        var talk = LEVELS[state.index].talk[id];
        if (!talk) return;
        Engine.pause(true);
        UI.play(talk, function () { toPlay(); });
      },
      onItem: function (e) {
        if (e.margin) {
          state.margin = Math.max(0, state.margin + e.margin);
          refreshItems();
          UI.toast('Маржа ' + state.margin + '%');
          return;
        }
        give(e.id);
      },
      onGoal: finishLevel,
      onHit: function () { UI.flash(); }
    });

    /* полоса прогресса обновляется отдельно от кадра — раз в 200 мс хватает */
    setInterval(function () {
      if (state.started) UI.setProgress(Engine.progress());
    }, 200);

    /* Интро играет один раз при загрузке: фото превращается в персонажа,
       он падает в кадр — и мы уже на титульном экране. */
    /* Ряд кнопок на сенсорных экранах показываем сразу и не прячем:
       иначе рамка игры прыгала бы по высоте при каждом переходе. */
    if (isTouch()) $('touch').classList.add('on');

    hideScreens();
    $('btnSkip').hidden = false;
    Engine.scene('intro', afterIntro);
  }

  /* Ждём шрифты: иначе первые кадры канваса нарисуются системным шрифтом. */
  function start() {
    Sprites.load(function () {
      if (document.fonts && document.fonts.load) {
        Promise.all([
          document.fonts.load('30px Chava'),
          document.fonts.load('800 16px Bricolage')
        ]).then(boot, boot);
      } else {
        boot();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
