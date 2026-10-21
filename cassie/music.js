// Cassie and the White Sable — music and small sounds.
//
// A gentle synth: music box, flute, harp, plucked strings, a soft piano, a
// low hum. Each page names a mood; moods crossfade. The emotional range runs
// from a cozy supper waltz to a storm, from a slow, lonely piano to the
// lullaby that opens and closes the book ("Moonglow's theme").
(function () {
  'use strict';
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const VOLUME = 0.95;
  let ctx = null, master = null, bus = null, sfxBus = null, noiseBuf = null, waves = {};
  let muted = false, started = false, timer = null, wanted = null;
  const live = new Map();
  try { muted = localStorage.getItem('cassie.sound') === 'off'; } catch (e) {}

  // ─── Graph ────────────────────────────────────────────────────────────
  function build(c) {
    ctx = c;
    master = ctx.createGain(); master.gain.value = 0;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 6000;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(tone); tone.connect(comp); comp.connect(ctx.destination);
    bus = ctx.createGain(); bus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.32;
    bus.connect(verb); sfxBus.connect(verb); verb.connect(wet); wet.connect(master);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.33;
    const fb = ctx.createGain(); fb.gain.value = 0.22;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2200;
    const eo = ctx.createGain(); eo.gain.value = 0.16;
    bus.connect(delay); delay.connect(dark); dark.connect(fb); fb.connect(delay); dark.connect(eo); eo.connect(master);
    const pulse = duty => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty); return ctx.createPeriodicWave(re, im); };
    waves = { pulse25: pulse(0.25), pulse12: pulse(0.125) };
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  const osc = type => { const o = ctx.createOscillator(); if (waves[type]) o.setPeriodicWave(waves[type]); else o.type = type; return o; };

  // A tone with an envelope: the building block of every instrument.
  function tone(out, f, t, dur, o) {
    const s = osc(o.type || 'triangle');
    s.frequency.setValueAtTime(f, t);
    if (o.glideTo) s.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime || dur));
    if (o.detune) s.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(); l.frequency.value = o.vibRate || 5;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (Math.pow(2, o.vib / 1200) - 1), t + Math.min(0.4, dur));
      l.connect(lg); lg.connect(s.frequency); l.start(t); l.stop(t + dur + (o.release || 1) * 2);
    }
    let node = s;
    if (o.band) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = o.band; b.Q.value = o.bandQ || 1.2; node.connect(b); node = b; }
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = o.cutoff || 3000;
    const g = ctx.createGain();
    const a = o.attack || 0.01, r = o.release || 0.8, v = o.vol || 0.05;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a);
    if (o.decay) g.gain.setTargetAtTime(v * (o.sustain || 0), t + a, o.decay / 3);
    g.gain.setTargetAtTime(0, t + Math.max(a, dur), r / 3);
    node.connect(flt); flt.connect(g); g.connect(out);
    s.start(t); s.stop(t + Math.max(a, dur) + r * 2.5);
  }
  // Instruments: (out, midi, t, dur, vol)
  const INST = {
    musicbox: (out, m, t, d, v = 0.05) => { tone(out, mtof(m), t, 0.05, { type: 'sine', vol: v, attack: 0.003, release: 1.8, cutoff: 7000 }); tone(out, mtof(m) * 3, t, 0.03, { type: 'sine', vol: v * 0.18, attack: 0.003, release: 0.5, cutoff: 9000 }); },
    flute: (out, m, t, d, v = 0.045) => tone(out, mtof(m), t, d, { type: 'triangle', vol: v, attack: 0.08, release: 0.5, vib: 9, vibRate: 5, cutoff: 2600 }),
    recorder: (out, m, t, d, v = 0.035) => tone(out, mtof(m), t, d, { type: 'pulse12', vol: v, attack: 0.05, release: 0.35, vib: 6, cutoff: 1700 }),
    harp: (out, m, t, d, v = 0.04) => tone(out, mtof(m), t, 0.02, { type: 'triangle', vol: v, attack: 0.004, release: 1.6, cutoff: 3200 }),
    pizz: (out, m, t, d, v = 0.04) => tone(out, mtof(m), t, 0.02, { type: 'pulse25', vol: v, attack: 0.003, release: 0.32, cutoff: 1500 }),
    piano: (out, m, t, d, v = 0.05) => { tone(out, mtof(m), t, 0.04, { type: 'sine', vol: v, attack: 0.004, release: 2.8, cutoff: 5000 }); tone(out, mtof(m) * 2, t, 0.03, { type: 'sine', vol: v * 0.22, attack: 0.004, release: 1.2 }); tone(out, mtof(m) * 3.01, t, 0.02, { type: 'sine', vol: v * 0.07, attack: 0.004, release: 0.6 }); },
    pad: (out, m, t, d, v = 0.018) => { for (const dt of [-7, 7]) tone(out, mtof(m), t, d, { type: 'triangle', vol: v, attack: 0.9, release: 1.4, detune: dt, cutoff: 900 }); },
    hum: (out, m, t, d, v = 0.05) => tone(out, mtof(m), t, d, { type: 'triangle', vol: v, attack: 0.18, release: 0.7, vib: 14, vibRate: 4.6, band: 780, bandQ: 0.9, cutoff: 1800 }),
    cello: (out, m, t, d, v = 0.035) => tone(out, mtof(m), t, d, { type: 'sawtooth', vol: v, attack: 0.18, release: 0.6, vib: 10, vibRate: 4.8, cutoff: 760 }),
    bass: (out, m, t, d, v = 0.05) => tone(out, mtof(m), t, 0.05, { type: 'triangle', vol: v, attack: 0.006, release: 1.0, cutoff: 700 }),
    timp: (out, m, t, d, v = 0.08) => tone(out, mtof(m) * 1.4, t, 0.05, { type: 'sine', vol: v, attack: 0.004, release: 1.2, glideTo: mtof(m), glideTime: 0.25, cutoff: 400 }),
  };
  function noise(out, t, dur, o) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = dur > 1.9;
    const flt = ctx.createBiquadFilter(); flt.type = o.type || 'bandpass'; flt.frequency.setValueAtTime(o.freq || 1000, t); flt.Q.value = o.q || 1;
    if (o.freqTo) flt.frequency.exponentialRampToValueAtTime(o.freqTo, t + dur);
    const g = ctx.createGain(); const v = o.vol || 0.02, a = o.attack || 0.005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.setTargetAtTime(0, t + Math.max(a, dur - (o.release || 0.05)), (o.release || 0.05) / 2);
    src.connect(flt); flt.connect(g); g.connect(out);
    src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.5);
  }

  // ─── Moods ────────────────────────────────────────────────────────────
  // A mood: beats per bar, tempo, a chord per bar, and parts. A part's notes
  // are [midi | 0 for rest, beats]. 'gen' melodies are composed bar by bar
  // from the chord and scale, so they never quite repeat.
  const D = 62, G = 67, A_ = 69;
  const chord = (root, kind = 'M') => kind === 'm' ? [root, root + 3, root + 7] : kind === 's' ? [root, root + 5, root + 7] : [root, root + 4, root + 7];
  const MOONGLOW = [[69, 1], [66, 1], [69, 1], [71, 2], [69, 1], [67, 1], [66, 1], [64, 1], [66, 2], [0, 1], [69, 1], [66, 1], [69, 1], [74, 2], [73, 1], [71, 1], [69, 1], [67, 1], [69, 3]];
  const MOODS = {
    lullaby: { bpm: 66, beats: 3, chords: [chord(50), chord(47, 'm'), chord(43), chord(45), chord(50), chord(47, 'm'), chord(40, 'm'), chord(45)], theme: { inst: 'musicbox', notes: MOONGLOW, vol: 0.055 }, bass: { inst: 'bass', at: [0], vol: 0.035 }, arp: { inst: 'harp', pat: [[1, 1], [2, 2]], oct: 12, vol: 0.022 } },
    garden: { bpm: 112, beats: 6, chords: [chord(55), chord(48), chord(55), chord(50), chord(52, 'm'), chord(48), chord(50), chord(55)], scale: [67, 69, 71, 72, 74, 76, 78, 79], gen: { inst: 'flute', rhythm: [[2, 1, 2, 1], [3, 2, 1], [2, 1, 3]], vol: 0.04, oct: 0 }, bass: { inst: 'pizz', at: [0, 3], vol: 0.04, oct: -12 }, arp: { inst: 'harp', pat: [[1, 1], [2, 2], [4, 1], [5, 2]], oct: 12, vol: 0.016 }, extra: 'birds' },
    curious: { bpm: 100, beats: 4, chords: [chord(50), chord(55), chord(50), chord(57)], scale: [62, 64, 66, 69, 71, 74, 76], gen: { inst: 'musicbox', rhythm: [[0.5, 0.5, 1, 2], [1, 0.5, 0.5, 2], [0.5, 0.5, 0.5, 0.5, 2]], vol: 0.045, oct: 12 }, bass: { inst: 'pizz', at: [0, 2], vol: 0.04, oct: -12 }, extra: 'birds' },
    dinner: { bpm: 138, beats: 3, chords: [chord(53), chord(53), chord(48), chord(48), chord(58), chord(53), chord(48), chord(53)], theme: { inst: 'recorder', vol: 0.06, notes: [[72, 2], [69, 1], [70, 1], [72, 1], [74, 1], [72, 2], [67, 1], [0, 3], [70, 2], [67, 1], [69, 1], [70, 1], [72, 1], [74, 1], [72, 1], [70, 1], [69, 3]] }, bass: { inst: 'bass', at: [0], vol: 0.06, oct: -12 }, arp: { inst: 'pizz', pat: [[1, 1], [2, 2]], oct: 0, vol: 0.045 }, extra: 'fire' },
    night: { bpm: 60, beats: 3, chords: [chord(45, 'm'), chord(41), chord(43), chord(40, 'm')], scale: [69, 71, 72, 74, 76, 77, 79], gen: { inst: 'musicbox', rhythm: [[2, 1], [3], [1, 2]], vol: 0.04, oct: 0, rest: 0.35 }, pad: { vol: 0.016, oct: 0 }, extra: 'crickets' },
    urgent: { bpm: 96, beats: 4, chords: [chord(50, 'm'), chord(50, 'm'), chord(46), chord(45)], scale: [62, 64, 65, 67, 69, 70, 72], gen: { inst: 'flute', rhythm: [[1, 1, 2], [0.5, 0.5, 1, 2]], vol: 0.035, oct: 0, rest: 0.3 }, bass: { inst: 'pizz', at: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], vol: 0.03, oct: -12 }, pad: { vol: 0.012, oct: 0 } },
    dawn: { bpm: 70, beats: 4, chords: [chord(55), chord(60), chord(52, 'm'), chord(50, 's')], scale: [67, 69, 71, 74, 76, 79], gen: { inst: 'flute', rhythm: [[2, 2], [3, 1], [4]], vol: 0.036, oct: 0, rest: 0.25 }, pad: { vol: 0.016, oct: 0 }, arp: { inst: 'harp', pat: [[0, 0], [1, 1], [2, 2], [3, 1]], oct: 12, vol: 0.018 }, extra: 'birds' },
    walk: { bpm: 150, beats: 6, chords: [chord(50), chord(50), chord(55), chord(57), chord(50), chord(48), chord(55), chord(57)], scale: [62, 64, 66, 67, 69, 71, 72, 74], gen: { inst: 'recorder', rhythm: [[2, 1, 2, 1], [1, 1, 1, 3], [3, 3]], vol: 0.07, oct: 0 }, bass: { inst: 'pizz', at: [0, 3], vol: 0.06, oct: -12 }, arp: { inst: 'harp', pat: [[2, 1], [5, 2]], oct: 0, vol: 0.026 }, extra: 'birds' },
    wonder: { bpm: 60, beats: 4, chords: [chord(52), chord(54), chord(52), chord(47)], scale: [76, 78, 80, 82, 83, 85, 87], gen: { inst: 'musicbox', rhythm: [[1, 1, 2], [2, 2], [0.5, 0.5, 3]], vol: 0.032, oct: 0, rest: 0.3 }, pad: { vol: 0.016, oct: 0 }, extra: 'wind' },
    storm: { bpm: 72, beats: 4, chords: [chord(50, 'm'), chord(51), chord(50, 'm'), chord(49)], scale: [62, 63, 65, 67, 69, 70], gen: { inst: 'flute', rhythm: [[4], [2, 2]], vol: 0.022, oct: -12, rest: 0.5 }, pad: { vol: 0.02, oct: -12 }, bass: { inst: 'timp', at: [0], vol: 0.06, oct: -24, prob: 0.6 }, extra: 'rain' },
    despair: { bpm: 54, beats: 4, chords: [chord(47, 'm'), chord(43), chord(40, 'm'), chord(42)], theme: { inst: 'piano', vol: 0.05, notes: [[74, 2], [73, 1], [71, 1], [71, 3], [0, 1], [69, 2], [67, 1], [66, 1], [66, 3], [0, 1], [64, 2], [66, 1], [67, 1], [69, 2], [67, 1], [66, 1], [66, 4], [0, 4]] }, pad: { vol: 0.014, oct: 0 }, bass: { inst: 'piano', at: [0], vol: 0.03, oct: -12 }, extra: 'drip' },
    grace: { bpm: 72, beats: 3, chords: [chord(50), chord(55), chord(57), chord(50), chord(47, 'm'), chord(55), chord(57), chord(50)], scale: [66, 69, 71, 74, 76, 78, 81], gen: { inst: 'flute', rhythm: [[2, 1], [3], [1, 1, 1]], vol: 0.034, oct: 0, rest: 0.2 }, arp: { inst: 'harp', pat: [[0, 0], [1, 1], [2, 2]], oct: 0, vol: 0.022 }, pad: { vol: 0.012, oct: 0 } },
    spirit: { bpm: 84, beats: 3, chords: [chord(45, 'm'), chord(45, 'm'), chord(41), chord(40), chord(45, 'm'), chord(50, 'm'), chord(40), chord(45, 'm')], theme: { inst: 'hum', vol: 0.05, notes: [[76, 2], [77, 1], [76, 2], [72, 1], [74, 2], [72, 1], [71, 3], [72, 2], [74, 1], [76, 2], [69, 1], [71, 2], [68, 1], [69, 3]] }, bass: { inst: 'bass', at: [0], vol: 0.04, oct: -12 }, arp: { inst: 'musicbox', pat: [[1, 2], [2, 1]], oct: 24, vol: 0.016 }, extra: 'wind' },
    thinking: { bpm: 88, beats: 4, chords: [chord(48), chord(50, 'm'), chord(48), chord(43)], scale: [72, 74, 76, 77, 79, 81], gen: { inst: 'musicbox', rhythm: [[1, 1, 1, 1], [0.5, 0.5, 1, 2], [2, 2]], vol: 0.055, oct: 0, rest: 0.25 }, bass: { inst: 'pizz', at: [0, 1, 2, 3], vol: 0.045, oct: -12 } },
    tense: { bpm: 80, beats: 4, chords: [chord(50, 'm'), chord(50, 'm'), chord(46), chord(49)], scale: [74, 75, 77, 79, 81], gen: { inst: 'flute', rhythm: [[4], [3, 1]], vol: 0.018, oct: 0, rest: 0.6 }, bass: { inst: 'pizz', at: [0, 1, 1.5, 3], vol: 0.04, oct: -12 }, drum: { at: [0, 0.4], vol: 0.06 }, pad: { vol: 0.01, oct: 0 }, extra: 'crickets' },
    relief: { bpm: 76, beats: 4, chords: [chord(50), chord(55), chord(47, 'm'), chord(57)], scale: [66, 69, 71, 74, 76, 78], gen: { inst: 'flute', rhythm: [[2, 2], [3, 1], [1, 1, 2]], vol: 0.046, oct: 0 }, arp: { inst: 'harp', pat: [[0, 0], [1, 1], [2, 2], [3, 1]], oct: 12, vol: 0.026 } },
    joy: { bpm: 104, beats: 3, chords: [chord(50), chord(47, 'm'), chord(43), chord(45), chord(50), chord(47, 'm'), chord(40, 'm'), chord(45)], theme: { inst: 'flute', notes: MOONGLOW, vol: 0.045 }, bass: { inst: 'bass', at: [0], vol: 0.05, oct: -12 }, arp: { inst: 'harp', pat: [[1, 1], [2, 2]], oct: 12, vol: 0.026 }, pad: { vol: 0.012, oct: 0 } },
    spring: { bpm: 108, beats: 3, chords: [chord(55), chord(60), chord(55), chord(50)], scale: [67, 69, 71, 74, 76, 79], gen: { inst: 'musicbox', rhythm: [[1, 1, 1], [2, 1], [1, 2]], vol: 0.04, oct: 0 }, arp: { inst: 'harp', pat: [[1, 1], [2, 2]], oct: 0, vol: 0.02 }, bass: { inst: 'pizz', at: [0], vol: 0.04, oct: -12 }, extra: 'birds' },
    hearth: { bpm: 64, beats: 4, chords: [chord(53), chord(50, 'm'), chord(46), chord(48)], scale: [57, 60, 62, 65, 67, 69], gen: { inst: 'cello', rhythm: [[2, 2], [4], [3, 1]], vol: 0.05, oct: 0, rest: 0.2 }, arp: { inst: 'harp', pat: [[0, 0], [1, 1], [2, 2], [3, 1]], oct: 12, vol: 0.03 }, extra: 'fire' },
  };

  function composeBar(md, z, t, barLen, chordNotes) {
    const g = md.gen, sc = md.scale;
    const rh = pick(g.rhythm);
    const spb = 60 / md.bpm;
    let beat = 0;
    for (const d of rh) {
      const tt = t + beat * spb;
      beat += d;
      if (Math.random() < (g.rest || 0.1)) continue;
      // step near the last note; lean toward chord tones on the downbeat
      let i = z.mi ?? Math.floor(sc.length / 2);
      i = Math.max(0, Math.min(sc.length - 1, i + pick([-2, -1, -1, 0, 1, 1, 2])));
      if (beat - d === 0) {
        const pcs = chordNotes.map(n => n % 12);
        let best = i, bd = 9;
        sc.forEach((n, k) => { if (pcs.includes(n % 12) && Math.abs(k - i) < bd) { bd = Math.abs(k - i); best = k; } });
        i = best;
      }
      z.mi = i;
      INST[g.inst](z.g, sc[i] + (g.oct || 0), tt, d * spb * 0.92, g.vol);
    }
  }
  function playBar(z, t) {
    const md = z.md, spb = 60 / md.bpm, barLen = md.beats * spb;
    const ch = md.chords[z.bar % md.chords.length];
    if (md.pad) for (const n of ch) INST.pad(z.g, n + 12 + (md.pad.oct || 0), t, barLen * 0.98, md.pad.vol);
    if (md.bass) for (const b of md.bass.at) if (Math.random() < (md.bass.prob || 1)) INST[md.bass.inst](z.g, ch[0] + (md.bass.oct || 0) + (b % 2 && md.bass.at.length > 2 ? 0 : 0), t + b * spb, spb, md.bass.vol);
    if (md.arp) for (const [b, k] of md.arp.pat) INST[md.arp.inst](z.g, ch[k % 3] + (md.arp.oct || 0), t + b * spb, spb, md.arp.vol);
    if (md.drum) for (const b of md.drum.at) INST.timp(z.g, 33, t + b * spb, 0.2, md.drum.vol * (b ? 0.6 : 1));
    if (md.theme) {
      // the theme runs on its own clock, bar by bar
      const notes = md.theme.notes;
      let tt = t;
      while (tt < t + barLen - 1e-6) {
        const [m, d] = notes[z.ti % notes.length];
        const rem = z.tLeft ?? d;
        const use = Math.min(rem, (t + barLen - tt) / spb);
        if (z.tLeft === undefined && m) INST[md.theme.inst](z.g, m, tt, d * spb * 0.95, md.theme.vol);
        tt += use * spb;
        const left = rem - use;
        if (left > 1e-6) z.tLeft = left; else { z.tLeft = undefined; z.ti++; }
      }
    } else if (md.gen) composeBar(md, z, t, barLen, ch);
    // ambience
    const ex = md.extra;
    if (ex === 'birds' && Math.random() < 0.5) chirp(z.g, t + Math.random() * barLen);
    if (ex === 'crickets') for (let k = 0; k < 3; k++) if (Math.random() < 0.6) { const tt = t + Math.random() * barLen; for (let j = 0; j < 3; j++) tone(z.g, 4200, tt + j * 0.05, 0.02, { type: 'sine', vol: 0.004, attack: 0.003, release: 0.03, cutoff: 8000 }); }
    if (ex === 'fire') for (let k = 0; k < 4; k++) if (Math.random() < 0.6) noise(z.g, t + Math.random() * barLen, 0.03, { freq: 2600 + Math.random() * 1500, q: 3, vol: 0.01 });
    if (ex === 'drip' && Math.random() < 0.5) tone(z.g, 1400 + Math.random() * 600, t + Math.random() * barLen, 0.02, { type: 'sine', vol: 0.012, attack: 0.002, release: 0.15, glideTo: 2400, glideTime: 0.05 });
  }
  function chirp(out, t) {
    const f0 = 2600 + Math.random() * 1200;
    for (let j = 0; j < 2 + Math.floor(Math.random() * 3); j++) tone(out, f0, t + j * 0.11, 0.05, { type: 'sine', vol: 0.008, attack: 0.005, release: 0.06, glideTo: f0 * 1.25, glideTime: 0.05 });
  }
  function startBed(z) {
    const ex = z.md.extra, nodes = [];
    const loop = (o) => {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q || 0.6;
      const g = ctx.createGain(); g.gain.value = o.vol;
      src.connect(f); f.connect(g); g.connect(z.g); src.start(); nodes.push(src);
      if (o.lfo) { const l = ctx.createOscillator(); l.frequency.value = o.lfo; const lg = ctx.createGain(); lg.gain.value = o.vol * 0.6; l.connect(lg); lg.connect(g.gain); l.start(); nodes.push(l); }
    };
    if (ex === 'rain') { loop({ type: 'highpass', freq: 1800, vol: 0.016 }); loop({ type: 'lowpass', freq: 500, vol: 0.02, lfo: 0.07 }); }
    if (ex === 'wind') loop({ type: 'bandpass', freq: 700, q: 0.8, vol: 0.006, lfo: 0.05 });
    if (ex === 'fire') loop({ type: 'lowpass', freq: 300, vol: 0.006 });
    return nodes;
  }

  // ─── Mood lifecycle ───────────────────────────────────────────────────
  const FADE = 2.6;
  function activate(name, now) {
    const md = MOODS[name];
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + FADE); g.connect(bus);
    const z = { name, md, g, bar: 0, next: now + 0.1, dying: 0, ti: 0 };
    z.nodes = startBed(z);
    live.set(name, z);
  }
  function retire(z, now) {
    if (z.dying) return;
    z.dying = now + FADE + 0.6;
    z.g.gain.cancelScheduledValues(now); z.g.gain.setValueAtTime(z.g.gain.value, now); z.g.gain.linearRampToValueAtTime(0, now + FADE);
  }
  function pump(until) {
    const now = ctx.currentTime;
    for (const [name, z] of live) {
      if (z.dying && now > z.dying) { for (const n of z.nodes) { try { n.stop(); } catch (e) {} } z.g.disconnect(); live.delete(name); continue; }
      while (z.next < until) {
        if (!z.dying) playBar(z, z.next);
        z.bar++;
        z.next += z.md.beats * 60 / z.md.bpm;
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
    else if (z.dying) { z.dying = 0; z.g.gain.cancelScheduledValues(now); z.g.gain.setValueAtTime(z.g.gain.value, now); z.g.gain.linearRampToValueAtTime(1, now + FADE); if (z.next < now) z.next = now + 0.1; }
  }

  // ─── Small sounds ─────────────────────────────────────────────────────
  const SFX = {
    page: t => noise(sfxBus, t, 0.28, { freq: 1800, freqTo: 3800, q: 0.7, vol: 0.02, attack: 0.04, release: 0.15 }),
    chime: t => { INST.musicbox(sfxBus, pick([81, 83, 86, 88]), t, 0, 0.04); INST.musicbox(sfxBus, pick([88, 90, 93]), t + 0.09, 0, 0.025); },
    wonder: t => [76, 80, 83, 87, 88].forEach((m, i) => INST.musicbox(sfxBus, m + 12, t + i * 0.12, 0, 0.026)),
    pop: t => tone(sfxBus, 500, t, 0.05, { type: 'sine', vol: 0.05, attack: 0.003, release: 0.08, glideTo: 1100, glideTime: 0.06 }),
    cluck: t => { for (let i = 0; i < 3; i++) tone(sfxBus, 620 - i * 30, t + i * 0.13, 0.04, { type: 'pulse25', vol: 0.02, attack: 0.004, release: 0.05, cutoff: 1800, glideTo: 480, glideTime: 0.05 }); },
    buzz: t => tone(sfxBus, 190, t, 0.6, { type: 'sawtooth', vol: 0.008, attack: 0.05, release: 0.15, vib: 60, vibRate: 22, cutoff: 900 }),
    slip: t => noise(sfxBus, t, 0.25, { freq: 3000, freqTo: 1200, q: 0.8, vol: 0.016, attack: 0.02, release: 0.1 }),
    tick: t => noise(sfxBus, t, 0.02, { freq: 3500, q: 5, vol: 0.03 }),
    clink: t => { tone(sfxBus, 2400, t, 0.02, { type: 'sine', vol: 0.03, attack: 0.002, release: 0.4 }); tone(sfxBus, 3720, t + 0.05, 0.02, { type: 'sine', vol: 0.02, attack: 0.002, release: 0.3 }); },
    squish: t => noise(sfxBus, t, 0.14, { type: 'lowpass', freq: 900, q: 1, vol: 0.04, attack: 0.01, release: 0.08 }),
    low: t => INST.piano(sfxBus, 45, t, 0, 0.05),
    tap: t => { for (let i = 0; i < 2; i++) noise(sfxBus, t + i * 0.2, 0.04, { type: 'lowpass', freq: 700, vol: 0.05 }); },
    creak: t => tone(sfxBus, 140, t, 0.6, { type: 'sawtooth', vol: 0.01, attack: 0.05, release: 0.2, glideTo: 230, glideTime: 0.6, cutoff: 900 }),
    bark: t => { for (let i = 0; i < 2; i++) { noise(sfxBus, t + i * 0.22, 0.09, { freq: 700, q: 1.4, vol: 0.016 }); tone(sfxBus, 340, t + i * 0.22, 0.06, { type: 'sawtooth', vol: 0.006, attack: 0.005, release: 0.06, glideTo: 220, glideTime: 0.08, cutoff: 1200 }); } },
    pack: t => { noise(sfxBus, t, 0.15, { freq: 1500, q: 0.8, vol: 0.02, release: 0.1 }); tone(sfxBus, 160, t + 0.12, 0.04, { type: 'sine', vol: 0.04, attack: 0.003, release: 0.12 }); },
    moo: t => tone(sfxBus, 118, t, 1.1, { type: 'sawtooth', vol: 0.02, attack: 0.15, release: 0.4, glideTo: 96, glideTime: 1.1, band: 520, bandQ: 1.4, cutoff: 900 }),
    sniff: t => { for (let i = 0; i < 3; i++) noise(sfxBus, t + i * 0.14, 0.06, { type: 'highpass', freq: 2600, vol: 0.016 }); },
    steps: t => { for (let i = 0; i < 6; i++) noise(sfxBus, t + i * 0.32, 0.05, { type: 'lowpass', freq: 400, vol: 0.03 }); },
    thunder: (t, o) => { const near = (o && o.near) || 0; noise(sfxBus, t + (near >= 3 ? 0 : 0.2), 2.6 + near * 0.4, { type: 'lowpass', freq: 140 + near * 60, q: 0.5, vol: 0.05 + near * 0.025, attack: near >= 3 ? 0.02 : 0.4, release: 1.6 }); },
    crash: t => { noise(sfxBus, t, 1.2, { type: 'lowpass', freq: 1200, freqTo: 200, q: 0.6, vol: 0.05, attack: 0.01, release: 0.8 }); INST.timp(sfxBus, 28, t, 0, 0.1); },
    far: t => INST.flute(sfxBus, 76, t, 0.6, 0.012),
    grow: t => { tone(sfxBus, 110, t, 3.6, { type: 'triangle', vol: 0.02, attack: 1.2, release: 1, glideTo: 220, glideTime: 3.6, cutoff: 700 }); noise(sfxBus, t, 3.6, { freq: 600, q: 0.7, vol: 0.006, attack: 1.4, release: 1 }); },
    warm: t => INST.pad(sfxBus, 62, t, 1.8, 0.03),
    plop: t => tone(sfxBus, 300, t, 0.06, { type: 'sine', vol: 0.05, attack: 0.003, release: 0.12, glideTo: 820, glideTime: 0.06 }),
    rustle: t => noise(sfxBus, t, 0.45, { freq: 2200, q: 0.6, vol: 0.03, attack: 0.03, release: 0.2 }),
    growl: t => tone(sfxBus, 78, t, 0.8, { type: 'sawtooth', vol: 0.016, attack: 0.15, release: 0.3, vib: 80, vibRate: 18, cutoff: 500 }),
    string: t => { for (let i = 0; i < 4; i++) noise(sfxBus, t + i * 0.12, 0.08, { freq: 2600, q: 2, vol: 0.012 }); },
    clank: t => { tone(sfxBus, 520, t, 0.02, { type: 'pulse25', vol: 0.03, attack: 0.002, release: 0.5, cutoff: 1800 }); tone(sfxBus, 790, t, 0.02, { type: 'sine', vol: 0.02, attack: 0.002, release: 0.6 }); },
    click: t => { noise(sfxBus, t, 0.03, { freq: 2800, q: 4, vol: 0.05 }); tone(sfxBus, 1600, t, 0.02, { type: 'sine', vol: 0.02, attack: 0.002, release: 0.1 }); },
    count: (t, o) => INST.musicbox(sfxBus, [74, 76, 78, 79, 81, 83][((o && o.n) || 1) - 1], t, 0, 0.05),
    plant: t => { noise(sfxBus, t, 0.08, { type: 'lowpass', freq: 500, vol: 0.04 }); INST.musicbox(sfxBus, 86, t + 0.25, 0, 0.03); },
    pencil: t => { for (let i = 0; i < 10; i++) noise(sfxBus, t + i * 0.18, 0.12, { freq: 4200, q: 2, vol: 0.008 }); },
  };

  // ─── Public ───────────────────────────────────────────────────────────
  function start() {
    if (started) { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    started = true;
    build(new AC());
    if (!muted) master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2);
    apply();
    timer = setInterval(() => pump(ctx.currentTime + 0.6), 150);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume(); });
  }
  function setMood(name) { if (name === wanted || !MOODS[name]) return; wanted = name; apply(); }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('cassie.sound', muted ? 'off' : 'on'); } catch (e) {}
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, now + 0.6);
    if (!muted && ctx.state === 'suspended') ctx.resume();
  }
  function sfx(name, o) { if (!ctx || muted || !SFX[name]) return; SFX[name](ctx.currentTime + 0.01, o); }
  // Render a mood offline (for checking levels and making a sampler).
  async function render(name, seconds, rate = 22050) {
    const off = new OfflineAudioContext(1, Math.floor(seconds * rate), rate);
    const saved = { ctx, master, bus, sfxBus, waves, noiseBuf };
    build(off); master.gain.value = VOLUME;
    live.clear(); wanted = name;
    const md = MOODS[name];
    const z = { name, md, g: ctx.createGain(), bar: 0, next: 0.05, dying: 0, ti: 0 };
    z.g.connect(bus); z.nodes = startBed(z); live.set(name, z);
    pump(seconds);
    const buf = await off.startRendering();
    live.clear(); wanted = null;
    ({ ctx, master, bus, sfxBus, waves, noiseBuf } = saved);
    return buf;
  }
  window.BOOK_MUSIC = { start, setMood, setMuted, sfx, get muted() { return muted; }, get mood() { return wanted; }, moods: Object.keys(MOODS), render };
})();
