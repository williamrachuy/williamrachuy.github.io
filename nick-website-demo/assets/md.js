// md.js — deliberately small markdown reader.
// Produces a flat block list; no inline markup tree (see NOTE at bottom).

const FM_DELIM = /^---\s*$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// `date: 2026-05-18` is the format that sorts correctly and the one an author
// can type without thinking. It is not the one to read on the page.
// Anything that is not a plain ISO date is passed through as written.
export function formatDate(raw) {
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw;
  // Midday, so the date does not slide backwards a day west of UTC.
  const d = new Date(raw.trim() + 'T12:00:00');
  if (isNaN(d)) return raw;
  return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function parseFrontMatter(lines) {
  const meta = {};
  if (!lines.length || !FM_DELIM.test(lines[0])) return { meta, body: lines };
  let i = 1;
  for (; i < lines.length; i++) {
    if (FM_DELIM.test(lines[i])) { i++; break; }
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: lines.slice(i) };
}

// Strip inline markers down to plain text. We keep the characters, drop the syntax.
function flatten(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')      // images -> alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links  -> label
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// A paragraph wrapped entirely in a single pair of asterisks is treated as an
// italic "note" block. That covers editorial preambles and sign-offs, which is
// the only place this corpus uses emphasis at block scale.
function wholeBlockItalic(s) {
  const t = s.trim();
  return t.length > 2 && t.startsWith('*') && t.endsWith('*') && !t.startsWith('**')
    && t.slice(1, -1).indexOf('*') === -1;
}

export function parseDocument(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const { meta, body } = parseFrontMatter(lines);

  const blocks = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const raw = para.join(' ');
    para = [];
    if (wholeBlockItalic(raw)) blocks.push({ type: 'note', text: flatten(raw) });
    else blocks.push({ type: 'p', text: flatten(raw) });
  };

  for (const line of body) {
    const t = line.trim();
    if (!t) { flushPara(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); blocks.push({ type: 'hr', text: '' }); continue; }
    // A line that is nothing but an image is a figure. An image inside a
    // sentence stays flattened to its alt text, same as inline emphasis.
    const img = /^!\[([^\]]*)\]\(\s*(\S+?)\s*\)$/.exec(t);
    if (img) {
      flushPara();
      blocks.push({ type: 'image', text: img[1].trim(), src: img[2] });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { flushPara(); blocks.push({ type: 'h' + Math.min(3, h[1].length), text: flatten(h[2]) }); continue; }
    if (/^>\s?/.test(t)) {
      flushPara();
      blocks.push({ type: 'blockquote', text: flatten(t.replace(/^>\s?/, '')) });
      continue;
    }
    para.push(t);
  }
  flushPara();

  // Title / subtitle / byline come from front matter so the renderer can give
  // them their own type scale instead of guessing from the first heading.
  const head = [];
  if (meta.title) head.push({ type: 'title', text: meta.title });
  if (meta.subtitle) head.push({ type: 'subtitle', text: meta.subtitle });
  const bylineBits = [meta.author, meta.publication, formatDate(meta.date)].filter(Boolean);
  if (bylineBits.length) head.push({ type: 'meta', text: bylineBits.join('  ·  ') });

  // An image with no alt text is still a block; its emptiness is not a reason
  // to drop it the way an empty paragraph would be.
  const keep = b => b.text || b.type === 'hr' || b.type === 'image';
  return { meta, blocks: head.concat(blocks.filter(keep)) };
}

// NOTE / known gap: inline emphasis mid-sentence is flattened, not styled.
// Styling it correctly means measuring mixed fonts on one line, which is what
// `@chenglou/pretext/rich-inline` exists for. Wiring that in is the natural
// next step; faking it with per-run wrapping would produce wrong line breaks.
