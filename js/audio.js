/* ==========================================================================
   Звук. Всё синтезируется на WebAudio — внешних аудиофайлов нет.
   По умолчанию выключен: сайт могут открыть в тишине приёмной комиссии.
   AudioContext создаётся только после первого клика, иначе браузер его
   заблокирует.
   ========================================================================== */

var Audio8 = (function () {
  var ctx = null;
  var master = null;
  var enabled = false;
  var loopTimer = null;
  var step = 0;

  // Пентатоника — почти любые сочетания звучат мирно, а не как ошибка.
  var BASS = [110.00, 110.00, 146.83, 110.00, 164.81, 146.83, 110.00, 98.00];
  var LEAD = [440.00, 0, 587.33, 493.88, 0, 659.25, 587.33, 0,
              440.00, 0, 493.88, 0, 587.33, 0, 392.00, 0];

  function boot() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }

  function blip(freq, when, dur, type, vol) {
    if (!ctx || !freq) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(vol == null ? .18 : vol, when + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur + .02);
  }

  function tick() {
    if (!ctx || !enabled) return;
    var t = ctx.currentTime + .02;
    blip(BASS[step % BASS.length], t, .18, 'triangle', .22);
    var lead = LEAD[step % LEAD.length];
    if (lead) blip(lead, t, .12, 'square', .07);
    step++;
  }

  return {
    /* Вызывается из обработчика клика — тогда контекст точно разрешат. */
    unlock: function () {
      boot();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    isOn: function () { return enabled; },

    toggle: function () {
      boot();
      enabled = !enabled;
      if (!ctx) return false;
      if (ctx.state === 'suspended') ctx.resume();
      master.gain.setTargetAtTime(enabled ? .5 : 0, ctx.currentTime, .05);
      if (enabled && !loopTimer) loopTimer = setInterval(tick, 250);
      if (!enabled && loopTimer) { clearInterval(loopTimer); loopTimer = null; }
      return enabled;
    },

    sfx: function (name) {
      if (!ctx || !enabled) return;
      var t = ctx.currentTime;
      if (name === 'jump') {
        blip(392, t, .1, 'square', .16);
        blip(587, t + .05, .1, 'square', .12);
      } else if (name === 'pick') {
        blip(659, t, .08, 'square', .16);
        blip(880, t + .07, .08, 'square', .16);
        blip(1174, t + .14, .12, 'square', .14);
      } else if (name === 'hit') {
        blip(196, t, .12, 'sawtooth', .18);
        blip(147, t + .1, .2, 'sawtooth', .16);
      } else if (name === 'ui') {
        blip(523, t, .05, 'square', .1);
      } else if (name === 'win') {
        [523, 659, 784, 1047].forEach(function (f, i) {
          blip(f, t + i * .11, .22, 'square', .16);
        });
      } else if (name === 'deny') {
        blip(233, t, .09, 'square', .16);
        blip(220, t + .09, .18, 'square', .14);
      }
    }
  };
})();
