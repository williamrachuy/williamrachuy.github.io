// waterline.js — Profile 5
//
// Tidewater's idea with the window taken out of it.
//
// Tidewater holds a band in which every glyph is fully resolved, so there is a
// rectangle of perfect text moving down the page. Here there is exactly one
// line of pixels where the type is truly on its mark, and nothing else is ever
// quite settled. Above and below it a feather falls away, and everything in
// that feather is caught mid-snap.
//
// The feather is a speed, not a shape. A glyph's distance from the line sets
// how fast it converges on where it belongs: on the line, instantly; at the
// edge of the feather, barely at all. So widening the feather does not widen
// the area of correct text — it gives glyphs longer to arrive, which makes them
// look settled sooner as they rise toward the line.
//
// Distance also takes size. A glyph at the far edge is drawn at `farSize` of
// its real size and its line contracts toward the centre of the measure, so
// text recedes as it leaves the line rather than merely dimming.

import { imageOf } from '../images.js';

const DIM = [70, 59, 36];
const MID = [168, 141, 89];
const LIT = [242, 234, 216];
const BUCKETS = 32;

// Sizes are drawn in steps of 1/SIZE_STEPS. A glyph at a size nothing has
// drawn it at before is rasterised from its outline; at a size already seen it
// comes out of the glyph cache. With size following distance continuously,
// almost every glyph on screen missed on almost every frame — measured, that
// was three quarters of this profile's cost — and a 3% step in the size of a
// letter that is also drifting is not something anyone can see.
const SIZE_STEPS = 32;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Colour is quantised so the fill style changes a few dozen times a frame
// instead of once per glyph.
const RAMP = (() => {
  const out = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / (BUCKETS - 1);
    let r, g, b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = DIM[0] + (MID[0] - DIM[0]) * k;
      g = DIM[1] + (MID[1] - DIM[1]) * k;
      b = DIM[2] + (MID[2] - DIM[2]) * k;
    } else {
      const k = (t - 0.5) / 0.5;
      r = MID[0] + (LIT[0] - MID[0]) * k;
      g = MID[1] + (LIT[1] - MID[1]) * k;
      b = MID[2] + (LIT[2] - MID[2]) * k;
    }
    out[i] = `rgba(${r | 0},${g | 0},${b | 0},${(0.34 + 0.66 * t).toFixed(3)})`;
  }
  return out;
})();

export default {
  id: 'waterline',
  name: 'Waterline',
  blurb: 'One pixel line of true alignment. Everything else is mid-snap.',
  params: [
    { key: 'lineY', label: 'Focus line', type: 'range', min: 0.10, max: 0.85, step: 0.01, value: 0.42 },
    { key: 'feather', label: 'Feather width', type: 'range', min: 0.05, max: 0.70, step: 0.01, value: 0.30 },
    { key: 'falloff', label: 'Falloff', type: 'range', min: 0.4, max: 4, step: 0.1, value: 2.2 },
    { key: 'balance', label: 'On / off balance', type: 'range', min: 0.15, max: 0.85, step: 0.05, value: 0.5 },
    { key: 'farSize', label: 'Far size', type: 'range', min: 0.3, max: 1, step: 0.05, value: 0.5 },
    { key: 'scatter', label: 'Scatter', type: 'range', min: 0, max: 200, step: 5, value: 64 },
    { key: 'drift', label: 'Drift', type: 'range', min: 0, max: 2, step: 0.05, value: 0.85 },
    { key: 'showLine', label: 'Show the line', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    // The line and its feather glow are a layer under the canvas rather than
    // a gradient filled across it every frame; they only change when a
    // control does.
    const glow = document.createElement('div');
    glow.className = 'fx-layer';
    glow.setAttribute('aria-hidden', 'true');
    const rule = document.createElement('div');
    rule.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:rgba(226,206,158,0.55)';
    glow.appendChild(rule);
    host.insertBefore(glow, canvas);

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
    let cx = null, cy = null;              // where each glyph currently is
    let seen = null;                       // the frame each glyph was last stepped on
    let frameNo = 0;
    let ox = null, oy = null, fq = null, ph = null;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let measureCx = 0;                     // horizontal centre of the measure
    let lineY = 0.42;
    let dragging = false;

    function seed(n) {
      const rnd = mulberry32(0x2545f491 ^ n);
      cx = new Float32Array(n); cy = new Float32Array(n);
      seen = new Int32Array(n).fill(-1);
      ox = new Float32Array(n); oy = new Float32Array(n);
      fq = new Float32Array(n); ph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 0.3 + rnd() * 0.7;
        ox[i] = Math.cos(ang) * rad * 1.3;
        oy[i] = Math.sin(ang) * rad * 0.8;
        fq[i] = 0.35 + rnd() * 0.9;
        ph[i] = rnd() * 6.283;
      }
    }

    // How far the feather reaches on each side of the line. `balance` splits
    // the total between the approach (below the line, text coming up toward it)
    // and the departure (above it). At 0.5 they are equal; pushed either way it
    // gives a long slow roll on against a short sharp roll off, or the reverse.
    function reachBelow() { return Math.max(8, P.feather * vh) * 2 * P.balance; }
    function reachAbove() { return Math.max(8, P.feather * vh) * 2 * (1 - P.balance); }

    // 1 on the line, 0 at the edge of the feather, and nowhere flat in between.
    //
    // The curve is t^falloff rather than a smoothstep. A smoothstep is lazy at
    // both ends and steepest in the middle, which is backwards here: it spends
    // its resolution halfway out and leaves the line itself looking much like
    // its neighbours. Raising the exponent holds glyphs unresolved further out
    // and concentrates the whole change close to the line, which is where it
    // reads. Below 1 it does the opposite and spreads the gradient out.
    function weightAt(screenY) {
      const dy = screenY - lineY * vh;
      const reach = dy >= 0 ? reachBelow() : reachAbove();
      const t = 1 - clamp01(Math.abs(dy) / Math.max(1, reach));
      return Math.pow(t, P.falloff);
    }

    function placeHandle() {
      handle.style.top = (lineY * vh) + 'px';
      handle.style.left = '';
      placeLine();
    }

    // One pixel of true alignment, with the feather it commands shown faintly
    // either side of it so the mechanism is visible. Sampled rather than a
    // two-stop gradient, so the glow traces the actual falloff curve —
    // asymmetry and exponent both visible in the shape.
    function placeLine() {
      glow.style.display = P.showLine ? '' : 'none';
      if (!P.showLine) return;
      const y = Math.round(lineY * vh) + 0.5;
      const up = reachAbove(), down = reachBelow();
      const total = up + down;
      const stops = [];
      for (let i = 0; i <= 16; i++) {
        const stop = i / 16;
        const w = weightAt(y - up + stop * total);
        stops.push('rgba(214,186,124,' + (0.075 * w).toFixed(4) + ') ' + (stop * 100).toFixed(2) + '%');
      }
      glow.style.width = vw + 'px';
      glow.style.height = total + 'px';
      glow.style.transform = `translate(0px, ${y - up}px)`;
      glow.style.background = 'linear-gradient(180deg, ' + stops.join(', ') + ')';
      rule.style.top = (up - 0.5) + 'px';
    }

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
      host.dispatchEvent(new CustomEvent('paramsync', { detail: { key: 'lineY', value: P.lineY } }));
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
      topPad(viewport) { return viewport.vh * 0.34; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        lineY = P.lineY;
        measureCx = layout.left + layout.width / 2;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        const irnd = mulberry32(0x27d4eb2f ^ layout.blocks.length);
        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => {
            const ang = irnd() * Math.PI * 2;
            return {
              el: imageOf(b), w: b.width, h: b.height,
              tx: b.x + b.width / 2, ty: b.top + b.height / 2,
              ox: Math.cos(ang) * 0.4, oy: Math.sin(ang) * 0.3,
              cx: 0, cy: 0, placed: false
            };
          })
          .filter(im => im.el);

        // The first frame places every glyph straight onto its goal.
        seed(G.n);
        placeHandle();
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const n = G.n;
        frameNo++;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        const sc = P.scatter;
        const span = Math.max(sc * 1.6, 220);
        const minY = scrollY - padTop - span;
        const maxY = scrollY - padTop + vh + span;

        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        const tt = t * 0.001 * P.drift;
        const far = P.farSize;

        for (const im of imgs) drawImage(im, dt, scrollY, tt);

        let curFill = '', curFont = '', identity = true;
        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;

          const screenY = ty + padTop - scrollY;
          // Weight comes from where the glyph BELONGS, not where it has drifted
          // to. Reading it from the current position feeds back on itself — a
          // glyph pushed off the line then snaps slower, so it never comes back,
          // and the sharpest text ends up somewhere other than the line.
          const w = weightAt(screenY);
          const inv = 1 - w;

          // Size falls away from the line, and the line it sits on contracts
          // toward the centre of the measure, so a receding line stays a line
          // instead of spreading into loose letters.
          const s = Math.round((far + (1 - far) * w) * SIZE_STEPS) / SIZE_STEPS;
          const goalX = measureCx + (G.x[i] - measureCx) * s
                      + inv * (ox[i] * sc + Math.sin(tt * fq[i] + ph[i]) * 11);
          const goalY = screenY + inv * (oy[i] * sc + Math.cos(tt * fq[i] * 0.8 + ph[i]) * 8);

          // The feather is the speed: pinned on the line, barely moving at the
          // outer edge. Linear in w, not cubed — w is already t^falloff, and
          // cubing it on top compounds to t^(3*falloff), which at a high
          // falloff is zero everywhere but a hair from the line. Glyphs then
          // cannot converge in the time they have, and the focus line never
          // assembles. `falloff` is the one control over how concentrated this
          // is; it does not need help.
          //
          // A glyph that was outside the working set last frame holds a
          // screen position from a scroll long gone, and easing from there
          // streaked it in from off screen. It starts at its goal instead.
          if (seen[i] !== frameNo - 1) {
            cx[i] = goalX; cy[i] = goalY;
          } else {
            const rate = 0.8 + 46 * w;
            const k = 1 - Math.exp(-rate * dt);
            cx[i] += (goalX - cx[i]) * k;
            cy[i] += (goalY - cy[i]) * k;
          }
          seen[i] = frameNo;

          if (cy[i] < -60 || cy[i] > vh + 60) continue;

          const fill = RAMP[(w * (BUCKETS - 1)) | 0];
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          if (s >= 1) {
            if (!identity) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); identity = true; }
            ctx.fillText(G.ch[i], cx[i], cy[i]);
          } else {
            ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * cx[i], dpr * cy[i]);
            identity = false;
            ctx.fillText(G.ch[i], 0, 0);
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
        glow.remove();
      }
    };

    function drawImage(im, dt, scrollY, tt) {
      const screenY = im.ty + padTop - scrollY;
      if (screenY < -im.h - 200 || screenY > vh + im.h + 200) { im.placed = false; return; }

      const w = weightAt(screenY);
      const inv = 1 - w;
      const s = P.farSize + (1 - P.farSize) * w;
      const goalX = measureCx + (im.tx - measureCx) * s + inv * im.ox * P.scatter;
      const goalY = screenY + inv * im.oy * P.scatter;

      if (!im.placed) { im.cx = goalX; im.cy = goalY; im.placed = true; }
      const k = 1 - Math.exp(-(0.8 + 34 * w) * dt);
      im.cx += (goalX - im.cx) * k;
      im.cy += (goalY - im.cy) * k;

      ctx.globalAlpha = 0.24 + 0.76 * w;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * im.cx, dpr * im.cy);
      ctx.drawImage(im.el, -im.w / 2, -im.h / 2, im.w, im.h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
};
