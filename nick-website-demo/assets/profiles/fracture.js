// fracture.js — Profile 9
//
// Paper, black type, set properly and perfectly still. Scrolling does nothing
// to it. Then you tap it and it cracks, the way an ice sheet cracks: the page
// comes apart into floes that turn on the water and drift until they stop.
//
// The sheet is held together by bonds between neighbouring glyphs, and the
// bonds are not all the same. A gap where a space used to be barely holds at
// all; letter to letter inside a word holds hard; punctuation is somewhere
// between. So a crack runs through the spaces first and words come off whole,
// and only a harder hit splits a word itself.
//
// What stops a word from shattering into loose letters is that the bonds get
// stronger as the piece gets smaller. Breaking is run as a loop: find the bond
// carrying the most stress relative to its strength, break it, and now the two
// halves are shorter and tougher than the piece was. It converges on its own —
// a very long word comes apart into a handful of segments rather than into
// letters, and one of those segments needs a second, closer hit before it will
// give up a single character. `Grain` is the size it converges to.
//
// A piece is a rigid body from then on, not a bag of glyphs: one centre of
// mass, one velocity, one spin, and every letter in it keeps its spacing while
// the whole thing turns. That is the difference between a page shattering and a
// page boiling. Impulses are summed per glyph and resolved into linear and
// angular momentum about that centre, so the torque is whatever the blast
// actually applied across the piece rather than a spin number invented for it.
//
// Then it drifts. Water, not springs: velocity and spin bleed off to drag over
// `Drift` seconds with nothing pulling the piece anywhere, so it coasts out,
// slows, and stops. Only after that does `Reform` slide it back to where it
// belongs. There is no restoring force during the drift, which is what keeps
// this from reading as elastic.
//
// Hit a piece that is still in the air and it breaks again, inheriting the
// motion it already had — each child's translation and spin are solved from the
// parent's so nothing jumps at the moment of the split.

import { imageOf } from '../images.js';

const PAPER = '#fbfaf7';
const INK = 'rgb(21,19,15)';
const TAU = Math.PI * 2;

// What holds one glyph to the next, before toughness scales it. These are
// material constants rather than dials: the hierarchy is the point, and it is
// the hierarchy that puts the cracks through the spaces first.
const BOND_LETTER = 1;         // a to b inside a word
const BOND_PUNCT = 0.34;       // anything touching a comma, a dash, a bracket
const BOND_NONE = 0;           // across a line or a block: nothing to break

// Every piece is rasterised into one shared sheet rather than into a canvas of
// its own. A canvas each works and is still far cheaper than re-rasterising
// rotating glyphs, but it puts one texture bind per piece on the frame, which
// measured at 36fps with a couple of hundred of them in the air. Out of one
// sheet those same draws come off a single texture.
const ATLAS = 2048;

// Beyond this a piece is treated as one that has stopped mattering.
const MAX_PIECES = 420;
const MAX_BREAKS = 40;         // per piece per strike, a guard and nothing more

const ALNUM = /[\p{L}\p{N}]/u;

// Scratch for the break loop, grown as needed and never freed. The stress on a
// bond does not change while a piece is being broken up — only the toughness
// does, as the segments get shorter — so it is worked out once per bond and the
// loop after that is arithmetic on an array.
let STRESS = new Float32Array(0);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  id: 'fracture',
  name: 'Fracture',
  blurb: 'Still black type on paper. Tap it and it cracks into floes that turn and drift.',
  params: [
    { key: 'impact', label: 'Impact', type: 'range', min: 0.2, max: 4, step: 0.1, value: 1 },
    { key: 'radius', label: 'Crack radius', type: 'range', min: 0.12, max: 1, step: 0.02, value: 0.34 },
    { key: 'falloff', label: 'Falloff', type: 'range', min: 0.4, max: 4, step: 0.1, value: 1.5 },
    { key: 'grain', label: 'Grain', type: 'range', min: 2, max: 24, step: 1, value: 7 },
    { key: 'fatigue', label: 'Fatigue', type: 'range', min: 0, max: 1.5, step: 0.05, value: 0.55 },
    { key: 'spaceBond', label: 'Space bonds', type: 'range', min: 0, max: 0.6, step: 0.02, value: 0.08 },
    { key: 'throw', label: 'Throw', type: 'range', min: 20, max: 600, step: 10, value: 130 },
    { key: 'outward', label: 'Blow outward', type: 'range', min: 0, max: 1, step: 0.05, value: 0.45 },
    { key: 'spin', label: 'Spin', type: 'range', min: 0, max: 4, step: 0.1, value: 1.6 },
    { key: 'drag', label: 'Water drag', type: 'range', min: 0.3, max: 6, step: 0.1, value: 1.7 },
    { key: 'drift', label: 'Drift for', type: 'range', min: 0.3, max: 6, step: 0.1, value: 1.6 },
    { key: 'reform', label: 'Reform over', type: 'range', min: 0.3, max: 6, step: 0.1, value: 2.4 },
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
    let adv = null;            // each glyph's advance width, measured once
    let bond = null;           // strength between i and i+1; 0 where there is none
    let owner = null;          // piece id holding glyph i, or -1 for the intact sheet
    let pieces = new Map();
    let nextId = 1;
    let imgs = [];
    let dpr = 1, vw = 0, vh = 0, padTop = 0;
    let rings = [];
    let atlas = null, actx = null, shelfX = 0, shelfY = 0, shelfH = 0;
    let rnd = mulberry32(0x6b4f21a7);
    let pending = null;
    let reach = 0;             // furthest anything has travelled, for the cull

    function blastRadius() { return P.radius * Math.min(vw, vh); }

    // ------------------------------------------------------------- the sheet
    //
    // Spaces never become glyphs — typeset drops them — so a word boundary is a
    // gap in the advance widths rather than a character. Measuring the advances
    // once here is what makes the difference between knowing where the words are
    // and guessing from how far apart two letters look.
    function buildBonds() {
      const n = G.n;
      bond = new Float32Array(Math.max(0, n - 1));
      let font = '';
      adv = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        if (G.font[i] !== font) { font = G.font[i]; ctx.font = font; }
        adv[i] = ctx.measureText(G.ch[i]).width;
      }
      for (let i = 0; i < n - 1; i++) {
        if (G.line[i] !== G.line[i + 1] || G.block[i] !== G.block[i + 1]) {
          bond[i] = BOND_NONE;
          continue;
        }
        // Anything left over after this glyph's own width was a space.
        const gap = G.x[i + 1] - G.x[i] - adv[i];
        if (gap > G.size[i] * 0.12) { bond[i] = -1; continue; }   // marked; scaled at use
        bond[i] = (ALNUM.test(G.ch[i]) && ALNUM.test(G.ch[i + 1])) ? BOND_LETTER : BOND_PUNCT;
      }
    }

    // Space bonds are read through the slider rather than baked in, so the
    // hierarchy can be flattened or exaggerated without rebuilding the sheet.
    function bondAt(i) {
      const b = bond[i];
      return b < 0 ? P.spaceBond : b;
    }

    // ------------------------------------------------------------ the strike

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
      // The page having moved is the one that matters most on a phone: a flick
      // that ends in a stationary finger looks exactly like a tap until you
      // notice the page went with it.
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

    // -------------------------------------------------------------- geometry

    function comOf(i0, i1) {
      let cx = 0, cy = 0;
      for (let i = i0; i <= i1; i++) { cx += G.x[i]; cy += G.y[i]; }
      const m = i1 - i0 + 1;
      cx /= m; cy /= m;
      let I = 0;
      for (let i = i0; i <= i1; i++) {
        const ax = G.x[i] - cx, ay = G.y[i] - cy;
        I += ax * ax + ay * ay;
      }
      // A single glyph has no spread and would divide by zero on the first
      // torque; give it the inertia of something the size of itself.
      return { cx, cy, m, I: Math.max(I, G.size[i0] * G.size[i0] * 0.25) };
    }

    // Where a glyph actually is, given whatever piece is carrying it.
    const PT = { x: 0, y: 0 };
    function posOf(i, pc) {
      if (!pc) { PT.x = G.x[i]; PT.y = G.y[i]; return PT; }
      const a = Math.cos(pc.rot), b = Math.sin(pc.rot);
      const hx = G.x[i] - pc.cx, hy = G.y[i] - pc.cy;
      PT.x = pc.cx + pc.dx + a * hx - b * hy;
      PT.y = pc.cy + pc.dy + b * hx + a * hy;
      return PT;
    }

    // ---------------------------------------------------------------- pieces

    function resetAtlas() {
      if (!atlas) {
        atlas = document.createElement('canvas');
        atlas.width = atlas.height = ATLAS;
        actx = atlas.getContext('2d');
      }
      actx.setTransform(1, 0, 0, 1, 0, 0);
      actx.clearRect(0, 0, ATLAS, ATLAS);
      shelfX = 0; shelfY = 0; shelfH = 0;
    }

    // Shelf packing, which is all this needs: pieces are wider than they are
    // tall and arrive in bursts of a similar size.
    function place(w, h) {
      if (w > ATLAS || h > ATLAS) return null;
      if (shelfX + w > ATLAS) { shelfX = 0; shelfY += shelfH; shelfH = 0; }
      if (shelfY + h > ATLAS) return null;
      const at = { x: shelfX, y: shelfY };
      shelfX += w;
      if (h > shelfH) shelfH = h;
      return at;
    }

    // Text drawn through a rotating transform cannot use the glyph cache: the
    // angle is different on every frame, so every frame rasterises every glyph
    // from scratch. Measured, that alone was 60fps down to 27 with a few
    // hundred pieces in the air, and 35 at the defaults.
    //
    // A piece never changes what it says, so it is rasterised once, upright, at
    // device resolution, and after that the frame only rotates a bitmap — which
    // is a texture sample rather than a glyph rasterisation.
    function raster(pc) {
      let x0 = Infinity, x1 = -Infinity, top = 0, bot = 0;
      for (let i = pc.i0; i <= pc.i1; i++) {
        if (G.x[i] < x0) x0 = G.x[i];
        if (G.x[i] + adv[i] > x1) x1 = G.x[i] + adv[i];
        const sz = G.size[i];
        if (sz > top) { top = sz; bot = sz; }
      }
      // Generous either side of the baseline: ascenders and descenders both
      // live outside the em, and a clipped letter is worse than a large sprite.
      const up = top * 1.05, down = bot * 0.42, pad = 2;
      const y0 = G.y[pc.i0] - up - pad;
      const w = (x1 - x0) + pad * 2, h = up + down + pad * 2;
      if (!(w > 0) || !(h > 0)) return;

      const pw = Math.max(1, Math.ceil(w * dpr));
      const ph = Math.max(1, Math.ceil(h * dpr));
      let at = place(pw, ph);
      if (!at) {
        // The sheet is full. Clear it and lay every live piece down again;
        // anything that still will not fit is past caring about.
        resetAtlas();
        for (const other of pieces.values()) if (other !== pc) other.img = null;
        at = place(pw, ph);
        if (!at) return;
      }

      actx.save();
      actx.setTransform(dpr, 0, 0, dpr, at.x, at.y);
      actx.textBaseline = 'alphabetic';
      actx.fillStyle = INK;
      let font = '';
      for (let i = pc.i0; i <= pc.i1; i++) {
        if (G.font[i] !== font) { font = G.font[i]; actx.font = font; }
        actx.fillText(G.ch[i], G.x[i] - (x0 - pad), G.y[i] - y0);
      }
      actx.restore();

      pc.img = atlas;
      pc.ax = at.x; pc.ay = at.y; pc.aw = pw; pc.ah = ph;
      pc.sx = x0 - pad; pc.sy = y0; pc.sw = w; pc.sh = h;
    }

    function makePiece(i0, i1, parent) {
      const g = comOf(i0, i1);
      const pc = {
        id: nextId++, i0, i1,
        cx: g.cx, cy: g.cy, m: g.m, I: g.I,
        dx: 0, dy: 0, vx: 0, vy: 0,
        rot: 0, vrot: 0,
        img: null, ax: 0, ay: 0, aw: 0, ah: 0,
        sx: 0, sy: 0, sw: 0, sh: 0,
        t: 0, phase: 0, wear: 0,
        dx0: 0, dy0: 0, rot0: 0
      };
      if (parent) {
        // Solve the child's own translation so that nothing moves at the moment
        // of the split: with the same rotation about a different centre,
        //   d' = d + (R - I)(c' - c)
        const a = Math.cos(parent.rot), b = Math.sin(parent.rot);
        const ex = g.cx - parent.cx, ey = g.cy - parent.cy;
        const rx = a * ex - b * ey, ry = b * ex + a * ey;
        pc.rot = parent.rot;
        pc.dx = parent.dx + rx - ex;
        pc.dy = parent.dy + ry - ey;
        // And the velocity of the parent at the child's centre: v + w x r.
        pc.vx = parent.vx - parent.vrot * ry;
        pc.vy = parent.vy + parent.vrot * rx;
        pc.vrot = parent.vrot;
        pc.t = parent.t;
        pc.phase = parent.phase;
      }
      for (let i = i0; i <= i1; i++) owner[i] = pc.id;
      pieces.set(pc.id, pc);
      return pc;
    }

    function retire(pc) {
      for (let i = pc.i0; i <= pc.i1; i++) if (owner[i] === pc.id) owner[i] = -1;
      pc.img = null;            // its patch on the sheet, not the sheet
      pieces.delete(pc.id);
    }

    // The piece a glyph currently belongs to, as a range. For intact sheet this
    // is the run of unbroken bonds it sits in, bounded by lines and by whatever
    // pieces are already in the air beside it.
    function spanOf(i) {
      const id = owner[i];
      if (id >= 0) { const pc = pieces.get(id); return { a: pc.i0, b: pc.i1, pc }; }
      let a = i, b = i;
      while (a > 0 && owner[a - 1] < 0 && bondAt(a - 1) > 0) a--;
      while (b < G.n - 1 && owner[b + 1] < 0 && bondAt(b) > 0) b++;
      return { a, b, pc: null };
    }

    // ----------------------------------------------------------------- crack

    function crack(sx, sy, scrollY) {
      const px = sx, py = sy + scrollY - padTop;
      const R = blastRadius(), R2 = R * R;
      if (P.ring) rings.push({ x: px, y: py, born: performance.now() / 1000, r: R });

      const n = G.n;
      let lo = 0, hi = n;
      const minY = py - R, maxY = py + R;
      while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY - reach) lo = m + 1; else hi = m; }

      const stressAt = (x, y) => {
        const ox = x - px, oy = y - py;
        const d2 = ox * ox + oy * oy;
        if (d2 >= R2) return 0;
        return P.impact * Math.pow(1 - Math.sqrt(d2) / R, P.falloff);
      };

      // Gather the distinct spans the blast reaches, once each.
      const spans = [];
      const seen = new Set();
      for (let i = lo; i < n; i++) {
        if (G.y[i] > maxY + reach) break;
        const key = owner[i] >= 0 ? 'p' + owner[i] : null;
        if (key && seen.has(key)) continue;
        const sp = spanOf(i);
        const k = key || 's' + sp.a;
        if (seen.has(k)) continue;
        const p0 = posOf(sp.a, sp.pc), ax = p0.x, ay = p0.y;
        const p1 = posOf(sp.b, sp.pc);
        // Cheap reject: both ends and the middle far outside the blast.
        const near = Math.min(Math.hypot(ax - px, ay - py), Math.hypot(p1.x - px, p1.y - py),
                              Math.hypot((ax + p1.x) / 2 - px, (ay + p1.y) / 2 - py));
        if (near > R + 40) { seen.add(k); i = sp.b; continue; }
        seen.add(k);
        spans.push(sp);
        i = sp.b;
      }

      for (const sp of spans) split(sp, stressAt, px, py, R);

      if (pieces.size > MAX_PIECES) {
        // Oldest first: the ones that have been in the air longest are the ones
        // a reader has stopped watching.
        const all = [...pieces.values()].sort((x, y) => y.t - x.t);
        for (let i = 0; i < all.length && pieces.size > MAX_PIECES; i++) retire(all[i]);
      }
    }

    function split(sp, stressAt, px, py, R) {
      // Start from the whole span and keep breaking the most overloaded bond.
      // Every break shortens two pieces, and shorter pieces are tougher, so
      // this stops itself rather than needing a break budget.
      const span = sp.b - sp.a;
      if (STRESS.length < span) STRESS = new Float32Array(span + 64);
      for (let k = sp.a; k < sp.b; k++) {
        const q0 = posOf(k, sp.pc), qx = q0.x, qy = q0.y;
        const q1 = posOf(k + 1, sp.pc);
        STRESS[k - sp.a] = stressAt((qx + q1.x) / 2, (qy + q1.y) / 2);
      }

      const segs = [[sp.a, sp.b]];
      // Ice that has already been hit is easier to break than ice that has
      // not. Without this a second press on a piece does nothing at all — the
      // toughness rule has already converged and the same blow gives the same
      // answer forever — and "hit that segment again and a letter comes off"
      // was the whole point of it.
      const worn = 1 + (sp.pc ? sp.pc.wear : 0) * P.fatigue;
      for (let guard = 0; guard < MAX_BREAKS; guard++) {
        let bestK = -1, bestSeg = -1, bestRatio = 1;
        for (let s = 0; s < segs.length; s++) {
          const sa = segs[s][0], sb = segs[s][1];
          const L = sb - sa + 1;
          if (L < 2) continue;
          const tough = Math.pow(P.grain / L, 1.1) / worn;
          for (let k = sa; k < sb; k++) {
            const strength = bondAt(k) * tough;
            if (strength <= 0) { bestK = k; bestSeg = s; bestRatio = Infinity; break; }
            const ratio = STRESS[k - sp.a] / strength;
            if (ratio > bestRatio) { bestRatio = ratio; bestK = k; bestSeg = s; }
          }
          if (bestRatio === Infinity) break;
        }
        if (bestK < 0) break;
        const sa = segs[bestSeg][0], sb = segs[bestSeg][1];
        segs[bestSeg] = [sa, bestK];
        segs.push([bestK + 1, sb]);
      }

      // One span that did not break and was not already moving stays part of
      // the sheet — a crack nothing travelled through has closed again.
      if (segs.length === 1 && !sp.pc) {
        const g = comOf(sp.a, sp.b);
        if (stressAt(g.cx, g.cy) <= 0) return;
      }

      const parent = sp.pc;
      if (parent) pieces.delete(parent.id);

      for (const [a, b] of segs) {
        const pc = makePiece(a, b, parent);
        pc.wear = (parent ? parent.wear : 0) + Math.min(1, stressAt(pc.cx + pc.dx, pc.cy + pc.dy));
        kick(pc, stressAt, px, py, R);
        // A fresh piece that took nothing and inherited nothing never happened.
        if (!parent && !pc.vx && !pc.vy && !pc.vrot) { retire(pc); continue; }
        raster(pc);
      }
    }

    // Impulses are summed glyph by glyph and then resolved about the centre of
    // mass, so both the push and the turn come out of the same blast rather
    // than the spin being a number chosen separately. A big piece feels the
    // falloff across its own length and turns; a short one feels an almost even
    // push and mostly slides.
    function kick(pc, stressAt, px, py, R) {
      let jx = 0, jy = 0, torque = 0, hit = 0;
      const a = Math.cos(pc.rot), b = Math.sin(pc.rot);
      for (let i = pc.i0; i <= pc.i1; i++) {
        const p = posOf(i, pc);
        const ox = p.x - px, oy = p.y - py;
        const d = Math.hypot(ox, oy);
        if (d >= R) continue;
        const amp = Math.pow(1 - d / R, P.falloff);
        const inv = 1 / Math.max(d, 0.001);
        const ix = ox * inv * amp, iy = oy * inv * amp;
        jx += ix; jy += iy;
        // Lever arm from the centre of mass, in the piece's current attitude.
        const hx = G.x[i] - pc.cx, hy = G.y[i] - pc.cy;
        const rx = a * hx - b * hy, ry = b * hx + a * hy;
        torque += rx * iy - ry * ix;
        hit++;
      }
      if (!hit) return;
      const speed = P.throw;
      // Everything fleeing straight out from one point is what makes a hole in
      // the middle and reads as a bubble rather than a fracture. Real floes
      // separate along the cracks and slide past each other, so most of the
      // direction is the piece's own and only `outward` of it is radial.
      let ux = jx / pc.m, uy = jy / pc.m;
      const mag = Math.hypot(ux, uy) || 1;
      const ang = rnd() * TAU;
      const w = P.outward;
      ux = (ux / mag) * w + Math.cos(ang) * (1 - w);
      uy = (uy / mag) * w + Math.sin(ang) * (1 - w);
      const push = mag * speed;
      pc.vx += ux * push;
      pc.vy += uy * push;
      // Grit in the material: a floe never turns exactly as the arithmetic
      // says, and small ones spin up more readily than big ones.
      const jitter = (rnd() - 0.5) * 2 * P.spin * 2.2 / Math.sqrt(pc.m);
      pc.vrot += (torque / pc.I) * speed * P.spin * 0.4 + jitter;
      if (pc.vrot > 9) pc.vrot = 9; else if (pc.vrot < -9) pc.vrot = -9;
    }

    // --------------------------------------------------------------- the water

    const DONE = [];
    function step(dt) {
      let far = 0;
      DONE.length = 0;
      for (const pc of pieces.values()) {
        pc.t += dt;
        if (pc.phase === 0) {
          // Nothing pulls it anywhere. It coasts, drag takes the speed and the
          // spin off it, and it stops where it stops.
          const k = Math.exp(-P.drag * dt);
          pc.vx *= k; pc.vy *= k; pc.vrot *= k;
          pc.dx += pc.vx * dt;
          pc.dy += pc.vy * dt;
          pc.rot += pc.vrot * dt;
          if (pc.t >= P.drift) {
            pc.phase = 1; pc.t = 0;
            pc.dx0 = pc.dx; pc.dy0 = pc.dy;
            // Home by the shorter way round, and by whole turns where it has
            // made them, so a floe unwinds rather than rewinding.
            pc.rot0 = pc.rot;
          }
        } else {
          const u = Math.min(1, pc.t / Math.max(0.05, P.reform));
          const s = 1 - u * u * (3 - 2 * u);       // smoothstep, easing to a stop
          pc.dx = pc.dx0 * s;
          pc.dy = pc.dy0 * s;
          pc.rot = pc.rot0 * s;
          if (u >= 1) { DONE.push(pc); continue; }
        }
        const off = Math.abs(pc.dx) + Math.abs(pc.dy);
        if (off > far) far = off;
      }
      // Retired after the walk rather than during it: deleting out of a Map
      // while iterating it is the kind of thing that works until it does not.
      for (let i = 0; i < DONE.length; i++) retire(DONE[i]);
      reach = far;
    }

    function stepImages(dt) {
      for (const im of imgs) {
        if (!im.t && !im.vx && !im.vy && !im.dx && !im.dy) continue;
        im.t += dt;
        if (im.phase === 0) {
          const k = Math.exp(-P.drag * dt);
          im.vx *= k; im.vy *= k;
          im.dx += im.vx * dt; im.dy += im.vy * dt;
          if (im.t >= P.drift) { im.phase = 1; im.t = 0; im.dx0 = im.dx; im.dy0 = im.dy; }
        } else {
          const u = Math.min(1, im.t / Math.max(0.05, P.reform));
          const s = 1 - u * u * (3 - 2 * u);
          im.dx = im.dx0 * s; im.dy = im.dy0 * s;
          if (u >= 1) { im.dx = 0; im.dy = 0; im.vx = 0; im.vy = 0; im.t = 0; im.phase = 0; }
        }
      }
    }

    function shoveImages(px, py, R) {
      for (const im of imgs) {
        const ox = im.x + im.dx - px, oy = im.y + im.dy - py;
        const d = Math.hypot(ox, oy);
        if (d > R) continue;
        const amp = Math.pow(1 - d / R, P.falloff);
        const inv = 1 / Math.max(d, 0.001);
        // A photograph is not brittle: it takes the shove and does not turn.
        im.vx += ox * inv * amp * P.throw * 0.7;
        im.vy += oy * inv * amp * P.throw * 0.7;
        im.t = 0; im.phase = 0;
      }
    }

    function drawRings(nowSec, scrollY) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        const age = (nowSec - g.born) / 0.45;
        if (age >= 1) { rings.splice(i, 1); continue; }
        const sy = g.y + padTop - scrollY;
        if (sy < -g.r || sy > vh + g.r) continue;
        ctx.strokeStyle = 'rgba(21,19,15,' + (0.2 * (1 - age)).toFixed(3) + ')';
        ctx.lineWidth = 2 * (1 - age) + 0.4;
        ctx.beginPath();
        ctx.arc(g.x, sy, g.r * (0.1 + 0.9 * age), 0, TAU);
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

        owner = new Int32Array(G.n).fill(-1);
        pieces = new Map();
        nextId = 1;
        rings = [];
        reach = 0;
        rnd = mulberry32(0x6b4f21a7 ^ G.n);
        resetAtlas();
        buildBonds();

        imgs = layout.blocks
          .filter(b => b.type === 'image')
          .map(b => ({ el: imageOf(b), w: b.width, h: b.height,
                       x: b.x + b.width / 2, y: b.top + b.height / 2,
                       dx: 0, dy: 0, vx: 0, vy: 0, dx0: 0, dy0: 0, t: 0, phase: 0 }))
          .filter(im => im.el);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const nowSec = t * 0.001;
        const d = Math.min(0.04, dt);

        if (pending) {
          const px = pending.x, py = pending.y + scrollY - padTop;
          crack(pending.x, pending.y, scrollY);
          shoveImages(px, py, blastRadius());
          pending = null;
        }
        if (pieces.size) step(d);
        stepImages(d);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = INK;

        if (P.ring && rings.length) drawRings(nowSec, scrollY);

        for (const im of imgs) {
          const sy = im.y + im.dy + padTop - scrollY;
          if (sy < -im.h || sy > vh + im.h) continue;
          ctx.drawImage(im.el, im.x + im.dx - im.w / 2, sy - im.h / 2, im.w, im.h);
        }

        // The sheet: everything still held in place, drawn straight.
        const margin = 80 + reach;
        const minY = scrollY - padTop - margin;
        const maxY = scrollY - padTop + vh + margin;
        const n = G.n;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        let curFont = '';
        for (let i = lo; i < n; i++) {
          const ty = G.y[i];
          if (ty > maxY) break;
          if (owner[i] >= 0) continue;
          const sy = ty + padTop - scrollY;
          if (sy < -70 || sy > vh + 70) continue;
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }
          ctx.fillText(G.ch[i], G.x[i], sy);
        }

        // The floes: one transform each, then every letter in the piece keeps
        // its own spacing while the whole thing turns.
        for (const pc of pieces.values()) {
          const a = Math.cos(pc.rot), b = Math.sin(pc.rot);
          const ex = pc.cx + pc.dx - (a * pc.cx - b * pc.cy);
          const ey = pc.cy + pc.dy - (b * pc.cx + a * pc.cy) + padTop - scrollY;
          // Roughly where it is now; a piece well off screen is not drawn.
          const my = pc.cy + pc.dy + padTop - scrollY;
          if (my < -220 || my > vh + 220) continue;
          if (!pc.img) continue;
          ctx.setTransform(dpr * a, dpr * b, -dpr * b, dpr * a, dpr * ex, dpr * ey);
          ctx.drawImage(pc.img, pc.ax, pc.ay, pc.aw, pc.ah, pc.sx, pc.sy, pc.sw, pc.sh);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },

      destroy() {
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        document.documentElement.classList.remove('is-paper');
        canvas.remove();
      }
    };
  }
};
