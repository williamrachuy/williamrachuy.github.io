// tidewater.js — Profile 1
//
// Default state: every glyph is adrift. Displaced, rotated, dark.
// A focus lens sits in the upper third of the viewport. Glyphs entering it get
// pulled back onto the line Pretext computed for them, straighten out, and
// brighten. Glyphs leaving it are released and the current takes them again.
//
// The lens is draggable. Band mode reads while you scroll; circle mode is a
// spotlight you move around with your thumb.

const CORE_DIM = [74, 62, 38];      // very dark, desaturated gold
const CORE_MID = [170, 143, 90];    // gold
const CORE_LIT = [240, 232, 214];   // warm cream (matches the site wordmark)
const BUCKETS = 28;

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

    const handle = document.createElement('div');
    handle.className = 'lens-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', 'Focus lens position');
    handle.innerHTML = '<span></span>';
    host.appendChild(handle);

    const ctx = canvas.getContext('2d', { alpha: true });

    let G = null;            // glyph set from typeset()
    let cx, cy, cr;          // live state
    let ox, oy, amp, fq, ph, rot0;
    let dpr = 1, vw = 0, vh = 0;
    let padTop = 0;
    let lensPx = { x: 0.5, y: 0.36 };
    let dragging = false;

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    function seed(n) {
      const rnd = mulberry32(0x9e3779b9 ^ n);
      cx = new Float32Array(n); cy = new Float32Array(n); cr = new Float32Array(n);
      ox = new Float32Array(n); oy = new Float32Array(n);
      amp = new Float32Array(n * 2); fq = new Float32Array(n * 3); ph = new Float32Array(n * 3);
      rot0 = new Float32Array(n);
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

    function placeHandle() {
      handle.style.top = (lensPx.y * vh) + 'px';
      handle.style.left = P.lensMode === 'circle' ? (lensPx.x * vw) + 'px' : '';
      handle.dataset.mode = P.lensMode;
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
      host.dispatchEvent(new CustomEvent('paramsync', { detail: { lensY: P.lensY } }));
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
      bottomPad(viewport) { return viewport.vh * 0.62; },

      setLayout(layout, viewport, pad) {
        G = layout.glyphs;
        vw = viewport.vw; vh = viewport.vh; dpr = viewport.dpr; padTop = pad.top;
        lensPx.y = P.lensY;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = vw + 'px';
        canvas.style.height = vh + 'px';
        seed(G.n);
        // Start everything already adrift so the first paint is not a pop-in.
        for (let i = 0; i < G.n; i++) {
          cx[i] = G.x[i] + ox[i] * P.scatter;
          cy[i] = G.y[i] + padTop + oy[i] * P.scatter;
          cr[i] = rot0[i];
        }
        placeHandle();
      },

      frame(t, dt, scrollY) {
        if (!G) return;
        const n = G.n;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textBaseline = 'alphabetic';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (P.showLens) drawLens(ctx);

        const sc = P.scatter;
        const span = Math.max(sc * 1.6, 200);
        const minY = scrollY - padTop - span;
        const maxY = scrollY - padTop + vh + span;

        // y is monotonic, so bound the working set instead of touching 4k glyphs.
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (G.y[m] < minY) lo = m + 1; else hi = m; }

        const tt = t * 0.001 * P.current;
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

          // Snapping is decisive, releasing is lazy. Frame-rate independent.
          const rate = 3.2 + 22 * w * w;
          const k = 1 - Math.exp(-rate * dt);
          cx[i] += (goalX - cx[i]) * k;
          cy[i] += (goalY - cy[i]) * k;
          cr[i] += (goalR - cr[i]) * k;

          if (cy[i] < -60 || cy[i] > vh + 60) continue;

          const bi = (w * (BUCKETS - 1)) | 0;
          const fill = RAMP[bi];
          if (fill !== curFill) { ctx.fillStyle = fill; curFill = fill; }
          const f = G.font[i];
          if (f !== curFont) { ctx.font = f; curFont = f; }

          const r = cr[i];
          if (r > -0.006 && r < 0.006) {
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
      }
    };

    function drawLens(c) {
      const y = lensPx.y * vh;
      const core = Math.max(26, P.lensSize * vh);
      if (P.lensMode === 'band') {
        const g = c.createLinearGradient(0, y - core * 2.2, 0, y + core * 2.6);
        g.addColorStop(0, 'rgba(214,186,124,0)');
        g.addColorStop(0.5, 'rgba(214,186,124,0.085)');
        g.addColorStop(1, 'rgba(214,186,124,0)');
        c.fillStyle = g;
        c.fillRect(0, y - core * 2.2, vw, core * 4.8);
      } else {
        const x = lensPx.x * vw;
        const r = Math.max(90, core * 3.1);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(214,186,124,0.13)');
        g.addColorStop(0.62, 'rgba(214,186,124,0.05)');
        g.addColorStop(1, 'rgba(214,186,124,0)');
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill();
      }
    }
  }
};
