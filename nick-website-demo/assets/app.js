// app.js — orchestration.
//
// Two views. The feed is the landing page, a card per post; a post is the
// reading experience. `?post=` in the URL is the only difference between them,
// so every view is a real address you can link to, bookmark, or reload.
//
// Responsibilities, kept deliberately narrow:
//   1. load a markdown post + the Pretext engine
//   2. typeset once per width change
//   3. own the scroll spacer and the rAF clock
//   4. mount exactly one profile at a time and feed it frames
//   5. render the demo control panel from each profile's declared params
//
// Profiles know nothing about markdown, scrolling, or the control panel.

import { typeset, loadEngine, engineName } from './typeset.js';
import { discoverPosts, findPost, ensureDoc } from './posts.js';
import { renderFeed } from './feed.js';
import { resolveImages } from './images.js';

import tidewater from './profiles/tidewater.js';
import foundry from './profiles/foundry.js';
import lantern from './profiles/lantern.js';
import ledger from './profiles/ledger.js';

const PROFILES = [tidewater, lantern, ledger, foundry];
const byId = Object.fromEntries(PROFILES.map(p => [p.id, p]));

const stage = document.getElementById('stage');
const spacer = document.getElementById('spacer');
const srOnly = document.getElementById('reader-text');
const panel = document.getElementById('panel');
const statusEl = document.getElementById('engine-status');
const feedEl = document.getElementById('feed');
const backEl = document.getElementById('back-to-feed');
const controlsEl = document.getElementById('controls');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  doc: null,
  layout: null,
  profile: null,
  inst: null,
  pad: { top: 0, bottom: 0 },
  vw: 0, vh: 0, dpr: 1,
  scrollY: 0,
  running: false
};

// ---------------------------------------------------------------- viewport

function readViewport() {
  const vw = document.documentElement.clientWidth || window.innerWidth;
  // Lock height at the larger of the two so the iOS URL-bar collapse does not
  // retypeset mid-scroll. Layout only depends on width anyway.
  const vh = window.innerHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  return { vw, vh, dpr };
}

// ----------------------------------------------------------------- loading

// Posts arrive from posts.js already fetched and parsed — the listing has to
// read every post's front matter to know its title and date anyway, so there is
// nothing left to load when the reader switches between them.

// ------------------------------------------------------- accessible mirror

function renderReaderText(doc) {
  srOnly.innerHTML = '';
  for (const b of doc.blocks) {
    if (b.type === 'hr') { srOnly.appendChild(document.createElement('hr')); continue; }
    if (b.type === 'image') {
      if (b.broken) continue;
      // The canvas profiles draw pictures with no text alternative of their
      // own, so this mirror is the only one a screen reader ever gets.
      const im = document.createElement('img');
      im.src = b.src;
      im.alt = b.text || '';
      srOnly.appendChild(im);
      continue;
    }
    const tag = b.type === 'title' ? 'h1' : b.type.startsWith('h') ? 'h2' : 'p';
    const el = document.createElement(tag);
    el.textContent = b.text;
    srOnly.appendChild(el);
  }
  if (doc.meta.source) {
    const a = document.createElement('a');
    a.href = doc.meta.source;
    a.textContent = 'Original post';
    srOnly.appendChild(a);
  }
}

// ------------------------------------------------------------- mount cycle

function relayout() {
  const { vw, vh, dpr } = readViewport();
  state.vw = vw; state.vh = vh; state.dpr = dpr;
  state.layout = typeset(state.doc, vw, vh);

  const viewport = { vw, vh, dpr };
  const inst = state.inst;
  state.pad.top = inst.topPad ? inst.topPad(viewport) : vh * 0.3;
  state.pad.bottom = inst.bottomPad ? inst.bottomPad(viewport) : vh * 0.5;

  inst.setLayout(state.layout, viewport, state.pad, state.doc);

  const contentH = inst.contentHeight ? inst.contentHeight() : state.layout.height;
  spacer.style.height = Math.round(state.pad.top + contentH + state.pad.bottom) + 'px';
}

function mountProfile(id, keepScroll) {
  const prof = byId[id] || PROFILES[0];
  const prevRatio = keepScroll && spacer.offsetHeight
    ? window.scrollY / spacer.offsetHeight : 0;

  if (state.inst) state.inst.destroy();
  state.profile = prof;
  state.inst = prof.create(stage);
  document.body.dataset.profile = prof.id;
  relayout();
  buildControls();

  if (keepScroll) window.scrollTo(0, Math.round(prevRatio * spacer.offsetHeight));
}

// ------------------------------------------------------------ control panel

let postList = [];
let currentPost = '';

function buildControls() {
  panel.innerHTML = '';

  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const p of PROFILES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (p.id === state.profile.id ? ' on' : '');
    b.textContent = p.name;
    b.addEventListener('click', () => mountProfile(p.id, true));
    chips.appendChild(b);
  }
  panel.appendChild(chips);

  const blurb = document.createElement('p');
  blurb.className = 'blurb';
  blurb.textContent = state.profile.blurb;
  panel.appendChild(blurb);

  if (postList.length > 1) {
    const row = document.createElement('label');
    row.className = 'ctl';
    row.innerHTML = '<span>Post</span>';
    const sel = document.createElement('select');
    for (const p of postList) {
      const o = document.createElement('option');
      o.value = p.file;
      o.textContent = p.date ? p.title + '  ·  ' + p.date : p.title;
      if (p.file === currentPost) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => switchPost(sel.value));
    row.appendChild(sel);
    panel.appendChild(row);
  }

  const inst = state.inst;
  for (const p of state.profile.params) {
    const row = document.createElement('label');
    row.className = 'ctl';
    const name = document.createElement('span');
    name.textContent = p.label;
    row.appendChild(name);

    if (p.type === 'range') {
      const i = document.createElement('input');
      i.type = 'range'; i.min = p.min; i.max = p.max; i.step = p.step;
      i.value = inst.params[p.key];
      const out = document.createElement('em');
      out.textContent = (+i.value).toFixed(2).replace(/\.00$/, '');
      i.addEventListener('input', () => {
        inst.setParam(p.key, +i.value);
        out.textContent = (+i.value).toFixed(2).replace(/\.00$/, '');
      });
      row.appendChild(i); row.appendChild(out);
    } else if (p.type === 'bool') {
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.checked = !!inst.params[p.key];
      i.addEventListener('change', () => inst.setParam(p.key, i.checked));
      row.appendChild(i);
    } else if (p.type === 'enum') {
      const s = document.createElement('select');
      for (const o of p.options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        if (inst.params[p.key] === o) opt.selected = true;
        s.appendChild(opt);
      }
      s.addEventListener('change', () => inst.setParam(p.key, s.value));
      row.appendChild(s);
    }
    panel.appendChild(row);
  }

  const foot = document.createElement('p');
  foot.className = 'foot';
  foot.textContent = engineName() === 'pretext'
    ? 'Line breaking: @chenglou/pretext (canvas metrics, no DOM reflow).'
    : 'Line breaking: local greedy fallback — Pretext did not load.';
  panel.appendChild(foot);
}

// Tidewater tells the panel when the lens was dragged.
stage.addEventListener('paramsync', e => {
  const row = panel.querySelector('.ctl input[type=range]');
  if (row && e.detail.lensY != null && state.profile.id === 'tidewater') {
    // The lens slider is the second range in Tidewater's list.
    const ranges = panel.querySelectorAll('.ctl input[type=range]');
    if (ranges[0]) {
      ranges[0].value = e.detail.lensY;
      const em = ranges[0].parentElement.querySelector('em');
      if (em) em.textContent = e.detail.lensY.toFixed(2);
    }
  }
});

// --------------------------------------------------------------- routing

const SITE_TITLE = 'TBH Press — reading profiles';

// Everything the reader view owns, torn down. A profile holds a canvas and a
// few thousand glyph positions; leaving one mounted behind the feed would keep
// the rAF clock warm for a view that never animates.
function teardownReader() {
  state.running = false;
  if (state.inst) { state.inst.destroy(); state.inst = null; }
  state.profile = null;
  state.doc = null;
  srOnly.innerHTML = '';
  spacer.style.height = '0px';
  delete document.body.dataset.profile;
}

function showFeed(push) {
  teardownReader();
  controlsEl.hidden = true;
  controlsEl.classList.remove('open');
  document.getElementById('panel-toggle').setAttribute('aria-expanded', 'false');
  backEl.hidden = true;
  feedEl.hidden = false;
  document.title = SITE_TITLE;
  renderFeed(feedEl, postList, post => showPost(post, true));
  window.scrollTo(0, 0);
  if (push) history.pushState({ view: 'feed' }, '', './');
}

// Guards against a reader tapping through several posts faster than their
// pictures arrive: only the newest request is allowed to mount.
let openToken = 0;

async function showPost(post, push, forceProfile) {
  if (!post) return;
  const token = ++openToken;

  feedEl.hidden = true;
  feedEl.innerHTML = '';
  controlsEl.hidden = false;
  backEl.hidden = false;

  currentPost = post.file;
  document.title = (post.title || 'Demo') + ' — TBH Press';
  window.scrollTo(0, 0);

  // The address is correct before the post is, so a reload during the wait
  // lands back on the same one.
  const slugUrl = '?post=' + encodeURIComponent(post.slug);
  if (push) history.pushState({ view: 'post', slug: post.slug }, '', slugUrl);

  // A local post already carries its text. One from the Substack snapshot is
  // metadata until here, and fetches its body now.
  const bootEl = document.getElementById('boot');
  if (!post.doc) { bootEl.textContent = 'Setting the type…'; bootEl.hidden = false; }
  try {
    state.doc = await ensureDoc(post);
  } catch (err) {
    if (token !== openToken) return;
    bootEl.hidden = true;
    document.getElementById('fatal').hidden = false;
    document.getElementById('fatal').textContent = err.message;
    return;
  }
  if (token !== openToken) return;
  renderReaderText(state.doc);

  // Every picture has to be measured before the first typeset, or the text
  // below one would jump when it lands. Cached after the first visit, so this
  // only ever costs on the way in.
  const pending = state.doc.blocks.some(b => b.type === 'image' && !b.img && !b.broken);
  if (pending) { bootEl.textContent = 'Developing the pictures…'; bootEl.hidden = false; }
  const { late } = await resolveImages(state.doc);
  if (token !== openToken) return;          // reader moved on; abandon this one
  bootEl.hidden = true;

  // ?profile= in the address wins over the post's own preference, so a given
  // rendering of a given post stays shareable as one link.
  const declared = (forceProfile && byId[forceProfile]) ? forceProfile : state.doc.meta.profile;
  const wanted = byId[declared] ? declared : (state.profile ? state.profile.id : 'tidewater');
  mountProfile(reduced ? 'foundry' : wanted, false);

  const url = slugUrl + '&profile=' + state.profile.id;
  history.replaceState({ view: 'post', slug: post.slug }, '', url);

  if (!state.running) { state.running = true; last = 0; requestAnimationFrame(tick); }

  // A picture too slow for the first paint gets one re-layout when it arrives,
  // holding the reader's place in the post rather than their pixel offset.
  if (late) late.then(changed => {
    if (!changed || token !== openToken || !state.inst) return;
    const ratio = spacer.offsetHeight ? window.scrollY / spacer.offsetHeight : 0;
    relayout();
    window.scrollTo(0, Math.round(ratio * spacer.offsetHeight));
  });
}

// Switching posts from the control panel replaces rather than stacks — the
// back button should return to the feed, not walk back through every post the
// reader sampled.
function switchPost(file) {
  showPost(findPost(postList, file), false);
}

// The address bar is the state, so back/forward just re-read it.
window.addEventListener('popstate', () => {
  const qs = new URLSearchParams(location.search);
  const post = findPost(postList, qs.get('post'));
  if (post) showPost(post, false, qs.get('profile')); else showFeed(false);
});

backEl.addEventListener('click', e => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  showFeed(true);
});

// ------------------------------------------------------------------- clock

let last = 0;
function tick(now) {
  if (!state.running) return;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  state.scrollY = y;
  if (state.inst) state.inst.frame(now, dt, y);
  requestAnimationFrame(tick);
}

window.addEventListener('scroll', () => {
  state.scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  if (!state.inst) return;
  // On a phone the panel eats most of the screen. Scrolling means you are done
  // with it.
  const shell = document.getElementById('controls');
  if (shell.classList.contains('open') && Math.abs(state.scrollY - panelOpenedAt) > 90) {
    shell.classList.remove('open');
    document.getElementById('panel-toggle').setAttribute('aria-expanded', 'false');
  }
}, { passive: true });

let panelOpenedAt = 0;

let resizeTimer = 0;
let lastW = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!state.inst) return;               // the feed reflows on its own
    const { vw } = readViewport();
    // Height-only changes are the mobile URL bar. Ignore them.
    if (Math.abs(vw - lastW) < 2) return;
    lastW = vw;
    const ratio = spacer.offsetHeight ? window.scrollY / spacer.offsetHeight : 0;
    relayout();
    window.scrollTo(0, Math.round(ratio * spacer.offsetHeight));
  }, 140);
});

// ------------------------------------------------------------------- boot

(async function boot() {
  // Finding the posts and loading the type engine are independent, so they
  // overlap. Discovery costs a directory listing the reader never waits on
  // alone.
  const postsReady = discoverPosts();

  await loadEngine();
  statusEl.textContent = engineName() === 'pretext' ? 'pretext' : 'fallback';
  statusEl.dataset.mode = engineName();

  // Fonts must be resolved before we measure anything.
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }

  postList = await postsReady;

  document.getElementById('boot').hidden = true;

  if (!postList.length) {
    document.getElementById('fatal').hidden = false;
    document.getElementById('fatal').textContent =
      'No posts found in posts/. Add a .md file there — if you opened this page ' +
      'directly from disk, serve it instead (python3 -m http.server).';
    return;
  }

  lastW = readViewport().vw;

  // ?post= opens that post; anything else is the feed.
  const qs = new URLSearchParams(location.search);
  const post = findPost(postList, qs.get('post'));
  if (!post) { showFeed(false); return; }

  showPost(post, false, qs.get('profile'));
})();

// --------------------------------------------------------------- panel UI

const toggle = document.getElementById('panel-toggle');
const shell = document.getElementById('controls');
toggle.addEventListener('click', () => {
  const open = shell.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  panelOpenedAt = window.scrollY || 0;
});
