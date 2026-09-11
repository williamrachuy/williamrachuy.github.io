// meniscus.js — Profile 6
//
// The post is not set. It is suspended: every glyph adrift near where it
// belongs, small and dim, wandering. Nothing composes it on its own and nothing
// ever will — the reader does it, by touching the page.
//
// A tap drops a meniscus. Inside it surface tension holds: glyphs are drawn back
// onto their true positions, come up to full size and brighten. It is the only
// thing holding them there, and it will not hold long — each meniscus decays on
// a half-life, and as it weakens its grip slips and the words go back to
// drifting. Reading here is something you keep doing rather than something you
// receive.
//
// Menisci crowd each other. The more of them there are, the faster the older
// ones give out, so the page cannot be pinned open by tapping everywhere at
// once: hold one part of the post together and you lose another.
//
// Everything is slow on purpose. The gathering eases in over a second or so and
// the drift is barely perceptible frame to frame — this profile is meant to be
// ambient, and a fast version of it is just noise.

import { imageOf } from '../images.js';

const DIM = [96, 81, 52];
const LIT = [244, 238, 224];
const BUCKETS = 30;

const smooth = t => t * t * (3 - 2 * t);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RAMP = (() => {
  const out = new Array(BUCKETS);
  for (let i = 0; i < BUCKETS; i++) {
    const t = i / (BUCKETS - 1);
    const r = DIM[0] + (LIT[0] - DIM[0]) * t;
    const g = DIM[1] + (LIT[1] - DIM[1]) * t;
    const b = DIM[2] + (LIT[2] - DIM[2]) * t;
    out[i] = `rgba(${r | 0},${g | 0},${b | 0},${(0.38 + 0.62 * t).toFixed(3)})`;
  }
  return out;
})();

// Below this a meniscus is contributing nothing anyone can see, and it is
// costing a distance check per glyph per frame. A half-life never reaches zero,
// so something has to say when it is over.
const SPENT = 0.02;

// The field is driven past full and then clamped.
//
// Without this the centre of a meniscus is only ever as composed as the
// meniscus is old: decay starts the instant it is dropped, so by the time the
// glyphs have finished gathering — about a second — the grip has already
// slipped to 0.8 and the text never actually comes good. You tap and get
// almost-readable, which is the one thing this profile must not do.
//
// Overdriving means the core holds fully composed for the first half-life and
// then gives out, and the clear patch contracts toward the centre as it goes
// rather than the whole thing fading uniformly.
const GRIP = 2.2;

export default {
  id: 'meniscus',
  name: 'Meniscus',
  blurb: 'Nothing is composed. Tap the page and surface tension holds the words — briefly.',
  params: [
    { key: 'reach', label: 'Reach', type: 'range', min: 0.2, max: 1.3, step: 0.05, value: 0.62 },
    { key: 'halfLife', label: 'Half-life', type: 'range', min: 1, max: 14, step: 0.5, value: 5.5 },
    { key: 'crowd', label: 'Crowding', type: 'range', min: 0, max: 2.5, step: 0.1, value: 0.9 },
    { key: 'most', label: 'Most at once', type: 'range', min: 1, max: 8, step: 1, value: 4 },
    { key: 'restSize', label: 'Resting size', type: 'range', min: 0.3, max: 1, step: 0.05, value: 0.55 },
    { key: 'scatter', label: 'Scatter', type: 'range', min: 0, max: 180, step: 5, value: 72 },
    { key: 'drift', label: 'Drift', type: 'range', min: 0, max: 1.5, step: 0.05, value: 0.5 },
    { key: 'spin', label: 'Tumble', type: 'range', min: 0, max: 1.2, step: 0.05, value: 0.55 },
    { key: 'ring', label: 'Show the menisci', type: 'bool', value: true }
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
    let cx = null, cy = null, cr = null;        // where each glyph is, and how it lies
    let ox = null, oy = null, fq = null, ph = null;
    let rot0 = null, rfq = null, rph = null;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let period = 0;
    let menisci = [];
    let everTapped = false;
    let hintFade = 0;

    function seed(n) {
      const rnd = mulberry32(0x7f4a7c15 ^ n);
      cx = new Float32Array(n); cy = new Float32Array(n); cr = new Float32Array(n);
      ox = new Float32Array(n); oy = new Float32Array(n);
      fq = new Float32Array(n * 2); ph = new Float32Array(n * 2);
      rot0 = new Float32Array(n); rfq = new Float32Array(n); rph = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = 0.35 + rnd() * 0.65;
        ox[i] = Math.cos(ang) * rad;
        oy[i] = Math.sin(ang) * rad * 0.7;
        // Low and incommensurable, so the field never visibly pulses in step.
        fq[i * 2] = 0.05 + rnd() * 0.16;
        fq[i * 2 + 1] = 0.04 + rnd() * 0.13;
        ph[i * 2] = rnd() * 6.283;
        ph[i * 2 + 1] = rnd() * 6.283;
        // How a glyph lies when nothing is holding it, and how slowly it rocks
        // around that. Bounded rather than a free spin: a letter that turns all
        // the way over stops reading as a letter.
        rot0[i] = (rnd() - 0.5) * 2;
        rfq[i] = 0.02 + rnd() * 0.07;
        rph[i] = rnd() * 6.283;
      }
    }

    // The post repeats every `period`, so the field has to repeat with it:
    // fold the separation into the nearest whole number of periods. Without
    // this a meniscus stops matching its text the first time the scroll wraps.
    function foldY(dy) {
      if (period > 0) dy -= period * Math.round(dy / period);
      return dy;
    }

    // Strength of a meniscus now. Half-life, so it is never quite gone — but
    // each one older than the newest decays faster in proportion to how many
    // are stacked on top of it. Tap everywhere and nothing holds anywhere.
    function strengthOf(m, nowSec, rank) {
      const hl = Math.max(0.2, P.halfLife / (1 + rank * P.crowd));
      return Math.pow(0.5, (nowSec - m.born) / hl);
    }

    // How composed a point is: 1 means exactly where the type belongs, at full
    // size and full brightness.
    function holdAt(px, pyDoc, nowSec) {
      let w = 0;
      for (let i = 0; i < menisci.length; i++) {
        const m = menisci[i];
        const r = m.r;
        const dx = px - m.x;
        const dy = foldY(pyDoc - m.y);
        if (dx > r || dx < -r || dy > r || dy < -r) continue;   // cheap reject
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r) continue;
        w += smooth(1 - d / r) * m.now * GRIP;
        if (w >= 1) return 1;
      }
      return w;
    }

    function addMeniscus(clientX, clientY, scrollY, nowSec) {
      menisci.push({
        x: clientX,
        y: clientY + scrollY - padTop,
        r: P.reach * vw,
        born: nowSec,
        now: 0
      });
      // Hard ceiling on top of the crowding, so the cost per glyph stays known.
      while (menisci.length > P.most) menisci.shift();
      everTapped = true;
    }

    // ------------------------------------------------------------- pointer
    //
    // Listened for on the window rather than the canvas, which is
    // pointer-events:none so it never stands between the reader and the page.
    // A tap has to be told apart from a scroll: a drag of any distance, or a
    // long press, is the reader moving the page and must not drop a meniscus.
    let downX = 0, downY = 0, downAt = 0, downOK = false;
    let pendingTap = null;

    const isChrome = t => t && t.closest &&
      t.closest('#controls, #back-to-feed, a, button, input, select, label, #feed');

    const onDown = e => {
      if (isChrome(e.target)) { downOK = false; return; }
      downOK = true;
      downX = e.clientX; downY = e.clientY; downAt = performance.now();
    };
    const onUp = e => {
      if (!downOK) return;
      downOK = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 12 || performance.now() - downAt > 600) return;   // a scroll, not a tap
      pendingTap = { x: e.clientX, y: e.clientY };
    };
    const onCancel = () => { downOK = false; };
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });

    return {
      params: P,
      setParam(k, v) { P[k] = v; },
      setPeriod(p) { period = p; },
      topPad(viewport) { return viewport.vh * 0.32; },
      bottomPad(viewport) { return viewport.vh * 0.5; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        seed(G.n);
        for (let i = 0; i < G.n; i++) {
          cx[i] = G.x[i] + ox[i] * P.scatter;
          cy[i] = G.y[i] + padTop + oy[i] * P.scatter;
          cr[i] = rot0[i] * P.spin;
        }

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height,
                       x: b.x + b.width / 2, y: b.top + b.height / 2 }))
          .filter(im => im.el);

        menisci = [];
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;
        const n = G.n;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        if (pendingTap) {
          addMeniscus(pendingTap.x, pendingTap.y, scrollY, nowSec);
          pendingTap = null;
        }

        // Newest first, so rank 0 is the one just dropped and the crowding
        // penalty lands on everything underneath it.
        for (let i = 0; i < menisci.length; i++) {
          menisci[i].now = strengthOf(menisci[i], nowSec, menisci.length - 1 - i);
        }
        for (let i = menisci.length - 1; i >= 0; i--) {
          if (menisci[i].now < SPENT) menisci.splice(i, 1);
        }

        if (P.ring) drawMenisci(scrollY);

        const sc = P.scatter;
        const tt = nowSec * P.drift;
        const rest = P.restSize;

        for (const im of imgs) {
          const sy = im.y + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          const w = holdAt(im.x, im.y, nowSec);
          const s = rest + (1 - rest) * w;
          ctx.globalAlpha = 0.3 + 0.7 * w;
          ctx.drawImage(im.el, im.x - im.w * s / 2, sy - im.h * s / 2, im.w * s, im.h * s);
          ctx.globalAlpha = 1;
        }

        const margin = sc + 80;
        const minY = scrollY - padTop - margin;
        const maxY = scrollY - padTop + vh + margin;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        // Gathering is quicker than letting go: a meniscus takes hold in about a
        // second, and the words slide back out over several. Both are far below
        // anything that reads as snapping.
        let curFill = '', identity = true;

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;

          const w = holdAt(G.x[i], ty, nowSec);
          const inv = 1 - w;
          const a2 = i * 2;

          // Where it would be with nothing holding it: offset, and wandering.
          const wanderX = Math.sin(tt * fq[a2] * 6.283 + ph[a2]) * 9;
          const wanderY = Math.cos(tt * fq[a2 + 1] * 6.283 + ph[a2 + 1]) * 7;
          const goalX = G.x[i] + inv * (ox[i] * sc + wanderX);
          const goalY = ty + padTop + inv * (oy[i] * sc + wanderY);

          // The angle a glyph lies at with nothing holding it, scaled by how
          // ungathered it is. Written this way rather than as an angle that
          // keeps accumulating: an accumulating angle has to catch up when a
          // meniscus lets go, which reads as the letter suddenly spinning.
          // Here it simply unwinds to true vertical as it is drawn in, and
          // leans back out as it is released.
          const goalR = inv * P.spin *
            (rot0[i] + Math.sin(tt * rfq[i] * 6.283 + rph[i]) * 0.5);

          const rate = 1.1 + 3.4 * w;
          const k = 1 - Math.exp(-rate * dt);
          cx[i] += (goalX - cx[i]) * k;
          cy[i] += (goalY - cy[i]) * k;
          cr[i] += (goalR - cr[i]) * k;

          const sy = cy[i] - scrollY;
          if (sy < -50 || sy > vh + 50) continue;

          const fill = RAMP[(w * (BUCKETS - 1)) | 0];
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          ctx.font = G.font[i];

          const s = rest + (1 - rest) * w;
          const r = cr[i];
          // Upright and full size is the common case once a meniscus has hold,
          // and it is the one worth keeping off the transform path.
          if (s > 0.995 && r > -0.004 && r < 0.004) {
            if (!identity) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); identity = true; }
            ctx.fillText(G.ch[i], cx[i], sy);
          } else {
            const co = Math.cos(r) * s, si = Math.sin(r) * s;
            ctx.setTransform(dpr * co, dpr * si, -dpr * si, dpr * co, dpr * cx[i], dpr * sy);
            identity = false;
            ctx.fillText(G.ch[i], 0, 0);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Nothing here is legible until the reader does something, so say so
        // once. Fades for good the first time they tap.
        hintFade += ((everTapped ? 0 : 1) - hintFade) * (1 - Math.exp(-2.2 * dt));
        if (hintFade > 0.01) drawHint();
      },

      destroy() {
        // These are on the window, not the canvas, so they outlive this
        // profile unless they are taken off explicitly.
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        canvas.remove();
      }
    };

    function drawMenisci(scrollY) {
      for (const m of menisci) {
        // Draw it against whichever pass of the post is on screen.
        const sy = foldY(m.y + padTop - scrollY);
        if (sy < -m.r || sy > vh + m.r) continue;
        const e = m.now;

        const g = ctx.createRadialGradient(m.x, sy, 0, m.x, sy, m.r);
        g.addColorStop(0, `rgba(214,186,124,${(0.055 * e).toFixed(4)})`);
        g.addColorStop(1, 'rgba(214,186,124,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(m.x, sy, m.r, 0, 6.2832); ctx.fill();

        ctx.strokeStyle = `rgba(226,206,158,${(0.2 * e).toFixed(4)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(m.x, sy, m.r, 0, 6.2832); ctx.stroke();
      }
    }

    function drawHint() {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '500 13px ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = `rgba(232,224,209,${(0.5 * hintFade).toFixed(3)})`;
      ctx.fillText('Tap to hold the words together', vw / 2, vh * 0.5);
      ctx.restore();
    }
  }
};
