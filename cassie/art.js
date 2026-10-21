// Cassie and the White Sable — the drawing kit.
//
// Everything is drawn with SVG: soft, translucent washes whose edges wobble
// and darken a little as they dry, a fine sepia ink line on top, and cream
// paper underneath. Scenes are vignetted, fading out to the paper at the
// edges, the way small English nursery-book plates were.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const A = {};

  // ─── Palette (muted, natural) ───────────────────────────────────────────
  A.C = {
    paper: '#f4ecd9', ink: '#4a3a2b', inkSoft: '#7a6a58',
    sky: '#c9d6dd', skyWarm: '#ead8b8', dusk: '#b9a6b8', night: '#3b4660', nightDeep: '#2a3247',
    moon: '#f6f0dc', sun: '#f0cf8a',
    grass: '#a9b47e', grassDark: '#7f8b55', moss: '#6f7c48', meadow: '#bfc48f', sage: '#9aa67c',
    leaf: '#8c9a5e', leafDark: '#5f6d3c', leafLight: '#bcc58e',
    earth: '#a88e6a', earthDark: '#7d6548', path: '#cdb894', stone: '#a7a094', stoneDark: '#7f786d', stoneLight: '#c8c1b2',
    bark: '#7e6450', barkDark: '#5a4636', wood: '#a07c58', woodDark: '#77583d',
    water: '#9db3bf', waterDark: '#6f8b9a',
    thatch: '#c8a96a', wall: '#e2d6bf', roof: '#9b6e52',
    skin: '#f1d6bd', cheek: '#e3a08c', hair: '#e2c26f', hairGrey: '#cfcac2', hairBrown: '#8a6a4a', hairDark: '#5a4535',
    dress: '#8b9fb3', pinafore: '#efe5d0', boots: '#6b4b34', stocking: '#6a5a4d',
    apron: '#efe7d6', skirt: '#a8846a', shawl: '#b9a07a', coat: '#7d7462', coatGreen: '#6f7a5c', coatDark: '#4f4a43', hat: '#5e5445',
    sable: '#6c523d', sableLight: '#c8a37b', white: '#fdfbf5', pearl: '#cdd6df',
    berry: '#b8414a', berryBlue: '#4f63a8', ember: '#f09a4a', fire: '#f2b25a', flame: '#e5763e',
    cow: '#b48a63', cowLight: '#efe6d6', dog: '#8d8a84', dogDark: '#5f5c58', horse: '#7a5d45',
    cat: '#c99a62', bee: '#e1b74e', hen: '#c78f58',
    iron: '#5b5d61', ironLight: '#8b8e93',
  };

  // ─── Small helpers ──────────────────────────────────────────────────────
  A.el = function (tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  A.g = (parent, attrs) => A.el('g', attrs || {}, parent);
  A.rng = function (seed) {
    let a = seed | 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  // Smooth path through points (Catmull-Rom to cubic Bézier).
  A.smooth = function (pts, closed) {
    const n = pts.length;
    if (n < 2) return '';
    const P = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return closed ? d + 'Z' : d;
  };
  // An irregular, soft blob.
  A.blob = function (cx, cy, rx, ry, seed, jit = 0.16, n = 9) {
    const r = A.rng(seed || 1), pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + r() * 0.3;
      const k = 1 + (r() - 0.5) * 2 * jit;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return A.smooth(pts, true);
  };
  // A slightly wavering line between points (for ink).
  A.wline = function (pts, seed, amp = 1.2) {
    const r = A.rng(seed || 7), out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 30));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push([x0 + (x1 - x0) * t + (r() - 0.5) * amp, y0 + (y1 - y0) * t + (r() - 0.5) * amp]);
      }
    }
    out.push(pts[pts.length - 1]);
    return A.smooth(out, false);
  };
  // Painted shape: a wash (filled, translucent) in the given layer.
  A.wash = (parent, d, fill, op = 0.88, extra) => A.el('path', Object.assign({ d, fill, 'fill-opacity': op }, extra || {}), parent);
  // Ink stroke.
  A.ink = (parent, d, w = 1.8, color, extra) => A.el('path', Object.assign({ d, fill: 'none', stroke: color || A.C.ink, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.85 }, extra || {}), parent);
  A.dot = (parent, x, y, r, fill, op = 1) => A.el('circle', { cx: x, cy: y, r, fill, 'fill-opacity': op }, parent);
  // A layer pair: washes underneath (watercolor filter), ink on top (ink filter).
  A.pair = function (parent, attrs) {
    const g = A.g(parent, attrs);
    return { g, f: A.g(g, { filter: 'url(#wash)' }), l: A.g(g, { filter: 'url(#ink)' }) };
  };

  // ─── Filters, paper, vignette ───────────────────────────────────────────
  A.defs = function (svg) {
    const d = A.el('defs', {}, svg);
    d.innerHTML = `
      <filter id="wash" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.024" numOctaves="2" seed="4" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="0.8" result="b"/>
        <feMorphology in="b" operator="erode" radius="2" result="er"/>
        <feComposite in="b" in2="er" operator="out" result="edge"/>
        <feColorMatrix in="edge" type="matrix" values="0.6 0 0 0 0  0 0.58 0 0 0  0 0 0.56 0 0  0 0 0 0.45 0" result="edark"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="11" result="gr"/>
        <feColorMatrix in="gr" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="gray"/>
        <feComposite in="b" in2="gray" operator="arithmetic" k1="0.14" k2="0.94" k3="0" k4="0" result="tex"/>
        <feMerge><feMergeNode in="tex"/><feMergeNode in="edark"/></feMerge>
      </filter>
      <filter id="washsoft" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="9" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feGaussianBlur in="d" stdDeviation="5"/>
      </filter>
      <filter id="ink" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="1" seed="2" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="glowsmall" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="21" result="fine"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="3" seed="5" result="mottle"/>
        <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0 0.2  -0.6 -0.6 -0.6 0 1.0" result="speck"/>
        <feColorMatrix in="mottle" type="matrix" values="0 0 0 0 0.7  0 0 0 0 0.55  0 0 0 0 0.35  0.5 0 0 0 -0.22" result="blot"/>
        <feComposite in="speck" in2="SourceGraphic" operator="in" result="s2"/>
        <feComposite in="blot" in2="SourceGraphic" operator="in" result="b2"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="b2"/><feMergeNode in="s2"/></feMerge>
      </filter>
      <filter id="vigblur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="38"/></filter>
      <radialGradient id="moonglow"><stop offset="0" stop-color="#fffbe8" stop-opacity="0.9"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></radialGradient>
      <radialGradient id="emberglow"><stop offset="0" stop-color="#ffd38a" stop-opacity="0.95"/><stop offset="0.5" stop-color="#f09a4a" stop-opacity="0.45"/><stop offset="1" stop-color="#f09a4a" stop-opacity="0"/></radialGradient>
      <radialGradient id="pearlglow"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="1" stop-color="#dfe8f2" stop-opacity="0"/></radialGradient>
      <radialGradient id="lampglow"><stop offset="0" stop-color="#ffe2a0" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>
    `;
    return d;
  };
  // A scene root: paper, then a vignette-masked painting group.
  A.scene = function (svg, seed) {
    const id = 'vig' + seed;
    const m = A.el('mask', { id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1600, height: 1000 }, svg.querySelector('defs'));
    A.el('rect', { x: 0, y: 0, width: 1600, height: 1000, fill: 'black' }, m);
    A.el('path', { d: A.blob(800, 515, 700, 440, seed, 0.07, 14), fill: 'white', filter: 'url(#vigblur)' }, m);
    const root = A.g(svg, { mask: `url(#${id})` });
    return root;
  };

  // ─── Landscape ──────────────────────────────────────────────────────────
  A.sky = function (p, top, bottom, y0 = 0, y1 = 620) {
    const id = 'sky' + Math.random().toString(36).slice(2, 8);
    const gr = A.el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, p.ownerSVGElement.querySelector('defs'));
    A.el('stop', { offset: 0, 'stop-color': top }, gr);
    A.el('stop', { offset: 1, 'stop-color': bottom }, gr);
    return A.el('rect', { x: -40, y: y0, width: 1680, height: y1 - y0, fill: `url(#${id})`, filter: 'url(#washsoft)', opacity: 0.9 }, p);
  };
  A.band = function (p, y, amp, color, seed, op = 0.9, bottom = 1060, filter = 'wash') {
    const r = A.rng(seed), pts = [[-60, y]];
    for (let x = 0; x <= 1660; x += 110) pts.push([x, y + (r() - 0.5) * amp * 2]);
    let d = A.smooth(pts, false);
    d += `L1700,${bottom}L-60,${bottom}Z`;
    return A.el('path', { d, fill: color, 'fill-opacity': op, filter: `url(#${filter})` }, p);
  };
  A.tufts = function (p, x0, x1, y, n, seed, color) {
    const r = A.rng(seed), g = A.g(p, { filter: 'url(#ink)' });
    for (let i = 0; i < n; i++) {
      const x = x0 + r() * (x1 - x0), yy = y + (r() - 0.5) * 40;
      for (let k = 0; k < 3; k++) A.ink(g, `M${x + k * 3},${yy} q${-3 + k * 3},${-8 - r() * 8} ${-4 + k * 4},${-14 - r() * 8}`, 1.1, color || A.C.leafDark);
    }
    return g;
  };
  A.tree = function (p, x, y, s, o = {}) {
    const r = A.rng(o.seed || (x * 7 + y)), pr = A.pair(p, { class: o.cls || '' });
    const col = o.colors || [A.C.leafDark, A.C.leaf, A.C.leafLight];
    const h = 260 * s;
    // trunk
    A.wash(pr.f, `M${x - 12 * s},${y} C${x - 10 * s},${y - h * 0.4} ${x - 8 * s},${y - h * 0.6} ${x - 4 * s},${y - h * 0.7} L${x + 6 * s},${y - h * 0.7} C${x + 9 * s},${y - h * 0.5} ${x + 11 * s},${y - h * 0.3} ${x + 16 * s},${y} Z`, A.C.bark, 0.9);
    A.ink(pr.l, A.wline([[x - 12 * s, y], [x - 9 * s, y - h * 0.45], [x - 4 * s, y - h * 0.7]], r() * 99), 1.6);
    A.ink(pr.l, A.wline([[x + 16 * s, y], [x + 9 * s, y - h * 0.45], [x + 6 * s, y - h * 0.68]], r() * 99), 1.6);
    // crown, dark to light
    const cy = y - h * 0.78, crowns = o.crowns || 7;
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < crowns - layer * 2; i++) {
        const a = r() * Math.PI * 2, d = (0.55 - layer * 0.14) * r();
        const cx = x + Math.cos(a) * 95 * s * d, cyy = cy + Math.sin(a) * 70 * s * d - layer * 14 * s;
        A.wash(pr.f, A.blob(cx, cyy, (78 - layer * 16) * s, (58 - layer * 12) * s, r() * 1000, 0.2), col[layer], 0.55 + layer * 0.12);
      }
    }
    // a few leaf marks
    for (let i = 0; i < 14; i++) {
      const lx = x + (r() - 0.5) * 170 * s, ly = cy + (r() - 0.5) * 120 * s;
      A.ink(pr.l, `M${lx},${ly} q${4 * s},${-5 * s} ${9 * s},${-2 * s}`, 1, A.C.leafDark);
    }
    return pr.g;
  };
  A.pine = function (p, x, y, s, o = {}) {
    const r = A.rng(o.seed || x), pr = A.pair(p, { class: o.cls || '' });
    const h = 420 * s;
    A.wash(pr.f, `M${x - 7 * s},${y} L${x - 4 * s},${y - h} L${x + 4 * s},${y - h} L${x + 7 * s},${y} Z`, A.C.barkDark, 0.9);
    for (let i = 0; i < 7; i++) {
      const ty = y - h * (0.18 + i * 0.12), w = (110 - i * 13) * s;
      A.wash(pr.f, A.smooth([[x - w, ty + 20 * s], [x - w * 0.5, ty - 4 * s], [x, ty - 46 * s], [x + w * 0.5, ty - 4 * s], [x + w, ty + 20 * s], [x, ty + 8 * s]], true), i % 2 ? A.C.leafDark : A.C.moss, 0.85);
      A.ink(pr.l, A.wline([[x - w, ty + 20 * s], [x, ty - 46 * s], [x + w, ty + 20 * s]], i * 7 + r() * 9, 1.5), 1.2);
    }
    return pr.g;
  };
  A.bush = function (p, x, y, s, seed, col) {
    const pr = A.pair(p);
    const r = A.rng(seed);
    for (let i = 0; i < 5; i++) A.wash(pr.f, A.blob(x + (r() - 0.5) * 70 * s, y - 30 * s - r() * 20 * s, 46 * s, 32 * s, seed * 9 + i, 0.2), i < 2 ? (col || A.C.leafDark) : A.C.leaf, 0.7);
    A.ink(pr.l, A.wline([[x - 60 * s, y - 10 * s], [x - 40 * s, y - 58 * s], [x, y - 70 * s], [x + 44 * s, y - 56 * s], [x + 62 * s, y - 12 * s]], seed, 2), 1.3);
    return pr.g;
  };
  A.moon = function (p, x, y, r, o = {}) {
    const g = A.g(p, { class: o.cls || '' });
    A.el('circle', { cx: x, cy: y, r: r * 2.6, fill: 'url(#moonglow)', opacity: 0.55 }, g);
    const pr = A.pair(g);
    A.wash(pr.f, A.blob(x, y, r, r, 3, 0.03, 12), A.C.moon, 0.97);
    A.wash(pr.f, A.blob(x - r * 0.3, y - r * 0.2, r * 0.25, r * 0.2, 5, 0.2), '#e4dcc4', 0.6);
    A.wash(pr.f, A.blob(x + r * 0.25, y + r * 0.3, r * 0.18, r * 0.14, 6, 0.2), '#e4dcc4', 0.5);
    return g;
  };
  A.stars = function (p, n, seed, y1 = 420) {
    const r = A.rng(seed), g = A.g(p, { class: 'twinkle' });
    for (let i = 0; i < n; i++) {
      const s = A.dot(g, r() * 1600, r() * y1, 1 + r() * 1.6, '#fbf6e2', 0.5 + r() * 0.5);
      s.style.animationDelay = (r() * 4).toFixed(2) + 's';
    }
    return g;
  };
  A.cloud = function (p, x, y, s, seed, col, cls) {
    const g = A.g(p, { class: cls || 'drift', filter: 'url(#washsoft)' });
    const r = A.rng(seed);
    for (let i = 0; i < 5; i++) A.wash(g, A.blob(x + (i - 2) * 50 * s, y - r() * 20 * s, 70 * s, 34 * s, seed + i, 0.25), col || '#f7f3ea', 0.75);
    return g;
  };
  A.rain = function (p, density = 120, seed = 3, col = '#8ea2b0') {
    const r = A.rng(seed), g = A.g(p, { class: 'rain' });
    for (let k = 0; k < 2; k++) {
      const sheet = A.g(g, { class: 'rainsheet', style: `animation-delay:${-k * 0.45}s` });
      for (let i = 0; i < density / 2; i++) {
        const x = r() * 1700 - 50, y = r() * 1000 - 1000;
        A.el('line', { x1: x, y1: y, x2: x - 10, y2: y + 46, stroke: col, 'stroke-width': 1.4, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, sheet);
        const y2 = y + 1000;
        A.el('line', { x1: x, y1: y2, x2: x - 10, y2: y2 + 46, stroke: col, 'stroke-width': 1.4, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, sheet);
      }
    }
    return g;
  };
  A.bolt = function (p, pts, cls) {
    const g = A.g(p, { class: cls || '' });
    const d = 'M' + pts.map(q => q.join(',')).join('L');
    A.el('path', { d, fill: 'none', stroke: '#fffbe6', 'stroke-width': 16, 'stroke-opacity': 0.35, filter: 'url(#glowsmall)' }, g);
    A.el('path', { d, fill: 'none', stroke: '#fffdf2', 'stroke-width': 4, 'stroke-linejoin': 'round' }, g);
    return g;
  };
  A.fire = function (p, x, y, s = 1) {
    const g = A.g(p, { class: 'fire' });
    A.el('circle', { cx: x, cy: y - 30 * s, r: 120 * s, fill: 'url(#lampglow)', opacity: 0.55, class: 'flicker' }, g);
    const pr = A.pair(g);
    for (let i = -2; i <= 2; i++) A.wash(pr.f, `M${x + i * 12 * s - 10 * s},${y} L${x + i * 12 * s + 12 * s},${y - 6 * s} L${x + i * 10 * s + 18 * s},${y + 4 * s} Z`, A.C.woodDark, 0.9);
    const fl = A.g(pr.f, { class: 'flames' });
    A.wash(fl, A.smooth([[x - 26 * s, y - 2 * s], [x - 14 * s, y - 40 * s], [x - 4 * s, y - 30 * s], [x + 2 * s, y - 70 * s], [x + 10 * s, y - 34 * s], [x + 20 * s, y - 48 * s], [x + 26 * s, y - 2 * s]], true), A.C.flame, 0.85);
    A.wash(fl, A.smooth([[x - 14 * s, y - 2 * s], [x - 6 * s, y - 26 * s], [x + 2 * s, y - 44 * s], [x + 8 * s, y - 22 * s], [x + 14 * s, y - 2 * s]], true), A.C.fire, 0.95);
    return g;
  };
  A.lantern = function (p, x, y, s = 1, cls) {
    const g = A.g(p, { class: cls || '' });
    A.el('circle', { cx: x, cy: y, r: 70 * s, fill: 'url(#lampglow)', class: 'flicker' }, g);
    const pr = A.pair(g);
    A.wash(pr.f, `M${x - 8 * s},${y - 12 * s} h${16 * s} v${22 * s} h${-16 * s} Z`, '#f6d68d', 0.95);
    A.ink(pr.l, `M${x - 8 * s},${y - 12 * s} h${16 * s} v${22 * s} h${-16 * s} Z M${x},${y - 12 * s} v${-10 * s}`, 1.4);
    return g;
  };

  // ─── Buildings and things ───────────────────────────────────────────────
  A.cottage = function (p, x, y, s = 1) {
    const pr = A.pair(p);
    const w = 260 * s, h = 150 * s;
    A.wash(pr.f, `M${x},${y} v${-h} h${w} v${h} Z`, A.C.wall, 0.95);
    // stones
    const r = A.rng(x);
    for (let i = 0; i < 16; i++) A.wash(pr.f, A.blob(x + 20 * s + r() * (w - 40 * s), y - 15 * s - r() * (h - 30 * s), 12 * s, 7 * s, i + x, 0.25), A.C.stoneLight, 0.6);
    // thatch
    A.wash(pr.f, A.smooth([[x - 26 * s, y - h + 10 * s], [x + w * 0.2, y - h - 90 * s], [x + w * 0.5, y - h - 128 * s], [x + w * 0.8, y - h - 92 * s], [x + w + 26 * s, y - h + 10 * s], [x + w * 0.5, y - h + 18 * s]], true), A.C.thatch, 0.95);
    for (let i = 0; i < 12; i++) A.ink(pr.l, `M${x + i * w / 11},${y - h + 6 * s} l${(i - 6) * 3 * s},${-60 * s}`, 0.9, A.C.inkSoft);
    // door, windows
    A.wash(pr.f, `M${x + w * 0.42},${y} v${-82 * s} q${22 * s},${-18 * s} ${44 * s},0 v${82 * s} Z`, A.C.woodDark, 0.9);
    A.wash(pr.f, `M${x + 24 * s},${y - 100 * s} h${54 * s} v${44 * s} h${-54 * s} Z`, '#e8d9a6', 0.9);
    A.wash(pr.f, `M${x + w - 78 * s},${y - 100 * s} h${54 * s} v${44 * s} h${-54 * s} Z`, '#e8d9a6', 0.9);
    A.ink(pr.l, `M${x},${y} v${-h} M${x + w},${y} v${-h} M${x + 24 * s},${y - 100 * s} h${54 * s} v${44 * s} h${-54 * s} Z M${x + 51 * s},${y - 100 * s} v${44 * s} M${x + w - 78 * s},${y - 100 * s} h${54 * s} v${44 * s} h${-54 * s} Z M${x + w - 51 * s},${y - 100 * s} v${44 * s}`, 1.5);
    A.ink(pr.l, A.wline([[x - 26 * s, y - h + 10 * s], [x + w * 0.5, y - h - 128 * s], [x + w + 26 * s, y - h + 10 * s]], 4, 3), 1.6);
    // chimney and smoke
    A.wash(pr.f, `M${x + w * 0.7},${y - h - 70 * s} v${-60 * s} h${24 * s} v${78 * s} Z`, A.C.stone, 0.95);
    const sm = A.g(p, { class: 'smoke', filter: 'url(#washsoft)' });
    for (let i = 0; i < 4; i++) A.wash(sm, A.blob(x + w * 0.74 + i * 14 * s, y - h - 150 * s - i * 40 * s, 20 * s + i * 6 * s, 14 * s + i * 4 * s, i + 3), '#e9e4da', 0.6);
    return pr.g;
  };
  A.fence = function (p, x0, x1, y, s = 1, seed = 1) {
    const pr = A.pair(p), r = A.rng(seed);
    for (let x = x0; x <= x1; x += 70 * s) {
      const h = 64 * s + r() * 8;
      A.wash(pr.f, `M${x - 5 * s},${y} v${-h} l${5 * s},${-6 * s} l${5 * s},${6 * s} v${h} Z`, A.C.wood, 0.9);
      A.ink(pr.l, `M${x - 5 * s},${y} v${-h} l${5 * s},${-6 * s} l${5 * s},${6 * s} v${h}`, 1.2);
    }
    A.wash(pr.f, `M${x0},${y - 46 * s} L${x1},${y - 44 * s} L${x1},${y - 37 * s} L${x0},${y - 39 * s} Z`, A.C.wood, 0.85);
    A.wash(pr.f, `M${x0},${y - 22 * s} L${x1},${y - 20 * s} L${x1},${y - 14 * s} L${x0},${y - 16 * s} Z`, A.C.wood, 0.85);
    A.ink(pr.l, A.wline([[x0, y - 46 * s], [x1, y - 44 * s]], seed), 1.1);
    A.ink(pr.l, A.wline([[x0, y - 22 * s], [x1, y - 20 * s]], seed + 1), 1.1);
    return pr.g;
  };
  // A wooden pen or cage: frame and bars. Returns {g, door} pieces.
  A.cage = function (p, x, y, w, h, o = {}) {
    const g = A.g(p, { class: o.cls || '' });
    const back = A.pair(g);
    A.wash(back.f, `M${x},${y} v${-h} h${w} v${h} Z`, o.inside || '#b6a68c', 0.45);
    const front = A.pair(g);
    A.wash(front.f, `M${x - 6},${y - h - 8} h${w + 12} v${12} h${-w - 12} Z`, A.C.woodDark, 0.95);
    A.wash(front.f, `M${x - 6},${y - 4} h${w + 12} v${10} h${-w - 12} Z`, A.C.woodDark, 0.95);
    const bars = A.g(front.l);
    for (let bx = x + 6; bx < x + w; bx += o.gap || 16) A.ink(bars, `M${bx},${y - 2} V${y - h}`, o.iron ? 2.6 : 3, o.iron ? A.C.iron : A.C.woodDark);
    A.ink(front.l, `M${x - 6},${y - h - 8} h${w + 12} v${12} h${-w - 12} Z M${x - 6},${y - 4} h${w + 12} v${10} h${-w - 12} Z`, 1.3);
    return { g, back: back.g, front: front.g };
  };
  A.table = function (p, x, y, w, s = 1) {
    const pr = A.pair(p);
    A.wash(pr.f, `M${x},${y} h${w} l${-20 * s},${-18 * s} h${-(w - 40 * s)} Z`, A.C.wood, 0.95);
    A.wash(pr.f, `M${x + 6 * s},${y} h${w - 12 * s} v${14 * s} h${-(w - 12 * s)} Z`, A.C.woodDark, 0.9);
    A.wash(pr.f, `M${x + 20 * s},${y + 14 * s} v${100 * s} h${12 * s} v${-100 * s} Z M${x + w - 32 * s},${y + 14 * s} v${100 * s} h${12 * s} v${-100 * s} Z`, A.C.woodDark, 0.9);
    A.ink(pr.l, `M${x},${y} h${w} l${-20 * s},${-18 * s} h${-(w - 40 * s)} Z M${x + 6 * s},${y + 14 * s} h${w - 12 * s}`, 1.4);
    return pr.g;
  };
  A.candle = function (p, x, y, s = 1) {
    const g = A.g(p);
    A.el('circle', { cx: x, cy: y - 44 * s, r: 90 * s, fill: 'url(#lampglow)', class: 'flicker' }, g);
    const pr = A.pair(g);
    A.wash(pr.f, `M${x - 6 * s},${y} v${-30 * s} h${12 * s} v${30 * s} Z`, '#f2ead6', 0.95);
    A.wash(pr.f, A.blob(x, y - 40 * s, 5 * s, 10 * s, 2, 0.1), A.C.fire, 0.95, { class: 'flame1' });
    A.ink(pr.l, `M${x - 6 * s},${y} v${-30 * s} h${12 * s} v${30 * s}`, 1.1);
    return g;
  };
  A.bridge = function (p, x0, x1, y, s = 1, o = {}) {
    // A great single arch of old stone. Returns {g, deck, left, right, carvings}.
    const g = A.g(p, { class: o.cls || '' });
    const span = x1 - x0, mid = (x0 + x1) / 2, th = 46 * s;
    const pieces = [];
    const mk = (xa, xb, id) => {
      const pr = A.pair(g, { class: 'bpiece ' + id });
      const top = y, ar = y + 150 * s;
      const archY = xx => ar - Math.sin(Math.PI * (xx - x0) / span) * 120 * s;
      const pts = [];
      for (let xx = xa; xx <= xb + 0.1; xx += span / 20) pts.push([xx, archY(xx)]);
      let d = `M${xa},${top} L${xb},${top} L${xb},${archY(xb)} ` + pts.slice().reverse().map(q => `L${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ') + ' Z';
      A.wash(pr.f, d, A.C.stone, 0.95);
      A.wash(pr.f, `M${xa},${top - th * 0.3} L${xb},${top - th * 0.3} L${xb},${top} L${xa},${top} Z`, A.C.stoneDark, 0.8);
      const r = A.rng(xa);
      for (let i = 0; i < (xb - xa) / 26; i++) {
        const bx = xa + i * 26, by = top + 16 + (i % 3) * 22;
        if (by < archY(bx) - 8) A.ink(pr.l, `M${bx},${by} h${22} M${bx + 11},${by} v${20}`, 0.9, A.C.inkSoft);
      }
      for (let i = 0; i < 6; i++) A.wash(pr.f, A.blob(xa + r() * (xb - xa), top - 4 + r() * 10, 18 * s, 6 * s, i + xa, 0.3), A.C.moss, 0.6);
      A.ink(pr.l, `M${xa},${top - th * 0.3} L${xb},${top - th * 0.3}`, 1.5);
      A.ink(pr.l, A.wline(pts, 3, 1.5), 1.5);
      pieces.push(pr.g);
      return pr.g;
    };
    const left = mk(x0, mid - span * 0.06, 'bl');
    const center = mk(mid - span * 0.06, mid + span * 0.06, 'bc');
    const right = mk(mid + span * 0.06, x1, 'br');
    // carvings: rows of small unknown marks on the parapet faces
    const cv = A.g(g, { class: 'carvings', filter: 'url(#ink)' });
    const r = A.rng(77);
    for (let i = 0; i < 26; i++) {
      const cx = x0 + 40 + i * (span - 80) / 26, cy = y + 30 * s;
      const k = Math.floor(r() * 5);
      const d = [`M${cx},${cy} l6,-10 l6,10`, `M${cx},${cy - 10} v10 h10`, `M${cx + 6},${cy - 5} m-5,0 a5,5 0 1,0 10,0 a5,5 0 1,0 -10,0`, `M${cx},${cy - 10} l10,10 M${cx + 10},${cy - 10} l-10,10`, `M${cx},${cy - 5} h12 M${cx + 6},${cy - 11} v12`][k];
      A.ink(cv, d, 1.3, A.C.stoneDark);
    }
    return { g, left, center, right, carvings: cv };
  };
  A.cart = function (p, x, y, s = 1) {
    const pr = A.pair(p);
    A.wash(pr.f, `M${x - 120 * s},${y - 40 * s} h${240 * s} v${-34 * s} h${-240 * s} Z`, A.C.wood, 0.95);
    A.wash(pr.f, `M${x + 120 * s},${y - 56 * s} l${90 * s},${-6 * s} v${6 * s} l${-90 * s},${10 * s} Z`, A.C.woodDark, 0.9);
    for (const wx of [-70, 70]) {
      A.wash(pr.f, A.blob(x + wx * s, y - 26 * s, 30 * s, 30 * s, wx + 9, 0.04, 12), A.C.woodDark, 0.85);
      A.ink(pr.l, `M${x + wx * s - 30 * s},${y - 26 * s} a${30 * s},${30 * s} 0 1,0 ${60 * s},0 a${30 * s},${30 * s} 0 1,0 ${-60 * s},0 M${x + wx * s - 30 * s},${y - 26 * s} h${60 * s} M${x + wx * s},${y - 56 * s} v${60 * s}`, 1.3);
    }
    A.ink(pr.l, `M${x - 120 * s},${y - 40 * s} h${240 * s} v${-34 * s} h${-240 * s} Z`, 1.4);
    return pr.g;
  };
  A.pot = function (p, x, y, s = 1) {
    const pr = A.pair(p);
    A.ink(pr.l, `M${x - 46 * s},${y} L${x},${y - 110 * s} L${x + 46 * s},${y} M${x},${y - 110 * s} v${30 * s}`, 2.2, A.C.woodDark);
    A.wash(pr.f, `M${x - 30 * s},${y - 78 * s} h${60 * s} q${4 * s},${46 * s} ${-30 * s},${50 * s} q${-34 * s},${-4 * s} ${-30 * s},${-50 * s} Z`, A.C.iron, 0.95);
    A.ink(pr.l, `M${x - 30 * s},${y - 78 * s} h${60 * s} q${4 * s},${46 * s} ${-30 * s},${50 * s} q${-34 * s},${-4 * s} ${-30 * s},${-50 * s} Z`, 1.4);
    const st = A.g(p, { class: 'steam', filter: 'url(#washsoft)' });
    for (let i = 0; i < 3; i++) A.wash(st, A.blob(x - 10 * s + i * 10 * s, y - 100 * s - i * 26 * s, 14 * s, 10 * s, i + 40), '#f0ece2', 0.55);
    return pr.g;
  };

  // ─── People ───────────────────────────────────────────────────────────
  // A figure is drawn standing in its own frame (origin at the feet, y up
  // negative); a pose bends the body at the hip and places arms and legs.
  const POSES = {
    stand: { down: 0, rot: 0, armR: [[11, -90], [15, -75], [17, -60]], armL: [[-11, -90], [-15, -75], [-16, -60]], legs: [[[6, -38], [7, -20], [7, -5]], [[-5, -38], [-6, -20], [-6, -5]]] },
    walk: { down: 2, rot: 3, armR: [[11, -90], [8, -75], [2, -62]], armL: [[-11, -90], [-6, -76], [4, -63]], legs: [[[6, -38], [14, -22], [18, -5]], [[-5, -38], [-10, -20], [-15, -6]]] },
    reach: { down: 0, rot: 3, armR: [[11, -90], [24, -98], [37, -104]], armL: [[-11, -90], [-15, -75], [-16, -60]], legs: [[[6, -38], [8, -20], [10, -5]], [[-5, -38], [-6, -20], [-7, -5]]] },
    hold: { down: 0, rot: 0, armR: [[11, -90], [20, -78], [24, -66]], armL: [[-11, -90], [4, -80], [18, -68]], legs: [[[6, -38], [7, -20], [7, -5]], [[-5, -38], [-6, -20], [-6, -5]]] },
    kneel: { down: 18, rot: 16, armR: [[11, -90], [22, -72], [30, -50]], armL: [[-11, -90], [4, -72], [20, -52]], legs: [[[6, -22], [22, -22], [22, -5]], [[-5, -22], [-4, -6], [-26, -5]]] },
    crouch: { down: 14, rot: 10, armR: [[11, -90], [22, -78], [30, -64]], armL: [[-11, -90], [2, -76], [18, -66]], legs: [[[6, -26], [18, -20], [14, -5]], [[-5, -26], [6, -18], [-6, -5]]] },
    sit: { down: 30, rot: 20, armR: [[11, -90], [16, -100], [12, -110]], armL: [[-11, -90], [2, -100], [6, -110]], legs: [[[6, -10], [26, -34], [32, -5]], [[-3, -10], [20, -32], [26, -5]]], headDown: true },
  };
  A.POSES = POSES;
  const Q3 = (a, b, c) => `M${a[0]},${a[1]} Q${b[0]},${b[1]} ${c[0]},${c[1]}`;
  const boot = (g, x, y, col) => A.wash(g, `M${x - 5},${y - 7} h8 q7,1 8,7 q-1,2 -3,2 h-14 q-2,-4 1,-9 Z`, col, 0.95);

  A.cassie = function (p, x, y, s = 1, o = {}) {
    const C = A.C, P = POSES[o.pose || 'stand'];
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const F = A.g(g, { filter: 'url(#wash)' }), L = A.g(g, { filter: 'url(#ink)' });
    // legs (in the outer frame)
    const legs = A.g(F, { class: 'legs' }), legsL = A.g(L);
    P.legs.forEach((lg, i) => {
      A.el('path', { d: Q3(...lg), fill: 'none', stroke: C.stocking, 'stroke-width': 5.2, 'stroke-linecap': 'round', class: i ? 'legL' : 'legR' }, legs);
      boot(legs, lg[2][0], lg[2][1] + 4, C.boots);
      A.ink(legsL, Q3(...lg), 0.6, C.ink, { 'stroke-opacity': 0.4 });
    });
    // upper body, bent at the hip
    const hip = [0, -38];
    const up = A.g(g, { transform: `translate(0,${P.down}) rotate(${P.rot} ${hip[0]} ${hip[1]})` });
    const f = A.g(up, { filter: 'url(#wash)' }), l = A.g(up, { filter: 'url(#ink)' });
    const dressCol = o.coat ? C.coatGreen : C.dress;
    const sh = -92, w = -70, hem = -36;
    // back arm
    A.el('path', { d: Q3(...P.armL), fill: 'none', stroke: dressCol, 'stroke-width': 6.5, 'stroke-linecap': 'round' }, f);
    A.dot(f, P.armL[2][0], P.armL[2][1], 3.4, C.skin);
    // dress: fitted bodice, a skirt that flares to a soft, uneven hem
    const dress = `M-11,${sh + 2} C-12,${sh + 12} -11,${w - 2} -10,${w} C-16,${w + 12} -24,${hem - 10} -28,${hem} Q-20,${hem + 5} -12,${hem + 1} Q-4,${hem + 6} 4,${hem + 1} Q12,${hem + 6} 20,${hem + 1} Q25,${hem + 4} 28,${hem - 1} C24,${hem - 12} 16,${w + 12} 10,${w} C11,${w - 2} 12,${sh + 12} 11,${sh + 2} C6,${sh - 2} -6,${sh - 2} -11,${sh + 2} Z`;
    A.wash(f, dress, dressCol, 0.92);
    if (!o.coat) {
      A.wash(f, `M-7,${sh + 6} h14 L8,${w} C12,${w + 12} 16,${hem - 12} 18,${hem - 2} Q0,${hem + 3} -18,${hem - 2} C-16,${hem - 12} -12,${w + 12} -8,${w} Z`, C.pinafore, 0.92);
      A.wash(f, `M-6,${sh} Q0,${sh + 6} 6,${sh} Q0,${sh + 3} -6,${sh} Z`, '#fbf7ee', 0.95);
    } else {
      A.wash(f, `M-2,${sh + 2} L2,${hem}`, 'none');
    }
    A.wash(f, A.blob(-11, sh + 5, 6, 6, 3, 0.1), dressCol, 0.95);
    A.wash(f, A.blob(11, sh + 5, 6, 6, 4, 0.1), dressCol, 0.95);
    if (o.satchel) {
      A.el('path', { d: `M10,${sh + 2} L-16,${hem - 14}`, stroke: '#6e5236', 'stroke-width': 2.4, fill: 'none' }, f);
      A.wash(f, `M-29,${hem - 23} h16 v14 q-8,4 -16,0 Z`, '#9a7650', 0.95);
      A.ink(l, `M-29,${hem - 23} h16 v14 q-8,4 -16,0 Z M-29,${hem - 23} q8,7 16,0`, 0.9);
    }
    // front arm
    A.el('path', { d: Q3(...P.armR), fill: 'none', stroke: dressCol, 'stroke-width': 6.5, 'stroke-linecap': 'round', class: 'armR' }, f);
    A.dot(f, P.armR[2][0], P.armR[2][1], 3.4, C.skin);
    // head
    const hx = 1, hy = -110;
    const head = A.g(f, { class: 'head' });
    A.wash(head, A.blob(hx, hy, 15, 16, 31, 0.03, 10), C.skin, 0.97);
    A.wash(head, `M${hx - 17},${hy + 4} C${hx - 21},${hy - 15} ${hx - 9},${hy - 23} ${hx + 2},${hy - 21} C${hx + 13},${hy - 20} ${hx + 19},${hy - 11} ${hx + 16},${hy - 3} C${hx + 12},${hy - 10} ${hx + 5},${hy - 12} ${hx - 1},${hy - 9} C${hx - 5},${hy - 3} ${hx - 7},${hy + 7} ${hx - 5},${hy + 18} C${hx - 12},${hy + 21} ${hx - 19},${hy + 15} ${hx - 17},${hy + 4} Z`, C.hair, 0.95);
    A.wash(head, `M${hx - 16},${hy - 5} q-6,-3 -6,3 q2,4 6,1 Z M${hx - 16},${hy - 5} q-3,-6 3,-6 q2,3 -3,6 Z`, '#7f99b4', 0.95);
    const L2 = A.g(up, { filter: 'url(#ink)' });
    if (!P.headDown && !o.eyesClosed) {
      const eyes = A.g(head, { class: 'eyes' });
      A.dot(eyes, hx + 5.5, hy, 1.6, C.ink);
      A.dot(eyes, hx + 11.5, hy + 0.6, 1.5, C.ink);
      A.ink(L2, `M${hx + 3.5},${hy - 4.5} q2,-1.4 4,0 M${hx + 10},${hy - 4} q2,-1.2 3.6,0.2`, 0.7, '#9b7c45');
    }
    if (o.eyesClosed) A.ink(L2, `M${hx + 3.5},${hy + 0.5} q2,1.8 4,0 M${hx + 10},${hy + 1} q2,1.8 3.6,0`, 0.9);
    A.dot(head, hx + 9, hy + 6, 3, C.cheek, 0.38);
    A.ink(L2, `M${hx + 14.5},${hy + 2} q1.6,2 -0.4,3`, 0.8, C.inkSoft);
    if (o.smile) A.ink(L2, `M${hx + 6},${hy + 8.5} q3,2.4 6,0`, 0.9);
    else if (!P.headDown) A.ink(L2, `M${hx + 7},${hy + 9} h3.6`, 0.8);
    // ink: the whole silhouette, a few folds, a little hatching in the shadow side
    A.ink(l, A.wline([[-11, sh + 2], [-11, w], [-20, hem - 18], [-28, hem], [-12, hem + 1], [4, hem + 1], [20, hem + 1], [28, hem - 1], [20, hem - 18], [10, w], [11, sh + 2]], 5, 0.7), 1.15);
    A.ink(l, `M-4,${w + 6} q-3,12 -8,${hem - w - 10} M6,${w + 6} q3,12 8,${hem - w - 10} M1,${w + 8} v${hem - w - 12}`, 0.6, C.inkSoft);
    for (let i = 0; i < 5; i++) A.ink(l, `M${-24 + i * 3},${hem - 4 - i * 2} l5,-9`, 0.5, C.inkSoft);
    A.ink(l, `M${hx + 14.5},${hy - 3} C${hx + 17},${hy + 8} ${hx + 12},${hy + 15} ${hx + 4},${hy + 16}`, 1);
    for (let i = 0; i < 5; i++) A.ink(l, `M${hx - 13 + i * 5},${hy - 15} q${-2},${10} ${-6 + i},${23}`, 0.55, '#b19246');
    return outer;
  };

  // Grown-ups: kind 'mother' | 'grandmother' | 'father' | 'geologist' | 'thief'
  A.adult = function (p, x, y, s = 1, o = {}) {
    const C = A.C, kind = o.kind || 'mother';
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    const skirt = kind === 'mother' || kind === 'grandmother';
    const sh = -134, w = -100;
    const coatCol = { father: C.coatGreen, geologist: C.coat, thief: C.coatDark }[kind];
    const sleeve = skirt ? (kind === 'grandmother' ? C.shawl : '#9e7d64') : coatCol;
    const pose = o.pose || 'stand';
    const armR = pose === 'point' ? [[14, sh + 4], [34, sh + 4], [54, sh - 2]] : pose === 'hold' ? [[14, sh + 4], [26, sh + 30], [32, sh + 48]] : pose === 'reach' ? [[14, sh + 4], [32, sh + 22], [46, sh + 32]] : pose === 'hip' ? [[14, sh + 4], [26, sh + 26], [16, w + 4]] : [[14, sh + 4], [19, sh + 34], [19, sh + 62]];
    const armL = pose === 'hug' ? [[-14, sh + 4], [8, sh + 24], [26, sh + 30]] : [[-14, sh + 4], [-19, sh + 34], [-19, sh + 62]];
    if (!o.seated) {
      if (skirt) { boot(f, -9, -1, C.boots); boot(f, 10, -1, C.boots); }
      else for (const sx of [-8, 8]) {
        A.el('path', { d: `M${sx},${w + 10} L${sx + (sx > 0 ? 2 : -1)},-8`, stroke: kind === 'thief' ? '#4c4640' : '#6d6253', 'stroke-width': 11, fill: 'none', 'stroke-linecap': 'round' }, f);
        boot(f, sx + 2, -1, C.boots);
      }
    }
    A.el('path', { d: Q3(...armL), fill: 'none', stroke: sleeve, 'stroke-width': 9, 'stroke-linecap': 'round' }, f);
    A.dot(f, armL[2][0], armL[2][1], 4.4, C.skin);
    if (skirt) {
      const sk = kind === 'grandmother' ? '#8d8796' : C.skirt;
      A.wash(f, `M-15,${sh + 2} C-16,${sh + 18} -14,${w - 4} -13,${w} C-22,${w + 30} -34,-30 -38,-4 Q-24,2 -10,-2 Q4,3 18,-2 Q30,2 38,-5 C34,-30 22,${w + 30} 13,${w} C14,${w - 4} 16,${sh + 18} 15,${sh + 2} C8,${sh - 3} -8,${sh - 3} -15,${sh + 2} Z`, sk, 0.92);
      A.wash(f, `M-10,${w - 18} h20 L12,${w} C20,${w + 26} 26,-30 26,-12 Q0,-6 -26,-12 C-26,-30 -20,${w + 26} -12,${w} Z`, C.apron, 0.92);
      if (kind === 'grandmother') A.wash(f, `M-18,${sh} Q0,${sh + 44} 18,${sh} L23,${sh + 20} Q0,${sh + 62} -23,${sh + 20} Z`, C.shawl, 0.9);
      A.ink(l, A.wline([[-15, sh + 2], [-13, w], [-28, -40], [-38, -4], [-10, -2], [18, -2], [38, -5], [28, -40], [13, w], [15, sh + 2]], 6, 0.8), 1.2);
      A.ink(l, `M-6,${w + 10} q-4,30 -12,${-w - 22} M6,${w + 10} q4,30 12,${-w - 22}`, 0.6, C.inkSoft);
    } else {
      A.wash(f, `M-16,${sh + 2} C-20,${sh + 40} -26,${w} -27,${w + 46} L-4,${w + 48} L4,${w + 40} L27,${w + 46} C26,${w} 20,${sh + 40} 16,${sh + 2} C8,${sh - 3} -8,${sh - 3} -16,${sh + 2} Z`, coatCol, 0.93);
      if (kind === 'thief') A.wash(f, `M-14,${sh} Q0,${sh + 14} 14,${sh} L12,${sh + 12} Q0,${sh + 22} -12,${sh + 12} Z`, '#7a4f42', 0.9);
      else A.wash(f, `M-6,${sh} L0,${sh + 22} L6,${sh} Z`, '#efe7d6', 0.9);
      A.ink(l, A.wline([[-16, sh + 2], [-24, w], [-27, w + 46], [-4, w + 48], [27, w + 46], [24, w], [16, sh + 2]], 6, 0.8), 1.2);
      A.ink(l, `M0,${sh + 22} V${w + 42} M-3,${sh + 40} h0.5 M-3,${sh + 60} h0.5`, 0.8);
    }
    A.el('path', { d: Q3(...armR), fill: 'none', stroke: sleeve, 'stroke-width': 9, 'stroke-linecap': 'round', class: 'armR' }, f);
    A.dot(f, armR[2][0], armR[2][1], 4.4, C.skin);
    // head
    const hx = 2, hy = sh - 21;
    const head = A.g(f, { class: 'head' });
    A.wash(head, A.blob(hx, hy, 17, 19, 41, 0.03, 10), kind === 'thief' ? '#c9ae95' : C.skin, 0.97);
    const hairCol = { mother: C.hairBrown, grandmother: C.hairGrey, father: C.hairBrown, geologist: '#9a8a74', thief: C.hairDark }[kind];
    if (skirt) {
      A.wash(head, `M${hx - 18},${hy + 3} C${hx - 21},${hy - 17} ${hx - 6},${hy - 23} ${hx + 4},${hy - 21} C${hx + 15},${hy - 19} ${hx + 19},${hy - 10} ${hx + 17},${hy - 4} C${hx + 8},${hy - 11} ${hx - 5},${hy - 9} ${hx - 9},${hy + 1} C${hx - 11},${hy + 7} ${hx - 13},${hy + 11} ${hx - 18},${hy + 3} Z`, hairCol, 0.95);
      A.wash(head, A.blob(hx - 15, hy - 15, 9, 8, 12, 0.1), hairCol, 0.95);
    } else {
      A.wash(head, `M${hx - 18},${hy - 1} C${hx - 17},${hy - 17} ${hx + 8},${hy - 23} ${hx + 17},${hy - 7} C${hx + 8},${hy - 11} ${hx - 6},${hy - 9} ${hx - 11},${hy + 7} Z`, hairCol, 0.95);
    }
    if (kind === 'father' || kind === 'thief') A.wash(head, `M${hx - 4},${hy + 8} C${hx},${hy + 21} ${hx + 15},${hy + 21} ${hx + 17},${hy + 4} C${hx + 11},${hy + 11} ${hx + 2},${hy + 11} ${hx - 4},${hy + 8} Z`, hairCol, 0.9);
    if (kind === 'father' || kind === 'geologist' || kind === 'thief') {
      const brim = kind === 'geologist' ? 29 : kind === 'thief' ? 27 : 21;
      A.wash(head, `M${hx - brim},${hy - 11} Q${hx},${hy - 17} ${hx + brim},${hy - 11} L${hx + brim - 4},${hy - 7} Q${hx},${hy - 12} ${hx - brim + 4},${hy - 7} Z`, C.hat, 0.95);
      A.wash(head, `M${hx - 13},${hy - 12} C${hx - 14},${hy - 33} ${hx + 14},${hy - 33} ${hx + 13},${hy - 12} Z`, C.hat, 0.95);
      A.ink(l, `M${hx - brim},${hy - 11} Q${hx},${hy - 17} ${hx + brim},${hy - 11}`, 0.9);
    }
    if (kind === 'thief') A.wash(head, A.blob(hx + 4, hy - 1, 14, 8, 51, 0.2), '#3e3833', 0.55);
    else {
      const eyes = A.g(head, { class: 'eyes' });
      A.dot(eyes, hx + 6, hy, 1.8, C.ink);
      A.dot(eyes, hx + 12.5, hy + 0.5, 1.7, C.ink);
      if (kind === 'geologist') A.ink(l, `M${hx + 2},${hy} a4,4 0 1,0 8,0 a4,4 0 1,0 -8,0 M${hx + 10},${hy} h2 M${hx + 12},${hy} a3.5,3.5 0 1,0 7,0 a3.5,3.5 0 1,0 -7,0`, 0.8);
      if (o.smile) A.ink(l, `M${hx + 6},${hy + 10} q4,3 8,0`, 1);
      else A.ink(l, `M${hx + 8},${hy + 10} h4`, 0.8);
      A.dot(head, hx + 10, hy + 7, 3.4, C.cheek, 0.28);
    }
    A.ink(l, `M${hx + 17},${hy - 2} C${hx + 19},${hy + 10} ${hx + 13},${hy + 17} ${hx + 4},${hy + 18}`, 1.05);
    return outer;
  };

  // ─── Animals ──────────────────────────────────────────────────────────
  // Sables: naturalistic, undressed. pose 'walk' | 'sit'. white:true for Moonglow.
  A.sable = function (p, x, y, s = 1, o = {}) {
    const C = A.C, white = !!o.white;
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    if (white) A.el('ellipse', { cx: o.pose === 'sit' ? 0 : 6, cy: o.pose === 'sit' ? -36 : -18, rx: 64, ry: 48, fill: 'url(#pearlglow)', class: 'pearl' }, outer);
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    const body = white ? C.white : C.sable, light = white ? '#e6ebf0' : C.sableLight, line = white ? '#959ba4' : C.ink, dark = white ? '#d5dce4' : '#4d3a2b';
    if (o.pose === 'sit') {
      A.wash(f, `M-6,-4 C-24,-2 -40,-8 -40,-20 C-40,-28 -30,-30 -24,-24 C-20,-16 -14,-10 -6,-10 Z`, body, 0.92, { class: 'tail' });
      A.wash(f, `M-11,-2 C-17,-18 -15,-38 -8,-50 C-4,-58 7,-58 10,-50 C15,-38 16,-18 11,-2 Q0,2 -11,-2 Z`, body, 0.94);
      A.wash(f, `M-1,-50 C3,-42 7,-36 6,-26 C1,-28 -2,-34 -3,-42 Z`, light, 0.85);
      A.el('path', { d: 'M2,-36 q6,3 6,9 M7,-37 q6,3 5,9', stroke: dark, 'stroke-width': 3.2, 'stroke-linecap': 'round', fill: 'none' }, f);
      A.el('path', { d: 'M-8,-2 v-6 M6,-2 v-6', stroke: dark, 'stroke-width': 4.5, 'stroke-linecap': 'round', fill: 'none' }, f);
      const head = A.g(f, { class: 'head' });
      A.wash(head, `M-10,-61 C-11,-72 -1,-77 7,-73 C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55 C-4,-55 -9,-57 -10,-61 Z`, body, 0.95);
      A.wash(head, A.blob(-4, -73, 4, 4, 3, 0.1), body, 0.95);
      A.wash(head, A.blob(5, -75, 4, 4, 4, 0.1), body, 0.95);
      A.dot(head, -4, -73, 1.6, dark, 0.8);
      A.dot(head, 5, -75, 1.6, dark, 0.8);
      A.dot(head, 19, -61, 1.9, '#2e2620');
      A.dot(head, 8, -66, 1.8, '#1b1714');
      A.ink(l, `M-11,-2 C-17,-18 -15,-38 -8,-50 M11,-2 C16,-18 15,-38 10,-50 M-10,-61 C-11,-72 -1,-77 7,-73 C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55 M-6,-4 C-24,-2 -40,-8 -40,-20`, 0.9, line);
      for (let i = 0; i < 8; i++) A.ink(l, `M${-8 + (i % 4) * 2},${-46 + i * 5} l-3,4`, 0.5, line);
    } else {
      A.wash(f, `M-30,-15 C-44,-22 -58,-20 -66,-12 C-62,-5 -50,-4 -32,-9 Z`, body, 0.9, { class: 'tail' });
      A.wash(f, `M-32,-12 C-34,-24 -22,-30 -6,-30 C8,-32 20,-31 30,-25 C36,-21 35,-13 28,-10 C12,-8 -10,-8 -24,-8 C-30,-8 -32,-10 -32,-12 Z`, body, 0.94);
      for (const [a, b] of [[24, 27], [17, 15], [-22, -25], [-14, -12]]) A.el('path', { d: `M${a},-11 Q${(a + b) / 2},-6 ${b},-1`, stroke: dark, 'stroke-width': 4.6, 'stroke-linecap': 'round', fill: 'none' }, f);
      const head = A.g(f, { class: 'head' });
      A.wash(head, `M27,-27 C29,-35 39,-37 45,-32 C49,-29 53,-25 56,-22 C50,-19 41,-18 34,-19 C29,-20 26,-23 27,-27 Z`, body, 0.95);
      A.wash(head, A.blob(32, -35, 4, 4, 5, 0.1), body, 0.95);
      A.wash(head, A.blob(39, -36, 4, 4, 6, 0.1), body, 0.95);
      A.dot(head, 56, -22, 1.9, '#2e2620');
      A.dot(head, 44, -28, 1.8, '#1b1714');
      A.wash(f, `M25,-19 C30,-15 35,-14 37,-17 C34,-20 29,-21 25,-19 Z`, light, 0.85);
      A.ink(l, `M-32,-12 C-34,-24 -22,-30 -6,-30 C8,-32 20,-31 30,-25 M27,-27 C29,-35 39,-37 45,-32 C49,-29 53,-25 56,-22 M-24,-8 C-10,-8 12,-8 28,-10 M-30,-15 C-44,-22 -58,-20 -66,-12`, 0.9, line);
      for (let i = 0; i < 9; i++) A.ink(l, `M${-24 + i * 6},${-28 + (i % 2)} l-4,3`, 0.5, line);
    }
    return outer;
  };
  A.cow = function (p, x, y, s = 1, o = {}) {
    const C = A.C;
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    for (const lx of [-60, -42, 38, 54]) A.el('path', { d: `M${lx},-52 L${lx + 2},-4`, stroke: C.cow, 'stroke-width': 9, 'stroke-linecap': 'round', fill: 'none' }, f);
    A.wash(f, `M-74,-56 C-80,-96 -40,-108 0,-104 C40,-108 70,-100 72,-74 C74,-58 64,-48 40,-46 L-50,-46 C-66,-46 -72,-50 -74,-56 Z`, C.cow, 0.92);
    A.wash(f, A.blob(-20, -82, 26, 16, 3, 0.3), C.cowLight, 0.85);
    A.wash(f, A.blob(30, -66, 18, 12, 4, 0.3), C.cowLight, 0.8);
    A.wash(f, `M-72,-90 C-80,-94 -90,-90 -84,-84 Z`, C.cow, 0.9, { class: 'tail' });
    const head = A.g(f, { class: 'head' });
    A.wash(head, `M62,-96 C70,-108 92,-108 100,-96 C106,-86 104,-72 96,-66 C88,-62 80,-64 76,-70 C70,-78 64,-86 62,-96 Z`, C.cow, 0.95);
    A.wash(head, A.blob(94, -70, 9, 7, 9, 0.1), '#e2b9a6', 0.9);
    A.wash(head, `M70,-104 q-8,-10 -2,-16 M90,-106 q8,-8 4,-16`, 'none');
    A.ink(head, `M72,-104 q-6,-10 -1,-15 M90,-105 q8,-9 3,-15`, 1.6, C.ink);
    A.dot(head, 88, -90, 2, C.ink);
    A.ink(l, A.wline([[-74, -56], [-60, -100], [0, -104], [60, -100], [72, -74], [40, -46], [-50, -46], [-74, -56]], 3, 1.5), 1.3);
    return outer;
  };
  A.dog = function (p, x, y, s = 1, o = {}) {
    const C = A.C;
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    const c = o.wolf ? C.dog : '#a68a6a', d = o.wolf ? C.dogDark : '#7b6249';
    // legs with a joint
    for (const [hx, kx, fx] of [[-30, -34, -30], [-20, -18, -22], [22, 26, 24], [32, 30, 34]]) {
      A.el('path', { d: `M${hx},-30 Q${kx},-16 ${fx},-2`, stroke: hx > 0 ? c : d, 'stroke-width': 6.5, 'stroke-linecap': 'round', fill: 'none' }, f);
    }
    A.wash(f, `M-40,-36 C-44,-52 -16,-56 14,-54 C34,-54 44,-48 42,-36 C40,-28 28,-24 12,-26 C-4,-27 -20,-26 -30,-28 C-37,-29 -40,-32 -40,-36 Z`, c, 0.93);
    A.wash(f, `M-40,-44 C-52,-52 -62,-50 -66,-42 C-58,-42 -50,-40 -40,-37 Z`, c, 0.9, { class: 'tail' });
    if (o.wolf) A.wash(f, `M-30,-52 C-10,-58 18,-56 34,-50 C18,-49 -10,-47 -30,-45 Z`, d, 0.6);
    const head = A.g(f, { class: 'head' });
    A.wash(head, `M32,-50 C34,-63 48,-67 56,-60 C62,-56 68,-52 74,-50 C70,-44 62,-42 52,-42 C42,-42 33,-44 32,-50 Z`, c, 0.95);
    A.wash(head, `M42,-61 L44,-76 L53,-63 Z`, d, 0.95);
    A.dot(head, 74, -50, 2.2, '#2a2420');
    A.dot(head, 56, -56, 1.8, '#2a2420');
    A.ink(l, A.wline([[-40, -36], [-22, -55], [14, -54], [42, -38], [12, -26], [-30, -28], [-40, -36]], 4, 1), 1.1);
    A.ink(l, `M32,-50 C34,-63 48,-67 56,-60 C62,-56 68,-52 74,-50`, 1.1);
    for (let i = 0; i < 8; i++) A.ink(l, `M${-30 + i * 8},${-52 + (i % 2) * 2} l-3,4`, 0.6, C.inkSoft);
    return outer;
  };
  A.horse = function (p, x, y, s = 1, o = {}) {
    const C = A.C;
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    const col = o.color || C.horse, dark = '#4f3c2e';
    for (const [hx, kx, fx] of [[-50, -56, -50], [-36, -32, -38], [34, 40, 36], [48, 46, 52]]) {
      A.el('path', { d: `M${hx},-70 Q${kx},-36 ${fx},-4`, stroke: hx < -40 || hx > 40 ? col : dark, 'stroke-width': 8.5, 'stroke-linecap': 'round', fill: 'none' }, f);
    }
    A.wash(f, `M-62,-82 C-66,-112 -30,-120 8,-118 C40,-118 56,-110 56,-90 C56,-74 44,-66 24,-66 L-46,-66 C-58,-66 -62,-72 -62,-82 Z`, col, 0.93);
    A.wash(f, `M40,-108 C44,-132 58,-150 76,-156 C88,-158 98,-150 104,-138 C106,-132 102,-128 96,-130 C88,-132 82,-124 76,-114 C68,-100 54,-94 42,-96 Z`, col, 0.95);
    A.wash(f, `M52,-122 C58,-140 68,-152 80,-156 C70,-146 62,-134 58,-118 Z`, dark, 0.85);
    A.wash(f, `M-62,-100 C-80,-96 -86,-74 -80,-54 C-72,-68 -66,-82 -60,-90 Z`, dark, 0.9, { class: 'tail' });
    A.dot(f, 88, -146, 2, '#1d1712');
    A.ink(l, A.wline([[-62, -82], [-30, -118], [8, -118], [40, -108], [58, -140], [80, -156], [100, -146], [104, -138]], 6, 1.2), 1.15);
    if (o.rider) A.adult(g, -4, -24, 0.8, { kind: o.rider, seated: true, pose: o.riderPose || 'stand', smile: o.smile });
    if (o.lantern) A.lantern(g, 32, -150, 1.1);
    return outer;
  };
  A.caterpillar = function (p, x, y, s = 1, o = {}) {
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const f = A.g(outer, { filter: 'url(#wash)', class: 'cat-body' });
    for (let i = 0; i < 7; i++) A.wash(f, A.blob(-i * 9, -6 - (i === 3 ? 4 : 0), 6, 6, i + 2, 0.1, 8), i ? '#93a85a' : '#7d9446', 0.95);
    A.dot(f, 3, -8, 1.3, A.C.ink);
    return outer;
  };
  A.bee = function (p, x, y, s = 1, cls) {
    const g = A.g(p, { transform: `translate(${x},${y}) scale(${s})`, class: cls || '' });
    const f = A.g(g, { filter: 'url(#wash)' });
    A.wash(f, A.blob(0, 0, 7, 5, 3, 0.1), A.C.bee, 0.95);
    A.el('path', { d: 'M-2,-5 v10 M2,-5 v10', stroke: A.C.ink, 'stroke-width': 1.4 }, f);
    A.wash(f, A.blob(-2, -7, 5, 3, 4, 0.1), '#eef2f4', 0.7);
    return g;
  };
  A.hen = function (p, x, y, s = 1, o = {}) {
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${(o.flip ? -1 : 1) * s},${s})`, class: o.cls || '' });
    const g = A.g(outer, { class: 'fig' });
    const f = A.g(g, { filter: 'url(#wash)' }), l = A.g(g, { filter: 'url(#ink)' });
    A.wash(f, `M-26,-26 C-28,-46 -4,-50 10,-44 C14,-56 26,-58 28,-48 L36,-44 L28,-40 C28,-28 18,-14 0,-12 C-14,-12 -24,-16 -26,-26 Z`, A.C.hen, 0.93);
    A.wash(f, `M-26,-34 C-40,-44 -40,-28 -28,-24 Z`, '#9b6b44', 0.9);
    A.wash(f, A.blob(24, -56, 4, 3, 2, 0.2), '#c0443e', 0.9);
    A.dot(f, 25, -48, 1.5, A.C.ink);
    A.ink(l, `M-4,-12 v12 M6,-12 v12`, 1.4, '#c9973c');
    return outer;
  };
  A.bird = function (p, x, y, s = 1, cls) {
    const g = A.g(p, { class: cls || '', transform: `translate(${x},${y}) scale(${s})` });
    A.ink(g, 'M-12,0 q6,-7 12,0 q6,-7 12,0', 1.6, A.C.inkSoft);
    return g;
  };
  // The forest's own shape: roots and bark, a suggestion of a face, never a portrait.
  A.spirit = function (p, x, y, s = 1, o = {}) {
    const outer = A.g(p, { transform: `translate(${x},${y}) scale(${s})`, class: o.cls || '' });
    const f = A.g(outer, { filter: 'url(#wash)' }), l = A.g(outer, { filter: 'url(#ink)' });
    const r = A.rng(9);
    // a tall, thin, root-bodied figure that is mostly forest
    A.wash(f, `M-30,0 C-40,-80 -26,-160 -22,-230 C-20,-280 -36,-320 -20,-350 C-6,-372 14,-370 24,-350 C40,-318 22,-280 24,-230 C28,-160 42,-80 34,0 Z`, A.C.bark, 0.75);
    A.wash(f, `M-24,-340 C-60,-360 -80,-390 -70,-420 M24,-344 C60,-370 74,-396 66,-430`, 'none');
    for (const sgn of [-1, 1]) {
      A.ink(l, A.wline([[sgn * 18, -340], [sgn * 50, -366], [sgn * 70, -400], [sgn * 64, -440]], 3 + sgn, 3), 2.2, A.C.barkDark);
      A.ink(l, A.wline([[sgn * 50, -366], [sgn * 86, -372], [sgn * 104, -396]], 5 + sgn, 3), 1.6, A.C.barkDark);
      A.ink(l, A.wline([[sgn * 26, -250], [sgn * 60, -230], [sgn * 86, -196], [sgn * 96, -150]], 7 + sgn, 3), 2.4, A.C.barkDark);
    }
    for (let i = 0; i < 9; i++) A.ink(l, A.wline([[-20 + r() * 40, -10 - r() * 300], [-20 + r() * 40, -40 - r() * 300]], i, 4), 1, A.C.barkDark);
    // moss and small leaves
    for (let i = 0; i < 8; i++) A.wash(f, A.blob(-22 + r() * 44, -40 - r() * 300, 10, 6, i + 30, 0.3), A.C.moss, 0.7);
    // two knots where eyes would be, and a faint light in them
    const face = A.g(outer, { class: 'spirit-eyes' });
    A.el('circle', { cx: -8, cy: -318, r: 9, fill: 'url(#emberglow)', opacity: 0.5 }, face);
    A.el('circle', { cx: 10, cy: -316, r: 9, fill: 'url(#emberglow)', opacity: 0.5 }, face);
    A.dot(face, -8, -318, 2.4, '#3a2c20');
    A.dot(face, 10, -316, 2.4, '#3a2c20');
    return outer;
  };
  A.ember = function (p, x, y, s = 1, cls) {
    const g = A.g(p, { class: cls || 'ember' });
    A.el('circle', { cx: x, cy: y, r: 34 * s, fill: 'url(#emberglow)', class: 'flicker' }, g);
    A.el('circle', { cx: x, cy: y, r: 6 * s, fill: '#ffd58c' }, g);
    return g;
  };
  A.berry = function (p, x, y, s = 1, col) {
    const g = A.g(p, { filter: 'url(#wash)' });
    A.wash(g, A.blob(x, y, 9 * s, 9 * s, x + y, 0.08), col || A.C.berry, 0.95);
    A.dot(g, x - 3 * s, y - 3 * s, 2 * s, '#ffffff', 0.5);
    return g;
  };
  // A sparkle used to hint at things you can touch.
  A.sparkle = function (p, x, y, s = 1) {
    const g = A.g(p, { class: 'sparkle', transform: `translate(${x},${y}) scale(${s})` });
    A.el('path', { d: 'M0,-14 L3,-3 L14,0 L3,3 L0,14 L-3,3 L-14,0 L-3,-3 Z', fill: '#fff7da', stroke: '#c8a75c', 'stroke-width': 1 }, g);
    return g;
  };

  window.ART = A;
})();
