#!/usr/bin/env python3
"""Fetch a Substack publication into posts/substack/.

Substack sends no Access-Control-Allow-Origin on either its RSS feed or its
JSON API, so a browser on another domain cannot read it directly. This runs at
build time instead — in the Pages workflow, or by hand — and writes same-origin
files the page loads alongside the local markdown.

  python3 tools/fetch-substack.py [--feed URL] [--out DIR] [--limit N]

Output is split deliberately:

  posts/substack/index.json     every post's metadata and card excerpt
  posts/substack/<slug>.json    one post's body, fetched only when opened

The whole archive inlined into one file is ~47 KB gzipped, and the landing page
needs none of the bodies to draw its cards. The index alone is ~2 KB, so the
split is worth the extra request on open.

Everything is written to a temporary directory and moved into place only on
success, so a failed fetch leaves the previous snapshot serving rather than
emptying the site's feed.
"""

import argparse, datetime, html, json, os, re, sys, tempfile
import shutil
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

_rmtree = shutil.rmtree


class FeedUnavailable(Exception):
    """The feed could not be read. Expected, and not a reason to fail a build."""


# Substack sits behind Cloudflare, which refuses requests from datacenter
# address ranges — GitHub Actions runners included. Observed directly: the same
# request that returns 200 from a residential connection returns 403 from a
# runner, on every User-Agent tried. These headers are what a feed reader sends
# and cost nothing; they are not expected to defeat an address-based block.
HEADERS = {
    'User-Agent': 'nick-website-demo/1.0 (+https://www.adividiardi.com/nick-website-demo/)',
    'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

RETRIES = 3

CE = '{http://purl.org/rss/1.0/modules/content/}encoded'
DC_CREATOR = '{http://purl.org/dc/elements/1.1/}creator'

# The four reading profiles, handed out in rotation so a browse through the
# feed shows all of them rather than whichever one came first.
PROFILES = ['tidewater', 'lantern', 'ledger', 'foundry']

# Substack's own furniture, not the writing.
CTA = re.compile(r'^\s*\[?(subscribe now|share|leave a comment|share this post|'
                 r'give a gift subscription|refer a friend)\]?(\([^)]*\))?\.?\s*$', re.I)

MD = {'h1': '# ', 'h2': '## ', 'h3': '### ', 'h4': '### ', 'blockquote': '> ', 'p': ''}


def mark_images(s):
    """Keep pictures where they sit in the piece instead of stripping them with
    the widgets they happen to be wrapped in."""
    def fig(m):
        src = re.search(r'<img[^>]+src="([^"]+)"', m.group(0))
        return '<p>@@IMG:%s@@</p>' % src.group(1) if src else ''
    s = re.sub(r'(?is)<figure\b.*?</figure>', fig, s)
    s = re.sub(r'(?is)<img[^>]+src="([^"]+)"[^>]*/?>', r'<p>@@IMG:\1@@</p>', s)
    return s


def to_markdown(enc):
    s = mark_images(enc)
    s = re.sub(r'(?is)<(script|style|button|svg|form|input|iframe)\b.*?</\1>', '', s)
    s = re.sub(r'(?is)<(figcaption|picture)\b.*?</\1>', '', s)
    s = re.sub(r'(?is)<div class="[^"]*(subscription|subscribe|button|digest|poll|footer)'
               r'[^"]*"[^>]*>.*?</div>', '', s)
    out = []
    for m in re.finditer(r'(?is)<(p|h1|h2|h3|h4|blockquote|hr)\b[^>]*>(.*?)</\1>|<hr\s*/?>', s):
        tag = (m.group(1) or 'hr').lower()
        inner = m.group(2) or ''
        inner = re.sub(r'(?is)<br\s*/?>', ' ', inner)
        inner = re.sub(r'(?is)<(em|i)>(.*?)</\1>', r'*\2*', inner)
        inner = re.sub(r'(?is)<(strong|b)>(.*?)</\1>', r'**\2**', inner)
        inner = re.sub(r'(?is)<a [^>]*href="([^"]+)"[^>]*>(.*?)</a>', r'[\2](\1)', inner)
        inner = re.sub(r'(?s)<[^>]+>', '', inner)
        inner = re.sub(r'[ \t ]+', ' ', html.unescape(inner)).strip()

        img = re.match(r'^@@IMG:(\S+)@@$', inner)
        if img:
            out.append('![](%s)' % img.group(1))
            continue
        if tag == 'hr':
            if out and out[-1] != '---':
                out.append('---')
        elif inner and '@@IMG:' not in inner and not CTA.match(inner):
            out.append(MD[tag] + inner)

    while out and out[-1] == '---':
        out.pop()
    return '\n\n'.join(out)


def strip_tags(s):
    return re.sub(r'(?s)<[^>]+>', '', html.unescape(s or '')).strip()


def read_feed(feed_url):
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(feed_url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except (urllib.error.URLError, OSError) as err:
            last = err
            code = getattr(err, 'code', None)
            # A refusal is a decision, not a hiccup; only back off for the
            # failures that a second attempt can actually change.
            if code in (400, 401, 403, 404, 410):
                break
            if attempt < RETRIES:
                time.sleep(2 ** attempt)
    raise FeedUnavailable('%s: %s' % (feed_url, last))


def fetch(feed_url, limit):
    raw = read_feed(feed_url)

    channel = ET.fromstring(raw).find('channel')
    if channel is None:
        raise SystemExit('not an RSS feed: ' + feed_url)

    publication = strip_tags(channel.findtext('title')) or 'Substack'
    posts = []
    for i, item in enumerate(channel.findall('item')[:limit]):
        link = (item.findtext('link') or '').strip()
        if not link:
            continue
        body = to_markdown(item.findtext(CE) or '')
        if not body:
            continue
        pub = item.findtext('pubDate') or ''
        try:
            date = datetime.datetime.strptime(pub, '%a, %d %b %Y %H:%M:%S %Z').strftime('%Y-%m-%d')
        except ValueError:
            date = ''
        posts.append({
            'slug': link.rstrip('/').split('/')[-1],
            'title': strip_tags(item.findtext('title')),
            'subtitle': strip_tags(item.findtext('description')),
            'author': strip_tags(item.findtext(DC_CREATOR)),
            'publication': publication,
            'date': date,
            'source': link,
            'profile': PROFILES[i % len(PROFILES)],
            'body': body,
        })

    posts.sort(key=lambda p: p['date'], reverse=True)
    return {
        'publication': publication,
        'feed': feed_url,
        'fetched': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'posts': posts,
    }


def first_paragraph(body):
    """The card blurb: the opening prose, skipping any leading picture."""
    for block in body.split('\n\n'):
        b = block.strip()
        if not b or b == '---' or b.startswith('!['):
            continue
        if b.startswith('#') or b.startswith('>'):
            continue
        return re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', b).strip('*').strip()
    return ''


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--feed', default='https://tbhpress.substack.com/feed')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'posts', 'substack'))
    ap.add_argument('--limit', type=int, default=25)
    args = ap.parse_args()

    try:
        data = fetch(args.feed, args.limit)
    except FeedUnavailable as err:
        # Deliberately not an error exit. The snapshot committed to the repo is
        # still there and still correct, so the build should carry on and
        # publish it — but silently swallowing this is how a feed quietly goes
        # stale for months, so say so where GitHub will surface it.
        print('::warning title=Substack feed unreachable::%s — publishing the '
              'committed snapshot instead. The archive will be as of its last '
              'successful fetch.' % err)
        print('feed unreachable: %s' % err, file=sys.stderr)
        return

    if not data['posts']:
        print('::warning title=Substack feed empty::returned no usable posts; '
              'keeping the committed snapshot.')
        return

    out = os.path.abspath(args.out)
    parent = os.path.dirname(out)
    os.makedirs(parent, exist_ok=True)

    staging = tempfile.mkdtemp(dir=parent, prefix='.substack-')
    try:
        index = []
        for post in data['posts']:
            body = post.pop('body')
            write_json(os.path.join(staging, post['slug'] + '.json'), {'body': body})
            index.append(dict(post, excerpt=first_paragraph(body), chars=len(body)))

        write_json(os.path.join(staging, 'index.json'), {
            'publication': data['publication'],
            'feed': data['feed'],
            'fetched': data['fetched'],
            'posts': index,
        })

        # Swap the finished directory in, then delete the old one.
        previous = out + '.previous'
        if os.path.isdir(previous):
            _rmtree(previous)
        if os.path.isdir(out):
            os.replace(out, previous)
        os.replace(staging, out)
        staging = None
        if os.path.isdir(previous):
            _rmtree(previous)
    finally:
        if staging and os.path.isdir(staging):
            _rmtree(staging)

    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print('%s: %d posts -> %s (index %.1f KB, %d KB total)'
          % (data['publication'], len(index), out,
             os.path.getsize(os.path.join(out, 'index.json')) / 1024, size / 1024))


if __name__ == '__main__':
    main()
