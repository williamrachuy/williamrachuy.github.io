// meniscus.js — Profile 6
//
// The other profiles disturb the whole page and let a lens or a write head
// recover it. This one is the other way round: the type is set properly and
// stays readable, and every so often a circle surfaces somewhere on it.
//
// A circle carries a pressure field. Glyphs inside it are pushed away from its
// centre, hardest near the middle and fading to nothing at the rim, so a word
// bulges around it rather than being shoved aside. The budge is capped, and the
// cap is well under a line height — the text bends and you can still read it.
// Overlapping circles add their pressure, then the sum is capped, so a crowd of
// them cannot tear a line apart.
//
// Each circle fades in and back out over its life, so nothing pops. Positions
// are in document coordinates: a circle sits on a piece of text and travels
// with it while it lasts, rather than hanging in front of the screen.

import { imageOf } from '../images.js';

const INK = [238, 231, 214];
const WARM = [236, 206, 150];

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'meniscus',
  name: 'Meniscus',
  blurb: 'Readable type. Circles surface on it and the words bulge around them.',
  params: [
    { key: 'rate', label: 'How often', type: 'range', min: 0.1, max: 3, step: 0.1, value: 0.9 },
    { key: 'size', label: 'Circle size', type: 'range', min: 0.15, max: 1, step: 0.05, value: 0.45 },
    { key: 'pressure', label: 'Pressure', type: 'range', min: 0, max: 90, step: 2, value: 34 },
    { key: 'life', label: 'Lifetime', type: 'range', min: 1, max: 9, step: 0.5, value: 3.5 },
    { key: 'ring', label: 'Show the circles', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let G = null;
    let cx = null, cy = null;           // where each glyph currently is
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let left = 0, width = 0;
    let circles = [];
    let nextSpawn = 0;
    let rnd = mulberry32(0x9e3779b9);

    // Pressure from one circle at distance d. Zero at the rim and rising toward
    // the middle, so the field has an edge you can see the text follow. The
    // exponent keeps the shoulder soft: a hard kernel makes glyphs snap across
    // the boundary as the circle grows.
    function kernel(d, r) {
      if (d >= r) return 0;
      const t = 1 - d / r;
      return t * t * (3 - 2 * t);
    }

    function radiusOf(c, age) {
      // Opens quickly, then eases. Never starts from nothing, or the first
      // frames are a point source and the push looks like a glitch.
      return c.rMax * (0.35 + 0.65 * (1 - Math.pow(1 - age, 3)));
    }

    // Fades in and back out across its life, so a circle neither pops into
    // existence nor leaves the text snapping back.
    function envelopeOf(age) {
      return Math.sin(Math.PI * clamp01(age));
    }

    function spawn(nowSec, scrollY) {
      const rMax = (0.16 + rnd() * 0.34) * vw * (P.size / 0.45);
      circles.push({
        x: left + rnd() * width,
        // Document coordinates, somewhere on the screenful the reader is
        // looking at — a little beyond either edge so they also drift in.
        y: scrollY - padTop + (-0.15 + rnd() * 1.3) * vh,
        rMax,
        born: nowSec,
        life: P.life * (0.7 + rnd() * 0.6)
      });
      if (circles.length > 14) circles.shift();
    }

    // Total displacement at a point, from every live circle, capped so this
    // stays a budge. Returns into `out` to keep the frame loop allocation-free.
    const out = { x: 0, y: 0, heat: 0 };
    function pressureAt(px, pyDoc, nowSec) {
      out.x = 0; out.y = 0; out.heat = 0;
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i];
        const age = (nowSec - c.born) / c.life;
        if (age <= 0 || age >= 1) continue;
        const r = radiusOf(c, age);
        const dx = px - c.x, dy = pyDoc - c.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        const amp = kernel(d, r) * envelopeOf(age);
        // Epsilon keeps a glyph sitting exactly on the centre from producing a
        // zero-length direction and vanishing into NaN.
        const inv = 1 / Math.max(d, 0.001);
        out.x += dx * inv * amp;
        out.y += dy * inv * amp;
        out.heat += amp;
      }
      const mag = Math.sqrt(out.x * out.x + out.y * out.y);
      if (mag > 1) { out.x /= mag; out.y /= mag; }     // cap: a budge, not a shove
      out.x *= P.pressure; out.y *= P.pressure;
      if (out.heat > 1) out.heat = 1;
      return out;
    }

    return {
      params: P,
      setParam(k, v) { P[k] = v; },
      topPad(viewport) { return viewport.vh * 0.3; },
      bottomPad(viewport) { return viewport.vh * 0.45; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        left = layout.left; width = layout.width;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        cx = new Float32Array(G.n);
        cy = new Float32Array(G.n);
        for (let i = 0; i < G.n; i++) { cx[i] = G.x[i]; cy[i] = G.y[i] + padTop; }

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height,
                       x: b.x + b.width / 2, y: b.top + b.height / 2 }))
          .filter(im => im.el);

        circles = [];
        nextSpawn = 0;
        rnd = mulberry32(0x9e3779b9 ^ G.n);
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;
        const n = G.n;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        if (!nextSpawn) nextSpawn = nowSec + 0.4;
        if (nowSec >= nextSpawn) {
          spawn(nowSec, scrollY);
          nextSpawn = nowSec + 1 / Math.max(0.05, P.rate);
        }
        for (let i = circles.length - 1; i >= 0; i--) {
          if ((nowSec - circles[i].born) / circles[i].life >= 1) circles.splice(i, 1);
        }

        if (P.ring) drawCircles(nowSec, scrollY);

        // Pictures bulge too, shifted bodily rather than distorted.
        for (const im of imgs) {
          const sy = im.y + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          const p = pressureAt(im.x, im.y, nowSec);
          ctx.drawImage(im.el, im.x - im.w / 2 + p.x * 0.5, sy - im.h / 2 + p.y * 0.5, im.w, im.h);
        }

        const margin = P.pressure + 60;
        const minY = scrollY - padTop - margin;
        const maxY = scrollY - padTop + vh + margin;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        const k = 1 - Math.exp(-17 * dt);
        let curFont = '', curFill = '';

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;

          const p = pressureAt(G.x[i], ty, nowSec);
          const goalX = G.x[i] + p.x;
          const goalY = ty + padTop + p.y;

          // Eased rather than set outright, so a glyph leaving a circle's reach
          // settles back instead of stepping.
          cx[i] += (goalX - cx[i]) * k;
          cy[i] += (goalY - cy[i]) * k;

          const sy = cy[i] - scrollY;
          if (sy < -40 || sy > vh + 40) continue;

          // Under pressure the type warms rather than dims, so the circles read
          // as something arriving rather than something taken away.
          const h = p.heat;
          const fill = h < 0.02 ? 'rgba(238,231,214,0.88)'
            : `rgba(${(INK[0] + (WARM[0] - INK[0]) * h) | 0},${(INK[1] + (WARM[1] - INK[1]) * h) | 0},${(INK[2] + (WARM[2] - INK[2]) * h) | 0},${(0.88 + 0.12 * h).toFixed(3)})`;
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          ctx.fillText(G.ch[i], cx[i], sy);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },

      destroy() { canvas.remove(); }
    };

    function drawCircles(nowSec, scrollY) {
      for (const c of circles) {
        const age = (nowSec - c.born) / c.life;
        if (age <= 0 || age >= 1) continue;
        const r = radiusOf(c, age);
        const e = envelopeOf(age);
        const sy = c.y + padTop - scrollY;
        if (sy < -r || sy > vh + r) continue;

        const g = ctx.createRadialGradient(c.x, sy, 0, c.x, sy, r);
        g.addColorStop(0, `rgba(214,186,124,${(0.05 * e).toFixed(4)})`);
        g.addColorStop(0.75, `rgba(214,186,124,${(0.02 * e).toFixed(4)})`);
        g.addColorStop(1, 'rgba(214,186,124,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(c.x, sy, r, 0, 6.2832); ctx.fill();

        ctx.strokeStyle = `rgba(226,206,158,${(0.22 * e).toFixed(4)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x, sy, r, 0, 6.2832); ctx.stroke();
      }
    }
  }
};
