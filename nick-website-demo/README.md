# Reading profiles — demo

A markdown post, rendered four different ways. The point is to pick a house
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

**A post** is the reading experience, in one of the four profiles below.

The only difference between the two is `?post=` in the address, so every view is
a real URL you can link to, bookmark, or reload, and the back button does what
it should. Cards are real `<a href>` links, so the feed is navigable even before
the script runs.

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
| `profile` | Which of the four renderings this post opens in. Readers can still switch. |

The filename becomes the post's link. `overcoming-the-classics.md` is at
`?post=overcoming-the-classics`. Keep filenames lowercase with dashes instead of
spaces and the links stay tidy.

### About the posts currently in here

The five files in `posts/` are the five most recent TBH Press pieces, pulled
from `https://tbhpress.substack.com/feed`. Title, subtitle, byline, date and
canonical URL are the real metadata from that feed, and each file carries the
full text of the piece.

Nicholas Souza gave permission for his posts to be reproduced here, in a session
on 2026-09-11. Every post keeps a `source:` line pointing at the original on
TBH Press, which is where the canonical version lives.

Substack's own furniture — subscribe buttons, share links, embedded players — is
stripped on the way in. Photographs are kept, in the place they appear in the
piece, and are still served from Substack's CDN rather than copied into this
repo.

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

### How it finds the posts

There is no manifest because a manifest is a second thing to keep in sync, and
the first time it falls out of sync the post silently vanishes. Instead the page
asks GitHub what is in `posts/` — the same mechanism `/blog` on this site uses —
and reads the title and date out of each file's front matter.

Two consequences worth knowing:

- **A post goes live when GitHub Pages finishes deploying it**, usually under a
  minute after the commit. Nothing else has to happen.
- **The listing comes from the GitHub API, which allows 60 requests an hour per
  visitor IP.** A reader who blows through that keeps working — the list is
  cached in their browser — but the very first visit from a rate-limited IP will
  only find the one post named in `LAST_RESORT` at the top of `assets/posts.js`.
  In practice this is a non-issue for a personal blog; it would matter if a post
  hit the front page of somewhere.

Previewing locally works the same way without touching GitHub. Run
`python3 -m http.server` in the site root and open
`http://localhost:8000/nick-website-demo/` — the page reads the directory
listing the server prints, so you see exactly what you are about to publish.

**If you move this to your own domain or repo,** change the one line in
`index.html` that names the repository:

```html
<meta name="github-repo" content="williamrachuy/williamrachuy.github.io">
```

On a `username.github.io` address the page works that out by itself and the tag
can be deleted.

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
  app.js                 routing, scroll clock, profile mounting, control panel
  feed.js                the landing page: one card per post
  images.js              measures pictures before layout so nothing jumps
  posts.js               finds the posts; no manifest to maintain
  md.js                  front matter + block markdown
  typeset.js             Pretext wrapper: blocks -> lines -> glyph positions
  styles.css
  profiles/
    tidewater.js  lantern.js  ledger.js  foundry.js
posts/
  overcoming-the-classics.md      <- everything in here is a post
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
- Captions. A picture is a picture; there is nowhere to say what it is of.
- Pictures are hotlinked from Substack's CDN. That is how they are served today
  and it works, but it makes the posts depend on an account staying open.
  Committing the files next to the posts would make this repo self-contained.
- Tidewater has no scroll-position memory, so a very long post means a lot of
  glyph churn. Above roughly 15,000 characters it should page by section.
