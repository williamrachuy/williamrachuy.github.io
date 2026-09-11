#!/usr/bin/env python3
"""Draw the QR code that sits at the top of the feed.

    pip install segno
    python3 tools/make-qr.py [--url URL] [--out PATH]

The output is committed. Nothing on the page generates a QR code at runtime and
no library is loaded to display one — the site stays a folder of static files,
the way the pictures and the font do. Re-run this only if the address changes.

The matrix is walked by hand rather than handed to segno's own SVG writer so the
markup is ours: one path of merged horizontal runs, a warm tile behind it in the
site's palette instead of clinical white, and a viewBox with no fixed size so
CSS decides how big it is.
"""

import argparse
import sys

DEFAULT_URL = 'https://www.adividiardi.com/nick-website-demo/'

# The quiet zone is part of the code, not padding around it: a scanner needs
# four clear modules on every side to find the thing at all.
QUIET = 4

PAPER = '#f4efe2'
DARK = '#0b0c10'


def runs(matrix):
    """Merge each row's dark modules into horizontal runs, so the path is a few
    dozen rects rather than one per module."""
    for y, row in enumerate(matrix):
        x = 0
        width = len(row)
        while x < width:
            if not row[x]:
                x += 1
                continue
            start = x
            while x < width and row[x]:
                x += 1
            yield start, y, x - start


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default=DEFAULT_URL)
    ap.add_argument('--out', default='assets/qr-site.svg')
    args = ap.parse_args()

    try:
        import segno
    except ImportError:
        sys.exit('needs segno: pip install segno')

    # Error correction M carries a URL this short at a low version, which keeps
    # the modules large — the thing is read off a screen at about 120px, where
    # module size matters more than the redundancy a higher level would add.
    qr = segno.make(args.url, error='m', boost_error=True)
    matrix = [[bool(v) for v in row] for row in qr.matrix]
    n = len(matrix)
    side = n + QUIET * 2

    d = ' '.join('M%d %dh%dv1h-%dz' % (x + QUIET, y + QUIET, w, w)
                 for x, y, w in runs(matrix))

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'role="img" aria-label="QR code for %s">'
        '<title>%s</title>'
        '<rect width="%d" height="%d" rx="2.5" fill="%s"/>'
        '<path d="%s" fill="%s"/>'
        '</svg>\n'
    ) % (side, side, args.url, args.url, side, side, PAPER, d, DARK)

    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(svg)

    print('%s: version %s, %dx%d modules, %d bytes'
          % (args.out, qr.version, n, n, len(svg)))


if __name__ == '__main__':
    main()
