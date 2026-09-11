// posts.js — find the posts without anyone having to maintain an index.
//
// The rule, and the only rule: a `.md` file in `posts/` is a published post.
// There is no manifest to update, no id to assign, no slug to register, and no
// directory to create. Write the file, commit it, it is live. Rename it to
// `.md.offline` and it is not. That is the whole publishing workflow, and it is
// the same one /blog on this site already uses.
//
// Two ways to get the listing, because a static host will not give you one:
//
//   1. The GitHub Contents API, which can list a directory in a public repo.
//      This is the production path.
//   2. The directory index that `python3 -m http.server` emits, scraped for
//      links. This is the local-preview path, and it means you can see exactly
//      what you are about to publish before you push it.
//
// Whichever one matches the host is tried first; the other is the fallback, so
// an unusual setup still lands on its feet.

import { parseDocument } from './md.js';

// The Substack side of the feed, written at build time by
// tools/fetch-substack.py. Substack sends no CORS headers, so the browser
// cannot read the publication directly; this is a same-origin snapshot of it.
// Absent (a plain checkout, or a build where the fetch failed) simply means the
// feed is local markdown only.
const SUBSTACK_INDEX = 'posts/substack/index.json';

// Only ever consulted if BOTH listing routes fail — a rate-limited API on a
// host with no directory index. Without it the page would have nothing at all
// to show, which is a worse answer than showing the post that ships with it.
const LAST_RESORT = 'overcoming-the-classics.md';

// A stalled request never rejects on its own. Listing is not worth more than
// this much of the reader's time; past it, take the fallback.
const LIST_TIMEOUT_MS = 5000;

// ------------------------------------------------------------------ where

// Derived from the page's own URL rather than written down, so this keeps
// working if the folder is renamed or the demo is moved somewhere else.
// `/nick-website-demo/` -> `nick-website-demo/posts`
function postsDirPath() {
  const dir = location.pathname.replace(/[^/]*$/, '');   // drop any filename
  return (dir + 'posts').replace(/^\/+/, '');
}

// owner/repo for the Contents API. A fork on someone else's github.io is
// detected from the hostname; anything else can be stated outright with
//   <meta name="github-repo" content="owner/repo">
// in index.html, which is one line and needs no knowledge of this file.
function repoInfo() {
  const tag = document.querySelector('meta[name="github-repo"]');
  if (tag && tag.content.includes('/')) {
    const [owner, repo] = tag.content.trim().split('/');
    if (owner && repo) return { owner, repo };
  }
  const parts = location.hostname.split('.');
  if (parts.length >= 3 && parts[parts.length - 2] === 'github' && parts[parts.length - 1] === 'io') {
    return { owner: parts[0], repo: parts[0] + '.github.io' };
  }
  return { owner: 'williamrachuy', repo: 'williamrachuy.github.io' };
}

function isLocalPreview() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '' || h.endsWith('.local');
}

// ----------------------------------------------------------------- listing

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms))
  ]);
}

async function listViaGitHubApi() {
  const { owner, repo } = repoInfo();
  const url = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + postsDirPath();
  const r = await withTimeout(fetch(url), LIST_TIMEOUT_MS, 'GitHub API');
  if (!r.ok) throw new Error('GitHub API listing failed (' + r.status + ')');
  const files = await r.json();
  if (!Array.isArray(files)) throw new Error('unexpected GitHub API response');
  return files.filter(f => f.type === 'file' && f.name.endsWith('.md')).map(f => f.name);
}

// python3 -m http.server and most dev servers emit <a href="name.md">.
async function listViaDirectoryIndex() {
  const r = await withTimeout(fetch('posts/'), LIST_TIMEOUT_MS, 'directory index');
  if (!r.ok) throw new Error('no directory index (' + r.status + ')');
  const html = await r.text();
  const names = new Set();
  for (const m of html.matchAll(/href="([^"?#]+\.md)"/g)) {
    const name = decodeURIComponent(m[1]).split('/').pop();
    if (name) names.add(name);
  }
  if (!names.size) throw new Error('directory index listed no posts');
  return [...names];
}

// A rate-limited API (60 requests/hour per IP, unauthenticated) should not cost
// a returning reader the post list they already had.
const CACHE_KEY = 'nwd:posts:' + postsDirPath();

function readCache() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(v) && v.length ? v : null;
  } catch (_) { return null; }
}

function writeCache(names) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(names)); } catch (_) {}
}

async function listFiles() {
  const routes = isLocalPreview()
    ? [listViaDirectoryIndex, listViaGitHubApi]
    : [listViaGitHubApi, listViaDirectoryIndex];

  for (const route of routes) {
    try {
      const names = await route();
      if (names.length) { writeCache(names); return names; }
    } catch (err) {
      console.warn('[posts] ' + err.message);
    }
  }
  // A cached list may name a post that has since been deleted; those 404 on
  // fetch and drop out below, so the list heals itself on the next good listing.
  return readCache() || [LAST_RESORT];
}

// ------------------------------------------------------------------ load

// Two canonical URLs for the same piece differ only in punctuation more often
// than not, so compare them loosely.
function canonical(url) {
  return (url || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

// Local posts are a few KB each and fetching them now means switching between
// them later costs nothing. Front matter is the only source of titles and
// dates — nothing about a local post is recorded outside the post itself.
async function localPosts() {
  const names = await listFiles();
  const loaded = await Promise.all(names.map(async file => {
    try {
      const r = await fetch('posts/' + file, { cache: 'no-cache' });
      if (!r.ok) return null;
      const doc = parseDocument(await r.text());
      const firstPara = doc.blocks.find(b => b.type === 'p');
      return {
        origin: 'local',
        file,
        slug: file.replace(/\.md$/, ''),
        title: doc.meta.title || file.replace(/\.md$/, '').replace(/[-_]/g, ' '),
        subtitle: doc.meta.subtitle || '',
        excerpt: doc.meta.excerpt || (firstPara ? firstPara.text : ''),
        date: doc.meta.date || '',
        source: doc.meta.source || '',
        doc
      };
    } catch (_) { return null; }
  }));
  return loaded.filter(Boolean);
}

// The Substack side arrives as metadata only. A body is a separate small file,
// fetched when the reader actually opens that post — the landing page needs
// none of them to draw its cards, and the whole archive inlined would be some
// twenty times the payload for a page that shows titles.
async function substackPosts() {
  let index;
  try {
    const r = await fetch(SUBSTACK_INDEX, { cache: 'no-cache' });
    if (!r.ok) throw new Error(String(r.status));
    index = await r.json();
  } catch (err) {
    console.info('[posts] no Substack snapshot (' + err.message + '); local markdown only');
    return [];
  }

  return (index.posts || []).map(p => ({
    origin: 'substack',
    file: 'substack/' + p.slug,
    slug: p.slug,
    title: p.title || p.slug,
    subtitle: p.subtitle || '',
    excerpt: p.excerpt || '',
    date: p.date || '',
    source: p.source || '',
    publication: index.publication || p.publication || '',
    meta: p,
    doc: null
  }));
}

// Fills in a Substack post's body the first time it is opened. Local posts
// already carry theirs.
export async function ensureDoc(post) {
  if (post.doc) return post.doc;
  const r = await fetch('posts/substack/' + encodeURIComponent(post.slug) + '.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Could not load ' + post.slug + ' (' + r.status + ')');
  const { body } = await r.json();

  // Rebuild the front matter the markdown parser expects, so a post from the
  // feed and a post from a file go through exactly the same path from here on.
  const m = post.meta || {};
  const fm = ['---'];
  for (const [k, v] of [['title', m.title], ['subtitle', m.subtitle], ['author', m.author],
                        ['publication', m.publication], ['date', m.date],
                        ['source', m.source], ['profile', m.profile]]) {
    if (v) fm.push(k + ': ' + String(v).replace(/\n/g, ' '));
  }
  fm.push('---', '');
  post.doc = parseDocument(fm.join('\n') + body);
  return post.doc;
}

/**
 * The feed: local markdown and the Substack snapshot, merged.
 *
 * Both are fetched together at page load. Where the same piece appears in both,
 * the local file wins — that is what makes dropping a .md file into posts/ an
 * override, so anything hand-edited here survives the next feed refresh while
 * everything else keeps flowing in from Substack on its own.
 */
export async function discoverPosts() {
  const [local, remote] = await Promise.all([localPosts(), substackPosts()]);

  const claimed = new Set();
  for (const p of local) {
    if (p.source) claimed.add(canonical(p.source));
    claimed.add('slug:' + p.slug);
  }
  const merged = local.concat(
    remote.filter(p => !claimed.has(canonical(p.source)) && !claimed.has('slug:' + p.slug)));

  // Newest first, by the `date:` in front matter or the feed's publish date.
  // ISO dates sort correctly as strings. Undated posts fall to the bottom
  // rather than disappearing.
  return merged.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.slug.localeCompare(b.slug);
  });
}

// `?post=` accepts either the filename or the bare slug, so a URL typed by hand
// works as well as one the page produced.
export function findPost(posts, wanted) {
  if (!wanted) return null;
  const w = decodeURIComponent(wanted);
  return posts.find(p => p.file === w)
      || posts.find(p => p.slug === w.replace(/\.md$/, ''))
      || null;
}
