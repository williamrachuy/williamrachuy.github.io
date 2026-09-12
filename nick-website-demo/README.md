# Reading profiles — demo

A markdown post, rendered nine different ways. The point is to pick a house
style by feeling it on a phone rather than arguing about it in the abstract.

Live: `/nick-website-demo/`

- `/nick-website-demo/` is the feed — one card per post, newest first
- `?post=overcoming-the-classics` opens that post
- `?profile=tidewater` overrides the post's default profile

To publish, put a markdown file in `posts/` and commit it. There is no step two.

## The two views

**The feed** is the landing page: a card per post showing date, title, subtitle
and the opening few lines, newest first — the same shape as `/blog` on this
site. It is ordinary flowing text, selectable and searchable, because choosing
what to read is a different job from reading it.

At the top of the feed is a **QR code for the published address**, so the site
can be handed to someone standing next to you without anybody typing it. It is
a committed SVG drawn by `tools/make-qr.py` — nothing generates a code at
runtime and no library is loaded to show one, the same way the pictures and the
font are files in the repo rather than requests to somebody else's server. It
encodes the live URL rather than `location.href` on purpose: the point is to
hand over the published site, not the localhost you happen to be previewing on.
Re-run the script if the address ever changes.

**A post** is the reading experience, in one of the nine profiles below.

The only difference between the two is `?post=` in the address, so every view is
a real URL you can link to, bookmark, or reload, and the back button does what
it should. Cards are real `<a href>` links, so the feed is navigable even before
the script runs.

## Looping

A post has a definite top — the browser clamps at zero, and above the first line
there is only the top pad. Reach the bottom and it hands straight back to the
top and keeps going.

It works by laying the post out **twice**, one pass after the other with a gap
between. With both passes present, the view at `scrollY` and the view at
`scrollY + period` are the same picture, so jumping the scroll position back by
exactly one period cannot be seen. That is the entire mechanism, and it means no
profile has to know looping exists: each one renders a long document and culls
it by y as it already did.

Only the tail is duplicated. `state.doc` stays the post as written, so the
accessible mirror, the page title and the card feed never stutter.

The period is measured, not summed — margin collapsing and skipped broken images
both move things around, and the two passes are laid out identically so the
offset between them is exact by construction. It is then rounded, because the
spacer is sized in whole pixels: leaving it fractional makes `scrollY >= period`
compare 5493 against 5493.4, and the wrap never fires at all.

### What is rendered

Nothing far from the viewport is drawn.

- The canvas profiles binary-search the glyph array for the visible span and
  stop at the far edge, so doubling the post does not double per-frame work.
- Lantern takes a line out of the document entirely once it is more than 300px
  beyond the viewport, and puts it back on the way in. On the longest post that
  is 23 to 43 live lines out of 378.
- Foundry is left alone on purpose. It is the control group: ordinary flowing
  text that stays selectable and findable, which virtualising would break.

## The nine profiles

| id | name | what it does | cost |
|---|---|---|---|
| `waterline` | Waterline | One line of pixels where the type is truly on its mark; a feather above and below where everything is caught mid-snap. The feather is a speed, not a shape — widening it does not widen the area of correct text, it gives glyphs longer to arrive. Distance also takes size, down to `farSize`. `falloff` sets how concentrated the gradient is near the line; `balance` splits the feather's reach between the approach and the departure, for a slow roll on against a sharp roll off or the reverse. | Canvas, per-glyph physics. |
| `tidewater` | Tidewater | Every glyph drifts, rotated and dark, until a draggable focus lens pulls it back onto its line and brightens it. Past the lens it lets go again. | Canvas, per-glyph physics. Heaviest. |
| `lantern` | Lantern | Same reading-band idea at line granularity. Lines sit dim and offset, then settle and brighten inside the band. | DOM, ~60 elements. Cheap. |
| `ledger` | Ledger | Lines are blank until they cross a write head, then ink in left-to-right and stay written. | Canvas, no physics. Medium. |
| `meniscus` | Meniscus | Nothing is composed and nothing composes itself. Every glyph drifts near where it belongs, small, dim and tilted, rocking slowly around its own angle. A tap drops a meniscus: inside it the type is pulled onto its true positions, unwinds to true vertical, and comes up to full size and full brightness — and it is the only thing holding it there. Each decays on a half-life and the words go back to drifting, so reading is something you keep doing. Menisci crowd each other — the more there are, the faster the older ones give out. | Canvas, per-glyph, plus a handful of distance checks. |
| `cipher` | Cipher | Waterline's gradient spent on identity rather than position. Nothing moves; what changes is which character is drawn. Far from the line a glyph shows something else and keeps churning, and the closer it comes the more likely each turn lands on the character that belongs. `Correct on the line` is that probability at the line itself, so at 1 the line resolves clean and below it the text reads but flickers. `Churn` is how often a glyph reconsiders itself: about twice a second out in the noise at the default, and roughly every two and a half seconds on the line, where it is held rather than merely correct. Some fraction of changes release energy that runs off down that glyph's own line as a pulse — sparse enough that a line carries one or two currents at a time and you can watch one travel, rather than a wash. `Energy` sets how many and how bright; at 0 the field is just the gradient. Green, and set in Share Tech Mono throughout — the profile declares its own family and `typeset()` measures against it, so line breaking and every glyph position come out of that font's metrics rather than the serif's. The noise alphabet is half-width katakana (U+FF66-FF9D) with digits and Latin, drawn mirrored about half the time, after the film's. | Canvas, no physics. |
| `marbles` | Marbles | The one light page: black type on paper with a few discs of coloured glass loose on top of it. Each carries the shell-shaped pressure field the first Meniscus had — no push at the centre, strongest at a ring partway out, nothing at the rim — so a word bends around the ring rather than being shoved off a point, and the ring is drawn where the push peaks so you can see the edge doing the work. Colour is a second field, strongest where the push is weakest: type under the middle keeps its shape and takes the marble's hue, type at the edge keeps its colour and gets moved. Nothing dims. They drift, they are pulled toward type by a density map of the page built at layout, and they can be picked up, dragged and thrown. | Canvas, plus one invisible grab element per marble. |
| `fracture` | Fracture | The other light page. Black type, set properly and perfectly still — scrolling does nothing to it. Tap it and it cracks the way an ice sheet cracks, into floes that turn on the water and drift until they stop. The sheet is held by bonds between neighbouring glyphs: the gap where a space used to be barely holds, letter to letter inside a word holds hard, so cracks run through the spaces first and words come off whole. Bonds get stronger as a piece gets shorter, so breaking converges on its own — a long word gives a handful of segments rather than loose letters — and ice already struck is easier to strike again, so a second press on a segment will shed a single character. Each piece is a rigid body with one centre of mass, one velocity and one spin, coasting on drag with nothing pulling it anywhere until `Reform` slides it home. | Canvas. Each floe is rasterised once into a shared 2048px sheet and only ever blitted after that — text drawn through a transform that changes every frame cannot use the glyph cache, and rasterising every glyph afresh each frame cost 35fps at the defaults. Window listeners that only watch. |
| `foundry` | Foundry | No motion. Ordinary flowing text, selectable and copyable. | DOM. Free. |

Tidewater is the one that was asked for, and Waterline is the same idea with the
window taken out of it. Foundry is the control group — it exists so the other
six have something to be judged against, and so there is somewhere sane to fall
back to.

## Publishing a post

Write a markdown file. Put it in `posts/`. Commit it. That is the entire
process — there is no index to update, no list to register it in, no folder to
create for it, and no build step to run. The page finds the file on its own.

```markdown
---
title: Overcoming the Classics
subtitle: A short interlude while I focus on my garden.
author: Nicholas Souza
publication: TBH Press
date: 2026-06-26
source: https://tbhpress.substack.com/p/overcoming-the-classics
profile: tidewater
---

Body text starts here.
```

Only `title` is required. The rest:

| field | what it does if you include it |
|---|---|
| `subtitle` | Second line under the title, in italic. Also the card's second line. |
| `author`, `publication` | Byline, joined with a dot. |
| `date` | Byline, and the sort order. **Newest post is what a visitor lands on.** Write it as `2026-06-26`. |
| `source` | Adds an "Original post" link for screen readers and search engines. |
| `excerpt` | What the card shows. Leave it out and the card uses the post's opening. |
| `profile` | Which of the nine renderings this post opens in. Readers can still switch. Overruled by `profiles.md` — see below. |

The filename becomes the post's link. `overcoming-the-classics.md` is at
`?post=overcoming-the-classics`. Keep filenames lowercase with dashes instead of
spaces and the links stay tidy.

### Which profile a post is set in

Three places can say, and the most specific one that does wins:

| | where | applies to |
|---|---|---|
| 1 | nothing said anywhere — **Foundry** | every post |
| 2 | `profile:` in the post's front matter | posts that have a `.md` file |
| 3 | a line in **`profiles.md`** | any post, and it beats 2 |

Rule 3 exists because of rule 2's limit. A post that comes in from Substack has
no file here to write `profile:` into, so without somewhere outside the post to
say, half the feed could never be set at all. `profiles.md` sits next to
`index.html` and is one line per post:

```
How Nodes Can Fix Broken Networks: cipher
montana-and-wyoming-travel-log: tidewater
```

Either name works — the post's title as it appears on its card, or the short
name from its web address — and capitals, spaces and punctuation are ignored on
both sides, so a title copied off the page matches whatever it happens to
contain. A line naming a profile that does not exist is reported in the console
and otherwise ignored, rather than silently doing nothing.

One line re-skins everything, over both of the rules above:

```
everything: cipher
```

A named line still beats it, so `everything:` is a background you can put
exceptions on rather than a switch that cancels the file.

Since this is the only place a Substack post's profile can be set,
`fetch-substack.py` does not assign one. It used to hand them out in rotation so
a browse showed some variety; that put a script's choice above the author's, in
a spot with nothing to point at when you wanted to change it. The variety now
comes from `profiles.md`, where it can be edited.

Above all three sits `?profile=` in the address, which is what the demo's chips
write. That is a preview, not a decision: it makes one particular rendering
shareable as a link, and it is never written back to any file. Picking a profile
in the panel shows the line that would make it permanent.

### About the posts currently in here

Everything on the site is TBH Press, from `https://tbhpress.substack.com/feed`.
The five `.md` files in `posts/` are the five most recent pieces, held locally
so they can be hand-edited; the rest of the archive arrives through the Substack
snapshot described below. Title, subtitle, byline, date and canonical URL are
the real metadata from that feed either way.

Nicholas Souza gave permission for his posts to be reproduced here, in a session
on 2026-09-11. Every post keeps a `source:` line pointing at the original on
TBH Press, which is where the canonical version lives.

Substack's own furniture — subscribe buttons, share links, embedded players — is
stripped on the way in. Photographs are kept, in the place they appear in the
piece, and are **copied into `posts/images/`** rather than hotlinked, so the
demo owns its own pictures and does not depend on a CDN or an account staying
open. 31 pictures, about 4.3 MB.

**The pictures have no alt text.** Substack did not carry any, and describing
someone else's photographs is not a thing to guess at. Write it in the square
brackets — `![two chairs on a cliff](https://…)` — and it reaches screen
readers, search engines, and anyone whose images fail to load.

### Taking a post down

Rename it from `something.md` to `something.md.offline`. It stops being a post
immediately, and the text is still sitting right there when you want it back.
Renaming it to `.md` republishes it. (This is the same trick `/blog` uses.)

To be clear about what that does and does not do: the post stops being listed
and stops being reachable as a post, but the file is still in a public
repository, so it is unpublished rather than private. Anything you would not
want read should not be committed at all.

### Where the posts come from

The feed has two sources and merges them at page load.

**Local markdown** — the `.md` files in `posts/`, discovered by asking GitHub
what is in that directory. There is no manifest, because a manifest is a second
thing to keep in sync and the first time it falls out of sync the post silently
vanishes. Title and date come out of each file's front matter. This is the same
mechanism `/blog` on this site uses.

**The Substack snapshot** — `posts/substack/`, a copy of the publication's RSS
feed. Substack sends no `Access-Control-Allow-Origin` header on either its RSS
feed or its JSON API, so a browser on this domain **cannot** read it directly;
the fetch has to happen somewhere other than the reader's browser. It happens at
build time, in `.github/workflows/pages.yml`, and the page then loads a
same-origin file.

Where the same piece appears in both, **the local file wins**, matched on the
canonical URL in its `source:` line. That is what makes dropping a `.md` file
into `posts/` an override: edit a post, add alt text, trim it, and your version
is what ships, while everything you have not touched keeps flowing in from
Substack on its own.

#### The scheduled refresh does not currently work

Substack is behind Cloudflare, which refuses the fetch from GitHub Actions
runner address ranges. The build step gets a bare `403 Forbidden`. This is an
address-based block, not a User-Agent one — the identical request returns `200`
from an ordinary connection on every User-Agent tried, and `403` from a runner
on all of them.

So the scheduled job runs, fails to reach the feed, raises a warning annotation,
and publishes the snapshot committed to the repo. **The archive on the site is
as of the last time someone ran the fetch script somewhere that can reach
Substack and committed the result.** The schedule is left in place, at daily,
so it heals itself if the block ever lifts.

Two ways to actually fix it, neither done here:

- **Fetch through a Cloudflare Worker.** A Worker calling Substack runs on
  Cloudflare's own edge rather than from a blocked range. Point `--feed` at the
  Worker and the build step starts working, with no other change. This is the
  same piece of infrastructure already behind `/combo`.
- **Refresh it from somewhere that can reach Substack** — a laptop, a home
  server — and commit the result. No new services; it just needs doing by hand.

The snapshot being committed is what keeps this from being fatal: a failed
fetch, a Substack outage, or a fresh checkout all fall back to the last good
copy rather than emptying the site's feed. If the snapshot is missing
altogether the feed falls back to local markdown only.

To refresh it by hand — which, per the above, is currently the only way it gets
refreshed — or to preview before pushing:

```sh
python3 tools/fetch-substack.py                        # defaults to TBH Press
python3 tools/fetch-substack.py --feed URL --limit 40  # any Substack
```

It writes `posts/substack/index.json` — every post's metadata and card blurb —
plus one small `<slug>.json` per body. The split is deliberate: the whole
archive in one file is about 47 KB gzipped and the landing page needs none of
the bodies to draw its cards, while the index alone is about 2 KB. A body is
fetched only when that post is opened.

It then calls `localize_images.py`, which copies any picture it does not already
have into `posts/images/` and repoints the markdown at the local copy. That runs
standalone too:

```sh
python3 tools/localize_images.py --dry-run   # report without downloading
python3 tools/localize_images.py             # copy and rewrite
```

Both are idempotent, so running either twice is a no-op.

**If you would rather it were live to the second,** the fetch needs a proxy that
adds the CORS header — a ~15-line Cloudflare Worker, the same shape as the relay
behind `/combo`. Point `SUBSTACK_INDEX` in `assets/posts.js` at it and the rest
of the page does not change. The trade is a second origin to keep running, and a
network round trip in front of the first paint.

### A note on the `.md.offline` trick and Substack

Renaming a local file to `.md.offline` removes *the local override*, not the
post. If that piece is also in the Substack feed, it comes straight back on the
next refresh — as the Substack copy. To keep a piece off the site entirely,
unpublish it on Substack, or drop `--limit` low enough to exclude it.

### Supported markdown

`#`/`##`/`###` headings, paragraphs, `>` blockquotes, `---` rules. A paragraph
wrapped entirely in a single pair of asterisks becomes an italic note block —
that is how the editorial preamble and the `-Nick` sign-off are styled.

**Pictures:** a line containing nothing but `![alt text](url)` becomes a figure.
It can be any URL — Substack's CDN, somewhere else, or a file committed next to
the post. Each profile renders it in its own idiom: Foundry sets it in the flow,
Lantern lifts it out of the dark as it reaches the reading band, Ledger develops
it downward under the write head, Tidewater lets it drift and rights it in the
lens.

A picture is never given more than 62% of the screen height, so a tall portrait
cannot fill the viewport on its own. One that fails to load is skipped and the
text closes over the gap. An image inside a sentence, rather than alone on its
own line, is still flattened to its alt text.

**Known gap:** inline emphasis mid-sentence is flattened to plain text. Styling
it properly means measuring mixed fonts on a single line, which is what
`@chenglou/pretext/rich-inline` is for. That is the honest next step; faking it
by laying out each run separately would produce wrong line breaks.

## A note on the Matrix font

Cipher is set in **Share Tech Mono** (Carrois Type Design, SIL OFL 1.1),
committed to `assets/fonts/` with its licence rather than hotlinked. It is a
13.5 KB Latin subset.

It is **not** the typeface from the film. That is a proprietary custom design by
Simon Whiteley, and neither it nor any recreation of it is shipped here. What is
reproduced is the documented technique: half-width katakana, mirrored, mixed
with digits and Latin.

Share Tech Mono has no katakana, so those come from whatever Japanese face the
reader's system provides. Cipher measures for one at mount — against a
private-use code point, which no font defines — and drops to Latin and digits
alone if the widths match, because a page of notdef boxes is worse than a page
with no katakana in it.

A profile that wants its own face sets `fontFamily` on itself and `typeset()`
measures with it. That matters more than it sounds: the same string is 190px in
the serif and 270px in Share Tech Mono, so a profile that swapped the font only
at draw time would put every character in the wrong place.

## `.nojekyll`

GitHub Pages runs Jekyll by default, and Jekyll converts any `.md` file that has
YAML front matter into `.html` — which would turn every post into a 404 at
runtime. The empty `.nojekyll` file at the **repository root** turns that off.

It is already there. This note exists so nobody deletes it wondering what it was
for.

## How Pretext is used

[`@chenglou/pretext`](https://github.com/chenglou/pretext) (loaded from
`esm.sh`, ~15KB) does the line breaking. It measures text with canvas font
metrics instead of DOM reads, so there is no `getBoundingClientRect`, no reflow,
and re-typesetting on rotate does not make the page lurch.

Three things fall out of that:

- **`prepareWithSegments` + `layoutWithLines`** give the committed lines and
  their real widths. Every profile builds on those coordinates — one typeset
  pass, nine skins.
- **`measureLineStats` binary search** (`balancedWidth` in `typeset.js`) finds
  the narrowest width that still yields the same line count, which is how the
  title and subtitle come out balanced instead of dropping one orphan word.
- Per-character x offsets are derived here, not by Pretext — it commits to a
  line, then `typeset.js` walks that line with incremental `measureText` to get
  grapheme positions for the canvas profiles.

If the CDN import fails or the browser lacks `Intl.Segmenter`, `typeset.js`
falls back to a greedy word wrapper and the badge in the control panel flips
from `pretext` to `fallback`. Nothing white-screens.

To vendor it instead of hitting a CDN: `npm pack @chenglou/pretext`, drop
`dist/` into `assets/vendor/`, and change `PRETEXT_CDN` at the top of
`typeset.js`.

## Layout / files

```
index.html
profiles.md              which profile each post is set in; beats front matter
assets/fonts/            Share Tech Mono (SIL OFL) + its licence; Cipher's face
tools/
  fetch-substack.py      build-time: RSS -> posts/substack/ (Substack has no CORS)
  localize_images.py     copies referenced pictures into posts/images/
  make-qr.py             redraws assets/qr-site.svg (needs `pip install segno`)
assets/
  qr-site.svg            the feed's QR code for the published address
  app.js                 routing, scroll clock, profile mounting, control panel
  assign.js              reads profiles.md and resolves which profile a post gets
  feed.js                the landing page: one card per post
  posts.js               merges local markdown with the Substack snapshot
  images.js              measures pictures before layout so nothing jumps
  posts.js               finds the posts; no manifest to maintain
  md.js                  front matter + block markdown
  typeset.js             Pretext wrapper: blocks -> lines -> glyph positions
  styles.css
  profiles/
    tidewater.js  lantern.js  ledger.js  marbles.js  fracture.js  foundry.js
posts/
  overcoming-the-classics.md      <- every .md in here is a post
  images/
    <uuid>.jpeg                   <- pictures, copied in rather than hotlinked
  substack/
    index.json                    <- build-time snapshot of the RSS feed
    <slug>.json                   <- one body each, fetched on open
```

`app.js` owns scrolling and time. Profiles know nothing about markdown, URLs, or
the control panel — they receive a layout and a frame callback.

## Writing a new profile

```js
export default {
  id: 'myprofile',
  name: 'My Profile',
  blurb: 'One line for the control panel.',
  params: [
    { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 2, step: 0.1, value: 1 },
    { key: 'glow',  label: 'Glow',  type: 'bool', value: true },
    { key: 'mode',  label: 'Mode',  type: 'enum', options: ['a', 'b'], value: 'a' }
  ],
  create(host) {
    const P = {}; for (const p of this.params) P[p.key] = p.value;
    return {
      params: P,
      setParam(k, v) { P[k] = v; },
      topPad(vp) { return vp.vh * 0.3; },      // scroll runway above content
      bottomPad(vp) { return vp.vh * 0.5; },   // and below
      setLayout(layout, viewport, pad, doc) { /* build */ },
      frame(t, dt, scrollY) { /* 60fps */ },
      contentHeight() { /* optional; defaults to layout.height */ },
      destroy() { /* remove your nodes */ }
    };
  }
};
```

Register it in the `PROFILES` array in `app.js`. The control panel builds itself
from `params`.

## Notes on the implementation

- **Accessibility.** All nine visual layers are `aria-hidden`. A real
  `<h1>/<p>` copy of the article lives in a visually-hidden div for screen
  readers, search engines, and JS-off. Tidewater's canvas text is not
  selectable; Lantern's and Foundry's is.
- **`prefers-reduced-motion`** forces Foundry on load.
- **Resize.** Only *width* changes trigger a re-typeset. Height-only changes are
  the mobile URL bar collapsing, and reacting to those makes the page jump.
- **Performance.** Glyph positions are sorted by y, so each frame binary-searches
  the visible span instead of touching all ~2,300 glyphs. Fill styles are
  quantized into 28 buckets and only reassigned when the bucket changes; the
  rotation transform is skipped entirely for glyphs that have straightened out.

## Not done yet

- Desktop-specific profiles. This is tuned for a phone; the cursor opens up
  hover and 2D pointer input that none of these use.
- Inline emphasis (see above).
- Captions. A picture is a picture; there is nowhere to say what it is of.
- A live Substack read. The snapshot refreshes on a schedule, not on page load;
  making it current to the second needs a CORS proxy (see above).
- Pictures are hotlinked from Substack's CDN. That is how they are served today
  and it works, but it makes the posts depend on an account staying open.
  Committing the files next to the posts would make this repo self-contained.
- Tidewater has no scroll-position memory, so a very long post means a lot of
  glyph churn. Above roughly 15,000 characters it should page by section.
