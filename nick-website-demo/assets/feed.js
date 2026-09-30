// feed.js — the landing page: one card per post, newest first.
//
// Same shape as /blog on this site: date, title, subtitle, a few lines of the
// opening. The cards are real links, so they work before this script runs and
// keep working for anything that does not run scripts at all.
//
// This is plain DOM on purpose. The typographic profiles are for reading a
// post; choosing one to read is a job for ordinary flowing text that is
// selectable, searchable, and instant.

import { formatDate } from './md.js';

const squash = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// The card blurb, already worked out by whichever source the post came from —
// the opening prose, never a pull quote or a sign-off.
//
// A newsletter subtitle is often lifted from the opening line ("Dear Reader,"),
// which would print the same words twice on one card. Drop the blurb when the
// subtitle has already said it.
function excerptOf(post) {
  const sub = squash(post.subtitle);
  const ex = squash(post.excerpt);
  if (!ex) return '';
  if (sub && (ex === sub || sub.startsWith(ex) || ex.startsWith(sub))) return '';
  return post.excerpt;
}

function card(post) {
  const a = document.createElement('a');
  a.className = 'post-card';
  a.href = '?post=' + encodeURIComponent(post.slug);

  const date = document.createElement('div');
  date.className = 'date';
  date.textContent = formatDate(post.date);
  // Which pipeline this card came down. Both are live at once, and without
  // this there is no way to see that from the outside.
  if (post.origin === 'substack') {
    const tag = document.createElement('span');
    tag.className = 'origin';
    tag.textContent = 'via Substack';
    date.appendChild(tag);
  }

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  a.appendChild(date);
  a.appendChild(h2);

  if (post.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = post.subtitle;
    a.appendChild(sub);
  }

  const ex = excerptOf(post);
  if (ex) {
    const p = document.createElement('div');
    p.className = 'excerpt';
    p.textContent = ex;
    a.appendChild(p);
  }

  return a;
}

// `onOpen` gets the post instead of the browser, so opening one does not
// reload the page and throw away the type engine we just finished loading.
// Where the QR code points, and what it says underneath. The code itself is a
// committed file drawn by tools/make-qr.py — nothing generates one at runtime
// and no library is loaded to show one, so this stays a folder of static files.
// It is deliberately the live address rather than location.href: the point is
// to hand someone the published site, not the localhost you happen to be on.
const SITE_URL = 'https://www.adividiardi.com/nick-website-staging/';
const SITE_LABEL = 'adividiardi.com';

export function renderFeed(host, posts, onOpen, opts = {}) {
  const { search, controls = true } = opts;
  host.innerHTML = '';

  const head = document.createElement('header');
  head.className = 'feed-head';
  head.innerHTML =
    '<div class="feed-intro">' +
      '<h1>TBH Press</h1>' +
      '<p class="feed-note">Words from the edge of your algorithm. ' +
      'Pick a post — each one opens in the reading style it was set in' +
      (controls ? ', and you can switch between all nine from the panel at the top.' : '.') + '</p>' +
    '</div>' +
    // Not a link. Following it would do nothing useful — on the published site
    // it reloads the page you are on, and while previewing locally it throws
    // you out to production — so the code is a thing to point a camera at and
    // the caption below it is the address to type or copy by hand.
    '<div class="feed-qr">' +
      '<img src="assets/qr-site.svg" alt="QR code for ' + SITE_URL + '"' +
           ' width="123" height="123">' +
      '<span><b>Scan to open</b>' + SITE_LABEL + '</span>' +
    '</div>';
  host.appendChild(head);

  if (!posts.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.innerHTML = '<div class="icon">―</div><p>No posts yet.</p>';
    host.appendChild(empty);
    return;
  }

  const bar = document.createElement('div');
  bar.className = 'feed-search';
  bar.innerHTML = '<input type="search" placeholder="Search posts" aria-label="Search posts" ' +
                  'autocomplete="off" spellcheck="false" enterkeyhint="search">';
  host.appendChild(bar);
  const input = bar.firstChild;

  const list = document.createElement('div');
  list.className = 'posts';
  host.appendChild(list);

  const foot = document.createElement('p');
  foot.className = 'feed-foot';
  host.appendChild(foot);

  function draw(shown, q) {
    list.innerHTML = '';
    for (const post of shown) {
      const el = card(post);
      el.addEventListener('click', e => {
        // Leave the modified clicks alone: cmd/ctrl-click and middle-click
        // should still open a real new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onOpen(post);
      });
      list.appendChild(el);
    }
    const n = shown.length;
    foot.textContent = q
      ? (n ? n + ' post' + (n === 1 ? '' : 's') + ' matching \u201c' + q + '\u201d' : 'Nothing matches \u201c' + q + '\u201d')
      : posts.length + ' post' + (posts.length === 1 ? '' : 's');
  }

  // Instant filter over what is already on the page, then — if a Substack
  // proxy is configured — Substack's own full-text search is folded in, so a
  // word that only appears deep inside a post still finds it.
  let ticket = 0;
  input.addEventListener('input', () => {
    const q = input.value.trim();
    const mine = ++ticket;
    if (!q) { draw(posts, ''); return; }

    const words = squash(q).split(' ').filter(Boolean);
    const here = posts.filter(p => {
      const hay = squash(p.title + ' ' + p.subtitle + ' ' + p.excerpt);
      return words.every(w => hay.includes(w));
    });
    draw(here, q);

    if (!search || q.length < 2) return;
    clearTimeout(input._t);
    input._t = setTimeout(async () => {
      const found = await search(q);
      if (mine !== ticket || !found.length) return;
      const bare = u => (u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const sources = new Set(posts.map(p => bare(p.source)).filter(Boolean));
      const inList = new Set(here);
      const extra = [];
      for (const f of found) {
        // The same piece the page already has (possibly a local .md that
        // replaces it) is shown as that post, never as a second copy.
        const hit = posts.find(p => p.slug === f.slug) || (sources.has(bare(f.source)) ? null : f);
        if (hit && !inList.has(hit) && !extra.includes(hit)) extra.push(hit);
      }
      const merged = here.concat(extra).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      draw(merged, q);
    }, 300);
  });

  draw(posts, '');
}
