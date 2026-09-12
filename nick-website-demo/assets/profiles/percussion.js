// percussion.js — Profile 9
//
// Paper, black type, set properly and perfectly still. Scrolling does nothing
// to it. Then you tap the page and it goes off where you touched.
//
// The glyphs near the strike take an impulse away from it, hardest at the
// centre and falling off to nothing at the edge of the blast, with enough
// scatter in the angle and the speed that the debris is not a tidy ring. They
// tumble as they go. Then every one of them is on a spring back to exactly
// where it belongs, and over `Heal` seconds the paragraph reassembles itself.
//
// The spring is a damped harmonic oscillator per glyph rather than a timed
// animation, which is what makes this composable: a second tap while the first
// is still settling adds its impulse to whatever velocity a glyph already has,
// so two blasts in quick succession interfere the way two blasts should. There
// is no "explosion" object anywhere in here — only positions, velocities and
// the one place each glyph is trying to get back to.
//
// Rotation springs to the nearest whole turn rather than to zero. A glyph that
// has spun most of the way round finishes the turn and lands upright, instead
// of stopping and unwinding backwards, which reads as a mistake.
//
// A tap is not a scroll, and telling them apart is the whole interaction: the
// press and the release have to be close together in both time and distance,
// and the page must not have moved in between. Get that wrong and either the
// text never goes off or it goes off every time somebody tries to read it. All
// three thresholds are on the panel.

import { imageOf } from '../images.js';

const PAPER = '#fbfaf7';
const INK = 'rgb(21,19,15)';
const TAU = Math.PI * 2;

// Below this a glyph is home: it stops being simulated and is snapped exactly
// onto its typeset position, so nothing is left a third of a pixel out.
const AT_REST = 0.05;       // px
const STOPPED = 0.6;        // px/s

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'percussion',
  name: 'Percussion',
  blurb: 'Still black type on paper. Tap it and it detonates there, then reassembles.',
  params: [
    { key: 'force', label: 'Force', type: 'range', min: 200, max: 4000, step: 50, value: 1500 },
    { key: 'radius', label: 'Blast radius', type: 'range', min: 0.12, max: 1, step: 0.02, value: 0.46 },
    { key: 'falloff', label: 'Falloff', type: 'range', min: 0.4, max: 4, step: 0.1, value: 1.6 },
    { key: 'heal', label: 'Heal', type: 'range', min: 0.4, max: 6, step: 0.1, value: 1.8 },
    { key: 'bounce', label: 'Bounce', type: 'range', min: 0.25, max: 1.2, step: 0.05, value: 0.75 },
    { key: 'spin', label: 'Tumble', type: 'range', min: 0, max: 3, step: 0.1, value: 1 },
    { key: 'scatter', label: 'Scatter', type: 'range', min: 0, max: 1, step: 0.05, value: 0.35 },
    { key: 'shrink', label: 'Shrink in flight', type: 'range', min: 0, max: 0.5, step: 0.02, value: 0.12 },
    { key: 'tapMs', label: 'Tap window (ms)', type: 'range', min: 90, max: 700, step: 10, value: 320 },
    { key: 'tapSlop', label: 'Tap slop (px)', type: 'range', min: 2, max: 30, step: 1, value: 10 },
    { key: 'ring', label: 'Show the strike', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: false });

    document.documentElement.classList.add('is-paper');

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let G = null;
    let dx = null, dy = null, vx = null, vy = null, rot = null, vrot = null;
    let live = null, liveN = 0, isLive = null;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let rings = [];
    let rnd = mulberry32(0x2f6b1d09);
    let pending = null;
    let reach = 0;            // furthest anything is from home, for the cull

    function blastRadius() { return P.radius * Math.min(vw, vh); }

    // ------------------------------------------------------------ the strike
    //
    // Listened for on the window, because the canvas is pointer-events:none and
    // must never stand between the reader and the page. Nothing is prevented or
    // captured here — this only watches, so scrolling, selection and every
    // control keep working exactly as they did.

    let downX = 0, downY = 0, downAt = 0, downScroll = 0, downOK = false;

    const isChrome = t => t && t.closest &&
      t.closest('#controls, #back-to-feed, a, button, input, select, label, #feed');

    const onDown = e => {
      if (isChrome(e.target)) { downOK = false; return; }
      downOK = true;
      downX = e.clientX; downY = e.clientY;
      downAt = performance.now();
      downScroll = window.scrollY;
    };
    const onUp = e => {
      if (!downOK) return;
      downOK = false;
      // Three ways to not be a tap, and the page having moved is the one that
      // matters most on a phone: a flick that ends in a stationary finger looks
      // exactly like a tap until you notice the page went with it.
      if (window.scrollY !== downScroll) return;
      if (performance.now() - downAt > P.tapMs) return;
      const mx = e.clientX - downX, my = e.clientY - downY;
      if (mx * mx + my * my > P.tapSlop * P.tapSlop) return;
      pending = { x: e.clientX, y: e.clientY };
    };
    const onCancel = () => { downOK = false; };
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });

    // --------------------------------------------------------------- physics

    // Only what is moving is simulated. A glyph enters this list when something
    // hits it and leaves when it is home, so a still page costs nothing at all
    // and a blast costs the few hundred glyphs it actually touched.
    function wake(i) {
      if (isLive[i]) return;
      isLive[i] = 1;
      live[liveN++] = i;
    }

    function detonate(sx, sy, scrollY) {
      const px = sx, py = sy + scrollY - padTop;     // into document space
      const R = blastRadius();
      const R2 = R * R;

      if (P.ring) rings.push({ x: px, y: py, born: performance.now() / 1000, r: R });

      // Home positions are sorted by y, so only the band within the blast has
      // to be looked at rather than the whole post.
      const n = G.n;
      let lo = 0, hi = n;
      const minY = py - R, maxY = py + R;
      while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

      for (let i = lo; i < n; i++) {
        const gy = G.y[i];
        if (gy > maxY) break;
        const ox = G.x[i] + dx[i] - px;
        const oy = gy + dy[i] - py;
        const d2 = ox * ox + oy * oy;
        if (d2 > R2) continue;

        const d = Math.sqrt(d2);
        const t = 1 - d / R;
        const amp = Math.pow(t, P.falloff);

        // A glyph sitting exactly on the strike has no direction of its own, so
        // it is given one rather than being left to divide by zero.
        let ang = d > 0.001 ? Math.atan2(oy, ox) : rnd() * TAU;
        ang += (rnd() - 0.5) * P.scatter * 2;
        const speed = P.force * amp * (1 - P.scatter * 0.5 + rnd() * P.scatter);

        vx[i] += Math.cos(ang) * speed;
        vy[i] += Math.sin(ang) * speed;
        vrot[i] += (rnd() - 0.5) * 2 * P.spin * amp * 14;
        wake(i);
      }

      for (const im of imgs) {
        const ox = im.x + im.dx - px, oy = im.y + im.dy - py;
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d > R) continue;
        const amp = Math.pow(1 - d / R, P.falloff);
        const ang = d > 0.001 ? Math.atan2(oy, ox) : rnd() * TAU;
        // A picture takes the shove but not the spin; a tumbling photograph
        // reads as a bug rather than as debris.
        im.vx += Math.cos(ang) * P.force * amp * 0.45;
        im.vy += Math.sin(ang) * P.force * amp * 0.45;
      }
    }

    function integrate(dt) {
      // A critically damped spring reaches ~2% of its displacement at t = heal
      // with w = 6 / heal, which is what makes `Heal` readable as "how long
      // until it looks fixed" rather than as a coefficient.
      const w = 6 / Math.max(0.1, P.heal);
      const k = w * w;
      const c = 2 * P.bounce * w;
      let far = 0;

      for (let s = liveN - 1; s >= 0; s--) {
        const i = live[s];

        vx[i] += (-k * dx[i] - c * vx[i]) * dt;
        vy[i] += (-k * dy[i] - c * vy[i]) * dt;
        dx[i] += vx[i] * dt;
        dy[i] += vy[i] * dt;

        // Toward the nearest whole turn, not toward zero: a glyph most of the
        // way round finishes the rotation instead of rewinding through it.
        const turn = Math.round(rot[i] / TAU) * TAU;
        vrot[i] += (-k * (rot[i] - turn) - c * vrot[i]) * dt;
        rot[i] += vrot[i] * dt;

        const off = Math.abs(dx[i]) + Math.abs(dy[i]);
        if (off > far) far = off;

        if (off < AT_REST && Math.abs(vx[i]) + Math.abs(vy[i]) < STOPPED &&
            Math.abs(rot[i] - turn) < 0.002 && Math.abs(vrot[i]) < 0.02) {
          dx[i] = 0; dy[i] = 0; vx[i] = 0; vy[i] = 0;
          rot[i] = 0; vrot[i] = 0;
          isLive[i] = 0;
          live[s] = live[--liveN];          // swap-remove; order does not matter
        }
      }
      reach = far;

      for (const im of imgs) {
        if (!im.dx && !im.dy && !im.vx && !im.vy) continue;
        im.vx += (-k * im.dx - c * im.vx) * dt;
        im.vy += (-k * im.dy - c * im.vy) * dt;
        im.dx += im.vx * dt;
        im.dy += im.vy * dt;
        if (Math.abs(im.dx) + Math.abs(im.dy) < AT_REST &&
            Math.abs(im.vx) + Math.abs(im.vy) < STOPPED) {
          im.dx = 0; im.dy = 0; im.vx = 0; im.vy = 0;
        }
      }
    }

    function drawRings(nowSec, scrollY) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        const age = (nowSec - g.born) / 0.55;
        if (age >= 1) { rings.splice(i, 1); continue; }
        const sy = g.y + padTop - scrollY;
        if (sy < -g.r || sy > vh + g.r) continue;
        ctx.strokeStyle = 'rgba(21,19,15,' + (0.22 * (1 - age)).toFixed(3) + ')';
        ctx.lineWidth = 2 * (1 - age) + 0.5;
        ctx.beginPath();
        ctx.arc(g.x, sy, g.r * (0.12 + 0.88 * age), 0, TAU);
        ctx.stroke();
      }
    }

    return {
      params: P,
      setParam(k, v) { P[k] = v; },
      topPad(viewport) { return viewport.vh * 0.3; },
      bottomPad(viewport) { return viewport.vh * 0.45; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        const n = G.n;
        dx = new Float32Array(n); dy = new Float32Array(n);
        vx = new Float32Array(n); vy = new Float32Array(n);
        rot = new Float32Array(n); vrot = new Float32Array(n);
        live = new Int32Array(n); isLive = new Uint8Array(n);
        liveN = 0; reach = 0;
        rings = [];
        rnd = mulberry32(0x2f6b1d09 ^ n);

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height,
                       x: b.x + b.width / 2, y: b.top + b.height / 2,
                       dx: 0, dy: 0, vx: 0, vy: 0 }))
          .filter(im => im.el);

        // An opaque canvas starts black and the first frame is a frame away.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;

        if (pending) {
          detonate(pending.x, pending.y, scrollY);
          pending = null;
        }
        // Clamped: dt is unbounded coming back from a background tab, and one
        // huge step through a spring is how a spring explodes.
        if (liveN || rings.length) integrate(Math.min(0.04, dt));

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        if (P.ring && rings.length) drawRings(nowSec, scrollY);

        for (const im of imgs) {
          const sy = im.y + im.dy + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          ctx.drawImage(im.el, im.x + im.dx - im.w / 2, sy - im.h / 2, im.w, im.h);
        }

        // The cull has to allow for debris: a glyph whose home is off screen may
        // have been thrown onto it, so the band grows with the furthest thing
        // currently out of place.
        const margin = 80 + reach;
        const minY = scrollY - padTop - margin;
        const maxY = scrollY - padTop + vh + margin;
        const n = G.n;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        ctx.fillStyle = INK;
        let curFont = '';
        const R = blastRadius();
        const shrinkOver = Math.max(1, R * 0.5);

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          const sy = ty + dy[i] + padTop - scrollY;
          if (sy < -70 || sy > vh + 70) continue;

          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          const r = rot[i];
          const ox = dx[i], oy = dy[i];

          // Settled is the common case — a still page is every glyph — and it
          // is the one worth keeping off the transform path entirely.
          if (!ox && !oy && !r) {
            ctx.fillText(G.ch[i], G.x[i], sy);
            continue;
          }

          const off = Math.sqrt(ox * ox + oy * oy);
          const s = 1 - P.shrink * Math.min(1, off / shrinkOver);
          const cx = G.x[i] + ox;
          if (!r && s > 0.995) {
            ctx.fillText(G.ch[i], cx, sy);
          } else {
            const co = Math.cos(r) * s, si = Math.sin(r) * s;
            ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * cx, dpr * sy);
            ctx.fillText(G.ch[i], 0, 0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },

      destroy() {
        // On the window, not the canvas, so they outlive this profile unless
        // they are taken off explicitly.
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        document.documentElement.classList.remove('is-paper');
        canvas.remove();
      }
    };
  }
};
