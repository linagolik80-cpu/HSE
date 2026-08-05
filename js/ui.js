/* ==========================================================================
   Интерфейс: диалоговая панель, кнопки выбора, HUD, экраны, тосты.
   Здесь же — проигрыватель реплик (beats) из content.js.
   ========================================================================== */

var UI = (function () {
  var el = {};
  var queue = [];
  var onDone = null;
  var actionHandler = null;
  var busy = false;

  function $(id) { return document.getElementById(id); }

  function init(handlers) {
    el.dialogue = $('dialogue');
    el.who = $('dlgWho');
    el.text = $('dlgText');
    el.choices = $('dlgChoices');
    el.next = $('dlgNext');
    el.toast = $('toast');
    el.toastText = $('toastText');
    el.hud = $('hud');
    el.hudNum = $('hudNum');
    el.hudTitle = $('hudTitle');
    el.hudItems = $('hudItems');
    el.hudProgress = $('hudProgress');
    el.flash = $('flash');
    actionHandler = handlers.onAction;

    el.dialogue.addEventListener('click', function (e) {
      if (e.target.closest('.btn')) return;
      advance();
    });

    /* полоса прогресса — 24 пиксельных сегмента */
    for (var i = 0; i < 24; i++) el.hudProgress.appendChild(document.createElement('span'));
  }

  /* ------------------------------------------------------------------ */
  /* проигрыватель реплик                                                */
  /* ------------------------------------------------------------------ */

  function play(beats, done) {
    queue = beats.slice();
    onDone = done || null;
    busy = true;
    el.dialogue.hidden = false;
    next();
  }

  /* Вклинить реплики в текущую очередь, не сбивая колбэк завершения.
     Нужно, когда команда из beat порождает новый диалог (возврат к развилке). */
  function insert(beats) {
    queue = beats.concat(queue);
  }

  function next() {
    if (!queue.length) {
      el.dialogue.hidden = true;
      el.choices.hidden = true;
      busy = false;
      var fn = onDone;
      onDone = null;
      if (fn) fn();
      return;
    }

    var beat = queue.shift();

    if (beat.act) {
      if (actionHandler) actionHandler(beat.act, next);
      else next();
      return;
    }

    if (beat.give) {
      if (actionHandler) actionHandler('give:' + beat.give, next);
      else next();
      return;
    }

    if (beat.ask) {
      showAsk(beat);
      return;
    }

    el.who.textContent = beat.who || 'Ангелина';
    el.text.innerHTML = beat.t;
    el.choices.hidden = true;
    el.choices.innerHTML = '';
    el.next.hidden = false;
    Audio8.sfx('ui');
  }

  function showAsk(beat) {
    el.who.textContent = beat.who || 'Развилка';
    el.text.innerHTML = beat.ask;
    el.next.hidden = true;
    el.choices.hidden = false;
    el.choices.innerHTML = '';

    beat.opts.forEach(function (opt) {
      if (opt.off) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.innerHTML = '<span class="seven"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
                      '<span>' + opt.label + '</span>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        Audio8.sfx('ui');
        el.choices.hidden = true;
        el.choices.innerHTML = '';
        queue = (opt.then || []).concat(queue);
        next();
      });
      el.choices.appendChild(btn);
    });
  }

  function advance() {
    if (!busy) return;
    if (!el.choices.hidden) return;      /* ждём выбора */
    next();
  }

  /* ------------------------------------------------------------------ */
  /* HUD                                                                 */
  /* ------------------------------------------------------------------ */

  function setLevel(level, index, total) {
    el.hud.hidden = false;
    el.hudNum.textContent = level.num + '/0' + total;
    el.hudTitle.textContent = level.title;
  }

  function setItems(list) {
    el.hudItems.innerHTML = '';
    list.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (item.locked ? ' chip--locked' : '');
      chip.textContent = item.label;
      el.hudItems.appendChild(chip);
    });
  }

  function setProgress(p) {
    var cells = el.hudProgress.children;
    var on = Math.round(p * cells.length);
    for (var i = 0; i < cells.length; i++) {
      cells[i].className = i < on ? 'on' : '';
    }
  }

  function hideHud() { el.hud.hidden = true; }

  /* ------------------------------------------------------------------ */
  /* мелочи                                                              */
  /* ------------------------------------------------------------------ */

  var toastTimer = null;

  function toast(text) {
    el.toastText.textContent = text;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 1800);
  }

  function flash() {
    el.flash.classList.remove('on');
    void el.flash.offsetWidth;
    el.flash.classList.add('on');
  }

  return {
    init: init,
    play: play,
    insert: insert,
    advance: advance,
    isBusy: function () { return busy; },
    setLevel: setLevel,
    setItems: setItems,
    setProgress: setProgress,
    hideHud: hideHud,
    toast: toast,
    flash: flash
  };
})();
