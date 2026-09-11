// app.js — orchestration.
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
import { discoverPosts, findPost } from './posts.js';

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
  state.layout = typeset(state.doc, vw);

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

function switchPost(file) {
  const post = findPost(postList, file);
  if (!post) return;
  currentPost = post.file;
  state.doc = post.doc;
  renderReaderText(state.doc);
  document.title = (state.doc.meta.title || 'Demo') + ' — reading profiles';
  window.scrollTo(0, 0);
  const wanted = byId[state.doc.meta.profile] ? state.doc.meta.profile : state.profile.id;
  mountProfile(reduced ? 'foundry' : wanted, false);
  history.replaceState(null, '', '?post=' + encodeURIComponent(post.slug) + '&profile=' + state.profile.id);
}

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

  const qs = new URLSearchParams(location.search);
  // No ?post= means the newest one, which is what discoverPosts sorted to the
  // front. Publishing a post therefore makes it the landing page by itself.
  const post = findPost(postList, qs.get('post')) || postList[0];

  if (!post) {
    document.getElementById('boot').hidden = true;
    document.getElementById('fatal').hidden = false;
    document.getElementById('fatal').textContent =
      'No posts found in posts/. Add a .md file there — if you opened this page ' +
      'directly from disk, serve it instead (python3 -m http.server).';
    return;
  }

  currentPost = post.file;
  state.doc = post.doc;

  renderReaderText(state.doc);
  document.title = (state.doc.meta.title || 'Demo') + ' — reading profiles';

  const wanted = qs.get('profile') || state.doc.meta.profile || 'tidewater';
  lastW = readViewport().vw;
  mountProfile(reduced ? 'foundry' : (byId[wanted] ? wanted : 'tidewater'), false);
  document.getElementById('boot').hidden = true;

  state.running = true;
  requestAnimationFrame(tick);
})();

// --------------------------------------------------------------- panel UI

const toggle = document.getElementById('panel-toggle');
const shell = document.getElementById('controls');
toggle.addEventListener('click', () => {
  const open = shell.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  panelOpenedAt = window.scrollY || 0;
});
