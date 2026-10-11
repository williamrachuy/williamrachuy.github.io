// images.js — resolve every image in a post to real pixel dimensions before
// anything is typeset.
//
// Layout has to reserve the right amount of vertical space for a picture, and
// that depends on its aspect ratio, which is not knowable until the file has
// at least partly arrived. Guessing and correcting later would mean the text
// below every image jumping once the image lands — the exact lurch the rest of
// this demo goes out of its way to avoid.
//
// So: load first, typeset once — but only up to a point. A picture that is
// taking too long must not hold the words back, so past a short deadline the
// post is typeset without it and it slots in when it lands.
//
// Decoded images are cached, shared by all four profiles, and handed to the
// canvas ones to draw directly.

// How long a picture is given before it is written off entirely.
const LOAD_TIMEOUT_MS = 8000;

// How long the reader waits before being shown anything. Pictures that arrive
// inside this window are measured before the first typeset, which is the common
// case and the one worth optimising: no jump. Anything slower keeps loading in
// the background and slots in when it lands — one late reflow on a bad
// connection beats holding the words back for a photograph.
const FIRST_PAINT_MS = 2200;

const cache = new Map();   // src -> { img, w, h } | null (known broken)

function load(src) {
  if (cache.has(src)) return Promise.resolve(cache.get(src));

  return new Promise(resolve => {
    const img = new Image();
    let settled = false;

    const done = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cache.set(src, value);
      resolve(value);
    };

    const timer = setTimeout(() => {
      console.warn('[images] timed out, skipping: ' + src);
      done(null);
    }, LOAD_TIMEOUT_MS);

    img.onload = () => {
      // A decoded image with no dimensions is broken in a way onload does not
      // report — an SVG with no intrinsic size, mostly.
      if (!img.naturalWidth || !img.naturalHeight) { done(null); return; }
      done({ img, w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      console.warn('[images] failed to load, skipping: ' + src);
      done(null);
    };

    // Deliberately no crossOrigin: these are only ever painted, never read back
    // with getImageData, so a tainted canvas costs nothing — while asking for
    // CORS would break loading outright on any host that does not send the
    // headers.
    img.decoding = 'async';
    img.src = src;
  });
}

// Copy whatever has arrived onto the blocks themselves, so typeset() and the
// profiles stay synchronous and just read what is already there.
// Returns true if this changed anything the layout depends on.
function applyLoaded(blocks) {
  let changed = false;
  for (const b of blocks) {
    if (!cache.has(b.src)) continue;            // still in flight
    const hit = cache.get(b.src);
    if (hit) {
      if (b.img !== hit.img) { b.img = hit.img; b.iw = hit.w; b.ih = hit.h; changed = true; }
    } else if (!b.broken) {
      b.broken = true; changed = true;
    }
  }
  return changed;
}

/**
 * Waits briefly for the post's pictures, then gives up on the reader's behalf.
 *
 * @returns { late } — null when every picture is accounted for, otherwise a
 *          promise resolving to true once a straggler lands and the layout
 *          needs redoing.
 *
 * The promise is handed back inside an object deliberately. Returning it bare
 * from an async function would have the async machinery adopt it, so awaiting
 * this call would block until the slow picture arrived — precisely the wait the
 * deadline exists to avoid.
 */
export async function resolveImages(doc) {
  const blocks = doc.blocks.filter(b => b.type === 'image' && b.src);
  if (!blocks.length) return { late: null };

  const srcs = [...new Set(blocks.map(b => b.src))];
  const all = Promise.all(srcs.map(load));

  await Promise.race([all, new Promise(r => setTimeout(r, FIRST_PAINT_MS))]);
  applyLoaded(blocks);

  if (srcs.every(src => cache.has(src))) return { late: null };
  return { late: all.then(() => applyLoaded(blocks)) };
}

export function imageOf(block) {
  const hit = cache.get(block.src);
  return hit ? hit.img : null;
}
