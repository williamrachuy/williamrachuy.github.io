#!/usr/bin/env python3
"""Bring every referenced picture into the repo and repoint the posts at it.

The posts arrive from Substack referencing substackcdn.com. That works, but it
makes the site depend on an account staying open and a CDN staying up for
content this repo otherwise owns outright. This copies each picture into
posts/images/ and rewrites the markdown to point there, so the demo is
self-contained and a checkout is enough to serve it.

  python3 tools/localize_images.py            # posts/*.md and posts/substack/*
  python3 tools/localize_images.py --dry-run

Idempotent: a reference that is already local is left alone, and a picture
already in posts/images/ is not downloaded again. fetch-substack.py calls into
this after writing a snapshot, so refreshing the archive localises any new
pictures on the way through.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
POSTS = HERE.parent / 'posts'
IMAGES = POSTS / 'images'

# Where the page looks for them. Relative to the document, which is always
# /nick-website-demo/ regardless of which post is open, so this one prefix is
# correct for every reference.
PUBLIC_PREFIX = 'posts/images/'

MARKDOWN_IMAGE = re.compile(r'!\[([^\]]*)\]\(\s*(https?://[^)\s]+)\s*\)')

HEADERS = {
    'User-Agent': 'nick-website-demo/1.0 (+https://www.adividiardi.com/nick-website-demo/)',
    'Accept': 'image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8',
}

RETRIES = 3

EXT_BY_TYPE = {
    'image/jpeg': '.jpeg', 'image/jpg': '.jpeg', 'image/png': '.png',
    'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif',
    'image/svg+xml': '.svg',
}


class ImageUnavailable(Exception):
    """Could not be downloaded. Expected; the post keeps its remote URL."""


def local_name(url, content_type=''):
    """A stable filename for a picture, derived from the source URL.

    Substack wraps the original S3 URL inside its resizing URL, and that
    original carries a UUID — stable across refetches, unique across the
    archive, and a much better key than hashing the resizing URL, which
    changes whenever the CDN parameters do.

    The dimensions in the original filename are deliberately dropped: they
    describe the file before the CDN resized it, so a name built from them
    would claim 4096x2304 for a picture that is actually 1456x819.
    """
    decoded = urllib.parse.unquote(url)
    uuid = re.search(r'([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}'
                     r'-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', decoded)

    ext = EXT_BY_TYPE.get(content_type.split(';')[0].strip().lower(), '')
    if not ext:
        tail = re.search(r'\.(jpe?g|png|gif|webp|avif|svg)\b', decoded, re.I)
        ext = ('.' + tail.group(1).lower().replace('jpg', 'jpeg')) if tail else '.jpeg'

    if uuid:
        return uuid.group(1).lower() + ext
    # No UUID to key on: fall back to a short digest of the URL itself.
    import hashlib
    return hashlib.sha1(url.encode()).hexdigest()[:16] + ext


def download(url):
    last = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read(), r.headers.get('Content-Type', '')
        except (urllib.error.URLError, OSError) as err:
            last = err
            if getattr(err, 'code', None) in (400, 401, 403, 404, 410):
                break
            if attempt < RETRIES:
                time.sleep(2 ** attempt)
    raise ImageUnavailable('%s: %s' % (url, last))


def fetch_into_repo(url, cache, dry_run=False):
    """Return the public path for `url`, downloading it if necessary."""
    if url in cache:
        return cache[url]

    if dry_run:
        cache[url] = PUBLIC_PREFIX + local_name(url)
        return cache[url]

    data, content_type = download(url)
    name = local_name(url, content_type)
    target = IMAGES / name

    if not target.exists():
        IMAGES.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + '.tmp')
        tmp.write_bytes(data)
        os.replace(tmp, target)

    cache[url] = PUBLIC_PREFIX + name
    return cache[url]


def rewrite(text, cache, stats, dry_run=False):
    """Repoint every remote markdown image in `text` at its local copy."""
    def swap(m):
        alt, url = m.group(1), m.group(2)
        try:
            path = fetch_into_repo(url, cache, dry_run)
        except ImageUnavailable as err:
            # Leave the remote URL in place. A picture we cannot copy is still
            # better served from its CDN than turned into a broken link.
            print('  ! %s' % err, file=sys.stderr)
            stats['failed'] += 1
            return m.group(0)
        stats['rewritten'] += 1
        return '![%s](%s)' % (alt, path)

    return MARKDOWN_IMAGE.sub(swap, text)


def localize_tree(dry_run=False, quiet=False):
    """Localise every picture in posts/*.md and posts/substack/*.json."""
    cache, stats = {}, {'rewritten': 0, 'failed': 0, 'files': 0}

    for path in sorted(POSTS.glob('*.md')):
        text = path.read_text(encoding='utf-8')
        new = rewrite(text, cache, stats, dry_run)
        if new != text:
            stats['files'] += 1
            if not dry_run:
                path.write_text(new, encoding='utf-8')
            if not quiet:
                print('  %s' % path.name)

    snapshot = POSTS / 'substack'
    for path in sorted(snapshot.glob('*.json')):
        if path.name == 'index.json':
            continue                      # metadata and excerpts; no pictures
        doc = json.loads(path.read_text(encoding='utf-8'))
        body = doc.get('body', '')
        new = rewrite(body, cache, stats, dry_run)
        if new != body:
            doc['body'] = new
            stats['files'] += 1
            if not dry_run:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
                    f.write('\n')
            if not quiet:
                print('  substack/%s' % path.name)

    return stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true',
                    help='report what would change without downloading or writing')
    args = ap.parse_args()

    stats = localize_tree(dry_run=args.dry_run)

    on_disk = len(list(IMAGES.glob('*'))) if IMAGES.is_dir() else 0
    size = sum(f.stat().st_size for f in IMAGES.glob('*')) if IMAGES.is_dir() else 0
    print('%s%d reference(s) across %d file(s); %d picture(s) in %s (%.1f MB)%s'
          % ('[dry run] ' if args.dry_run else '',
             stats['rewritten'], stats['files'], on_disk,
             PUBLIC_PREFIX, size / 1048576,
             '; %d could not be downloaded' % stats['failed'] if stats['failed'] else ''))


if __name__ == '__main__':
    main()
