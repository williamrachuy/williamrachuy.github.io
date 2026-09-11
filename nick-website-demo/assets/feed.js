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
export function renderFeed(host, posts, onOpen) {
  host.innerHTML = '';

  const head = document.createElement('header');
  head.className = 'feed-head';
  head.innerHTML =
    '<h1>TBH Press</h1>' +
    '<p class="feed-note">Words from the edge of your algorithm. ' +
    'Pick a post — each one opens in the reading style it was set in, and you ' +
    'can switch between all seven from the panel at the top.</p>';
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
