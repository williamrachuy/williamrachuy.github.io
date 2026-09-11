// cipher.js — Profile 7
//
// Waterline's focus line, with substitution instead of physics.
//
// Nothing moves. Every glyph sits exactly where it was typeset and stays there.
// What changes is which character is drawn: far from the line a glyph shows
// something else entirely and keeps churning, and the closer it comes the more
// likely each turn lands on the character that actually belongs. It is the same
// gradient as Waterline, spent on identity rather than position.
//
// It never has to fully settle. `Correct on the line` is exactly that: the
// probability a turn lands on the true character for a glyph sitting on the
// line. Below 1 there is a residual chance of a glitch, so the text reads but
// flickers — resolving rather than resolved. At 1 the line is clean.
//
// The noise alphabet follows the film's: its code was a custom typeface built
// from half-width katakana, mirrored, alongside Latin letters and numerals. The
// characters here are ordinary Unicode half-width katakana (U+FF66-FF9D) with
// digits and a few Latin forms, drawn mirrored about half the time — the same
// technique, not the same typeface.
//
// Changing a character releases energy. It lights the glyph and runs off down
// its own line as a pulse, so the page is threaded with little currents chasing
// away from wherever something just turned over. That is what lights the text
// out in the dark: away from the line the base brightness is almost nothing and
// nearly all of what you see is energy passing through.

import { imageOf } from '../images.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Half-width katakana, then digits, then the Latin forms that read as code.
// Built from code points rather than pasted, so what is here is exactly the
// documented range and nothing snuck in from an editor.
const KATAKANA = (() => {
  const out = [];
  for (let c = 0xFF66; c <= 0xFF9D; c++) out.push(String.fromCharCode(c));
  return out;
})();
const LATIN = '0123456789:.=*+-<>¦｜╌ｱﾘﾂ'.split('');

// A glyph that is missing from every font on the machine draws as a box, and a
// page of boxes is worse than a page with no katakana in it. Compared against a
// private-use code point, which no font has: equal widths means both fell back
// to the same notdef.
function katakanaUsable(ctx, font) {
  ctx.font = font;
  const missing = ctx.measureText('').width;
  const kana = ctx.measureText('ｱ').width;
  return Math.abs(kana - missing) > 0.25 && kana > 0.5;
}

// Share Tech Mono carries every Western character; half-width katakana are not
// in it and fall through to whatever Japanese face the reader has. Declared on
// the profile so typeset() measures against it — line breaking and every glyph
// x come out of these metrics, so getting this wrong does not merely look
// different, it puts every character in the wrong place.
const FAMILY = '"Share Tech Mono", ui-monospace, SFMono-Regular, Menlo, ' +
               '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, "Noto Sans JP", monospace';

// Matrix green: near-black at rest, signal green through the middle, and almost
// white where a pulse is passing.
const DARK = [0, 46, 22];
const MID = [0, 168, 76];
const NEAR = [120, 245, 160];
const HOT = [214, 255, 226];
const BUCKETS = 26;

const BASE_RAMP = (() => {
  const out = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / (BUCKETS - 1);
    let r, g, b;
    if (t < 0.62) {
      const k = t / 0.62;
      r = DARK[0] + (MID[0] - DARK[0]) * k;
      g = DARK[1] + (MID[1] - DARK[1]) * k;
      b = DARK[2] + (MID[2] - DARK[2]) * k;
    } else {
      const k = (t - 0.62) / 0.38;
      r = MID[0] + (NEAR[0] - MID[0]) * k;
      g = MID[1] + (NEAR[1] - MID[1]) * k;
      b = MID[2] + (NEAR[2] - MID[2]) * k;
    }
    out[i] = [r | 0, g | 0, b | 0, 0.3 + 0.7 * t];
  }
  return out;
})();

// How far a pulse runs along its line, how fast, and how long a glyph holds it.
const TRAIL = 16;
const STEP = 0.028;      // seconds per glyph — about 570 glyphs a second
const TAU = 0.55;        // seconds to decay to 1/e

// How long a glyph waits before reconsidering itself, in seconds: brisk out in
// the dark, nearly still on the line. Stated as time rather than as a rate so
// the numbers here are the thing you can picture — CHURN_FAR is how often a
// glyph out in the noise turns over, and `churn` scales both ends. The rate a
// given glyph *receives* energy is roughly TRAIL times faster than it changes,
// which is why these can be this slow and the page still stays lit.
const CHURN_FAR = 0.5;
const CHURN_NEAR = 2.8;

// No glyph's baseline lands exactly on the line, so if `Correct on the line`
// only held at w === 1 the number on the slider would be one the text never
// actually reaches — set it to 1 and the line would still flicker. The top of
// the feather counts as on the line instead: at or above this weight a turn
// lands on the true character with exactly the probability the slider says.
const PLATEAU = 0.92;

export default {
  id: 'cipher',
  name: 'Cipher',
  fontFamily: FAMILY,
  fontPreload: '"Share Tech Mono"',
  blurb: 'The line decides what each character is. Changing one sends current down the row.',
  params: [
    { key: 'lineY', label: 'Focus line', type: 'range', min: 0.10, max: 0.85, step: 0.01, value: 0.44 },
    { key: 'feather', label: 'Feather width', type: 'range', min: 0.05, max: 0.7, step: 0.01, value: 0.34 },
    { key: 'falloff', label: 'Falloff', type: 'range', min: 0.4, max: 4, step: 0.1, value: 1.8 },
    { key: 'churn', label: 'Churn', type: 'range', min: 0.25, max: 2, step: 0.05, value: 1 },
    { key: 'lock', label: 'Correct on the line', type: 'range', min: 0.3, max: 1, step: 0.01, value: 0.95 },
    { key: 'energy', label: 'Energy', type: 'range', min: 0, max: 1.5, step: 0.05, value: 0.85 },
    { key: 'showLine', label: 'Show the line', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    const handle = document.createElement('div');
    handle.className = 'lens-handle';
    handle.dataset.mode = 'band';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Focus line position');
    handle.innerHTML = '<span></span>';
    host.appendChild(handle);

    const ctx = canvas.getContext('2d', { alpha: true });

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let G = null;
    let shown = null;      // index into POOL, or -1 for the true character
    let nextAt = null;     // when this glyph next reconsiders itself
    let enMag = null;      // energy magnitude at enAt
    let enAt = null;       // when that energy arrives — may be in the future
    let mirror = null;     // whether the substitute is drawn back to front
    let imgs = [];
    let POOL = LATIN;
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let lineY = 0.44;
    let dragging = false;
    let rnd = mulberry32(0x1b873593);

    function reachOf() { return Math.max(8, P.feather * vh); }

    // Identical in shape to Waterline's: 1 on the line, 0 at the edge of the
    // feather, concentrated near the line as `falloff` rises.
    function weightAt(screenY) {
      const t = 1 - clamp01(Math.abs(screenY - lineY * vh) / reachOf());
      return Math.pow(t, P.falloff);
    }

    // Send a pulse off down this glyph's line. It does not cross into the next
    // line: these are meant to read as current in a trace, and a trace ends.
    function emit(i, nowSec) {
      const blk = G.block[i], ln = G.line[i];
      enMag[i] = 1; enAt[i] = nowSec;
      for (let k = 1; k <= TRAIL; k++) {
        const j = i + k;
        if (j >= G.n || G.block[j] !== blk || G.line[j] !== ln) break;
        const mag = Math.pow(1 - k / TRAIL, 1.2);
        const at = nowSec + k * STEP;
        // Compare what each pulse will actually be worth at the moment this one
        // lands, not raw magnitudes: a strong pulse that passed a second ago is
        // spent, and must not go on shadowing every weaker one behind it. Doing
        // it the other way leaves a glyph latched at the brightest magnitude it
        // has ever seen, which reads as a steady glow instead of current.
        const held = enMag[j] * Math.exp(-(at - enAt[j]) / TAU);
        if (mag > held) { enMag[j] = mag; enAt[j] = at; }
      }
    }

    function energyAt(i, nowSec) {
      const age = nowSec - enAt[i];
      if (age < 0 || age > TAU * 7) return 0;
      return enMag[i] * Math.exp(-age / TAU);
    }

    function placeHandle() { handle.style.top = (lineY * vh) + 'px'; }

    const onDown = e => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-dragging');
      e.preventDefault();
    };
    const onMove = e => {
      if (!dragging) return;
      const r = host.getBoundingClientRect();
      lineY = clamp01((e.clientY - r.top) / vh);
      P.lineY = lineY;
      placeHandle();
      host.dispatchEvent(new CustomEvent('paramsync', { detail: { lensY: P.lineY } }));
      e.preventDefault();
    };
    const onUp = e => {
      dragging = false;
      handle.classList.remove('is-dragging');
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    return {
      params: P,
      setParam(k, v) {
        P[k] = v;
        if (k === 'lineY') lineY = v;
        placeHandle();
      },
      topPad(viewport) { return viewport.vh * 0.32; },
      bottomPad(viewport) { return viewport.vh * 0.55; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        lineY = P.lineY;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        POOL = katakanaUsable(ctx, '16px ' + FAMILY)
          ? KATAKANA.concat(LATIN)
          : LATIN;

        const n = G.n;
        shown = new Int32Array(n).fill(-1);
        nextAt = new Float32Array(n);
        enMag = new Float32Array(n);
        enAt = new Float32Array(n).fill(-99);
        mirror = new Uint8Array(n);
        rnd = mulberry32(0x1b873593 ^ n);
        for (let i = 0; i < n; i++) {
          shown[i] = (rnd() * POOL.length) | 0;
          nextAt[i] = rnd() * CHURN_FAR;
          mirror[i] = rnd() < 0.5 ? 1 : 0;
        }

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height, x: b.x, y: b.top }))
          .filter(im => im.el);
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;
        const n = G.n;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        if (P.showLine) drawLine();

        for (const im of imgs) {
          const sy = im.y + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          const w = weightAt(sy + im.h / 2);
          ctx.globalAlpha = 0.12 + 0.55 * w;
          ctx.drawImage(im.el, im.x, sy, im.w, im.h);
          ctx.globalAlpha = 1;
        }

        const minY = scrollY - padTop - 60;
        const maxY = scrollY - padTop + vh + 60;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        let curFill = '', curFont = '';

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          const sy = ty + padTop - scrollY;
          const w = weightAt(sy);

          // Turn over from time to time. Far from the line that is often and
          // usually lands on noise; near it, rarely, and almost always on the
          // character that belongs.
          if (nowSec >= nextAt[i]) {
            // P.lock is the probability of landing on the true character for a
            // glyph on the line; everything else scales down from it, to a
            // faint 2% of it out in the dark.
            const k = w >= PLATEAU ? 1 : w / PLATEAU;
            const floor = P.lock * 0.02;
            const pCorrect = floor + (P.lock - floor) * k * k;
            const correct = rnd() < pCorrect;
            const was = shown[i];
            shown[i] = correct ? -1 : (rnd() * POOL.length) | 0;
            if (shown[i] !== was) {
              mirror[i] = rnd() < 0.5 ? 1 : 0;
              // Only an actual change releases anything. Re-picking the same
              // character is not an event.
              if (P.energy > 0) emit(i, nowSec);
            }
            // Churn slows to a crawl as a glyph approaches the line, which is
            // what makes text near it feel held rather than merely correct.
            const base = CHURN_FAR + (CHURN_NEAR - CHURN_FAR) * w * w;
            nextAt[i] = nowSec + base * (0.6 + rnd() * 0.9) / P.churn;
          }

          const e = P.energy > 0 ? Math.min(1, energyAt(i, nowSec) * P.energy) : 0;
          const c = BASE_RAMP[(w * (BUCKETS - 1)) | 0];
          // Energy pushes the colour toward white-green and lifts the alpha, so
          // a pulse is visible even out where the base is almost nothing.
          const r = (c[0] + (HOT[0] - c[0]) * e) | 0;
          const g = (c[1] + (HOT[1] - c[1]) * e) | 0;
          const bl = (c[2] + (HOT[2] - c[2]) * e) | 0;
          const a = Math.min(1, c[3] + 0.75 * e);
          const fill = `rgba(${r},${g},${bl},${a.toFixed(3)})`;
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }

          // True character and substitute are the same face now, so there is
          // one font switch per block rather than one per character.
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          const s = shown[i];
          if (s < 0) {
            ctx.fillText(G.ch[i], G.x[i], sy);
          } else {
            if (mirror[i]) {
              // Back to front, the way the film's typeface was drawn.
              ctx.setTransform(-dpr, 0, 0, dpr, dpr * (G.x[i] + G.size[i] * 0.6), 0);
              ctx.fillText(POOL[s], 0, sy);
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            } else {
              ctx.fillText(POOL[s], G.x[i], sy);
            }
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },

      destroy() {
        handle.removeEventListener('pointerdown', onDown);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        canvas.remove();
        handle.remove();
      }
    };

    function drawLine() {
      const y = Math.round(lineY * vh) + 0.5;
      const reach = reachOf();
      const g = ctx.createLinearGradient(0, y - reach, 0, y + reach);
      for (let i = 0; i <= 12; i++) {
        const stop = i / 12;
        const w = weightAt(y - reach + stop * reach * 2);
        g.addColorStop(stop, `rgba(0,200,90,${(0.05 * w).toFixed(4)})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, y - reach, vw, reach * 2);
      ctx.fillStyle = 'rgba(150,255,180,0.42)';
      ctx.fillRect(0, y - 0.5, vw, 1);
    }
  }
};
