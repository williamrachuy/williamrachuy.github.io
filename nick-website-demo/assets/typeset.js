// typeset.js
//
// The whole demo hangs off this file. Pretext (@chenglou/pretext) does the part
// that is genuinely hard and genuinely expensive in a browser: deciding where
// lines break and how wide each resulting line is, using canvas font metrics
// instead of DOM reads. No getBoundingClientRect, no reflow, so we can
// re-typeset on rotate/resize without the scroll position lurching.
//
// Pretext hands back lines. It does not hand back per-character x offsets,
// because that is a renderer concern. We derive those here with incremental
// canvas measureText over the line Pretext already committed to, which keeps
// the glyph positions consistent with Pretext's own line widths.

const PRETEXT_CDN = 'https://esm.sh/@chenglou/pretext@0.0.9';

// A blocked CDN usually stalls rather than failing outright, and a hung import
// never rejects — so the catch below would never fire and the page would sit on
// "Setting the type…" forever. Give up and take the fallback instead.
const CDN_TIMEOUT_MS = 6000;

export const FAMILY = 'Cambria, Georgia, "Times New Roman", serif';

let PT = null;          // pretext module, or null if we fell back
let ptStatus = 'idle';  // 'pretext' | 'fallback'

export function engineName() { return ptStatus; }

export async function loadEngine() {
  if (ptStatus !== 'idle') return ptStatus;
  try {
    if (typeof Intl.Segmenter !== 'function') throw new Error('no Intl.Segmenter');
    PT = await Promise.race([
      import(/* @vite-ignore */ PRETEXT_CDN),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error('CDN timed out after ' + CDN_TIMEOUT_MS + 'ms')), CDN_TIMEOUT_MS))
    ]);
    if (typeof PT.prepareWithSegments !== 'function') throw new Error('bad module');
    ptStatus = 'pretext';
  } catch (err) {
    console.warn('[typeset] Pretext unavailable, using greedy fallback:', err && err.message);
    PT = null;
    ptStatus = 'fallback';
  }
  return ptStatus;
}

// ---------------------------------------------------------------- type scale

// mt/mb are in em of the block's own size, so the scale stays proportional.
const STYLE = {
  title:      { size: 1.50, weight: 600, italic: false, lh: 1.16, align: 'center', mt: 0.0,  mb: 0.34 },
  subtitle:   { size: 1.00, weight: 400, italic: true,  lh: 1.42, align: 'center', mt: 0.0,  mb: 0.70 },
  meta:       { size: 0.72, weight: 400, italic: false, lh: 1.40, align: 'center', mt: 0.0,  mb: 1.90 },
  h1:         { size: 1.38, weight: 600, italic: false, lh: 1.22, align: 'left',   mt: 1.10, mb: 0.42 },
  h2:         { size: 1.16, weight: 600, italic: false, lh: 1.28, align: 'left',   mt: 1.20, mb: 0.44 },
  h3:         { size: 1.02, weight: 600, italic: false, lh: 1.34, align: 'left',   mt: 1.10, mb: 0.40 },
  p:          { size: 1.00, weight: 400, italic: false, lh: 1.62, align: 'left',   mt: 0.0,  mb: 1.02 },
  note:       { size: 0.96, weight: 400, italic: true,  lh: 1.58, align: 'left',   mt: 0.0,  mb: 1.02 },
  blockquote: { size: 0.98, weight: 400, italic: true,  lh: 1.54, align: 'left',   mt: 0.35, mb: 1.05, indent: 0.9 },
  hr:         { size: 1.00, weight: 400, italic: false, lh: 1.00, align: 'center', mt: 1.05, mb: 1.35 }
};

export function styleFor(type) { return STYLE[type] || STYLE.p; }

export function fontString(px, weight, italic) {
  return `${italic ? 'italic ' : ''}${weight} ${px}px ${FAMILY}`;
}

// Base body size scales gently with the viewport. Clamped so a 320px phone
// stays readable and a tablet does not turn into billboard text.
export function baseSize(viewportW) {
  return Math.max(16.5, Math.min(21, 15.2 + viewportW * 0.0115));
}

export function measureWidth(viewportW) {
  const gutter = viewportW < 420 ? 26 : 32;
  return Math.min(660, viewportW - gutter * 2);
}

// ------------------------------------------------------------- measuring ctx

let mctx = null;
function ctx2d() {
  if (!mctx) {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    mctx = c.getContext('2d');
  }
  return mctx;
}

let segmenter = null;
function graphemes(s) {
  if (typeof Intl.Segmenter === 'function') {
    if (!segmenter) segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const out = [];
    for (const g of segmenter.segment(s)) out.push(g.segment);
    return out;
  }
  return Array.from(s);
}

// Font vertical metrics, cached per font string, so canvas baselines and DOM
// line boxes land on the same pixel.
const vmCache = new Map();
function verticalMetrics(font, size) {
  let vm = vmCache.get(font);
  if (vm) return vm;
  const c = ctx2d();
  c.font = font;
  const m = c.measureText('Hxgjp');
  const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || size * 0.80;
  const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || size * 0.22;
  vm = { asc, desc };
  vmCache.set(font, vm);
  return vm;
}

// ------------------------------------------------------------- line breaking

function breakLinesFallback(text, font, maxWidth) {
  const c = ctx2d();
  c.font = font;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (c.measureText(test).width <= maxWidth || !cur) cur = test;
    else { lines.push({ text: cur, width: c.measureText(cur).width }); cur = w; }
  }
  if (cur) lines.push({ text: cur, width: c.measureText(cur).width });
  return lines;
}

function breakLines(text, font, maxWidth, lineHeight) {
  if (PT) {
    const prepared = PT.prepareWithSegments(text, font);
    const { lines } = PT.layoutWithLines(prepared, maxWidth, lineHeight);
    return lines.map(l => ({ text: l.text, width: l.width }));
  }
  return breakLinesFallback(text, font, maxWidth);
}

// Pretext extra: the tightest width that still produces the same line count.
// Used to balance headlines instead of letting one orphan word hang.
export function balancedWidth(text, font, maxWidth) {
  if (!PT) return maxWidth;
  const prepared = PT.prepareWithSegments(text, font);
  const target = PT.measureLineStats(prepared, maxWidth).lineCount;
  if (target <= 1) return PT.measureLineStats(prepared, maxWidth).maxLineWidth;
  let lo = 40, hi = maxWidth;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (PT.measureLineStats(prepared, mid).lineCount <= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ------------------------------------------------------------------ typeset

/**
 * @returns {{ width, base, height, blocks: Block[], glyphs: GlyphSet }}
 * Block  = { type, align, x, top, lineHeight, font, size, italic, weight,
 *            lines: [{ text, width, top, baseline, x }] }
 * GlyphSet is a struct-of-arrays. Canvas profiles iterate it directly; DOM
 * profiles ignore it and use block.lines.
 */
export function typeset(doc, viewportW) {
  const base = baseSize(viewportW);
  const width = measureWidth(viewportW);
  const left = Math.round((viewportW - width) / 2);

  const blocks = [];
  let y = 0;
  let prevMb = 0;

  for (const b of doc.blocks) {
    const st = styleFor(b.type);
    const size = Math.round(base * st.size * 100) / 100;
    const lh = Math.round(size * st.lh * 100) / 100;
    const font = fontString(size, st.weight, st.italic);
    const indent = (st.indent || 0) * size;
    const colW = width - indent;

    // Collapse adjacent margins the way CSS would.
    y += Math.max(prevMb, st.mt * size);

    if (b.type === 'hr') {
      blocks.push({ type: 'hr', align: 'center', x: left, top: y, lineHeight: 1, font, size, lines: [],
                    italic: st.italic, weight: st.weight, width });
      y += 1;
      prevMb = st.mb * size;
      continue;
    }

    // 1.5% inset: measureText widths exclude serif/italic side bearings, so a
    // line that "exactly fits" can still kiss the right edge when painted.
    const safe = colW * 0.985;
    let avail = safe;
    if (b.type === 'title' || b.type === 'h1' || b.type === 'subtitle') {
      avail = Math.max(colW * 0.5, Math.min(safe, balancedWidth(b.text, font, safe)));
    }

    const raw = breakLines(b.text, font, avail, lh);
    const vm = verticalMetrics(font, size);
    const lines = raw.map((l, i) => {
      const top = y + i * lh;
      let x = left + indent;
      if (st.align === 'center') x = left + indent + (colW - l.width) / 2;
      return {
        text: l.text,
        width: l.width,
        top,
        x,
        baseline: top + (lh - (vm.asc + vm.desc)) / 2 + vm.asc
      };
    });

    blocks.push({
      type: b.type, align: st.align, x: left + indent, top: y, width: colW,
      lineHeight: lh, font, size, italic: st.italic, weight: st.weight, lines
    });

    y += raw.length * lh;
    prevMb = st.mb * size;
  }

  const height = y + prevMb;
  return { width, left, base, height, blocks, glyphs: explode(blocks) };
}

// ---------------------------------------------------------------- glyph pass

// Per-character x offsets inside each committed line. Incremental prefix
// measurement, so kerning stays honest and the final offset matches the line
// width Pretext reported.
function explode(blocks) {
  const c = ctx2d();
  const chars = [];
  const bx = [], by = [], bsize = [], bfont = [], bline = [], bblock = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const blk = blocks[bi];
    if (!blk.lines.length) continue;
    c.font = blk.font;
    for (let li = 0; li < blk.lines.length; li++) {
      const ln = blk.lines[li];
      const gs = graphemes(ln.text);
      let prefix = '';
      let prevW = 0;
      for (let gi = 0; gi < gs.length; gi++) {
        const g = gs[gi];
        prefix += g;
        const w = c.measureText(prefix).width;
        if (!/^\s+$/.test(g)) {
          chars.push(g);
          bx.push(ln.x + prevW);
          by.push(ln.baseline);
          bsize.push(blk.size);
          bfont.push(blk.font);
          bline.push(li);
          bblock.push(bi);
        }
        prevW = w;
      }
    }
  }

  const n = chars.length;
  return {
    n,
    ch: chars,
    x: Float32Array.from(bx),
    y: Float32Array.from(by),
    size: Float32Array.from(bsize),
    font: bfont,
    line: Int32Array.from(bline),
    block: Int32Array.from(bblock)
  };
}
