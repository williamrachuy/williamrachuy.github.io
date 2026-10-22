#!/usr/bin/env python3
"""Front-page icons, drawn as small solid objects lit from the upper left
(the same look as the 2x4 brick and the golden pyramid).

Run from the repo root:  python3 assets/icons/make_icons.py
Writes assets/icons/*.svg. Needs fontTools only for the question mark.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent
SCALE = 8  # natural pixel size per SVG unit (only the aspect ratio matters to the page)


def f(v):
    return f"{v:.2f}".rstrip('0').rstrip('.')


def svg(title, minx, miny, w, h, body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{round(w * SCALE)}" height="{round(h * SCALE)}" '
            f'viewBox="{f(minx)} {f(miny)} {f(w)} {f(h)}">\n<title>{title}</title>\n'
            + (f'<defs>{defs}</defs>\n' if defs else '') + body + '\n</svg>\n')


# ─── Voxel slabs: pixel art extruded backwards, receding up and to the right ──
# Front faces stay square so the pixel art reads exactly; tops are lit, right
# sides are in shade, and only the outer edges of each run get a bevel line.

def voxels(rows, palette, u=1.0, depth=0.9, outline='#000', bevel=True):
    """rows: list of strings; palette: char -> (front, top, side) or None for empty."""
    dx, dy = depth * 0.62 * u, -depth * 0.48 * u
    H, W = len(rows), max(len(r) for r in rows)
    cell = lambda r, c: rows[r][c] if 0 <= r < H and 0 <= c < len(rows[r]) and rows[r][c] in palette else None
    sides, fronts, lines = {}, {}, []
    sq = lambda pts: 'M' + ' L'.join(f'{f(a)},{f(b)}' for a, b in pts) + ' Z'
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
                hi = 'rgba(255,255,255,0.55)'
                lo = 'rgba(0,0,0,0.35)'
                w = 0.09 * u
                if not cell(r - 1, c):
                    lines.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(u)}" height="{f(w)}" fill="{hi}"/>')
                if not cell(r, c - 1):
                    lines.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(u)}" fill="{hi}" opacity="0.7"/>')
                if not cell(r + 1, c):
                    lines.append(f'<rect x="{f(x)}" y="{f(y + u - w)}" width="{f(u)}" height="{f(w)}" fill="{lo}"/>')
                if not cell(r, c + 1):
                    lines.append(f'<rect x="{f(x + u - w)}" y="{f(y)}" width="{f(w)}" height="{f(u)}" fill="{lo}" opacity="0.8"/>')
    bounds = (0, dy, W * u + dx, H * u - dy)
    paths = [f'<path d="{" ".join(d)}" fill="{c}"/>' for c, d in list(sides.items()) + list(fronts.items())]
    return '\n'.join(paths + lines), bounds


def shade(hex_, k):
    """k>0 lightens toward white, k<0 darkens toward black."""
    r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
    t = (255 if k > 0 else 0)
    k = abs(k)
    return '#' + ''.join(f'{round(v + (t - v) * k):02x}' for v in (r, g, b))


def trio(base):
    return (base, shade(base, 0.38), shade(base, -0.45))


# ─── Berzerk: the robot ──────────────────────────────────────────────────────
def berzerk():
    rows = [
        '..YYYY..',
        '.YVVEVY.',
        '.YYYYYY.',
        '...YY...',
        'YYYYYYYY',
        'Y.YYYY.Y',
        'Y.YYYY.Y',
        '..YYYY..',
        '..Y..Y..',
        '..Y..Y..',
        '.YY..YY.',
    ]
    pal = {'Y': trio('#e8c81a'), 'V': ('#2a2206', '#4a3d0c', '#1a1504'), 'E': ('#ff3a22', '#ff8a70', '#a8180c')}
    body, (x0, y0, w, h) = voxels(rows, pal, depth=0.95)
    glow = '<radialGradient id="eye"><stop offset="0" stop-color="#ff6a50" stop-opacity="0.9"/><stop offset="1" stop-color="#ff2a10" stop-opacity="0"/></radialGradient>'
    body += '\n<circle cx="4.5" cy="1.5" r="1.25" fill="url(#eye)"/>'
    pad = 0.3
    return svg('Berzerk robot', x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad, body, glow)


# ─── Missile Command: cities under an incoming warhead and a counter-burst ───
def missile_command():
    rows = [
        '....G.....',
        '..G.GG..G.',
        '.GGGGG.GGG',
        'GGGGGGGGGG',
    ]
    u = 1.0
    body, (x0, y0, w, h) = voxels(rows, {'G': trio('#e0b93c')}, u=u, depth=1.0)
    oy = 7.4  # the city sits below the sky
    city = f'<g transform="translate(0,{f(oy)})">{body}</g>'
    # Incoming warhead: a red trail from the upper left, white-hot head.
    tx0, ty0, tx1, ty1 = -0.6, -1.6, 4.2, 4.8
    trail = (f'<line x1="{f(tx0)}" y1="{f(ty0)}" x2="{f(tx1)}" y2="{f(ty1)}" stroke="#e83a2c" stroke-width="0.6" stroke-linecap="round" opacity="0.35"/>'
             f'<line x1="{f(tx0)}" y1="{f(ty0)}" x2="{f(tx1)}" y2="{f(ty1)}" stroke="url(#trail)" stroke-width="0.32" stroke-linecap="round"/>'
             f'<rect x="{f(tx1 - 0.45)}" y="{f(ty1 - 0.45)}" width="0.9" height="0.9" fill="#fff6e8"/>')
    # Counter-missile burst (blue) to the right, with its thin rising trail.
    bx, by = 8.4, 1.4
    burst = (f'<line x1="{f(bx + 1.4)}" y1="{f(oy + 0.2)}" x2="{f(bx)}" y2="{f(by)}" stroke="#3fa9f5" stroke-width="0.24" opacity="0.75"/>'
             f'<circle cx="{f(bx)}" cy="{f(by)}" r="2.4" fill="url(#burst)"/>')
    defs = ('<linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="-0.6" y1="-1.6" x2="4.2" y2="4.8">'
            '<stop offset="0" stop-color="#e83a2c" stop-opacity="0"/><stop offset="0.6" stop-color="#ff5a3c"/><stop offset="1" stop-color="#ffb08a"/></linearGradient>'
            '<radialGradient id="burst"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="#a8dcff"/>'
            '<stop offset="0.75" stop-color="#3fa9f5" stop-opacity="0.85"/><stop offset="1" stop-color="#3fa9f5" stop-opacity="0"/></radialGradient>')
    minx, miny = min(x0, tx0) - 0.5, -2.2
    maxx, maxy = max(x0 + w, bx + 2.4) + 0.3, oy + y0 + h + 0.3
    return svg('Missile Command', minx, miny, maxx - minx, maxy - miny, trail + burst + city, defs)


# ─── The Chronicler: Ξ, the readable carving, as three gold bars ─────────────
def chronicler():
    rows = [
        'XXXXXXX',
        '.......',
        '.XXXXX.',
        '.......',
        'XXXXXXX',
    ]
    body, (x0, y0, w, h) = voxels(rows, {'X': trio('#d6b86e')}, u=1.0, depth=1.25)
    pad = 0.3
    return svg('Chronicler inscription', x0 - pad, y0 - pad, w + 2 * pad, h + 2 * pad, body)


# ─── About: a solid question mark ────────────────────────────────────────────
def question():
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
        t = k / steps
        col = shade('#8f86a8', -0.35 * t)
        layers.append(f'<use href="#q" transform="translate({f(k * ddx)},{f(k * ddy)})" fill="{col}"/>')
    face = ('<use href="#q" fill="url(#qface)"/>'
            '<use href="#q" fill="none" stroke="#fffaf0" stroke-opacity="0.55" stroke-width="0.05"/>')
    defs = (f'<path id="q" transform="{tf}" d="{pen.getCommands()}"/>'
            '<linearGradient id="qface" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fffdf6"/>'
            '<stop offset="0.55" stop-color="#efe6d6"/><stop offset="1" stop-color="#cbbfd9"/></linearGradient>')
    pad = 0.35
    return svg('Question mark', -pad, steps * ddy - pad, gw + steps * ddx + 2 * pad, 10 - steps * ddy + 2 * pad,
               '\n'.join(layers) + '\n' + face, defs)


# ─── Cassie: the white sable, sitting (the picture book's pose) ──────────────
def sable():
    body = 'M-11,-2 C-17,-18 -15,-38 -8,-50 C-4,-58 7,-58 10,-50 C15,-38 16,-18 11,-2 Q0,2 -11,-2 Z'
    tail = 'M-6,-4 C-24,-2 -40,-8 -40,-20 C-40,-28 -30,-30 -24,-24 C-20,-16 -14,-10 -6,-10 Z'
    head = 'M-10,-61 C-11,-72 -1,-77 7,-73 C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55 C-4,-55 -9,-57 -10,-61 Z'
    neck = 'M-8,-50 C-4,-58 7,-58 10,-50 L6,-56 C2,-58 -4,-58 -8,-54 Z'
    shapes = [tail, body, neck, head]
    ears = '<circle cx="-4" cy="-73" r="4"/><circle cx="5" cy="-75" r="4"/>'
    depth = ''.join(f'<g transform="translate({f(k * 0.55)},{f(-k * 0.35)})" fill="{shade("#b9c3cf", -0.18 * k / 4)}">'
                    + ''.join(f'<path d="{d}"/>' for d in shapes) + ears + '</g>' for k in range(4, 0, -1))
    face = (f'<g fill="url(#fur)">' + ''.join(f'<path d="{d}"/>' for d in shapes) + ears + '</g>'
            '<path d="M-1,-50 C3,-42 7,-36 6,-26 C1,-28 -2,-34 -3,-42 Z" fill="#e6ebf0"/>'
            '<path d="M2,-36 q6,3 6,9 M7,-37 q6,3 5,9" stroke="#c3ccd6" stroke-width="2.6" stroke-linecap="round" fill="none"/>'
            '<path d="M-8,-2 v-6 M6,-2 v-6" stroke="#c3ccd6" stroke-width="4" stroke-linecap="round" fill="none"/>'
            '<circle cx="-4" cy="-73" r="1.6" fill="#c8d0da"/><circle cx="5" cy="-75" r="1.6" fill="#c8d0da"/>'
            '<circle cx="19" cy="-61" r="1.9" fill="#2e2620"/>'
            '<circle cx="8" cy="-66" r="1.9" fill="#1b1714"/><circle cx="8.6" cy="-66.6" r="0.55" fill="#ffffff"/>'
            '<path d="M-11,-2 C-17,-18 -15,-38 -8,-50 M11,-2 C16,-18 15,-38 10,-50 M-10,-61 C-11,-72 -1,-77 7,-73 '
            'C12,-71 16,-65 19,-61 C15,-57 8,-55 2,-55 M-6,-4 C-24,-2 -40,-8 -40,-20" stroke="#8d96a2" stroke-width="0.9" '
            'fill="none" stroke-linecap="round"/>')
    defs = ('<radialGradient id="fur" gradientUnits="userSpaceOnUse" cx="-6" cy="-62" r="64">'
            '<stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f6f4ee"/>'
            '<stop offset="1" stop-color="#d3dae3"/></radialGradient>')
    minx, miny, maxx, maxy = -42, -82, 24, 3
    return svg('White sable', minx, miny, maxx - minx, maxy - miny, depth + face, defs)


# ─── Blog: a quill standing in an inkwell ────────────────────────────────────
def blog():
    # Inkwell: a squat cylinder of dark blue glass, seen from slightly above.
    cx, top, bot, rx, ry = 0.0, 0.0, 6.0, 5.0, 1.7
    well = (f'<path d="M{f(cx - rx)},{f(top)} L{f(cx - rx)},{f(bot)} A{f(rx)},{f(ry)} 0 0 0 {f(cx + rx)},{f(bot)} L{f(cx + rx)},{f(top)} Z" fill="url(#glass)"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top)}" rx="{f(rx)}" ry="{f(ry)}" fill="#3a5578"/>'
            f'<path d="M{f(cx - 2.2)},{f(top - 0.2)} L{f(cx - 2.2)},{f(top - 1.6)} A2.2,0.75 0 0 0 {f(cx + 2.2)},{f(top - 1.6)} L{f(cx + 2.2)},{f(top - 0.2)} Z" fill="#26364d"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top - 1.6)}" rx="2.2" ry="0.75" fill="#0b0f18"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top - 1.6)}" rx="2.2" ry="0.75" fill="none" stroke="#6f8fb8" stroke-width="0.18"/>'
            f'<path d="M{f(cx - 3.9)},{f(top + 1.2)} L{f(cx - 3.9)},{f(bot - 0.6)}" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.55" stroke-linecap="round"/>'
            f'<ellipse cx="{f(cx)}" cy="{f(top)}" rx="{f(rx)}" ry="{f(ry)}" fill="none" stroke="#8fb0d8" stroke-opacity="0.55" stroke-width="0.16"/>')
    # Quill: shaft dipped into the well, vane sweeping up and to the right.
    quill = ('<g transform="translate(0.2,-1.4) rotate(24)">'
             '<path d="M0,0 C-0.2,-4 -0.4,-9 0.3,-15.5" stroke="#cdb48a" stroke-width="0.32" fill="none" stroke-linecap="round"/>'
             '<path d="M0.05,-3.2 C-2.6,-5.2 -3.6,-9.5 -2.2,-13.6 C-1.4,-15.6 0.1,-16.6 0.3,-15.5 Z" fill="url(#vaneL)"/>'
             '<path d="M0.05,-3.2 C1.9,-5.4 2.6,-10.2 1.5,-13.6 C1.0,-15.2 0.4,-16.2 0.3,-15.5 Z" fill="url(#vaneR)"/>'
             '<path d="M-1.6,-7 l-1.1,0.5 M-2.1,-10 l-0.9,0.3 M1.4,-8.6 l0.9,0.1" stroke="#b3a68d" stroke-width="0.14" stroke-linecap="round"/>'
             '<path d="M0.05,-3.2 C-0.1,-7 -0.1,-11 0.3,-15.5" stroke="#8c7a5c" stroke-width="0.12" fill="none"/>'
             '</g>')
    defs = ('<linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f5f8a"/>'
            '<stop offset="0.45" stop-color="#22344f"/><stop offset="1" stop-color="#0f1726"/></linearGradient>'
            '<linearGradient id="vaneL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#ece3d0"/></linearGradient>'
            '<linearGradient id="vaneR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfc4ad"/><stop offset="1" stop-color="#9c907a"/></linearGradient>')
    minx, miny, maxx, maxy = -5.6, -16.6, 7.6, 8.0
    # The shaft disappears into the ink: clip the quill at the opening.
    clip = f'<clipPath id="above"><rect x="-20" y="-30" width="40" height="{f(30 + top - 1.6)}"/></clipPath>'
    return svg('Quill and inkwell', minx, miny, maxx - minx, maxy - miny,
               well + f'<g clip-path="url(#above)">{quill}</g>', defs + clip)


# ─── Combo: the four face buttons of a Super Famicom pad ────────────────────
def snes_buttons():
    # X top (blue), A right (red), B bottom (yellow), Y left (green): domed
    # buttons on a pale grey base, lit from the upper left like the brick studs.
    R, d = 1.85, 2.95
    buttons = [(0, -d, '#3b5fd6'), (d, 0, '#d8262c'), (0, d, '#f2c414'), (-d, 0, '#2f9e48')]
    defs = ('<radialGradient id="base" cx="0.42" cy="0.38" r="0.7"><stop offset="0" stop-color="#e9e6ee"/>'
            '<stop offset="0.7" stop-color="#c9c4d2"/><stop offset="1" stop-color="#9d97a8"/></radialGradient>')
    body = [f'<circle cx="0.25" cy="0.35" r="{f(d + R + 1.0)}" fill="#4a4652"/>',
            f'<circle cx="0" cy="0" r="{f(d + R + 1.0)}" fill="url(#base)"/>',
            f'<circle cx="0" cy="0" r="{f(d + R + 1.0)}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.18"/>']
    # Buttons, not marbles: a short side wall below (the button stands up from
    # the base), a flat, barely domed top face with gentle shading, and a thin
    # rim highlight on the lit side instead of a glossy spot.
    wall = 0.42
    for i, (x, y, c) in enumerate(buttons):
        defs += (f'<linearGradient id="t{i}" x1="0.15" y1="0.1" x2="0.85" y2="0.95"><stop offset="0" stop-color="{shade(c, 0.22)}"/>'
                 f'<stop offset="0.6" stop-color="{c}"/><stop offset="1" stop-color="{shade(c, -0.12)}"/></linearGradient>')
        body += [f'<circle cx="{f(x + 0.18)}" cy="{f(y + wall + 0.28)}" r="{f(R + 0.12)}" fill="#2a2630" opacity="0.45"/>',   # contact shadow
                 f'<circle cx="{f(x)}" cy="{f(y + wall)}" r="{f(R)}" fill="{shade(c, -0.42)}"/>',                         # side wall
                 f'<rect x="{f(x - R)}" y="{f(y)}" width="{f(2 * R)}" height="{f(wall)}" fill="{shade(c, -0.42)}"/>',
                 f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(R)}" fill="url(#t{i})"/>',                                          # top face
                 f'<path d="M{f(x - R * 0.82)},{f(y + R * 0.2)} A{f(R * 0.86)},{f(R * 0.86)} 0 0 1 {f(x + R * 0.35)},{f(y - R * 0.8)}" '
                 f'fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.22" stroke-linecap="round"/>',          # rim highlight
                 f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(R)}" fill="none" stroke="{shade(c, -0.3)}" stroke-opacity="0.6" stroke-width="0.12"/>']
    e = d + R + 1.5
    return svg('Super Famicom buttons', -e, -e, 2 * e, 2 * e, '\n'.join(body), defs)


ICONS = {
    'combo-buttons.svg': snes_buttons,
    'berzerk-robot.svg': berzerk,
    'missile-command.svg': missile_command,
    'chronicler-xi.svg': chronicler,
    'about-question.svg': question,
    'white-sable.svg': sable,
    'blog-quill.svg': blog,
}

if __name__ == '__main__':
    for name, fn in ICONS.items():
        (OUT / name).write_text(fn())
        print('wrote', name)
