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

// The card blurb: the post's own `excerpt:` if it has one, otherwise the start
// of the post. Body paragraphs only — a pull quote or a sign-off is a bad
// summary of what the piece is about.
//
// A newsletter subtitle is often lifted from the opening line ("Dear Reader,"),
// which would print the same words twice on one card. Skip past any paragraph
// the subtitle already said.
function excerptOf(post) {
  if (post.doc.meta.excerpt) return post.doc.meta.excerpt;
  const sub = squash(post.doc.meta.subtitle);
  for (const b of post.doc.blocks) {
    if (b.type !== 'p') continue;
    const t = squash(b.text);
    if (sub && (t === sub || sub.startsWith(t) || t.startsWith(sub))) continue;
    return b.text;
  }
  return '';
}

function card(post) {
  const a = document.createElement('a');
  a.className = 'post-card';
  a.href = '?post=' + encodeURIComponent(post.slug);

  const date = document.createElement('div');
  date.className = 'date';
  date.textContent = formatDate(post.date);

  const h2 = document.createElement('h2');
  h2.textContent = post.title;

  a.appendChild(date);
  a.appendChild(h2);

  if (post.doc.meta.subtitle) {
    const sub = document.createElement('div');
    sub.className = 'subtitle';
    sub.textContent = post.doc.meta.subtitle;
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
export function renderFeed(host, posts, onOpen) {
  host.innerHTML = '';

  const head = document.createElement('header');
  head.className = 'feed-head';
  head.innerHTML =
    '<h1>TBH Press</h1>' +
    '<p class="feed-note">Words from the edge of your algorithm. ' +
    'Pick a post — each one opens in one of four reading styles, and you can ' +
    'switch between them from the panel at the top.</p>';
  host.appendChild(head);

  if (!posts.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.innerHTML = '<div class="icon">―</div><p>No posts yet.</p>';
    host.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'posts';
  for (const post of posts) {
    const el = card(post);
    el.addEventListener('click', e => {
      // Leave the modified clicks alone: cmd/ctrl-click and middle-click should
      // still open a real new tab.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      onOpen(post);
    });
    list.appendChild(el);
  }
  host.appendChild(list);

  const foot = document.createElement('p');
  foot.className = 'feed-foot';
  foot.textContent = posts.length + ' post' + (posts.length === 1 ? '' : 's');
  host.appendChild(foot);
}
