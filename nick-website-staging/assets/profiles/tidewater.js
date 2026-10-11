// tidewater.js — Profile 1
//
// Default state: every glyph is adrift. Displaced, rotated, dark.
// A focus lens sits in the upper third of the viewport. Glyphs entering it get
// pulled back onto the line Pretext computed for them, straighten out, and
// brighten. Glyphs leaving it are released and the current takes them again.
//
// The lens is draggable. Band mode reads while you scroll; circle mode is a
// spotlight you move around with your thumb.

import { imageOf } from '../images.js';

const CORE_DIM = [74, 62, 38];      // very dark, desaturated gold
const CORE_MID = [170, 143, 90];    // gold
const CORE_LIT = [240, 232, 214];   // warm cream (matches the site wordmark)
const BUCKETS = 28;

// Angles are drawn in steps of 1/ROT_STEPS of a radian, about two and a half
// degrees. A glyph drawn at an angle nothing has drawn before has to be
// rasterised from its outline; one drawn at an angle already seen comes out of
// the glyph cache. Continuous angles meant every drifting letter missed on
// every frame — the single largest cost of this profile — and a step this
// small is lost in the drift that is moving the letter anyway.
const ROT_STEPS = 24;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = t => t * t * (3 - 2 * t);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

function rampTable() {
  const out = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / (BUCKETS - 1);
    let r, g, b;
    if (t < 0.55) {
      const k = t / 0.55;
      r = CORE_DIM[0] + (CORE_MID[0] - CORE_DIM[0]) * k;
      g = CORE_DIM[1] + (CORE_MID[1] - CORE_DIM[1]) * k;
      b = CORE_DIM[2] + (CORE_MID[2] - CORE_DIM[2]) * k;
    } else {
      const k = (t - 0.55) / 0.45;
      r = CORE_MID[0] + (CORE_LIT[0] - CORE_MID[0]) * k;
      g = CORE_MID[1] + (CORE_LIT[1] - CORE_MID[1]) * k;
      b = CORE_MID[2] + (CORE_LIT[2] - CORE_MID[2]) * k;
    }
    const a = 0.40 + 0.60 * t;
    out[i] = `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})`;
  }
  return out;
}
const RAMP = rampTable();

// Far from the lens the current thins out. Where the lens has any pull at all
// every glyph is drawn; beyond that the share drawn falls away linearly to
// FAR_KEEP at FAR_REACH screen-heights out, so text condenses out of the
// current as it comes up toward the lens rather than all of it being there all
// along. Each glyph has a fixed rank that decides whether it is one of the
// survivors, so the same letters are always the ones left and nothing
// flickers; those near the cut fade rather than pop. Out there every letter is
// dim and turned, and a turned letter is the most expensive thing a canvas can
// be asked to draw — at the defaults that is most of the bottom third of the screen.
const FAR_KEEP = 0.4;
const FAR_REACH = 0.35;
const FADE = 0.12;             // how much of the rank range a letter fades across
const FADE_STEPS = 8;
// The dimmest colour with its alpha scaled down, for letters fading at the cut.
// Only ever needed where the lens has no pull, which is exactly where every
// glyph is at the bottom of the ramp.
const FAR_FADE = (() => {
  const out = [];
  for (let k = 0; k <= FADE_STEPS; k++) {
    out.push(RAMP[0].replace(/[\d.]+\)$/, (0.40 * k / FADE_STEPS).toFixed(3) + ')'));
  }
  return out;
})();

export default {
  id: 'tidewater',
  name: 'Tidewater',
  blurb: 'Glyphs drift until the focus lens pulls them into line. Drag the lens.',
  params: [
    { key: 'lensMode', label: 'Lens', type: 'enum', options: ['band', 'circle'], value: 'band' },
    { key: 'lensY', label: 'Lens position', type: 'range', min: 0.12, max: 0.82, step: 0.01, value: 0.36 },
    { key: 'lensSize', label: 'Lens size', type: 'range', min: 0.05, max: 0.32, step: 0.01, value: 0.11 },
    { key: 'scatter', label: 'Scatter', type: 'range', min: 0, max: 240, step: 5, value: 110 },
    { key: 'current', label: 'Current', type: 'range', min: 0, max: 2.2, step: 0.05, value: 1 },
    { key: 'showLens', label: 'Show lens glow', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    // The lens glow is a layer of its own under the canvas rather than a
    // gradient filled across the canvas every frame; it only changes when the
    // lens is moved or resized.
    const glow = document.createElement('div');
    glow.className = 'fx-layer';
    glow.setAttribute('aria-hidden', 'true');
    host.insertBefore(glow, canvas);

    const handle = document.createElement('div');
    handle.className = 'lens-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Focus lens position');
    handle.innerHTML = '<span></span>';
    host.appendChild(handle);

    const ctx = canvas.getContext('2d', { alpha: true });

    let G = null;            // glyph set from typeset()
    let cx, cy, cr;          // live state
    let seen = null;         // the frame each glyph was last stepped on
    let frameNo = 0;
    let ox, oy, amp, fq, ph, rot0;
    let rank = null;         // fixed per glyph: whether it survives the far thinning
    let dpr = 1, vw = 0, vh = 0;
    let padTop = 0;
    let lensPx = { x: 0.5, y: 0.36 };
    let dragging = false;
    let imgs = [];           // pictures ride the same current as the glyphs

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    function seed(n) {
      const rnd = mulberry32(0x9e3779b9 ^ n);
      cx = new Float32Array(n); cy = new Float32Array(n); cr = new Float32Array(n);
      seen = new Int32Array(n).fill(-1);
      ox = new Float32Array(n); oy = new Float32Array(n);
      amp = new Float32Array(n * 2); fq = new Float32Array(n * 3); ph = new Float32Array(n * 3);
      rot0 = new Float32Array(n);
      rank = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 0.35 + rnd() * 0.65;
        ox[i] = Math.cos(ang) * rad * 1.45;
        oy[i] = Math.sin(ang) * rad * 0.95;
        amp[i * 2] = 5 + rnd() * 16;
        amp[i * 2 + 1] = 4 + rnd() * 13;
        fq[i * 3] = 0.5 + rnd() * 1.1;
        fq[i * 3 + 1] = 0.4 + rnd() * 1.0;
        fq[i * 3 + 2] = 0.3 + rnd() * 0.9;
        ph[i * 3] = rnd() * 6.283;
        ph[i * 3 + 1] = rnd() * 6.283;
        ph[i * 3 + 2] = rnd() * 6.283;
        rot0[i] = (rnd() - 0.5) * 1.5;
      }
      // Its own generator, so adding this left every drift exactly as it was.
      const rr = mulberry32(0x68e31da4 ^ n);
      for (let i = 0; i < n; i++) rank[i] = rr();
    }

    // Lens weight: 1 inside the core, easing to 0 across the falloff.
    // Incoming text (below the lens) gets a longer runway than outgoing text,
    // so lines assemble before you reach them and shed once you pass.
    function weight(gx, gy) {
      const cyPx = lensPx.y * vh;
      const core = Math.max(26, P.lensSize * vh);
      const inFall = core * 1.5;
      const outFall = core * 1.3;
      const dy = gy - cyPx;
      let w;
      if (dy > 0) w = 1 - clamp01((dy - core) / inFall);
      else w = 1 - clamp01((-dy - core) / outFall);
      w = clamp01(w);
      if (P.lensMode === 'circle') {
        const r = Math.max(70, core * 2.5);
        const dx = Math.abs(gx - lensPx.x * vw);
        w *= 1 - clamp01((dx - r) / (r * 0.85));
      }
      return smooth(w);
    }

    // Share of glyphs drawn at this height on screen: all of them wherever the
    // lens pulls, thinning past that. Vertical distance only, so a circle lens
    // keeps its full band either side, exactly as the band lens does.
    function keepAt(gy) {
      const cyPx = lensPx.y * vh;
      const core = Math.max(26, P.lensSize * vh);
      const dy = gy - cyPx;
      const edge = dy > 0 ? dy - core * 2.5 : -dy - core * 2.3;
      if (edge <= 0) return 1;
      return 1 - (1 - FAR_KEEP) * clamp01(edge / (FAR_REACH * vh));
    }

    function placeHandle() {
      handle.style.top = (lensPx.y * vh) + 'px';
      handle.style.left = P.lensMode === 'circle' ? (lensPx.x * vw) + 'px' : '';
      handle.dataset.mode = P.lensMode;
      placeGlow();
    }

    // Same geometry and the same stops the canvas used to fill.
    function placeGlow() {
      glow.style.display = P.showLens ? '' : 'none';
      if (!P.showLens) return;
      const y = lensPx.y * vh;
      const core = Math.max(26, P.lensSize * vh);
      if (P.lensMode === 'band') {
        glow.style.width = vw + 'px';
        glow.style.height = (core * 4.8) + 'px';
        glow.style.borderRadius = '';
        glow.style.transform = `translate(0px, ${y - core * 2.2}px)`;
        glow.style.background = 'linear-gradient(180deg, rgba(214,186,124,0) 0%, ' +
          'rgba(214,186,124,0.085) 50%, rgba(214,186,124,0) 100%)';
      } else {
        const x = lensPx.x * vw;
        const r = Math.max(90, core * 3.1);
        glow.style.width = glow.style.height = (r * 2) + 'px';
        glow.style.borderRadius = '50%';
        glow.style.transform = `translate(${x - r}px, ${y - r}px)`;
        glow.style.background = 'radial-gradient(circle closest-side, rgba(214,186,124,0.13) 0%, ' +
          'rgba(214,186,124,0.05) 62%, rgba(214,186,124,0) 100%)';
      }
    }

    // ------------------------------------------------------------ pointer
    const onDown = e => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-dragging');
      e.preventDefault();
    };
    const onMove = e => {
      if (!dragging) return;
      const r = host.getBoundingClientRect();
      lensPx.y = clamp01((e.clientY - r.top) / vh);
      P.lensY = lensPx.y;
      if (P.lensMode === 'circle') lensPx.x = clamp01((e.clientX - r.left) / vw);
      placeHandle();
      host.dispatchEvent(new CustomEvent('paramsync', { detail: { key: 'lensY', value: P.lensY } }));
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
        if (k === 'lensY') lensPx.y = v;
        placeHandle();
      },
      topPad(viewport) { return viewport.vh * 0.34; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        lensPx.y = P.lensY;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';
        // Pictures drift too. Each gets its own drift vector off the same
        // generator, so a reload puts everything back exactly where it was.
        const irnd = mulberry32(0x85ebca6b ^ layout.blocks.length);
        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => {
            const ang = irnd() * Math.PI * 2;
            const rad = 0.30 + irnd() * 0.5;
            return {
              el: imageOf(b), w: b.width, h: b.height,
              tx: b.x + b.width / 2, ty: b.top + b.height / 2,
              ox: Math.cos(ang) * rad, oy: Math.sin(ang) * rad * 0.7,
              rot0: (irnd() - 0.5) * 0.5,
              fq: 0.3 + irnd() * 0.5, ph: irnd() * 6.283,
              cx: 0, cy: 0, cr: 0, placed: false
            };
          })
          .filter(im => im.el);

        // Nothing has been stepped yet, so the first frame places every glyph
        // straight onto its drift goal rather than easing in from the origin.
        seed(G.n);
        placeHandle();
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const n = G.n;
        frameNo++;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textBaseline = 'alphabetic';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const sc = P.scatter;
        const span = Math.max(sc * 1.6, 200);
        const minY = scrollY - padTop - span;
        const maxY = scrollY - padTop + vh + span;

        // y is monotonic, so bound the working set instead of touching 4k glyphs.
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        const tt = t * 0.001 * P.current;

        // Pictures first, so drifting glyphs pass in front of them.
        for (const im of imgs) {
          const screenY = im.ty + padTop - scrollY;
          if (screenY < -im.h - sc * 2 || screenY > vh + im.h + sc * 2) { im.placed = false; continue; }

          const w = weight(im.cx || im.tx, screenY);
          const inv = 1 - w;
          const driftX = im.tx + inv * (im.ox * sc + Math.sin(tt * im.fq + im.ph) * 14);
          const driftY = screenY + inv * (im.oy * sc + Math.cos(tt * im.fq * 0.8 + im.ph) * 10);
          const driftR = inv * (im.rot0 + Math.sin(tt * im.fq * 0.6 + im.ph) * 0.12);

          if (!im.placed) { im.cx = driftX; im.cy = driftY; im.cr = driftR; im.placed = true; }
          const k = 1 - Math.exp(-(3.0 + 18 * w * w) * dt);
          im.cx += (driftX - im.cx) * k;
          im.cy += (driftY - im.cy) * k;
          im.cr += (driftR - im.cr) * k;

          ctx.globalAlpha = 0.26 + 0.74 * w;
          const co = Math.cos(im.cr), si = Math.sin(im.cr);
          ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * im.cx, dpr * im.cy);
          ctx.drawImage(im.el, -im.w / 2, -im.h / 2, im.w, im.h);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalAlpha = 1;
        }

        let curFont = '', curFill = '', identity = true;

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;

          const tx = G.x[i];
          const screenY = ty + padTop - scrollY;
          const w = weight(cx[i], screenY);
          const inv = 1 - w;

          // Goal position: the true line position, plus displacement scaled by
          // how far outside the lens we are.
          const a2 = i * 2, a3 = i * 3;
          const flowX = Math.sin(ty * 0.009 + tt * 0.42) * 13;
          const flowY = Math.cos(tx * 0.011 + tt * 0.33) * 8;
          const wobX = Math.sin(tt * fq[a3] + ph[a3]) * amp[a2];
          const wobY = Math.cos(tt * fq[a3 + 1] + ph[a3 + 1]) * amp[a2 + 1];

          const goalX = tx + inv * (ox[i] * sc + wobX + flowX);
          const goalY = screenY + inv * (oy[i] * sc + wobY + flowY);
          const goalR = inv * (rot0[i] + Math.sin(tt * fq[a3 + 2] + ph[a3 + 2]) * 0.45);

          // A glyph that was outside the working set last frame has a position
          // from whenever it was last stepped — a screen coordinate from a
          // scroll position long gone. Easing from there sent letters streaking
          // in from off screen whenever the reader scrolled back or jumped.
          // It starts from where the current would have it instead.
          if (seen[i] !== frameNo - 1) {
            cx[i] = goalX; cy[i] = goalY; cr[i] = goalR;
          } else {
            // Snapping is decisive, releasing is lazy. Frame-rate independent.
            const rate = 3.2 + 22 * w * w;
            const k = 1 - Math.exp(-rate * dt);
            cx[i] += (goalX - cx[i]) * k;
            cy[i] += (goalY - cy[i]) * k;
            cr[i] += (goalR - cr[i]) * k;
          }
          seen[i] = frameNo;

          if (cy[i] < -60 || cy[i] > vh + 60) continue;

          // Still stepped above, so a letter that comes back is exactly where
          // the current has been carrying it; just not drawn.
          const keep = keepAt(screenY);
          let fill;
          if (keep < 1) {
            // Scaled so that at keep = 1 every rank is fully in, and the
            // thinning starts from nothing rather than from a step.
            const fa = (keep * (1 + FADE) - rank[i]) / FADE;
            if (fa <= 0) continue;
            fill = fa >= 1 ? RAMP[0] : FAR_FADE[Math.ceil(fa * FADE_STEPS)];
          } else {
            fill = RAMP[(w * (BUCKETS - 1)) | 0];
          }
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          const r = Math.round(cr[i] * ROT_STEPS) / ROT_STEPS;
          if (r === 0) {
            if (!identity) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); identity = true; }
            ctx.fillText(G.ch[i], cx[i], cy[i]);
          } else {
            const co = Math.cos(r), si = Math.sin(r);
            ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * cx[i], dpr * cy[i]);
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
  }
};
