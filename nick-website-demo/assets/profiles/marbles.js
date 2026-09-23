// marbles.js — Profile 8
//
// The only light page here. Black type on paper, and a few discs of coloured
// glass loose on top of it.
//
// The ends of `How many` and `Size` are where they are for a measured reason.
// Glass is transparent, so every marble on screen is another layer of alpha
// blending — six at 0.24 held 48fps when the glass was filled into the canvas
// every frame, eight at 0.30 fell to 27, and by then the page is a wash of
// colour and not a reading profile anyway. The glass is its own layer now,
// under a transparent canvas, so the compositor moves it rather than the
// canvas re-rasterising it, and the blending is the GPU's to do.
//
// A marble carries the shell-shaped pressure field the first Meniscus had: the
// push is nothing at the centre, strongest at a ring partway out, nothing again
// at the rim. Text is pressed aside by the wall rather than swelling off a
// point, and because the ring is drawn where the push peaks, you can see the
// edge doing the work. The displacement is capped well under a line height, so
// a word bends around a marble and stays a word.
//
// Colour is a second field, and it is strongest where the push is weakest: full
// in the middle of the marble, gone at the rim. Type under the centre keeps its
// shape and takes the colour; type at the edge keeps its colour and gets
// shoved. Nothing dims — the ink is pulled toward the marble's hue and never
// further than `Colour pull` allows, which tops out well short of matching it.
//
// The marbles drift, and they are attracted to type: a density map of the page
// is built once at layout and each marble rolls up its gradient, so they
// collect over paragraphs and drain out of the margins rather than wandering
// anywhere. They can be picked up — press one, drag it, let go, and it keeps
// the speed you let go at, slows, and eventually settles back over the text.
//
// Positions are in screen coordinates, not document ones. A marble is a thing
// on the glass rather than a mark on the page, so the text scrolls under it,
// which is what makes one worth throwing.

import { imageOf } from '../images.js';

const INK = [21, 19, 15];

// Printer's colours rather than screen ones: saturated enough to read as glass
// on white, dark enough that type tinted by one is still type.
const GLASS = [
  [ 46, 104, 196],
  [201,  74,  56],
  [ 54, 138,  96],
  [206, 146,  38],
  [124,  84, 178],
  [ 24, 154, 168]
];

const TAU = Math.PI * 2;
const CELL = 44;            // density map resolution, in document px
const MAX_SPEED = 2600;     // px/s, so a hard throw stays on this planet

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// Under a marble every glyph gets its own colour, and building a fresh
// `rgb(...)` string for each one — then handing it to the context, which parses
// it — is the most expensive thing on the frame by a wide margin. Colours are
// rounded to 5 bits a channel and the strings kept, so a page settles onto a
// few hundred of them and builds each once. Five bits is far finer than the eye
// can follow along a tint this shallow.
const FILLS = new Array(1 << 15);
function fillFor(r, g, b) {
  const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const hit = FILLS[k];
  if (hit !== undefined) return hit;
  return (FILLS[k] = `rgb(${(r >> 3) << 3},${(g >> 3) << 3},${(b >> 3) << 3})`);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'marbles',
  name: 'Marbles',
  blurb: 'Black on white, with coloured glass loose on the page. Push one around.',
  params: [
    { key: 'count', label: 'How many', type: 'range', min: 1, max: 6, step: 1, value: 3 },
    { key: 'size', label: 'Size', type: 'range', min: 0.06, max: 0.24, step: 0.01, value: 0.15 },
    { key: 'shell', label: 'Shell', type: 'range', min: 0, max: 0.9, step: 0.05, value: 0.55 },
    { key: 'pressure', label: 'Push', type: 'range', min: 0, max: 55, step: 1, value: 15 },
    { key: 'tint', label: 'Colour pull', type: 'range', min: 0, max: 0.9, step: 0.05, value: 0.55 },
    { key: 'ink', label: 'Glass', type: 'range', min: 0.04, max: 0.6, step: 0.02, value: 0.22 },
    { key: 'attract', label: 'Pull toward text', type: 'range', min: 0, max: 2, step: 0.1, value: 0.7 },
    { key: 'drift', label: 'Drift', type: 'range', min: 0, max: 2.5, step: 0.1, value: 0.8 },
    { key: 'slow', label: 'How fast they slow', type: 'range', min: 0.15, max: 3, step: 0.05, value: 0.9 },
    { key: 'apart', label: 'Keep apart', type: 'range', min: 0, max: 2, step: 0.1, value: 0.8 },
    { key: 'ring', label: 'Show the shell', type: 'bool', value: true }
  ],

  create(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'stage-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d', { alpha: true });

    // The page goes to paper for as long as this profile is mounted. Set on the
    // root rather than the body so the strip behind an overscroll matches too.
    document.documentElement.classList.add('is-paper');

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let G = null;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let left = 0, width = 0, docH = 0;
    let dens = null, gw = 0, gh = 0;
    let orbs = [];
    let rnd = mulberry32(0x51ed270b);

    const handles = [];      // one invisible grab target per marble
    const glass = [];        // and one layer of coloured glass under the type

    function base() { return Math.min(vw, vh); }
    function radiusOf(o) { return P.size * base() * o.spread; }

    // ------------------------------------------------------------ the map
    //
    // Where the type is, at CELL resolution, blurred once so a marble rolling
    // up the gradient gets a smooth slope instead of stepping between cells.

    function buildDensity(layout) {
      gw = Math.max(1, Math.ceil(Math.max(1, width) / CELL));
      gh = Math.max(1, Math.ceil(Math.max(1, docH) / CELL));
      const raw = new Float32Array(gw * gh);
      for (let i = 0; i < G.n; i++) {
        const gx = Math.min(gw - 1, Math.max(0, ((G.x[i] - left) / CELL) | 0));
        const gy = Math.min(gh - 1, Math.max(0, (G.y[i] / CELL) | 0));
        raw[gy * gw + gx] += 1;
      }
      // Pictures are type too, as far as a marble is concerned.
      for (const b of layout.blocks) {
        if (b.type !== 'image') continue;
        const x0 = Math.max(0, ((b.x - left) / CELL) | 0);
        const x1 = Math.min(gw - 1, ((b.x + b.width - left) / CELL) | 0);
        const y0 = Math.max(0, (b.top / CELL) | 0);
        const y1 = Math.min(gh - 1, ((b.top + b.height) / CELL) | 0);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) raw[y * gw + x] += 6;
      }

      const blur = new Float32Array(gw * gh);
      let max = 0;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          let s = 0, k = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= gh) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx;
              if (xx < 0 || xx >= gw) continue;
              s += raw[yy * gw + xx]; k++;
            }
          }
          const v = k ? s / k : 0;
          blur[y * gw + x] = v;
          if (v > max) max = v;
        }
      }
      if (max > 0) for (let i = 0; i < blur.length; i++) blur[i] /= max;
      dens = blur;
    }

    // Bilinear, in document coordinates. Off the page reads as empty, which is
    // what keeps a marble from wandering out of the column and staying there.
    function densityAt(docX, docY) {
      if (!dens) return 0;
      const fx = (docX - left) / CELL - 0.5;
      const fy = docY / CELL - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const at = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh) ? 0 : dens[y * gw + x];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }

    // ----------------------------------------------------------- the field

    // Push from one marble at distance u = d / r. `shell` at 0 is a swell,
    // hardest at the centre; above 0 it is a ring peaking at that fraction of
    // the radius and falling to nothing at both the centre and the rim.
    // Smoothstepped on each side, so no crease at the peak and no snap at the
    // boundary as a marble crosses a line.
    function pushKernel(u) {
      const p = P.shell;
      let t;
      if (p <= 0.001) t = 1 - u;
      else if (u < p) t = u / p;
      else t = (1 - u) / (1 - p);
      return t * t * (3 - 2 * t);
    }

    // Colour goes the other way: full in the middle, gone at the rim.
    function tintKernel(u) {
      const t = 1 - u;
      return t * t * (3 - 2 * t);
    }

    // ------------------------------------------------------------ marbles

    function makeOrb(i) {
      const w = vw || 800, h = vh || 800;
      return {
        x: (0.2 + rnd() * 0.6) * w,
        y: (0.2 + rnd() * 0.6) * h,
        vx: (rnd() - 0.5) * 40,
        vy: (rnd() - 0.5) * 40,
        spread: 0.7 + rnd() * 0.6,       // size relative to the others
        c: GLASS[i % GLASS.length],
        ph: rnd() * TAU, ph2: rnd() * TAU,
        fq: 0.06 + rnd() * 0.09, fq2: 0.05 + rnd() * 0.08,
        held: false, pid: -1,
        lx: 0, ly: 0, lt: 0
      };
    }

    function syncOrbs() {
      const want = Math.max(1, Math.round(P.count));
      while (orbs.length > want) { orbs.pop(); dropHandle(handles.pop()); glass.pop().el.remove(); }
      while (orbs.length < want) {
        orbs.push(makeOrb(orbs.length));
        handles.push(makeHandle(orbs.length - 1));
        glass.push(makeGlass());
      }
      styleGlass();
    }

    // ------------------------------------------------------------ the glass

    function makeGlass() {
      const el = document.createElement('div');
      el.className = 'fx-layer';
      el.setAttribute('aria-hidden', 'true');
      el.style.borderRadius = '50%';
      const ring = document.createElement('div');
      ring.style.cssText = 'position:absolute;box-sizing:border-box;border-radius:50%';
      el.appendChild(ring);
      host.insertBefore(el, canvas);
      return { el, ring, tf: '' };
    }

    // Everything about a marble's look except where it is. Only a control or
    // a new layout changes any of it, so this is not run per frame.
    function styleGlass() {
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i], g = glass[i], r = radiusOf(o), c = o.c, a = P.ink;
        g.el.style.width = g.el.style.height = (r * 2) + 'px';
        g.tf = '';
        // The glass is drawn on the colour field, not the push field: it is
        // densest where the type takes the most colour and gone at the rim, so
        // what you see on the paper is what is happening to the words. Stops
        // follow tintKernel so the two cannot drift apart.
        const stops = [];
        for (let k = 0; k <= 6; k++) {
          const u = k / 6;
          stops.push(`rgba(${c[0]},${c[1]},${c[2]},${(a * tintKernel(u)).toFixed(3)}) ${(u * 100).toFixed(2)}%`);
        }
        g.el.style.background = 'radial-gradient(circle closest-side, ' + stops.join(', ') + ')';
        // The ring sits exactly where the push peaks, so the wall the words
        // are bending around is something you can see rather than infer.
        if (P.ring && P.shell > 0.05) {
          const lw = Math.max(1, r * 0.014), rr = r * P.shell;
          g.ring.style.display = '';
          g.ring.style.width = g.ring.style.height = (rr * 2 + lw) + 'px';
          g.ring.style.left = g.ring.style.top = (r - rr - lw / 2) + 'px';
          g.ring.style.border = lw + 'px solid ' +
            `rgba(${c[0]},${c[1]},${c[2]},${Math.min(0.9, a * 1.7).toFixed(3)})`;
        } else {
          g.ring.style.display = 'none';
        }
      }
    }

    function placeGlass() {
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i], g = glass[i], r = rad[i];
        const tf = `translate(${(o.x - r).toFixed(1)}px, ${(o.y - r).toFixed(1)}px)`;
        if (tf !== g.tf) { g.el.style.transform = tf; g.tf = tf; }
      }
    }

    // ---------------------------------------------------------- picking up
    //
    // A real element per marble rather than one listener over the page. It gets
    // `touch-action: none`, so a drag on a marble is a drag and not a scroll,
    // while a touch anywhere else still scrolls normally — which one listener
    // on the whole surface could not manage without breaking the page.

    function makeHandle(i) {
      const el = document.createElement('div');
      el.className = 'marble-grip';
      el.setAttribute('aria-hidden', 'true');
      host.appendChild(el);

      const onDown = e => {
        const o = orbs[i];
        if (!o) return;
        o.held = true; o.pid = e.pointerId;
        o.lx = e.clientX; o.ly = e.clientY; o.lt = e.timeStamp;
        o.vx = 0; o.vy = 0;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-held');
        e.preventDefault();
      };
      const onMove = e => {
        const o = orbs[i];
        if (!o || !o.held || e.pointerId !== o.pid) return;
        const dt = (e.timeStamp - o.lt) / 1000;
        o.x = e.clientX; o.y = e.clientY;
        if (dt > 0.001) {
          // Smoothed, so the last sample before letting go — often a still one,
          // as a finger settles — cannot cancel the throw on its own.
          const k = 0.45;
          o.vx = o.vx * (1 - k) + ((e.clientX - o.lx) / dt) * k;
          o.vy = o.vy * (1 - k) + ((e.clientY - o.ly) / dt) * k;
          o.lx = e.clientX; o.ly = e.clientY; o.lt = e.timeStamp;
        }
        e.preventDefault();
      };
      const onUp = e => {
        const o = orbs[i];
        if (!o) return;
        o.held = false; o.pid = -1;
        el.classList.remove('is-held');
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      return { el, onDown, onMove, onUp, size: '', tf: '' };
    }

    function dropHandle(h) {
      if (!h) return;
      h.el.removeEventListener('pointerdown', h.onDown);
      h.el.removeEventListener('pointermove', h.onMove);
      h.el.removeEventListener('pointerup', h.onUp);
      h.el.removeEventListener('pointercancel', h.onUp);
      h.el.remove();
    }

    function placeHandles() {
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i], r = radiusOf(o);
        // The grip is the still middle of the marble, not the whole disc: the
        // rim is where the text is, and a touch there should still scroll.
        const gr = Math.max(26, r * Math.max(0.34, P.shell * 0.8));
        const h = handles[i], el = h.el;
        // Written only on a change: a marble at rest would otherwise restyle
        // its grip every frame for nothing.
        const size = Math.round(gr * 2) + 'px';
        if (size !== h.size) { el.style.width = el.style.height = size; h.size = size; }
        const tf = 'translate(' + Math.round(o.x - gr) + 'px,' + Math.round(o.y - gr) + 'px)';
        if (tf !== h.tf) { el.style.transform = tf; h.tf = tf; }
      }
    }

    // ------------------------------------------------------------- physics

    function step(dt, nowSec, scrollY) {
      for (const o of orbs) {
        const r = radiusOf(o);
        if (o.held) {
          o.x = Math.max(-r, Math.min(vw + r, o.x));
          o.y = Math.max(-r, Math.min(vh + r, o.y));
          continue;
        }

        let ax = 0, ay = 0;

        // Up the density gradient, sampled a cell either side, in document
        // coordinates: the marble is on the glass, the type is under it.
        if (P.attract > 0) {
          const dx0 = o.x, dy0 = o.y + scrollY - padTop;
          const gx = densityAt(dx0 + CELL, dy0) - densityAt(dx0 - CELL, dy0);
          const gy = densityAt(dx0, dy0 + CELL) - densityAt(dx0, dy0 - CELL);
          ax += gx * P.attract * 1400;
          ay += gy * P.attract * 1400;
        }

        // Every marble is drawn to the same column of type, so without
        // something between them they end up in a stack, which is one big
        // marble with extra steps. They push apart when they overlap, and
        // ignore each other entirely when they do not.
        if (P.apart > 0) {
          for (const q of orbs) {
            if (q === o) continue;
            const qx = o.x - q.x, qy = o.y - q.y;
            const reach = r + radiusOf(q);
            const dd = qx * qx + qy * qy;
            if (dd >= reach * reach || dd < 1e-6) continue;
            const d = Math.sqrt(dd);
            const over = 1 - d / reach;
            ax += (qx / d) * over * over * P.apart * 900;
            ay += (qy / d) * over * over * P.apart * 900;
          }
        }

        // Its own slow wander, so a page of even type is not a page of still
        // marbles.
        if (P.drift > 0) {
          ax += Math.cos(nowSec * o.fq * TAU + o.ph) * P.drift * 70;
          ay += Math.sin(nowSec * o.fq2 * TAU + o.ph2) * P.drift * 55;
        }

        // Soft walls. A marble thrown at the edge turns round and comes back,
        // rather than sticking there or sailing off for good.
        const m = r * 0.55;
        if (o.x < m) ax += (m - o.x) * 14;
        if (o.x > vw - m) ax -= (o.x - (vw - m)) * 14;
        if (o.y < m) ay += (m - o.y) * 14;
        if (o.y > vh - m) ay -= (o.y - (vh - m)) * 14;

        o.vx += ax * dt;
        o.vy += ay * dt;

        const damp = Math.exp(-P.slow * dt);
        o.vx *= damp; o.vy *= damp;

        const sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
        if (sp > MAX_SPEED) { o.vx = o.vx / sp * MAX_SPEED; o.vy = o.vy / sp * MAX_SPEED; }

        o.x += o.vx * dt;
        o.y += o.vy * dt;
      }
    }

    // Everything a point feels, in one pass: how far it is displaced, and how
    // much colour it has taken from which marbles. Written into a reused object
    // so the glyph loop allocates nothing.
    const F = { x: 0, y: 0, w: 0, r: 0, g: 0, b: 0 };
    let rad = [], rad2 = [];
    function cacheRadii() {
      const b = base();
      for (let i = 0; i < orbs.length; i++) {
        const r = P.size * b * orbs[i].spread;
        rad[i] = r; rad2[i] = r * r;
      }
      rad.length = rad2.length = orbs.length;
    }
    function fieldAt(px, py) {
      F.x = 0; F.y = 0; F.w = 0; F.r = 0; F.g = 0; F.b = 0;
      for (let i = 0; i < orbs.length; i++) {
        const o = orbs[i];
        const r = rad[i];
        const dx = px - o.x, dy = py - o.y;
        const dd = dx * dx + dy * dy;
        if (dd >= rad2[i]) continue;
        const d = Math.sqrt(dd);
        const u = d / r;

        const amp = pushKernel(u);
        const inv = 1 / Math.max(d, 0.001);   // a glyph exactly on the centre
        F.x += dx * inv * amp;                // has no direction; do not divide
        F.y += dy * inv * amp;                // by zero to find out

        const tw = tintKernel(u);
        F.w += tw;
        F.r += o.c[0] * tw; F.g += o.c[1] * tw; F.b += o.c[2] * tw;
      }
      const m2 = F.x * F.x + F.y * F.y;
      if (m2 > 1) { const mag = Math.sqrt(m2); F.x /= mag; F.y /= mag; }  // a budge, not a shove
      F.x *= P.pressure; F.y *= P.pressure;
      if (F.w > 0) { F.r /= F.w; F.g /= F.w; F.b /= F.w; }
      if (F.w > 1) F.w = 1;
      return F;
    }

    return {
      params: P,
      setParam(k, v) {
        P[k] = v;
        if (k === 'count') syncOrbs();
        else if (k === 'size' || k === 'ink' || k === 'shell' || k === 'ring') styleGlass();
      },
      topPad(viewport) { return viewport.vh * 0.3; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        left = layout.left; width = layout.width; docH = layout.height;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';

        rnd = mulberry32(0x51ed270b ^ G.n);
        buildDensity(layout);

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height,
                       x: b.x + b.width / 2, y: b.top + b.height / 2 }))
          .filter(im => im.el);

        // A resize re-enters here; marbles already in play keep their places
        // rather than being scattered again mid-read. Their size follows the
        // screen, so the glass is restyled either way.
        if (!orbs.length) syncOrbs();
        else styleGlass();
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;
        const n = G.n;

        // dt is unbounded after a background tab, and one huge step would fling
        // every marble off the page.
        step(Math.min(0.05, dt), nowSec, scrollY);
        cacheRadii();
        placeHandles();

        // Under the type, on its own layer: a marble is a thing the words
        // pass over. The page behind the canvas is already paper.
        placeGlass();

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';

        for (const im of imgs) {
          const sy = im.y + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          // Pictures shift bodily rather than distorting.
          const f = fieldAt(im.x, sy);
          ctx.drawImage(im.el, im.x - im.w / 2 + f.x, sy - im.h / 2 + f.y, im.w, im.h);
        }

        const margin = P.pressure + 80;
        const minY = scrollY - padTop - margin;
        const maxY = scrollY - padTop + vh + margin;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        let curFill = '', curFont = '';

        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          const sy = ty + padTop - scrollY;
          if (sy < -60 || sy > vh + 60) continue;

          const f = fieldAt(G.x[i], sy);

          let fill;
          if (f.w <= 0.001) {
            fill = 'rgb(21,19,15)';
          } else {
            // Toward the glass, never all the way to it. The ink keeps its
            // weight: this pulls the hue across, it does not fade the letter.
            const k = clamp01(f.w) * P.tint;
            fill = fillFor((INK[0] + (f.r - INK[0]) * k) | 0,
                           (INK[1] + (f.g - INK[1]) * k) | 0,
                           (INK[2] + (f.b - INK[2]) * k) | 0);
          }
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }

          const fo = G.font[i];
          if (fo !== curFont) { ctx.font = fo; curFont = fo; }

          ctx.fillText(G.ch[i], G.x[i] + f.x, sy + f.y);
        }
      },

      destroy() {
        while (handles.length) dropHandle(handles.pop());
        while (glass.length) glass.pop().el.remove();
        orbs = [];
        document.documentElement.classList.remove('is-paper');
        canvas.remove();
      }
    };
  }
};
