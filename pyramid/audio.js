/* PYR.Audio — procedural WebAudio sound engine, no asset files.
 * Plain script (not a module); attaches to window.PYR.
 * Contract: play(name), startMusic('menu'|'game'), stopMusic(),
 *           toggleMute()->bool, isMuted(), resume(), ensure()
 * Never throws if WebAudio is unavailable — all calls become no-ops.
 */
(function (global) {
  'use strict';

  var PYR = global.PYR = global.PYR || {};
  var MUTE_KEY = 'pyr_mute';

  var ctx = null;
  var master = null;
  var musicNodes = null; // { stop() }
  var muted = false;
  var supported = true;

  function readMuteFromStorage() {
    try {
      var v = global.localStorage && global.localStorage.getItem(MUTE_KEY);
      return v === '1' || v === 'true';
    } catch (e) { return false; }
  }
  function writeMuteToStorage(v) {
    try {
      if (global.localStorage) global.localStorage.setItem(MUTE_KEY, v ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  muted = readMuteFromStorage();

  function AudioCtor() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function ensure() {
    if (!supported) return null;
    if (ctx) return ctx;
    try {
      var C = AudioCtor();
      if (!C) { supported = false; return null; }
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      return ctx;
    } catch (e) {
      supported = false;
      ctx = null;
      return null;
    }
  }

  function resume() {
    try {
      var c = ensure();
      if (c && c.state === 'suspended' && typeof c.resume === 'function') {
        c.resume().catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }

  function isMuted() { return !!muted; }

  function toggleMute() {
    muted = !muted;
    writeMuteToStorage(muted);
    try {
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.02);
    } catch (e) { /* ignore */ }
    return muted;
  }

  // ---- low level helpers ----
  function now() {
    try { return ctx.currentTime; } catch (e) { return 0; }
  }

  function mkGain(gainVal) {
    var g = ctx.createGain();
    g.gain.value = gainVal == null ? 1 : gainVal;
    g.connect(master);
    return g;
  }

  function envGain(g, t0, attack, decay, peak, sustainLevel, releaseEnd) {
    var p = g.gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(0.0001, t0);
    p.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    p.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), t0 + attack + decay);
    p.exponentialRampToValueAtTime(0.0001, releaseEnd);
  }

  function tone(freq, t0, dur, opts) {
    opts = opts || {};
    var type = opts.type || 'sine';
    var gainVal = opts.gain == null ? 0.22 : opts.gain;
    var osc = ctx.createOscillator();
    var g = mkGain(1);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    }
    osc.connect(g);
    envGain(g, t0, opts.attack || 0.008, opts.decay || dur * 0.3, gainVal, gainVal * (opts.sustain == null ? 0.3 : opts.sustain), t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return osc;
  }

  function noiseBurst(t0, dur, opts) {
    opts = opts || {};
    var bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, opts.decayPow || 2);
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.filterType || 'bandpass';
    filt.frequency.value = opts.freq || 1200;
    filt.Q.value = opts.q || 0.8;
    var g = mkGain(opts.gain == null ? 0.18 : opts.gain);
    src.connect(filt);
    filt.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    return src;
  }

  function chime(freqs, t0, dur, gainVal) {
    freqs.forEach(function (f, idx) {
      tone(f, t0 + idx * 0.015, dur, { type: 'sine', gain: (gainVal || 0.15) / (idx + 1), attack: 0.004, decay: dur * 0.5, sustain: 0.15 });
    });
  }

  // ---- sound library ----
  var SOUNDS = {
    pivot: function (t0) {
      noiseBurst(t0, 0.16, { filterType: 'bandpass', freq: 900, q: 0.6, gain: 0.1, decayPow: 2.4 });
      tone(260, t0, 0.14, { type: 'sine', gain: 0.06, slideTo: 190, attack: 0.01 });
    },
    claim: function (t0) {
      chime([880, 1108.7, 1318.5], t0, 0.55, 0.16);
    },
    gemArm: function (t0) {
      chime([1318.5, 1760], t0, 0.3, 0.08);
    },
    draw: function (t0) {
      noiseBurst(t0, 0.1, { filterType: 'highpass', freq: 2200, q: 0.5, gain: 0.07, decayPow: 3 });
      tone(520, t0 + 0.01, 0.09, { type: 'triangle', gain: 0.05, attack: 0.005 });
    },
    buy: function (t0) {
      chime([523.25, 659.25], t0, 0.32, 0.13);
    },
    turn: function (t0) {
      tone(392, t0, 0.16, { type: 'sine', gain: 0.09, attack: 0.006, decay: 0.1 });
      tone(523.25, t0 + 0.09, 0.18, { type: 'sine', gain: 0.09, attack: 0.006, decay: 0.12 });
    },
    duel: function (t0) {
      tone(146.8, t0, 0.5, { type: 'sawtooth', gain: 0.1, slideTo: 110, attack: 0.02 });
      tone(220, t0 + 0.06, 0.4, { type: 'sawtooth', gain: 0.07, slideTo: 164.8, attack: 0.02 });
      noiseBurst(t0, 0.3, { filterType: 'bandpass', freq: 600, q: 0.5, gain: 0.06 });
    },
    pyramid: function (t0) {
      var seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach(function (f, idx) {
        tone(f, t0 + idx * 0.11, 0.5, { type: 'triangle', gain: 0.15, attack: 0.008, decay: 0.3, sustain: 0.25 });
      });
      chime([1046.5, 1318.5, 1568], t0 + 0.44, 0.9, 0.14);
    },
    win: function (t0) {
      var seq = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      seq.forEach(function (f, idx) {
        tone(f, t0 + idx * 0.09, 0.4, { type: 'sine', gain: 0.14, attack: 0.006, decay: 0.2, sustain: 0.2 });
      });
    },
    lose: function (t0) {
      var seq = [392, 349.2, 293.7, 246.9];
      seq.forEach(function (f, idx) {
        tone(f, t0 + idx * 0.14, 0.4, { type: 'sine', gain: 0.11, attack: 0.01, decay: 0.25, sustain: 0.15 });
      });
    },
    click: function (t0) {
      tone(700, t0, 0.045, { type: 'square', gain: 0.045, attack: 0.002, decay: 0.03 });
    },
    error: function (t0) {
      tone(196, t0, 0.18, { type: 'square', gain: 0.08, slideTo: 146.8, attack: 0.004 });
    }
  };

  function play(name) {
    var c = ensure();
    if (!c || muted) return;
    var fn = SOUNDS[name];
    if (!fn) return;
    try {
      resume();
      fn(now() + 0.001);
    } catch (e) { /* never throw */ }
  }

  // ---- ambient music ----
  function makeMusicNode(kind) {
    var c = ctx;
    var bus = c.createGain();
    bus.gain.value = 0.0001;
    bus.connect(master);
    bus.gain.setTargetAtTime(kind === 'menu' ? 0.06 : 0.05, c.currentTime, 1.2);

    var oscs = [];
    var lfo = c.createOscillator();
    var lfoGain = c.createGain();
    lfo.frequency.value = kind === 'menu' ? 0.05 : 0.035;
    lfoGain.gain.value = kind === 'menu' ? 6 : 4;
    lfo.connect(lfoGain);

    var baseFreqs = kind === 'menu' ? [98, 146.8, 220] : [87.3, 130.8, 196];
    baseFreqs.forEach(function (f, idx) {
      var osc = c.createOscillator();
      osc.type = idx === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      var g = c.createGain();
      g.gain.value = idx === 0 ? 0.5 : 0.22 / (idx + 1);
      lfoGain.connect(osc.frequency);
      osc.connect(g);
      g.connect(bus);
      osc.start();
      oscs.push(osc);
    });
    lfo.start();
    oscs.push(lfo);

    // gentle filtered noise pad for texture
    var padDur = 4;
    var padBuf = c.createBuffer(1, Math.floor(c.sampleRate * padDur), c.sampleRate);
    var padData = padBuf.getChannelData(0);
    for (var i = 0; i < padData.length; i++) padData[i] = (Math.random() * 2 - 1) * 0.4;
    var padSrc = c.createBufferSource();
    padSrc.buffer = padBuf;
    padSrc.loop = true;
    var padFilt = c.createBiquadFilter();
    padFilt.type = 'lowpass';
    padFilt.frequency.value = kind === 'menu' ? 500 : 380;
    var padGain = c.createGain();
    padGain.gain.value = 0.05;
    padSrc.connect(padFilt);
    padFilt.connect(padGain);
    padGain.connect(bus);
    padSrc.start();

    return {
      stop: function () {
        var t = c.currentTime;
        try { bus.gain.setTargetAtTime(0.0001, t, 0.4); } catch (e) {}
        oscs.forEach(function (o) {
          try { o.stop(t + 1.2); } catch (e) {}
        });
        try { padSrc.stop(t + 1.2); } catch (e) {}
      }
    };
  }

  function startMusic(kind) {
    var c = ensure();
    if (!c) return;
    try {
      stopMusic();
      resume();
      musicNodes = makeMusicNode(kind === 'menu' ? 'menu' : 'game');
    } catch (e) { /* never throw */ }
  }

  function stopMusic() {
    if (musicNodes) {
      try { musicNodes.stop(); } catch (e) { /* ignore */ }
      musicNodes = null;
    }
  }

  PYR.Audio = {
    play: play,
    startMusic: startMusic,
    stopMusic: stopMusic,
    toggleMute: toggleMute,
    isMuted: isMuted,
    resume: resume,
    ensure: ensure
  };

})(typeof window !== 'undefined' ? window : this);
