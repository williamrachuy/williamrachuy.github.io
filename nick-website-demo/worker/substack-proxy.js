// substack-proxy.js — a Cloudflare Worker that lets the site read Substack live.
//
// Why it exists: Substack publishes its posts as public JSON and RSS, but sends
// no CORS headers, so a browser on another domain is not allowed to read them,
// and it refuses requests from GitHub's build machines. A Worker runs on
// Cloudflare's own network, is allowed to fetch both, and can hand the result
// to the site with the header the browser needs.
//
// It holds no secrets and stores nothing. Everything it serves is public, and
// every answer is cached at Cloudflare's edge for a few minutes so a burst of
// visitors costs Substack one request, not hundreds.
//
// Endpoints (all GET, all JSON):
//
//   /index            every post, newest first, as cards:
//                     { publication, posts: [{ slug, title, subtitle, author,
//                       date, source, excerpt, paywalled }] }
//   /post/<slug>      one post's body, already converted to the site's markdown:
//                     { slug, body, paywalled }
//   /search?q=words   posts matching the words, same shape as /index. Searches
//                     Substack's own search, so it covers post text, not only
//                     titles.
//   /health           what this Worker can and cannot reach right now. Open it
//                     in a browser first when setting up or when something
//                     looks wrong.
//
// Settings (Cloudflare dashboard -> this Worker -> Settings -> Variables):
//
//   SUBSTACK_HOST     required. The publication's address with no https://,
//                     for example  tbhpress.substack.com
//   ALLOWED_ORIGIN    optional. Which site may call this Worker, for example
//                     https://nick.github.io . Unset means any site, which is
//                     fine: the data is public anyway.
//   CACHE_SECONDS     optional. How long answers are kept. Default 600.

const DEFAULT_CACHE_SECONDS = 600;
const PAGE = 50;            // Substack's archive pages
const MAX_POSTS = 500;      // a safety stop, not an expected size
const UPSTREAM_TIMEOUT_MS = 10000;

const UA = 'Mozilla/5.0 (compatible; SubstackMirror/1.0; +https://developers.cloudflare.com/workers/)';

// ---------------------------------------------------------------- entry

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors);

    const host = cleanHost(env.SUBSTACK_HOST);
    if (!host) {
      return json({ error: 'SUBSTACK_HOST is not set. Add it under Settings -> Variables.' }, 500, cors);
    }

    const url = new URL(request.url);
    const ttl = Number(env.CACHE_SECONDS) > 0 ? Number(env.CACHE_SECONDS) : DEFAULT_CACHE_SECONDS;

    // /health is never cached: its whole job is to report the present moment.
    if (url.pathname === '/health') return health(host, cors);

    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = new Request(url.origin + url.pathname + url.search, { method: 'GET' });
    if (cache) {
      const hit = await cache.match(key);
      if (hit) return withHeaders(hit, cors);
    }

    let res;
    try {
      res = await route(url, host, ttl);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 502, cors);
    }

    // Only remember good answers; a failure should be retried next time.
    if (cache && res.status === 200) ctx.waitUntil(cache.put(key, res.clone()));
    return withHeaders(res, cors);
  }
};

async function route(url, host, ttl) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/index') {
    return json(await listPosts(host, ''), 200, cacheHeaders(ttl));
  }

  if (path === '/search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q.length < 2) return json({ error: 'q must be at least 2 characters' }, 400);
    return json(await listPosts(host, q), 200, cacheHeaders(ttl));
  }

  const m = /^\/post\/([A-Za-z0-9][A-Za-z0-9_-]{0,200})$/.exec(path);
  if (m) {
    const post = await getPost(host, m[1]);
    return post ? json(post, 200, cacheHeaders(ttl)) : json({ error: 'no such post' }, 404);
  }

  return json({ error: 'not found', endpoints: ['/index', '/post/<slug>', '/search?q=', '/health'] }, 404);
}

// ------------------------------------------------------------- upstream

async function upstream(url, accept) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    // Cloudflare's own cache in front of Substack, for the edge rather than
    // the browser.
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!r.ok) throw new Error('Substack answered ' + r.status + ' for ' + new URL(url).pathname);
  return r;
}

const ymd = s => {
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
};

function author(p) {
  const by = (p.publishedBylines || p.published_bylines || [])[0];
  return (by && by.name) || '';
}

function cardFromApi(p, host, publication) {
  const slug = p.slug;
  return {
    slug,
    title: p.title || slug,
    subtitle: p.subtitle || '',
    author: author(p),
    publication,
    date: ymd(p.post_date),
    source: p.canonical_url || 'https://' + host + '/p/' + slug,
    excerpt: clean(p.truncated_body_text || p.description || ''),
    paywalled: p.audience === 'only_paid' || p.audience === 'founding'
  };
}

// --------------------------------------------------------------- listing

async function listPosts(host, q) {
  let posts;
  let publication = '';
  try {
    posts = [];
    for (let offset = 0; offset < MAX_POSTS; offset += PAGE) {
      const u = 'https://' + host + '/api/v1/archive?sort=new&limit=' + PAGE + '&offset=' + offset +
                (q ? '&search=' + encodeURIComponent(q) : '');
      const batch = await (await upstream(u, 'application/json')).json();
      if (!Array.isArray(batch)) throw new Error('unexpected archive response');
      posts.push(...batch);
      if (batch.length < PAGE || q) break;      // a search is one page of best matches
    }
    publication = await publicationName(host);
    posts = posts.filter(p => p.slug).map(p => cardFromApi(p, host, publication));
  } catch (archiveErr) {
    // The JSON API is the nicer route; the RSS feed carries the same posts.
    // Search is the one thing the feed cannot do, so it filters by hand.
    const feed = await readFeed(host).catch(feedErr => {
      throw new Error(archiveErr.message + '; feed: ' + feedErr.message);
    });
    publication = feed.publication;
    posts = feed.items.map(it => it.card);
    if (q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const ids = new Set(feed.items
        .filter(it => words.every(w => (it.card.title + ' ' + it.card.subtitle + ' ' + it.plain).toLowerCase().includes(w)))
        .map(it => it.card.slug));
      posts = posts.filter(p => ids.has(p.slug));
    }
  }
  posts.sort((a, b) => b.date.localeCompare(a.date));
  return { publication, posts };
}

async function publicationName(host) {
  try {
    const r = await upstream('https://' + host + '/api/v1/publication_launch_checklist', 'application/json');
    const j = await r.json();
    if (j && j.name) return j.name;
  } catch (_) { /* fall through */ }
  try {
    const x = await (await upstream('https://' + host + '/feed', 'application/rss+xml')).text();
    const m = /<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/.exec(x);
    if (m) return clean(unCdata(m[1]));
  } catch (_) { /* fall through */ }
  return host.split('.')[0];
}

// ------------------------------------------------------------------ post

async function getPost(host, slug) {
  try {
    const r = await upstream('https://' + host + '/api/v1/posts/' + encodeURIComponent(slug), 'application/json');
    const p = await r.json();
    if (p && p.slug) {
      const paywalled = p.audience === 'only_paid' || p.audience === 'founding';
      return { slug: p.slug, body: withPaywallNote(toMarkdown(p.body_html || ''), paywalled, p.canonical_url), paywalled };
    }
  } catch (err) {
    if (/ 404 /.test(err.message)) return null;
  }
  // Same fallback as the listing: the feed has full text for free posts.
  const feed = await readFeed(host);
  const it = feed.items.find(i => i.card.slug === slug);
  return it ? { slug, body: toMarkdown(it.html), paywalled: false } : null;
}

function withPaywallNote(body, paywalled, source) {
  if (!paywalled) return body;
  const note = '*The rest of this post is for paid subscribers. Read it on Substack.*';
  return (body ? body + '\n\n' : '') + note;
}

// -------------------------------------------------------------- RSS route

async function readFeed(host) {
  const xml = await (await upstream('https://' + host + '/feed', 'application/rss+xml')).text();
  const publication = clean(unCdata((/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/.exec(xml) || [])[1] || '')) || host.split('.')[0];
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const t = tag => unCdata((new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(m[1]) || [])[1] || '');
    const link = t('link').trim();
    if (!link) continue;
    const slug = link.replace(/\/+$/, '').split('/').pop();
    const html = t('content:encoded');
    const plain = clean(html.replace(/<[^>]+>/g, ' '));
    items.push({
      html,
      plain,
      card: {
        slug,
        title: clean(t('title')),
        subtitle: clean(t('description')),
        author: clean(t('dc:creator')),
        publication,
        date: ymd(t('pubDate')),
        source: link,
        excerpt: firstParagraph(toMarkdown(html)),
        paywalled: false
      }
    });
  }
  if (!items.length) throw new Error('feed had no items');
  return { publication, items };
}

// ------------------------------------------------------------ HTML -> md
//
// A line-for-line port of to_markdown() in tools/fetch-substack.py, so a post
// read live and a post from the committed snapshot come out the same. If one
// changes, change the other.

const CTA = /^\s*\[?(subscribe now|share|leave a comment|share this post|give a gift subscription|refer a friend)\]?(\([^)]*\))?\.?\s*$/i;
const MD = { h1: '# ', h2: '## ', h3: '### ', h4: '### ', blockquote: '> ', p: '' };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…' };
function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(n); } catch (_) { return all; }
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function markImages(s) {
  s = s.replace(/<figure\b[\s\S]*?<\/figure>/gi, m => {
    const src = /<img[^>]+src="([^"]+)"/i.exec(m);
    return src ? '<p>@@IMG:' + src[1] + '@@</p>' : '';
  });
  return s.replace(/<img[^>]+src="([^"]+)"[^>]*\/?>/gi, '<p>@@IMG:$1@@</p>');
}

function toMarkdown(enc) {
  let s = markImages(enc || '');
  s = s.replace(/<(script|style|button|svg|form|input|iframe)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(figcaption|picture)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<div class="[^"]*(subscription|subscribe|button|digest|poll|footer)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  const out = [];
  const re = /<(p|h1|h2|h3|h4|blockquote|hr)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  for (const m of s.matchAll(re)) {
    const tag = (m[1] || 'hr').toLowerCase();
    let inner = m[2] || '';
    inner = inner.replace(/<br\s*\/?>/gi, ' ');
    inner = inner.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
    inner = inner.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**');
    inner = inner.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
    inner = inner.replace(/<[^>]+>/g, '');
    inner = unescapeHtml(inner).replace(/[ \t ]+/g, ' ').trim();

    const img = /^@@IMG:(\S+)@@$/.exec(inner);
    if (img) { out.push('![](' + img[1] + ')'); continue; }
    if (tag === 'hr') {
      if (out.length && out[out.length - 1] !== '---') out.push('---');
    } else if (inner && !inner.includes('@@IMG:') && !CTA.test(inner)) {
      out.push(MD[tag] + inner);
    }
  }
  while (out.length && out[out.length - 1] === '---') out.pop();
  return out.join('\n\n');
}

function firstParagraph(body) {
  for (const block of body.split('\n\n')) {
    const b = block.trim();
    if (!b || b === '---' || b.startsWith('![') || b.startsWith('#') || b.startsWith('>')) continue;
    return b.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*+/g, '').trim();
  }
  return '';
}

// ---------------------------------------------------------------- health

async function health(host, cors) {
  const probe = async (label, path, accept) => {
    const started = Date.now();
    try {
      const r = await fetch('https://' + host + path, {
        headers: { 'User-Agent': UA, 'Accept': accept },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
      });
      return { what: label, status: r.status, ok: r.ok, ms: Date.now() - started };
    } catch (err) {
      return { what: label, ok: false, error: String(err.message || err) };
    }
  };
  const checks = await Promise.all([
    probe('archive JSON (preferred)', '/api/v1/archive?sort=new&limit=1', 'application/json'),
    probe('RSS feed (fallback)', '/feed', 'application/rss+xml')
  ]);
  const working = checks.some(c => c.ok);
  return json({
    host,
    verdict: working
      ? 'OK — this Worker can read ' + host
      : 'BLOCKED — Substack refused this Worker. See the troubleshooting section of worker/README.md',
    checks
  }, working ? 200 : 502, { ...cors, 'Cache-Control': 'no-store' });
}

// --------------------------------------------------------------- helpers

function clean(s) {
  return unescapeHtml(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function unCdata(s) {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1] : s;
}
function cleanHost(h) {
  return String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}
function cacheHeaders(ttl) {
  return { 'Cache-Control': 'public, max-age=' + Math.min(ttl, 60) + ', s-maxage=' + ttl };
}
function corsHeaders(request, env) {
  const origin = env.ALLOWED_ORIGIN ? String(env.ALLOWED_ORIGIN).replace(/\/+$/, '') : '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}
function withHeaders(res, headers) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}
