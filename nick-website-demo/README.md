# Reading profiles — demo

A markdown post, rendered four different ways. The point is to pick a house
style by feeling it on a phone rather than arguing about it in the abstract.

Live: `/nick-website-demo/`

- `?post=some-file.md` loads a specific post
- `?profile=tidewater` overrides the post's default profile

## The four profiles

| id | name | what it does | cost |
|---|---|---|---|
| `tidewater` | Tidewater | Every glyph drifts, rotated and dark, until a draggable focus lens pulls it back onto its line and brightens it. Past the lens it lets go again. | Canvas, per-glyph physics. Heaviest. |
| `lantern` | Lantern | Same reading-band idea at line granularity. Lines sit dim and offset, then settle and brighten inside the band. | DOM, ~60 elements. Cheap. |
| `ledger` | Ledger | Lines are blank until they cross a write head, then ink in left-to-right and stay written. | Canvas, no physics. Medium. |
| `foundry` | Foundry | No motion. Ordinary flowing text, selectable and copyable. | DOM. Free. |

Tidewater is the one that was asked for. Foundry is the control group — it
exists so the other three have something to be judged against, and so there is
somewhere sane to fall back to.

## Adding a post

1. Drop a `.md` file in `posts/`.
2. Add it to `posts/manifest.json`.
3. Put front matter at the top of the markdown:

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

`profile:` is the default rendering for that post. Readers can still switch from
the demo panel. Everything except `title` is optional.

### Supported markdown

`#`/`##`/`###` headings, paragraphs, `>` blockquotes, `---` rules. A paragraph
wrapped entirely in a single pair of asterisks becomes an italic note block —
that is how the editorial preamble and the `-Nick` sign-off are styled.

**Known gap:** inline emphasis mid-sentence is flattened to plain text. Styling
it properly means measuring mixed fonts on a single line, which is what
`@chenglou/pretext/rich-inline` is for. That is the honest next step; faking it
by laying out each run separately would produce wrong line breaks.

## ⚠️ `.nojekyll` is required

GitHub Pages runs Jekyll by default, and Jekyll converts any `.md` file that has
YAML front matter into `.html`. That would turn `posts/overcoming-the-classics.md`
into a 404 at runtime.

Copy the `.nojekyll` file to the **repository root** (not this folder). It is
empty; its presence is the whole signal. The site is hand-written static HTML
with no Jekyll templating, so disabling Jekyll costs nothing.

If you would rather not touch the repo root, the alternative is to drop front
matter entirely and move `profile` into `manifest.json` — Jekyll passes through
markdown that has no front matter.

## How Pretext is used

[`@chenglou/pretext`](https://github.com/chenglou/pretext) (loaded from
`esm.sh`, ~15KB) does the line breaking. It measures text with canvas font
metrics instead of DOM reads, so there is no `getBoundingClientRect`, no reflow,
and re-typesetting on rotate does not make the page lurch.

Three things fall out of that:

- **`prepareWithSegments` + `layoutWithLines`** give the committed lines and
  their real widths. Every profile builds on those coordinates — one typeset
  pass, four skins.
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
assets/
  app.js                 loading, scroll clock, profile mounting, control panel
  md.js                  front matter + block markdown
  typeset.js             Pretext wrapper: blocks -> lines -> glyph positions
  styles.css
  profiles/
    tidewater.js  lantern.js  ledger.js  foundry.js
posts/
  manifest.json
  overcoming-the-classics.md
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

- **Accessibility.** All four visual layers are `aria-hidden`. A real
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
- Images. Nick's posts have them; the parser drops them to alt text today.
- Tidewater has no scroll-position memory, so a very long post means a lot of
  glyph churn. Above roughly 15,000 characters it should page by section.
