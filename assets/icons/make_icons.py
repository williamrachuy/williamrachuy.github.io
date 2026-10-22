#!/usr/bin/env python3
"""Front-page icons, drawn as small solid objects lit from the upper left.

Every icon is a function of time t in [0, 1) (one loop), or t=None for its
resting pose, which is the static icon. Animated icons also get a sprite
sheet: one loop of frames in a grid, played on the front page while the icon
is zoomed into (see ICON_ANIMS in index.html via anim/manifest.js).

Run from the repo root:  python3 assets/icons/make_icons.py
Writes assets/icons/*.svg, assets/icons/anim/*.svg and anim/manifest.js.
Needs fontTools only for the question mark.
"""
import json
import math
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent
ANIM = OUT / 'anim'
SCALE = 8  # natural pixel size per SVG unit (only the aspect ratio matters to the page)


def f(v):
    return f"{v:.3f}".rstrip('0').rstrip('.')


def svg(title, minx, miny, w, h, body, defs='', scale=SCALE):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{round(w * scale)}" height="{round(h * scale)}" '
            f'viewBox="{f(minx)} {f(miny)} {f(w)} {f(h)}">\n<title>{title}</title>\n'
            + (f'<defs>{defs}</defs>\n' if defs else '') + body + '\n</svg>\n')


def shade(hex_, k):
    """k>0 lightens toward white, k<0 darkens toward black."""
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    t = (255 if k > 0 else 0)
    k = abs(k)
    return '#' + ''.join(f'{round(v + (t - v) * k):02x}' for v in (r, g, b))


def mix(a, b, k):
    ra, ga, ba = (int(a[i:i + 2], 16) for i in (1, 3, 5))
    rb, gb, bb = (int(b[i:i + 2], 16) for i in (1, 3, 5))
    return '#' + ''.join(f'{round(x + (y - x) * k):02x}' for x, y in ((ra, rb), (ga, gb), (ba, bb)))


def trio(base):
    return (base, shade(base, 0.38), shade(base, -0.45))


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


# ─── Voxel slabs: pixel art extruded backwards, receding up and to the right ──
# Front faces stay square so the pixel art reads exactly; tops are lit, right
# sides are in shade, and only the outer edges of each run get a bevel line.

def voxels(rows, palette, u=1.0, depth=0.9, ox=0.0, oy=0.0, bevel=True):
    """rows: list of strings; palette: char -> (front, top, side)."""
    dx, dy = depth * 0.62 * u, -depth * 0.48 * u
    H, W = len(rows), max(len(r) for r in rows)
    cell = lambda r, c: rows[r][c] if 0 <= r < H and 0 <= c < len(rows[r]) and rows[r][c] in palette else None
    sides, fronts, lines = {}, {}, []
    sq = lambda pts: 'M' + ' L'.join(f'{f(a + ox)},{f(b + oy)}' for a, b in pts) + ' Z'
    for r in range(H):
        for c in range(W - 1, -1, -1):
            ch = cell(r, c)
            if not ch:
                continue
            front, top, side = palette[ch]
            x, y = c * u, r * u
            if not cell(r - 1, c):
                sides.setdefault(top, []).append(sq([(x, y), (x + u, y), (x + u + dx, y + dy), (x + dx, y + dy)]))
            if not cell(r, c + 1):
                sides.setdefault(side, []).append(sq([(x + u, y), (x + u + dx, y + dy), (x + u + dx, y + u + dy), (x + u, y + u)]))
            fronts.setdefault(front, []).append(sq([(x, y), (x + u, y), (x + u, y + u), (x, y + u)]))
            if bevel:
                hi, lo, w = 'rgba(255,255,255,0.55)', 'rgba(0,0,0,0.35)', 0.09 * u
                X, Y = x + ox, y + oy
                if not cell(r - 1, c):
                    lines.append(f'<rect x="{f(X)}" y="{f(Y)}" width="{f(u)}" height="{f(w)}" fill="{hi}"/>')
                if not cell(r, c - 1):
                    lines.append(f'<rect x="{f(X)}" y="{f(Y)}" width="{f(w)}" height="{f(u)}" fill="{hi}" opacity="0.7"/>')
                if not cell(r + 1, c):
                    lines.append(f'<rect x="{f(X)}" y="{f(Y + u - w)}" width="{f(u)}" height="{f(w)}" fill="{lo}"/>')
                if not cell(r, c + 1):
                    lines.append(f'<rect x="{f(X + u - w)}" y="{f(Y)}" width="{f(w)}" height="{f(u)}" fill="{lo}" opacity="0.8"/>')
    bounds = (ox, oy + dy, W * u + dx, H * u - dy)
    paths = [f'<path d="{" ".join(d)}" fill="{c}"/>' for c, d in list(sides.items()) + list(fronts.items())]
    return '\n'.join(paths + lines), bounds


# ─── Berzerk: the arcade robot ───────────────────────────────────────────────
# The 1980 robot is 8x12 pixels: a domed head, a visor row in which the eye
# (a two-pixel gap) scans from side to side, a chest band with the arms hanging
# at its sides, then thin legs and feet.
BERZERK_ROWS = [
    '..YYYY..',
    '.YYYYYY.',   # visor: the eye is a gap here
    'YYYYYYYY',
    'Y.YYYY.Y',
    'Y.YYYY.Y',
    'Y.YYYY.Y',
    '..YYYY..',
    '..Y..Y..',
    '..Y..Y..',
    '..Y..Y..',
    '..Y..Y..',
    '.YY..YY.',
]
BERZERK_EYE = [5, 4, 3, 2, 1, 2, 3, 4]   # gap start column, frame by frame (arcade-slow)


def berzerk(t=None):
    eye = 3 if t is None else BERZERK_EYE[int(t * len(BERZERK_EYE)) % len(BERZERK_EYE)]
    rows = list(BERZERK_ROWS)
    rows[1] = ''.join('.' if c in (eye, eye + 1) else ch for c, ch in enumerate(rows[1]))
    body, (x0, y0, w, h) = voxels(rows, {'Y': trio('#e8c81a')}, depth=0.95)
    pad = 0.3
    return 'Berzerk robot', (x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad), body, ''


# ─── Missile Command: a city, incoming warheads, counter-missiles ───────────
def _mc_event(u, mirror, key):
    """One raid: a warhead streaks in, a counter-missile rises, a burst blooms."""
    X = (lambda x: 10.0 - x) if mirror else (lambda x: x)
    sx, sy, tx, ty = X(-0.4), -1.8, X(3.6), 7.2
    hit, gone = 0.55, 0.9
    k = 0.62
    px, py = sx + (tx - sx) * k, sy + (ty - sy) * k          # interception point
    bx, by = X(9.6), 7.3                                      # launcher
    out = []
    if u < gone:
        head = min(u / hit, 1.0)
        hx, hy = sx + (px - sx) * head, sy + (py - sy) * head
        fade = 1.0 if u < hit else 1 - (u - hit) / (gone - hit)
        out.append(f'<line x1="{f(sx)}" y1="{f(sy)}" x2="{f(hx)}" y2="{f(hy)}" stroke="#e83a2c" stroke-width="0.6" stroke-linecap="round" opacity="{f(0.35 * fade)}"/>')
        out.append(f'<line x1="{f(sx)}" y1="{f(sy)}" x2="{f(hx)}" y2="{f(hy)}" stroke="url(#tr{key})" stroke-width="0.32" stroke-linecap="round" opacity="{f(fade)}"/>')
        if u < hit:
            out.append(f'<rect x="{f(hx - 0.45)}" y="{f(hy - 0.45)}" width="0.9" height="0.9" fill="#fff6e8"/>')
    launch = 0.3
    if launch <= u < gone:
        a = min((u - launch) / (hit - launch), 1.0)
        ax, ay = bx + (px - bx) * a, by + (py - by) * a
        fade = 1.0 if u < hit else 1 - (u - hit) / (gone - hit)
        out.append(f'<line x1="{f(bx)}" y1="{f(by)}" x2="{f(ax)}" y2="{f(ay)}" stroke="#3fa9f5" stroke-width="0.24" opacity="{f(0.75 * fade)}"/>')
        if u < hit:
            out.append(f'<rect x="{f(ax - 0.3)}" y="{f(ay - 0.3)}" width="0.6" height="0.6" fill="#d8f0ff"/>')
    if hit <= u < gone:
        r = 2.4 * math.sin(math.pi * (u - hit) / (gone - hit)) ** 0.7
        out.append(f'<circle cx="{f(px)}" cy="{f(py)}" r="{f(max(r, 0.01))}" fill="url(#burst)"/>')
    defs = (f'<linearGradient id="tr{key}" gradientUnits="userSpaceOnUse" x1="{f(sx)}" y1="{f(sy)}" x2="{f(px)}" y2="{f(py)}">'
            '<stop offset="0" stop-color="#e83a2c" stop-opacity="0"/><stop offset="0.6" stop-color="#ff5a3c"/><stop offset="1" stop-color="#ffb08a"/></linearGradient>')
    return ''.join(out), defs


def missile_command(t=None):
    rows = [
        '....G.....',
        '..G.GG..G.',
        '.GGGGG.GGG',
        'GGGGGGGGGG',
    ]
    oy = 7.4
    city, (x0, y0, w, h) = voxels(rows, {'G': trio('#e0b93c')}, u=1.0, depth=1.0, oy=oy)
    tt = 0.45 if t is None else t
    a, da = _mc_event(tt % 1.0, False, 'a')
    b, db = _mc_event((tt + 0.5) % 1.0, True, 'b')
    defs = da + db + ('<radialGradient id="burst"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#a8dcff"/>'
                      '<stop offset="0.75" stop-color="#3fa9f5" stop-opacity="0.85"/><stop offset="1" stop-color="#3fa9f5" stop-opacity="0"/></radialGradient>')
    vb = (-1.1, -2.2, 12.2, (y0 + h + 0.3) + 2.2)
    return 'Missile Command', vb, a + b + city, defs


# ─── The Chronicler: Ξ, the readable carving, as three gold bars ─────────────
CHRON_BOB = 0.35


def chronicler(t=None):
    bars = [(0, 'XXXXXXX', 0.0), (2, '.XXXXX.', 2.1), (4, 'XXXXXXX', 4.2)]
    parts, x1, y1 = [], 0, 0
    for row, s, phase in bars:
        dy = 0.0 if t is None else CHRON_BOB * math.sin(2 * math.pi * t + phase)
        body, (bx, by, bw, bh) = voxels([s], {'X': trio('#d6b86e')}, u=1.0, depth=1.25, oy=row + dy)
        parts.append(body)
    # the static extent (as if no bob), so frames and the icon share a box
    _, (x0, y0, w, h) = voxels(['XXXXXXX', '.......', '.XXXXX.', '.......', 'XXXXXXX'], {'X': trio('#d6b86e')}, depth=1.25)
    pad = 0.3
    return 'Chronicler inscription', (x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad), '\n'.join(parts), ''


# ─── About: a solid question mark ────────────────────────────────────────────
def question(t=None):
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.boundsPen import BoundsPen
    font = TTFont('/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf')
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord('?')]
    pen = SVGPathPen(gs)
    gs[name].draw(pen)
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    xmin, ymin, xmax, ymax = bp.bounds
    s = 10.0 / (ymax - ymin)  # glyph 10 units tall, y flipped
    tf = f'matrix({s:.6f},0,0,{-s:.6f},{-xmin * s:.4f},{ymax * s:.4f})'
    gw = (xmax - xmin) * s
    steps, ddx, ddy = 12, 0.075, -0.06
    layers = []
    for k in range(steps, 0, -1):
        col = shade('#8f86a8', -0.35 * k / steps)
        layers.append(f'<use href="#q" transform="translate({f(k * ddx)},{f(k * ddy)})" fill="{col}"/>')
    face = ('<use href="#q" fill="url(#qface)"/>'
            '<use href="#q" fill="none" stroke="#fffaf0" stroke-opacity="0.55" stroke-width="0.05"/>')
    defs = (f'<path id="q" transform="{tf}" d="{pen.getCommands()}"/>'
            '<linearGradient id="qface" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fffdf6"/>'
            '<stop offset="0.55" stop-color="#efe6d6"/><stop offset="1" stop-color="#cbbfd9"/></linearGradient>')
    pad = 0.35
    return ('Question mark', (-pad, steps * ddy - pad, gw + steps * ddx + 2 * pad, 10 - steps * ddy + 2 * pad),
            '\n'.join(layers) + '\n' + face, defs)


# ─── Cassie: the white sable, sitting; tail sways, head tilts ────────────────
def sable(t=None):
    body = 'M-11,-2 C-17,-18 -15,-38 -8,-50 C-4,-58 7,-58 10,-50 C15,-38 16,-18 11,-2 Q0,2 -11,-2 Z'
    tail = 'M-6,-4 C-24,-2 -40,-8 -40,-20 C-40,-28 -30,-30 -24,-24 C-20,-16 -14,-10 -6,-10 Z'
    head = 'M-10,-61 C-11,-72 -1,-77 7,-73 C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55 C-4,-55 -9,-57 -10,-61 Z'
    neck = 'M-8,-50 C-4,-58 7,-58 10,-50 L6,-56 C2,-58 -4,-58 -8,-54 Z'
    ears = '<circle cx="-4" cy="-73" r="4"/><circle cx="5" cy="-75" r="4"/>'
    if t is None:
        ta, ha = 0.0, 0.0
    else:
        w = 2 * math.pi * t
        ta = 11 * math.sin(w)                                  # tail sway
        ha = 6 * math.sin(w + 1.2) + 2.5 * math.sin(2 * w)     # head tilt, with a small nod
    T = f'rotate({f(ta)} -8 -7)'      # tail pivots at its root
    Hd = f'rotate({f(ha)} 2 -55)'     # head pivots at the neck

    def silhouette(fill):
        return (f'<g fill="{fill}"><path d="{tail}" transform="{T}"/><path d="{body}"/><path d="{neck}"/>'
                f'<g transform="{Hd}"><path d="{head}"/>{ears}</g></g>')
    depth = ''.join(f'<g transform="translate({f(k * 0.55)},{f(-k * 0.35)})">' + silhouette(shade("#b9c3cf", -0.18 * k / 4)) + '</g>'
                    for k in range(4, 0, -1))
    face = (silhouette('url(#fur)')
            + '<path d="M-1,-50 C3,-42 7,-36 6,-26 C1,-28 -2,-34 -3,-42 Z" fill="#e6ebf0"/>'
            '<path d="M2,-36 q6,3 6,9 M7,-37 q6,3 5,9" stroke="#c3ccd6" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
            '<path d="M-8,-2 v-6 M6,-2 v-6" stroke="#c3ccd6" stroke-width="4" stroke-linecap="round" fill="none"/>'
            f'<g transform="{Hd}"><circle cx="-4" cy="-73" r="1.6" fill="#c8d0da"/><circle cx="5" cy="-75" r="1.6" fill="#c8d0da"/>'
            '<circle cx="19" cy="-61" r="1.9" fill="#2e2620"/>'
            '<circle cx="8" cy="-66" r="1.9" fill="#1b1714"/><circle cx="8.6" cy="-66.6" r="0.55" fill="#ffffff"/>'
            '<path d="M-10,-61 C-11,-72 -1,-77 7,-73 C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55" stroke="#8d96a2" stroke-width="0.9" fill="none" stroke-linecap="round"/></g>'
            f'<path d="M-6,-4 C-24,-2 -40,-8 -40,-20" transform="{T}" stroke="#8d96a2" stroke-width="0.9" fill="none" stroke-linecap="round"/>'
            '<path d="M-11,-2 C-17,-18 -15,-38 -8,-50 M11,-2 C16,-18 15,-38 10,-50" stroke="#8d96a2" stroke-width="0.9" fill="none" stroke-linecap="round"/>')
    defs = ('<radialGradient id="fur" gradientUnits="userSpaceOnUse" cx="-6" cy="-62" r="64">'
            '<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f6f4ee"/>'
            '<stop offset="1" stop-color="#d3dae3"/></radialGradient>')
    minx, miny, maxx, maxy = -42, -82, 24, 3
    return 'White sable', (minx, miny, maxx - minx, maxy - miny), depth + face, defs


# ─── Blog: a quill in an inkwell; it lifts out, writes, dips again ──────────
def blog(t=None):
    cx, top, bot, rx, ry = 0.0, 0.0, 6.0, 5.0, 1.7
    well = (f'<path d="M{f(cx - rx)},{f(top)} L{f(cx - rx)},{f(bot)} A{f(rx)},{f(ry)} 0 0 0 {f(cx + rx)},{f(bot)} L{f(cx + rx)},{f(top)} Z" fill="url(#glass)"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top)}" rx="{f(rx)}" ry="{f(ry)}" fill="#3a5578"/>'
            f'<path d="M{f(cx - 2.2)},{f(top - 0.2)} L{f(cx - 2.2)},{f(top - 1.6)} A2.2,0.75 0 0 0 {f(cx + 2.2)},{f(top - 1.6)} L{f(cx + 2.2)},{f(top - 0.2)} Z" fill="#26364d"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top - 1.6)}" rx="2.2" ry="0.75" fill="#0b0f18"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top - 1.6)}" rx="2.2" ry="0.75" fill="none" stroke="#6f8fb8" stroke-width="0.18"/>'
            f'<path d="M{f(cx - 3.9)},{f(top + 1.2)} L{f(cx - 3.9)},{f(bot - 0.6)}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.55" stroke-linecap="round"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="#8fb0d8" stroke-opacity="0.55" stroke-width="0.16"/>')
    if t is None:
        lift, dx, dr = 0.0, 0.0, 0.0
    else:
        # lift out of the ink, write a few strokes in the air, dip back
        lift = 2.6 * smooth(t / 0.18) * (1 - smooth((t - 0.82) / 0.18))
        wr = smooth((t - 0.16) / 0.06) * (1 - smooth((t - 0.8) / 0.06))
        dx = wr * (0.55 * math.sin(2 * math.pi * 3 * t) + 0.25 * math.sin(2 * math.pi * 7 * t))
        lift += wr * 0.35 * math.sin(2 * math.pi * 6 * t + 0.7)
        dr = wr * 7 * math.sin(2 * math.pi * 3 * t + 0.9)
    quill = (f'<g transform="translate({f(0.2 + dx)},{f(-1.4 - lift)}) rotate({f(24 + dr)})">'
             '<path d="M-0.17,-0.7 L0,0.45 L0.17,-0.7 Z" fill="#232a38"/>'        # inked nib
             '<path d="M0,-0.6 C-0.2,-4 -0.4,-9 0.3,-15.5" stroke="#cdb48a" stroke-width="0.32" fill="none" stroke-linecap="round"/>'
             '<path d="M0.05,-3.2 C-2.6,-5.2 -3.6,-9.5 -2.2,-13.6 C-1.4,-15.6 0.1,-16.6 0.3,-15.5 Z" fill="url(#vaneL)"/>'
             '<path d="M0.05,-3.2 C1.9,-5.4 2.6,-10.2 1.5,-13.6 C1.0,-15.2 0.4,-16.2 0.3,-15.5 Z" fill="url(#vaneR)"/>'
             '<path d="M-1.6,-7 l-1.1,0.5 M-2.1,-10 l-0.9,0.3 M1.4,-8.6 l0.9,0.1" stroke="#b3a68d" stroke-width="0.14" stroke-linecap="round"/>'
             '<path d="M0.05,-3.2 C-0.1,-7 -0.1,-11 0.3,-15.5" stroke="#8c7a5c" stroke-width="0.12" fill="none"/>'
             '</g>')
    defs = ('<linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f5f8a"/>'
            '<stop offset="0.45" stop-color="#22344f"/><stop offset="1" stop-color="#0f1726"/></linearGradient>'
            '<linearGradient id="vaneL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#ece3d0"/></linearGradient>'
            '<linearGradient id="vaneR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc4ad"/><stop offset="1" stop-color="#9c907a"/></linearGradient>'
            f'<clipPath id="above"><rect x="-20" y="-40" width="40" height="{f(40 + top - 1.6)}"/></clipPath>')
    minx, miny, maxx, maxy = -5.6, -16.6, 7.6, 8.0
    return 'Quill and inkwell', (minx, miny, maxx - minx, maxy - miny), well + f'<g clip-path="url(#above)">{quill}</g>', defs


# ─── Combo: the face buttons of a Super Famicom pad, pressed in a combo ─────
# Real proportions: four equal round buttons (about 10.5 mm) in a diamond
# about 33 mm across, so each button's radius is ~0.47 of its distance from
# the centre.
COMBO_PRESSES = [(1, 3), (5, 2), (8, 1), (12, 0), (17, 1), (20, 2), (23, 3), (27, 1)]  # (frame, button)
COMBO_FRAMES = 32
PRESS_DEPTH = [0.75, 1.0, 0.45]   # frame by frame after a press starts


def snes_buttons(t=None):
    d = 2.95
    R = d * 0.47
    buttons = [(0, -d, '#3b5fd6'), (d, 0, '#d8262c'), (0, d, '#f2c414'), (-d, 0, '#2f9e48')]   # X, A, B, Y
    press = [0.0] * 4
    if t is not None:
        k = int(t * COMBO_FRAMES) % COMBO_FRAMES
        for start, bi in COMBO_PRESSES:
            j = (k - start) % COMBO_FRAMES
            if j < len(PRESS_DEPTH):
                press[bi] = max(press[bi], PRESS_DEPTH[j])
    base_r = d + R + 1.15
    defs = ('<radialGradient id="base" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#e9e6ee"/>'
            '<stop offset="0.7" stop-color="#c9c4d2"/><stop offset="1" stop-color="#9d97a8"/></radialGradient>')
    body = [f'<circle cx="0.25" cy="0.35" r="{f(base_r)}" fill="#4a4652"/>',
            f'<circle cx="0" cy="0" r="{f(base_r)}" fill="url(#base)"/>',
            f'<circle cx="0" cy="0" r="{f(base_r)}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.18"/>']
    wall = 0.42
    for i, (x, y, c) in enumerate(buttons):
        p = press[i]
        sink = wall * 0.8 * p
        w = wall - sink
        top_c = shade(c, -0.12 * p)
        defs += (f'<linearGradient id="t{i}" x1="0.15" y1="0.1" x2="0.85" y2="0.95"><stop offset="0" stop-color="{shade(top_c, 0.22)}"/>'
                 f'<stop offset="0.6" stop-color="{top_c}"/><stop offset="1" stop-color="{shade(top_c, -0.12)}"/></linearGradient>')
        ty = y + sink
        body += [f'<circle cx="{f(x)}" cy="{f(y + wall)}" r="{f(R + 0.2)}" fill="#7d7788" opacity="0.6"/>',                 # the hole it sits in
                 f'<circle cx="{f(x + 0.16)}" cy="{f(ty + w + 0.24)}" r="{f(R + 0.1)}" fill="#2a2630" opacity="{f(0.4 * (1 - p * 0.6))}"/>',
                 f'<circle cx="{f(x)}" cy="{f(ty + w)}" r="{f(R)}" fill="{shade(c, -0.42)}"/>',
                 f'<rect x="{f(x - R)}" y="{f(ty)}" width="{f(2 * R)}" height="{f(max(w, 0.001))}" fill="{shade(c, -0.42)}"/>',
                 f'<circle cx="{f(x)}" cy="{f(ty)}" r="{f(R)}" fill="url(#t{i})"/>',
                 f'<path d="M{f(x - R * 0.82)},{f(ty + R * 0.2)} A{f(R * 0.86)},{f(R * 0.86)} 0 0 1 {f(x + R * 0.35)},{f(ty - R * 0.8)}" '
                 f'fill="none" stroke="#ffffff" stroke-opacity="{f(0.45 * (1 - 0.5 * p))}" stroke-width="0.2" stroke-linecap="round"/>',
                 f'<circle cx="{f(x)}" cy="{f(ty)}" r="{f(R)}" fill="none" stroke="{shade(c, -0.3)}" stroke-opacity="0.6" stroke-width="0.12"/>']
    e = base_r + 0.5
    return 'Super Famicom buttons', (-e, -e, 2 * e, 2 * e), '\n'.join(body), defs


# ─── Pyramid: a golden square pyramid, turning slowly on its axis ───────────
def pyramid(t=None):
    yaw = math.radians(-22) + (0.0 if t is None else t) * math.pi / 2   # a quarter turn per loop
    pitch = math.radians(24)
    Hh = 1.3
    cy_, sy_ = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)

    def view(p):
        x, y, z = p
        x, z = x * cy_ + z * sy_, -x * sy_ + z * cy_
        y, z = y * cp - z * sp, y * sp + z * cp
        return (x, y, z)
    base = [view(p) for p in [(-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1)]]
    apex = view((0, Hh, 0))
    ctr = view((0, Hh * 0.25, 0))
    scr = lambda p: (p[0], -p[1])
    L = (-0.55, 0.75, 0.45)
    ln = math.sqrt(sum(c * c for c in L))
    L = tuple(c / ln for c in L)
    light = ['#fff6d2', '#f8d567', '#dda22c', '#a86a12']
    dark = ['#e0a63c', '#b8781c', '#7a4808', '#4a2a03']
    faces, defs, body = [], '', []
    for i in range(4):
        a, b = base[i], base[(i + 1) % 4]
        u = [a[k] - apex[k] for k in range(3)]
        v = [b[k] - apex[k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        cen = [(apex[k] + a[k] + b[k]) / 3 for k in range(3)]
        if sum(n[k] * (cen[k] - ctr[k]) for k in range(3)) < 0:
            n = [-c for c in n]
        nl = math.sqrt(sum(c * c for c in n))
        n = [c / nl for c in n]
        if n[2] <= 0.02:
            continue
        faces.append((cen[2], i, a, b, n))
    faces.sort()
    visible = {i for _, i, *_ in faces}
    for _, i, a, b, n in faces:
        s = smooth((sum(n[k] * L[k] for k in range(3)) - 0.05) / 0.75)
        stops = [mix(dark[k], light[k], s) for k in range(4)]
        A, B, P = scr(apex), scr(a), scr(b)
        mid = ((B[0] + P[0]) / 2, (B[1] + P[1]) / 2)
        defs += (f'<linearGradient id="g{i}" gradientUnits="userSpaceOnUse" x1="{f(A[0])}" y1="{f(A[1])}" x2="{f(mid[0])}" y2="{f(mid[1])}">'
                 + ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in zip((0, 0.32, 0.72, 1), stops)) + '</linearGradient>')
        body.append(f'<polygon points="{f(A[0])},{f(A[1])} {f(B[0])},{f(B[1])} {f(P[0])},{f(P[1])}" fill="url(#g{i})"/>')
        lc = f'rgba({round(140 - 110 * (1 - s))},{round(84 - 70 * (1 - s))},{round(8 * s)},{f(0.22 + 0.04 * (1 - s))})'
        for fr in (0.2, 0.4, 0.6, 0.8):
            p1 = (A[0] + (B[0] - A[0]) * (1 - fr), A[1] + (B[1] - A[1]) * (1 - fr))
            p2 = (A[0] + (P[0] - A[0]) * (1 - fr), A[1] + (P[1] - A[1]) * (1 - fr))
            body.append(f'<line x1="{f(p1[0])}" y1="{f(p1[1])}" x2="{f(p2[0])}" y2="{f(p2[1])}" stroke="{lc}" stroke-width="0.011"/>')
        c1 = (A[0] + (B[0] - A[0]) * 0.13, A[1] + (B[1] - A[1]) * 0.13)
        c2 = (A[0] + (P[0] - A[0]) * 0.13, A[1] + (P[1] - A[1]) * 0.13)
        body.append(f'<polygon points="{f(A[0])},{f(A[1])} {f(c1[0])},{f(c1[1])} {f(c2[0])},{f(c2[1])}" fill="{mix("#f2c96e", "#fffbe6", s)}"/>')
    # the front ridge between two lit faces catches the light
    best = None
    for i in range(4):
        if i in visible and (i - 1) % 4 in visible and (best is None or base[i][2] > base[best][2]):
            best = i
    if best is not None:
        A, B = scr(apex), scr(base[best])
        body.append(f'<line x1="{f(A[0])}" y1="{f(A[1])}" x2="{f(B[0])}" y2="{f(B[1])}" stroke="#fff6d6" stroke-width="0.016" stroke-linecap="round" opacity="0.85"/>')
    A = scr(apex)
    body.append(f'<circle cx="{f(A[0])}" cy="{f(A[1] + 0.03)}" r="0.026" fill="#ffffff" opacity="0.9"/>')
    r = math.sqrt(2)
    top_y = -Hh * cp
    vb = (-r - 0.06, top_y - 0.06, 2 * r + 0.12, (r * sp) - top_y + 0.12)
    return 'Golden pyramid', vb, '\n'.join(body), defs


# ─── Brick: a red 2x4; when zoomed in, bricks drop on and join it ───────────
ISO_C, ISO_S = math.cos(math.pi / 6), math.sin(math.pi / 6)
BRICK_H, STUD_R, STUD_H = 9.6, 2.4, 1.7
BRICK_PAL = {
    'red':    dict(top='#e5341f', front='#c91a09', side='#8f1207', stud='#f04a33', hi='#ff8a70', g=('#d42410', '#b3170a', '#7d1006'), edge='#ff7a5c', line='#4a0904'),
    'blue':   dict(top='#3a78c8', front='#1e5aa8', side='#123a70', stud='#4d8ad6', hi='#a8cbf2', g=('#2a66b4', '#1c4f94', '#10305c'), edge='#7fb0ea', line='#0a1c38'),
    'yellow': dict(top='#f8dc5e', front='#f2cd37', side='#b08d12', stud='#fbe270', hi='#fff4c0', g=('#f0c830', '#d6ad1c', '#9a7a0c'), edge='#fff0a0', line='#5a4606'),
}


def iso(x, y, z):
    return ((x - y) * ISO_C, (x + y) * ISO_S - z)


def iso_brick(ox, oy, oz, nx, ny, color, opacity=1.0):
    pal = BRICK_PAL[color]
    Lx, Wy, H = 8 * nx, 8 * ny, BRICK_H
    P = lambda x, y, z: iso(x + ox, y + oy, z + oz)
    poly = lambda ps: ' '.join(f'{f(a)},{f(b)}' for a, b in ps)
    out = [f'<polygon points="{poly([P(0, 0, H), P(Lx, 0, H), P(Lx, Wy, H), P(0, Wy, H)])}" fill="{pal["top"]}"/>',
           f'<polygon points="{poly([P(0, Wy, H), P(Lx, Wy, H), P(Lx, Wy, 0), P(0, Wy, 0)])}" fill="{pal["front"]}"/>',
           f'<polygon points="{poly([P(Lx, 0, H), P(Lx, Wy, H), P(Lx, Wy, 0), P(Lx, 0, 0)])}" fill="{pal["side"]}"/>']
    rx, ry = STUD_R * math.sqrt(1.5), STUD_R * math.sqrt(0.5)
    for sx, sy in sorted(((4 + 8 * i, 4 + 8 * j) for i in range(nx) for j in range(ny)), key=lambda c: c[0] + c[1]):
        bx, by = P(sx, sy, H)
        tx, ty = P(sx, sy, H + STUD_H)
        out.append(f'<path d="M{f(bx - rx)},{f(ty)} L{f(bx - rx)},{f(by)} A{f(rx)},{f(ry)} 0 0 0 {f(bx + rx)},{f(by)} L{f(bx + rx)},{f(ty)} Z" fill="url(#stud_{color})"/>')
        out.append(f'<ellipse cx="{f(tx)}" cy="{f(ty)}" rx="{f(rx)}" ry="{f(ry)}" fill="{pal["stud"]}"/>')
        out.append(f'<ellipse cx="{f(tx - rx * 0.22)}" cy="{f(ty - ry * 0.18)}" rx="{f(rx * 0.42)}" ry="{f(ry * 0.34)}" fill="{pal["hi"]}" opacity="0.55"/>')
    for (a, b), (c, d) in [(P(0, Wy, H), P(Lx, Wy, H)), (P(Lx, 0, H), P(Lx, Wy, H)), (P(Lx, Wy, H), P(Lx, Wy, 0))]:
        out.append(f'<line x1="{f(a)}" y1="{f(b)}" x2="{f(c)}" y2="{f(d)}" stroke="{pal["edge"]}" stroke-opacity="0.45" stroke-width="0.35"/>')
    out.append(f'<polygon points="{poly([P(0, 0, H), P(Lx, 0, H), P(Lx, 0, 0), P(Lx, Wy, 0), P(0, Wy, 0), P(0, Wy, H)])}" fill="none" stroke="{pal["line"]}" stroke-width="0.45" stroke-linejoin="round"/>')
    g = '\n'.join(out)
    return g if opacity >= 0.999 else f'<g opacity="{f(opacity)}">{g}</g>'


def brick_defs(colors):
    return ''.join(f'<linearGradient id="stud_{c}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="{BRICK_PAL[c]["g"][0]}"/>'
                   f'<stop offset="0.55" stop-color="{BRICK_PAL[c]["g"][1]}"/><stop offset="1" stop-color="{BRICK_PAL[c]["g"][2]}"/></linearGradient>'
                   for c in colors)


BRICK_DROP = 22.0   # how far above the brick a falling brick starts


def _drop(t, t0, t1):
    """Height above its seat: falls with gravity from t0, lands at t1, small settle."""
    if t < t0:
        return None
    if t < t1:
        u = (t - t0) / (t1 - t0)
        return BRICK_DROP * (1 - u * u)
    j = t - t1
    return 0.9 * math.sin(math.pi * j / 0.05) if j < 0.05 else 0.0


def brick(t=None):
    L, W, H = 32.0, 16.0, BRICK_H
    pts = [iso(x, y, z) for x in (0, L) for y in (0, W) for z in (0, H + STUD_H)]
    pad = 1.2
    minx = min(p[0] for p in pts) - STUD_R * 1.3 - pad
    maxx = max(p[0] for p in pts) + STUD_R * 1.3 + pad
    miny = min(p[1] for p in pts) - STUD_R - pad
    maxy = max(p[1] for p in pts) + pad
    body = [iso_brick(0, 0, 0, 4, 2, 'red')]
    colors = ['red']
    if t is not None:
        fade = 1 - smooth((t - 0.84) / 0.14)
        # a yellow 1x2 at the left end, then a blue 2x2 on the right half
        for (ox, oy, nx, ny, col, t0, t1) in [(0, 0, 1, 2, 'yellow', 0.04, 0.26), (16, 0, 2, 2, 'blue', 0.36, 0.58)]:
            z = _drop(t, t0, t1)
            if z is None or fade <= 0.001:
                continue
            body.append(iso_brick(ox, oy, H + z, nx, ny, col, fade))
            colors.append(col)
    return 'Red 2x4 brick', (minx, miny, maxx - minx, maxy - miny), '\n'.join(body), brick_defs(['red', 'yellow', 'blue'])


# ─── Output ──────────────────────────────────────────────────────────────────
# name: (function, frames, frames per second, extra room around the frame as
# fractions of the icon's width/height: left, top, right, bottom)
ICONS = {
    'combo-buttons': (snes_buttons, COMBO_FRAMES, 12, (0, 0, 0, 0)),
    'berzerk-robot': (berzerk, len(BERZERK_EYE), 6, (0, 0, 0, 0)),
    'missile-command': (missile_command, 36, 12, (0, 0, 0, 0)),
    'chronicler-xi': (chronicler, 24, 12, (0, 0.06, 0, 0.06)),
    'about-question': (question, 0, 0, None),
    'white-sable': (sable, 30, 15, (0.06, 0.03, 0.02, 0.02)),
    'blog-quill': (blog, 40, 12, (0.04, 0.12, 0.1, 0)),
    'pyramid': (pyramid, 45, 15, (0, 0, 0, 0)),
    'brick-2x4': (brick, 48, 15, (0, 0.62, 0, 0)),
}


def prefix_ids(s, k):
    s = re.sub(r'id="([^"]+)"', rf'id="f{k}_\1"', s)
    s = re.sub(r'url\(#([^)]+)\)', rf'url(#f{k}_\1)', s)
    return re.sub(r'href="#([^"]+)"', rf'href="#f{k}_\1"', s)


def sheet(name, fn, n, ext):
    title, (mx, my, w, h), _, _ = fn(None)
    l, tp, r, b = ext
    fx, fy, fw, fh = mx - l * w, my - tp * h, w * (1 + l + r), h * (1 + tp + b)
    cols = min(n, 8)
    rows = math.ceil(n / cols)
    frames = []
    for k in range(n):
        _, _, body, defs = fn(k / n)
        cx, cy = (k % cols) * fw, (k // cols) * fh
        frames.append(f'<svg x="{f(cx)}" y="{f(cy)}" width="{f(fw)}" height="{f(fh)}" viewBox="{f(fx)} {f(fy)} {f(fw)} {f(fh)}" overflow="hidden">'
                      + (f'<defs>{prefix_ids(defs, k)}</defs>' if defs else '') + prefix_ids(body, k) + '</svg>')
    scale = 64 / fh   # natural size only sets proportions
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{round(cols * fw * scale)}" height="{round(rows * fh * scale)}" '
           f'viewBox="0 0 {f(cols * fw)} {f(rows * fh)}">\n<title>{title} (animation)</title>\n' + '\n'.join(frames) + '\n</svg>\n')
    return doc, dict(src=f'assets/icons/anim/{name}.svg', n=n, cols=cols, rows=rows, ext=list(ext), aspect=fw / fh)


if __name__ == '__main__':
    ANIM.mkdir(exist_ok=True)
    manifest = {}
    for name, (fn, n, fps, ext) in ICONS.items():
        title, vb, body, defs = fn(None)
        (OUT / f'{name}.svg').write_text(svg(title, *vb, body, defs, scale=SCALE if vb[3] > 6 else 64 / vb[3] * 2))
        print('wrote', f'{name}.svg')
        if n:
            doc, meta = sheet(name, fn, n, ext)
            (ANIM / f'{name}.svg').write_text(doc)
            meta['fps'] = fps
            manifest[name] = meta
            print('wrote', f'anim/{name}.svg', n, 'frames')
    (ANIM / 'manifest.js').write_text('// Generated by assets/icons/make_icons.py: animation sheets for the front-page icons.\n'
                                      'window.ICON_ANIMS = ' + json.dumps(manifest, indent=1) + ';\n')
    print('wrote anim/manifest.js')
