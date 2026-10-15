// The Chronicler — ambient music.
//
// A small generative synth in the manner of a 16-bit console: soft triangle,
// pulse and sine voices, a shared echo and room, everything in D. Each zone
// has its own mode, tempo and texture; zones crossfade as you walk.
//
//   forest  D major pentatonic, slow triangle walk, wind, a bird now and then
//   temple  D dorian, held pulse chords, struck bells, a long room
//   grove   D lydian, glassy rising figures, a slow shimmer
//   heights D phrygian, low notes, wind, a drone that breathes
//   beach   D mixolydian, two-note phrases over the swell of the sea
//   wild    whole tones that will not hold their pitch
//   camp    D minor pentatonic, a plucked tune, fire
//   vision  a low drone and very high, very slow notes
(function () {
  'use strict';

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const VOLUME = 0.7;

  let ctx = null, master = null, bus = null, noiseBuf = null, waves = {};
  let muted = false, started = false, timer = null;
  const live = new Map(); // zone name -> instance
  let wanted = null;

  try { muted = localStorage.getItem('chronicler.sound') === 'off'; } catch (e) {}

  // ─── Graph ──────────────────────────────────────────────────────────────
  function build(c) {
    ctx = c;
    master = ctx.createGain();
    master.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 5200; tone.Q.value = 0.3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.05; comp.release.value = 0.6;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);

    bus = ctx.createGain();
    bus.connect(master);
    // The echo: a darkening feedback delay, the console kind.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2000;
    const echoOut = ctx.createGain(); echoOut.gain.value = 0.3;
    bus.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay); dark.connect(echoOut); echoOut.connect(master);
    // The room
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.34;
    bus.connect(verb); verb.connect(wet); wet.connect(master);

    // Pulse waves (25% and 12.5% duty), band-limited
    const pulse = duty => {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return ctx.createPeriodicWave(re, im);
    };
    waves = { pulse25: pulse(0.25), pulse12: pulse(0.125) };
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function osc(type) {
    const o = ctx.createOscillator();
    if (waves[type]) o.setPeriodicWave(waves[type]); else o.type = type;
    return o;
  }

  // ─── Voices (each bound to one zone's gain) ─────────────────────────────
  function voices(out) {
    const v = {};
    // A single note with an envelope, through a lowpass.
    v.note = (m, t, dur, o = {}) => {
      const f = mtof(m) * (o.mul || 1);
      const s = osc(o.type || 'triangle');
      s.frequency.setValueAtTime(f, t);
      if (o.glide) s.frequency.linearRampToValueAtTime(mtof(m + o.glide) * (o.mul || 1), t + dur);
      if (o.detune) s.detune.value = o.detune;
      let lfo = null;
      if (o.vibrato) {
        lfo = ctx.createOscillator(); lfo.frequency.value = o.vibRate || 4.5;
        const lg = ctx.createGain(); lg.gain.value = f * (Math.pow(2, o.vibrato / 1200) - 1);
        lfo.connect(lg); lg.connect(s.frequency); lfo.start(t); lfo.stop(t + dur + (o.release || 1) * 3);
      }
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = o.cutoff || 2400;
      const g = ctx.createGain();
      const a = o.attack || 0.02, r = o.release || 1, vol = o.vol || 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.setTargetAtTime(0, t + Math.max(a, dur), r / 3);
      s.connect(flt); flt.connect(g); g.connect(out);
      s.start(t); s.stop(t + Math.max(a, dur) + r * 2);
    };
    // A struck bell: a pure tone and an inharmonic partial.
    v.bell = (m, t, vol) => {
      v.note(m, t, 0.05, { type: 'sine', vol, attack: 0.004, release: 4.5, cutoff: 6000 });
      v.note(m, t, 0.03, { type: 'sine', vol: vol * 0.28, attack: 0.004, release: 1.6, cutoff: 6000, mul: 2.756 });
    };
    // A short burst of filtered noise (fire, footfall, grit).
    v.burst = (t, dur, freq, q, vol) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf;
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(flt); flt.connect(g); g.connect(out);
      src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.02);
    };
    // A bird: a little falling-rising whistle.
    v.chirp = (t, vol) => {
      const s = osc('sine'), g = ctx.createGain();
      const f0 = 2200 + Math.random() * 1400;
      s.frequency.setValueAtTime(f0, t);
      s.frequency.exponentialRampToValueAtTime(f0 * (0.75 + Math.random() * 0.6), t + 0.09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(g); g.connect(out); s.start(t); s.stop(t + 0.15);
    };
    // A held drone, with optional slow breathing (amplitude) and drift (pitch).
    v.drone = (m, o = {}) => {
      const s = osc(o.type || 'triangle');
      s.frequency.value = mtof(m);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = o.cutoff || 1200;
      const g = ctx.createGain(); g.gain.value = o.vol || 0.03;
      s.connect(flt); flt.connect(g); g.connect(out);
      const nodes = [s];
      if (o.breathe) {
        const l = ctx.createOscillator(); l.frequency.value = o.breathe.rate;
        const lg = ctx.createGain(); lg.gain.value = o.breathe.depth;
        l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l);
      }
      if (o.drift) {
        const l = ctx.createOscillator(); l.frequency.value = o.drift.rate;
        const lg = ctx.createGain(); lg.gain.value = o.drift.cents;
        l.connect(lg); lg.connect(s.detune); l.start(); nodes.push(l);
      }
      s.start();
      return nodes;
    };
    // Continuous filtered noise (wind, surf), with a gain you can shape.
    v.air = (o = {}) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = o.type || 'bandpass'; flt.frequency.value = o.freq || 800; flt.Q.value = o.q || 0.7;
      const g = ctx.createGain(); g.gain.value = o.vol || 0.01;
      src.connect(flt); flt.connect(g); g.connect(out);
      const nodes = [src];
      if (o.sweep) {
        const l = ctx.createOscillator(); l.frequency.value = o.sweep.rate;
        const lg = ctx.createGain(); lg.gain.value = o.sweep.depth;
        l.connect(lg); lg.connect(flt.frequency); l.start(); nodes.push(l);
      }
      src.start();
      return { nodes, gain: g, filter: flt };
    };
    return v;
  }

  // ─── The zones ──────────────────────────────────────────────────────────
  const ZONES = {
    forest: {
      beat: 1.15,
      start(v, z) {
        return [...v.drone(38, { vol: 0.05, cutoff: 500 }), ...v.drone(45, { vol: 0.03, cutoff: 500 }),
          ...v.air({ freq: 900, q: 0.5, vol: 0.006, sweep: { rate: 0.05, depth: 300 } }).nodes];
      },
      step(v, t, b, z) {
        const sc = [62, 64, 66, 69, 71, 74, 76, 78];
        z.i = Math.max(0, Math.min(sc.length - 1, (z.i ?? 3) + pick([-2, -1, -1, 1, 1, 2])));
        if (Math.random() < 0.42) v.note(sc[z.i], t, 1.3, { vol: 0.07, release: 1.4, cutoff: 2600 });
        if (b % 8 === 0) v.note(pick([50, 57, 55]), t, this.beat * 6, { type: 'pulse12', vol: 0.02, attack: 1.6, release: 2.5, cutoff: 900 });
        if (Math.random() < 0.06) v.chirp(t + Math.random() * this.beat, 0.012);
      },
    },
    temple: {
      beat: 1.7,
      start(v) {
        return [...v.drone(38, { type: 'sine', vol: 0.05 }), ...v.drone(50, { type: 'pulse12', vol: 0.01, cutoff: 700, drift: { rate: 0.07, cents: 5 } })];
      },
      step(v, t, b, z) {
        const chords = [[50, 57, 65], [48, 55, 64], [55, 59, 62], [57, 60, 64]];
        if (b % 6 === 0) {
          z.c = ((z.c ?? -1) + 1) % chords.length;
          for (const m of chords[z.c]) for (const d of [-7, 7])
            v.note(m, t, this.beat * 6, { type: 'pulse12', vol: 0.014, attack: 2.6, release: 3, cutoff: 950, detune: d });
        }
        if (Math.random() < 0.22) v.bell(pick([74, 76, 77, 79, 81, 84]), t + Math.random() * 0.4, 0.045);
      },
    },
    grove: {
      beat: 1.35,
      start(v) {
        return [...v.drone(50, { type: 'sine', vol: 0.03, breathe: { rate: 0.1, depth: 0.014 } }),
          ...v.drone(57, { type: 'sine', vol: 0.02, breathe: { rate: 0.13, depth: 0.01 } })];
      },
      step(v, t, b) {
        const sc = [62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81];
        if (b % 4 === 0 && Math.random() < 0.75) {
          const i = Math.floor(Math.random() * 6);
          [0, 2, 4].forEach((k, n) => {
            v.note(sc[i + k], t + n * 0.34, 1.2, { vol: 0.045, release: 2.6, vibrato: 7, cutoff: 3200 });
            v.note(sc[i + k] + 12, t + n * 0.34, 0.8, { type: 'sine', vol: 0.011, release: 3, vibrato: 12 });
          });
        } else if (Math.random() < 0.25) v.note(pick(sc.slice(6)), t, 1, { type: 'sine', vol: 0.03, release: 3, vibrato: 10 });
      },
    },
    heights: {
      beat: 2.3,
      start(v) {
        return [...v.drone(33, { vol: 0.055, cutoff: 300, breathe: { rate: 1 / 6.5, depth: 0.04 } }),
          ...v.drone(45, { type: 'sine', vol: 0.018, breathe: { rate: 1 / 6.5, depth: 0.014 } }),
          ...v.air({ freq: 520, q: 1.2, vol: 0.013, sweep: { rate: 0.07, depth: 260 } }).nodes];
      },
      step(v, t) {
        if (Math.random() < 0.22) v.note(pick([38, 39, 43, 45, 46, 50]), t, 4, { type: 'pulse25', vol: 0.05, attack: 1.2, release: 3, cutoff: 450 });
        if (Math.random() < 0.08) v.note(pick([81, 86]), t, 2, { type: 'sine', vol: 0.01, attack: 0.8, release: 3 });
      },
    },
    beach: {
      beat: 1.25,
      start(v, z) {
        z.sea = v.air({ type: 'lowpass', freq: 650, q: 0.4, vol: 0.004 });
        z.hiss = v.air({ type: 'highpass', freq: 3800, q: 0.4, vol: 0.0006 });
        return [...v.drone(38, { vol: 0.035, cutoff: 400 }), ...z.sea.nodes, ...z.hiss.nodes];
      },
      step(v, t, b, z) {
        if (b % 6 === 0) {
          // One wave: a slow swell in, a longer fall back.
          for (const [n, peak] of [[z.sea, 0.09], [z.hiss, 0.008]]) {
            n.gain.gain.setTargetAtTime(peak, t, 1.1);
            n.gain.gain.setTargetAtTime(peak * 0.07, t + 3, 1.6);
          }
        }
        const sc = [62, 64, 66, 67, 69, 71, 72, 74, 76];
        if (Math.random() < 0.3) {
          const i = Math.floor(Math.random() * (sc.length - 2));
          v.note(sc[i], t, 1.1, { type: 'pulse25', vol: 0.05, cutoff: 1700, release: 1.5 });
          v.note(sc[i + pick([1, 2, -1].filter(d => sc[i + d]))], t + this.beat * 0.5, 1.1, { type: 'pulse25', vol: 0.045, cutoff: 1700, release: 1.8 });
        }
        if (Math.random() < 0.03) v.note(pick([88, 91]), t, 0.5, { type: 'sine', vol: 0.008, glide: -5, release: 0.4 });
      },
    },
    wild: {
      beat: 1.55,
      start(v) {
        return [...v.drone(50, { vol: 0.028, drift: { rate: 0.05, cents: 30 } }),
          ...v.drone(56, { type: 'sine', vol: 0.02, drift: { rate: 0.07, cents: 40 } }),
          ...v.drone(52, { type: 'pulse12', vol: 0.007, cutoff: 600, drift: { rate: 0.031, cents: 60 } })];
      },
      step(v, t) {
        const sc = [62, 64, 66, 68, 70, 72, 74, 76];
        if (Math.random() < 0.35) {
          const m = pick(sc), gl = pick([-3, -2, -1, 1, 2, 3]) * (Math.random() < 0.5 ? 0.5 : 1);
          v.note(m, t, 2.2, { vol: 0.038, glide: gl, release: 1.6, vibrato: 18, vibRate: 2.3, cutoff: 2200 });
          v.note(m, t, 2.2, { vol: 0.024, glide: gl, release: 1.6, detune: 17, cutoff: 1800 });
        }
        if (Math.random() < 0.1) v.note(pick([79, 82, 84]), t, 2.3, { type: 'sine', vol: 0.028, attack: 2.2, release: 0.08 });
      },
    },
    camp: {
      beat: 0.95,
      start(v) { return v.drone(38, { vol: 0.045, cutoff: 400 }); },
      step(v, t, b) {
        const sc = [62, 65, 67, 69, 72, 74];
        const tune = [0, null, 2, null, 3, 2, null, 0, 1, null, 3, null, 4, 3, 2, null];
        const k = tune[b % 16];
        if (k !== null && Math.random() < 0.75) {
          const m = sc[Math.min(sc.length - 1, k + (Math.random() < 0.15 ? 1 : 0))];
          v.note(m, t, 0.15, { type: 'pulse25', vol: 0.075, attack: 0.005, release: 0.55, cutoff: 2000 });
        }
        if (b % 8 === 0) v.note(38, t, 0.2, { type: 'pulse25', vol: 0.08, attack: 0.005, release: 0.9, cutoff: 700 });
        if (b % 8 === 4) v.note(45, t, 0.2, { type: 'pulse25', vol: 0.065, attack: 0.005, release: 0.9, cutoff: 700 });
        const crackles = Math.floor(Math.random() * 4);
        for (let c = 0; c < crackles; c++) v.burst(t + Math.random() * this.beat, 0.02 + Math.random() * 0.03, 2500 + Math.random() * 1800, 3, 0.006 + Math.random() * 0.01);
      },
    },
    vision: {
      beat: 2,
      start(v) {
        return [...v.drone(26, { type: 'sine', vol: 0.08 }), ...v.drone(38, { vol: 0.03, cutoff: 300, breathe: { rate: 0.09, depth: 0.02 } }),
          ...v.drone(45, { type: 'pulse12', vol: 0.006, cutoff: 500, drift: { rate: 0.04, cents: 25 } })];
      },
      step(v, t) {
        if (Math.random() < 0.4) v.note(pick([74, 81, 86, 88]), t, 3, { type: 'sine', vol: 0.02, attack: 1.5, release: 4, vibrato: 6 });
      },
    },
  };

  // ─── Zone lifecycle and scheduling ──────────────────────────────────────
  const FADE = 3.5;
  function activate(name, now, instant) {
    const def = ZONES[name];
    const g = ctx.createGain();
    g.gain.setValueAtTime(instant ? 1 : 0, now);
    if (!instant) g.gain.linearRampToValueAtTime(1, now + FADE);
    g.connect(bus);
    const z = { name, def, g, beat: 0, next: now + 0.15, dying: 0 };
    z.v = voices(g);
    z.nodes = def.start(z.v, z) || [];
    live.set(name, z);
    return z;
  }
  function retire(z, now) {
    if (z.dying) return;
    z.dying = now + FADE + 0.5;
    z.g.gain.cancelScheduledValues(now);
    z.g.gain.setValueAtTime(z.g.gain.value, now);
    z.g.gain.linearRampToValueAtTime(0, now + FADE);
  }
  function pump(until) {
    const now = ctx.currentTime;
    for (const [name, z] of live) {
      if (z.dying && now > z.dying) {
        for (const n of z.nodes) { try { n.stop(); } catch (e) {} }
        z.g.disconnect();
        live.delete(name);
        continue;
      }
      while (z.next < until) {
        if (!z.dying || z.next < z.dying - 1) z.def.step(z.v, z.next, z.beat, z);
        z.beat++;
        z.next += z.def.beat;
      }
    }
  }
  function apply() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const z of live.values()) if (z.name !== wanted) retire(z, now);
    if (!wanted) return;
    const z = live.get(wanted);
    if (!z) activate(wanted, now);
    else if (z.dying) {
      // Walked back before it faded: bring it back up rather than restart it.
      z.dying = 0;
      z.g.gain.cancelScheduledValues(now);
      z.g.gain.setValueAtTime(z.g.gain.value, now);
      z.g.gain.linearRampToValueAtTime(1, now + FADE);
      if (z.next < now) z.next = now + 0.1;
    }
  }

  function start() {
    if (started) { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    started = true;
    build(new AC());
    if (!muted) master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2.5);
    apply();
    timer = setInterval(() => pump(ctx.currentTime + 0.5), 120);
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume();
    });
  }
  function setZone(name) {
    if (name === wanted || !ZONES[name]) return;
    wanted = name;
    apply();
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('chronicler.sound', muted ? 'off' : 'on'); } catch (e) {}
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, now + 0.8);
    if (!muted && ctx.state === 'suspended') ctx.resume();
  }

  // Offline render of one zone (for checking levels without a speaker).
  async function render(name, seconds, rate = 22050) {
    const off = new OfflineAudioContext(1, Math.floor(seconds * rate), rate);
    const saved = { ctx, master, bus, waves, noiseBuf };
    build(off);
    master.gain.value = VOLUME;
    live.clear();
    activate(name, 0, true);
    pump(seconds);
    const buf = await off.startRendering();
    live.clear();
    ({ ctx, master, bus, waves, noiseBuf } = saved);
    return buf;
  }

  window.ChroniclerMusic = { start, setZone, setMuted, get muted() { return muted; }, get zone() { return wanted; }, get playing() { return [...live.keys()]; }, zones: Object.keys(ZONES), render };
})();
