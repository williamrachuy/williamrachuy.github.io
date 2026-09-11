// lantern.js — Profile 3
//
// The same focus-band idea as Tidewater, one order of magnitude cheaper.
// Each line Pretext produced becomes one absolutely-positioned span at exactly
// the coordinates Pretext computed. Lines outside the band sit dim and pushed
// a few pixels off their baseline; inside the band they light up and settle.
//
// No canvas, no per-glyph physics, text still selectable. This is the version
// you ship if the audience is on five-year-old Android hardware.

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = t => t * t * (3 - 2 * t);

export default {
  id: 'lantern',
  name: 'Lantern',
  blurb: 'Lines dim until they reach the reading band, then settle and brighten.',
  params: [
    { key: 'lensY', label: 'Band position', type: 'range', min: 0.12, max: 0.82, step: 0.01, value: 0.38 },
    { key: 'lensSize', label: 'Band height', type: 'range', min: 0.06, max: 0.4, step: 0.01, value: 0.18 },
    { key: 'lift', label: 'Settle distance', type: 'range', min: 0, max: 26, step: 1, value: 12 },
    { key: 'floor', label: 'Resting brightness', type: 'range', min: 0.06, max: 0.6, step: 0.02, value: 0.18 }
  ],

  create(host) {
    const layer = document.createElement('div');
    layer.className = 'lantern';
    host.appendChild(layer);

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let items = [];   // { el, top, cur }
    let vh = 0, padTop = 0;

    return {
      params: P,
      setParam(k, v) { P[k] = v; },
      topPad(viewport) { return viewport.vh * 0.34; },
      bottomPad(viewport) { return viewport.vh * 0.5; },

      setLayout(layout, viewport, pad) {
        vh = viewport.vh; padTop = pad.top;
        layer.innerHTML = '';
        items = [];
        const frag = document.createDocumentFragment();
        for (const blk of layout.blocks) {
          if (blk.type === 'hr') {
            const rule = document.createElement('div');
            rule.className = 'lt-rule';
            rule.style.top = (blk.top + padTop) + 'px';
            rule.style.left = blk.x + 'px';
            rule.style.width = blk.width + 'px';
            frag.appendChild(rule);
            continue;
          }
          if (blk.type === 'image') {
            const im = document.createElement('img');
            im.className = 'lt-img';
            im.src = blk.src;
            im.alt = '';                 // the layer is aria-hidden; #reader-text carries the alt
            im.style.top = (blk.top + padTop) + 'px';
            im.style.left = blk.x + 'px';
            im.style.width = blk.width + 'px';
            im.style.height = blk.height + 'px';
            im.decoding = 'async';
            frag.appendChild(im);
            // A picture settles on its own centre, so a tall one is not still
            // dim at the top while its bottom edge has already passed the band.
            items.push({ el: im, top: blk.top + padTop + blk.height / 2, cur: 0, img: true });
            continue;
          }
          for (const ln of blk.lines) {
            const el = document.createElement('span');
            el.className = 'lt-line';
            el.textContent = ln.text;
            el.style.top = (ln.top + padTop) + 'px';
            el.style.left = ln.x + 'px';
            el.style.font = blk.font;
            el.style.lineHeight = blk.lineHeight + 'px';
            frag.appendChild(el);
            items.push({ el, top: ln.top + padTop + blk.lineHeight / 2, cur: 0 });
          }
        }
        layer.appendChild(frag);
      },

      frame(t, dt, scrollY) {
        const cyPx = P.lensY * vh;
        const core = Math.max(24, P.lensSize * vh);
        const fall = core * 1.8;
        const k = 1 - Math.exp(-9 * dt);
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          const sy = it.top - scrollY;
          if (sy < -160 || sy > vh + 160) {
            if (it.cur > 0.002) { it.cur = 0; apply(it, 0); }
            continue;
          }
          const d = Math.abs(sy - cyPx);
          const w = smooth(clamp01(1 - (d - core) / fall));
          it.cur += (w - it.cur) * k;
          apply(it, it.cur);
        }
      },

      destroy() { layer.remove(); }
    };

    function apply(it, w) {
      const o = P.floor + (1 - P.floor) * w;
      it.el.style.opacity = o.toFixed(3);
      it.el.style.transform = `translate3d(0, ${((1 - w) * P.lift).toFixed(2)}px, 0)`;
      if (it.img) {
        // Text goes from gold to cream; a photograph has its own colours, so it
        // comes up out of the dark instead.
        it.el.style.filter = `brightness(${(0.34 + 0.66 * w).toFixed(3)}) saturate(${(0.55 + 0.45 * w).toFixed(3)})`;
        return;
      }
      // Dim lines stay gold; lit lines go cream.
      it.el.style.color = w > 0.5
        ? `rgb(${(170 + 70 * (w - 0.5) * 2) | 0},${(143 + 89 * (w - 0.5) * 2) | 0},${(90 + 124 * (w - 0.5) * 2) | 0})`
        : `rgb(${(74 + 96 * w * 2) | 0},${(62 + 81 * w * 2) | 0},${(38 + 52 * w * 2) | 0})`;
    }
  }
};
