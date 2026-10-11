// foundry.js — Profile 2
//
// The control group. Real flowing DOM text, zero motion, selectable, indexable,
// works with a screen reader and with JS-lite browsers.
//
// Pretext still earns its place here, just quietly: it binary-searches the
// narrowest width that keeps a headline at the same line count, so titles come
// out balanced instead of dropping a single orphan word onto line two. That is
// a measurement the DOM cannot give you without laying the text out repeatedly.

import { styleFor, fontString, baseSize, measureWidth, balancedWidth, FAMILY } from '../typeset.js';

const TAG = { title: 'h1', subtitle: 'p', meta: 'p', h1: 'h2', h2: 'h3', h3: 'h4', p: 'p', note: 'p', blockquote: 'blockquote' };

export default {
  id: 'foundry',
  name: 'Foundry',
  blurb: 'No motion. Flowing, selectable text with Pretext-balanced headlines.',
  params: [
    { key: 'balance', label: 'Balance headlines', type: 'bool', value: true },
    { key: 'measure', label: 'Line measure', type: 'range', min: 0.7, max: 1.15, step: 0.01, value: 1 }
  ],

  create(host) {
    const article = document.createElement('article');
    article.className = 'foundry';
    host.appendChild(article);

    const P = {};
    for (const p of this.params) P[p.key] = p.value;

    let lastCtx = null;

    function render() {
      if (!lastCtx) return;
      const { doc, viewport } = lastCtx;
      const base = baseSize(viewport.vw);
      const width = measureWidth(viewport.vw) * P.measure;
      article.style.width = Math.round(width) + 'px';
      article.style.fontFamily = FAMILY;
      article.innerHTML = '';

      for (const b of doc.blocks) {
        if (b.type === 'hr') {
          const hr = document.createElement('hr');
          article.appendChild(hr);
          continue;
        }
        if (b.type === 'image') {
          if (b.broken || !b.iw) continue;
          const im = document.createElement('img');
          im.className = 'fy-img';
          im.src = b.src;
          im.alt = b.text || '';
          // Intrinsic size gives the browser the aspect ratio up front, so the
          // text below does not jump when the file arrives.
          im.width = b.iw; im.height = b.ih;
          im.loading = 'lazy'; im.decoding = 'async';
          const ist = styleFor('image');
          im.style.marginTop = (base * ist.mt).toFixed(1) + 'px';
          im.style.marginBottom = (base * ist.mb).toFixed(1) + 'px';
          article.appendChild(im);
          continue;
        }
        const st = styleFor(b.type);
        const el = document.createElement(TAG[b.type] || 'p');
        el.textContent = b.text;
        el.className = 'fy fy-' + b.type;
        const size = base * st.size;
        el.style.fontSize = size.toFixed(2) + 'px';
        el.style.lineHeight = (size * st.lh).toFixed(2) + 'px';
        el.style.fontWeight = String(st.weight);
        el.style.fontStyle = st.italic ? 'italic' : 'normal';
        el.style.textAlign = st.align;
        el.style.marginTop = (size * st.mt).toFixed(1) + 'px';
        el.style.marginBottom = (size * st.mb).toFixed(1) + 'px';
        if (st.indent) el.style.paddingLeft = (size * st.indent).toFixed(1) + 'px';


        if (P.balance && (b.type === 'title' || b.type === 'h1' || b.type === 'subtitle')) {
          const font = fontString(size, st.weight, st.italic);
          const w = balancedWidth(b.text, font, width);
          // +1px guards against sub-pixel rounding pushing a wrap.
          el.style.maxWidth = Math.ceil(w + 1) + 'px';
          el.style.marginLeft = 'auto';
          el.style.marginRight = 'auto';
        }
        article.appendChild(el);
      }
      // The page ends at the last line, not at the margin after it, so that
      // scrolled to the bottom the last line sits at the middle of the screen.
      if (article.lastElementChild) article.lastElementChild.style.marginBottom = '0';
    }

    return {
      params: P,
      setParam(k, v) { P[k] = v; render(); },
      topPad() { return 26; },
      setLayout(layout, viewport, pad, doc) {
        lastCtx = { doc, viewport };
        article.style.top = pad.top + 'px';
        render();
      },
      contentHeight() { return article.offsetHeight; },

      frame() {},
      destroy() { article.remove(); }
    };
  }
};
