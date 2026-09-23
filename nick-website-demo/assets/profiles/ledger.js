// ledger.js — Profile 4
//
// A plotter, not a tide. Lines are blank until they cross the write head, then
// ink in left to right and stay written. Scrolling back up shows finished text,
// which makes it viable for a long read in a way a pure scroll-scrubbed effect
// is not.
//
// Same glyph data as Tidewater; completely different motion vocabulary. That is
// the point of separating layout from profile — one typeset pass, many skins.

import { imageOf } from '../images.js';

const INK = [236, 228, 210];
const GHOST = [58, 50, 34];

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// How written a glyph is, quantised, with every colour it can be built once —
// one table with the unwritten text showing and one without. Building an
// rgba() string per glyph per frame was most of this profile's script time.
const LEVELS = 48;
function fillTable(ghost) {
  const out = new Array(LEVELS + 1);
  for (let l = 0; l <= LEVELS; l++) {
    const a = l / LEVELS;
    const r = (GHOST[0] + (INK[0] - GHOST[0]) * a) | 0;
    const g = (GHOST[1] + (INK[1] - GHOST[1]) * a) | 0;
    const b = (GHOST[2] + (INK[2] - GHOST[2]) * a) | 0;
    const alpha = ghost ? (0.16 + 0.84 * a) : a;
    out[l] = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  }
  return out;
}
const FILL_GHOST = fillTable(true);
const FILL_BARE = fillTable(false);

export default {
  id: 'ledger',
  name: 'Ledger',
  blurb: 'Lines ink in left-to-right as they cross the write head, then stay.',
  params: [
    { key: 'headY', label: 'Write head', type: 'range', min: 0.15, max: 0.85, step: 0.01, value: 0.52 },
    { key: 'speed', label: 'Ink speed', type: 'range', min: 0.4, max: 4, step: 0.1, value: 1.6 },
    { key: 'ghost', label: 'Show unwritten text', type: 'bool', value: true },
    { key: 'rewind', label: 'Re-ink on scroll up', type: 'bool', value: false }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let G = null, ink = null, lineKey = null, lineLen = null, glyphIdx = null;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;

    // Once everything in view is written and the page is not moving, every
    // frame is the same picture. `drawn` is what the canvas currently shows;
    // while it still matches, the frame is skipped outright.
    let drawn = { scrollY: NaN };

    return {
      params: P,
      setParam(k, v) {
        P[k] = v;
        drawn.scrollY = NaN;
      },

      topPad(viewport) { return viewport.vh * 0.30; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        // Pictures are not glyphs, so they get their own small list and their
        // own latch. Same write head, same rule: once developed, it stays.
        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ x: b.x, top: b.top, w: b.width, h: b.height, el: imageOf(b), ink: 0 }))
          .filter(b => b.el);
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        // Index glyphs by (block, line) so we know each glyph's position in its
        // own line — that ordinal is what drives the left-to-right wipe.
        const n = G.n;
        lineKey = new Int32Array(n);
        glyphIdx = new Int32Array(n);
        const counts = new Map();
        let key = -1, prevB = -1, prevL = -1;
        for (let i = 0; i < n; i++) {
          if (G.block[i] !== prevB || G.line[i] !== prevL) {
            key++; prevB = G.block[i]; prevL = G.line[i];
          }
          lineKey[i] = key;
          const c = (counts.get(key) || 0);
          glyphIdx[i] = c;
          counts.set(key, c + 1);
        }
        lineLen = new Int32Array(key + 1);
        for (const [k, c] of counts) lineLen[k] = c;
        ink = new Float32Array(key + 1);
        drawn.scrollY = NaN;
      },

      frame(t, dt, scrollY) {
        if (!G) return;

        const head = P.headY * vh;
        const n = G.n;
        const minY = scrollY - padTop - 80;
        const maxY = scrollY - padTop + vh + 80;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        // Advance ink for lines above the head — first, and on its own, so
        // the frame knows whether anything changed before it draws anything.
        const rate = P.speed * dt * 1.9;
        let changed = scrollY !== drawn.scrollY;
        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          if (glyphIdx[i] !== 0) continue;
          const k = lineKey[i];
          const was = ink[k];
          if (ty + padTop - scrollY <= head) ink[k] = Math.min(1, was + rate);
          else if (P.rewind) ink[k] = Math.max(0, was - rate * 1.6);
          if (ink[k] !== was) changed = true;
        }
        for (const im of imgs) {
          const sy = im.top + padTop - scrollY;
          if (sy > vh + 40 || sy + im.h < -40) continue;
          const was = im.ink;
          if (sy <= head) im.ink = Math.min(1, was + rate * 0.55);
          else if (P.rewind) im.ink = Math.max(0, was - rate);
          if (im.ink !== was) changed = true;
        }
        if (!changed) return;
        drawn.scrollY = scrollY;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        const FILL = P.ghost ? FILL_GHOST : FILL_BARE;
        let curFont = '', curFill = '';

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          const sy = ty + padTop - scrollY;
          const k = lineKey[i];

          const len = lineLen[k] || 1;
          const written = ink[k] * (len + 4);
          const a = clamp01(written - glyphIdx[i]);

          if (a <= 0.004 && !P.ghost) continue;

          const fill = FILL[(a * LEVELS + 0.5) | 0];
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          // Freshly written glyphs land from slightly above.
          const drop = (1 - a) * (1 - a) * 5;
          ctx.fillText(G.ch[i], G.x[i], sy - drop);
        }

        // Pictures develop downward from the head, like a print in a tray.
        for (const im of imgs) {
          const sy = im.top + padTop - scrollY;
          if (sy > vh + 40 || sy + im.h < -40) continue;

          if (P.ghost && im.ink < 1) {
            ctx.globalAlpha = 0.12;
            ctx.drawImage(im.el, im.x, sy, im.w, im.h);
            ctx.globalAlpha = 1;
          }
          if (im.ink > 0.002) {
            const revealed = im.h * im.ink;
            ctx.save();
            ctx.beginPath();
            ctx.rect(im.x, sy, im.w, revealed);
            ctx.clip();
            ctx.drawImage(im.el, im.x, sy, im.w, im.h);
            ctx.restore();
            // A soft edge where the developer has reached, so the reveal does
            // not read as a hard crop.
            if (im.ink < 1) {
              const edge = ctx.createLinearGradient(0, sy + revealed - 26, 0, sy + revealed);
              edge.addColorStop(0, 'rgba(214,186,124,0)');
              edge.addColorStop(1, 'rgba(214,186,124,0.20)');
              ctx.fillStyle = edge;
              ctx.fillRect(im.x, sy + revealed - 26, im.w, 26);
            }
          }
        }

        // Write head indicator.
        const grad = ctx.createLinearGradient(0, head - 1, 0, head + 1);
        grad.addColorStop(0, 'rgba(214,186,124,0)');
        grad.addColorStop(0.5, 'rgba(214,186,124,0.22)');
        grad.addColorStop(1, 'rgba(214,186,124,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, head - 1, vw, 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },

      destroy() { canvas.remove(); }
    };
  }
};
