# Your site — how to run it yourself

This is the guide to everything you are likely to want to do on the site, written
so you never have to depend on anyone (or anything) to do it. You do not need to
touch code for any of it. Almost everything is one of three things:

1. **Write or edit a post** — a plain text file ending in `.md`.
2. **Choose how a post looks** — one word, the post's *profile*.
3. **Take a post down or bring it back** — rename a file.

You can do all of it from the GitHub website in your browser, with no software
installed.

---

## The quick version

| I want to… | Do this |
|---|---|
| Publish a new post | Add a `.md` file to the `posts` folder ([how](#write-a-new-post)) |
| Edit a post I wrote as a `.md` file | Open it in `posts`, click the pencil, save ([how](#edit-a-post)) |
| Change how a post looks | Change its `profile:` line, or add a line to `profiles.md` ([how](#choose-how-a-post-looks)) |
| Hide a post | Rename `name.md` to `name.md.offline` ([how](#hide-or-restore-a-post)) |
| Change how a Substack post looks | Add a line to `profiles.md` ([how](#posts-that-come-from-substack)) |

Changes go live about a minute after you save them (GitHub rebuilds the site).
If you don't see a change, wait a minute and hard-refresh the page.

---

## How the site works, in one minute

- Every file ending in **`.md`** inside the **`posts`** folder is a post. That is
  the whole publishing system. There is no list to update and nothing to
  register: add the file and it is live, remove it and it is gone.
- Posts from your Substack show up automatically too (see
  [below](#posts-that-come-from-substack)). If you write a `.md` post about the
  same piece, yours replaces the Substack copy.
- Each post is shown in a **profile** — a style of reading experience (still
  page, drifting text, and so on). You decide which one each post uses.
- The newest post (by `date:`) is what visitors see first.

---

## Write a new post

1. On GitHub, open the repository and go to the **`posts`** folder.
2. Click **Add file → Create new file**.
3. Name it with lowercase words and dashes, ending in `.md`:
   `my-trip-to-portugal.md`. **The file name becomes the post's web address**
   (`…/?post=my-trip-to-portugal`), so pick one you'd be happy to see in a link,
   and don't change it later or old links will break.
4. Paste this in and fill it in:

```markdown
---
title: My Trip to Portugal
subtitle: One line under the title (optional).
author: Nicholas Souza
publication: TBH Press
date: 2026-07-14
source: https://tbhpress.substack.com/p/my-trip-to-portugal
profile: lantern
---

The first paragraph of the post starts here, after the second `---` line.

A blank line between paragraphs. That is all it takes.
```

5. Scroll down, click **Commit changes**, and confirm. Done.

The block between the two `---` lines is called **front matter**. It is just a
list of `name: value` lines. Only `title` is required.

| Line | What it does |
|---|---|
| `title:` | The post's title. **Required.** |
| `subtitle:` | A second line under the title, and on the post's card. |
| `author:`, `publication:` | The byline under the title. |
| `date:` | Sort order and byline. Write it as `2026-07-14` (year-month-day), exactly. Posts with no date sink to the bottom. |
| `source:` | The Substack link, if the post also exists there. Also how the site knows your `.md` replaces the Substack copy. |
| `excerpt:` | The text shown on the post's card. Leave it out and the first paragraph is used. |
| `profile:` | How the post looks. See [below](#choose-how-a-post-looks). Leave it out and the post uses the site default. |

### Formatting inside a post

| You type | You get |
|---|---|
| `# Heading`, `## Smaller heading`, `### Smaller still` | Headings |
| A blank line | New paragraph |
| `> text` | A quote |
| `---` on its own line | A divider |
| `*whole paragraph in asterisks*` | An italic note (how intros and sign-offs are styled) |
| `[words](https://example.com)` | A link |
| `![description of picture](https://…/photo.jpg)` alone on its own line | A picture |

Two limits worth knowing:

- **Bold and italics in the middle of a sentence are shown as plain text.** A
  paragraph that is entirely italic works; one italic word does not (yet).
- **Put the picture on its own line**, and always fill in the description in the
  square brackets — it is what screen readers read and what shows if the picture
  fails to load. A picture can be a web link, or a file you upload to
  `posts/images/` and point at (`![a cliff](posts/images/cliff.jpg)` — the path starts with `posts/`).

---

## Edit a post

1. Go to the `posts` folder on GitHub and click the post's `.md` file.
2. Click the **pencil icon** (top right of the file).
3. Make your change and click **Commit changes**.

If it is a Substack post that has **no** `.md` file in `posts`, you can't edit
it in place — it lives in a snapshot of your Substack. To take over a Substack
post (fix a typo, add picture descriptions, trim it), create a `.md` file for it
with the same `source:` link as the original. Yours then replaces the Substack
copy.

---

## Choose how a post looks

The site has nine profiles:

| Profile | What the reader gets |
|---|---|
| `foundry` | A plain, still page. Ordinary text you can select and copy. **The default.** |
| `tidewater` | Text drifts and darkens until a draggable lens pulls it into focus |
| `waterline` | One line of perfectly set type; everything else drifts around it |
| `lantern` | A lit circle, the rest of the page in the dark |
| `ledger` | Lines ink in as they reach a write head, like entries in an account book |
| `meniscus` | Scattered letters that gather where you tap |
| `cipher` | Green characters resolving out of noise as they near the line |
| `marbles` | Black on white, with coloured glass drifting over the words |
| `fracture` | Black on white, still until you tap it and it cracks apart |

Type the name in **lowercase**, exactly as in the left column.

### Which setting wins

A post's profile is decided by three layers. **The highest one that has an
answer wins:**

1. **The post's own file.** The `profile:` line in the front matter of its `.md`
   file. This always wins, and nothing else can overrule it.
2. **`profiles.md`.** A list in the main folder where you can assign a profile
   to any post, including Substack ones that have no file of their own.
3. **Foundry.** If neither of the above says anything, the post is plain.

So a brand new Substack post with no setting anywhere will look plain (Foundry)
until you give it one.

### Set it in the post itself

In the post's `.md` file, put the profile in the front matter:

```
profile: cipher
```

Change it by editing that line. Remove the line to fall back to `profiles.md`,
then to Foundry.

### Set it in `profiles.md`

Open **`profiles.md`** in the main folder and add one line per post, in the form
`post name: profile`:

```
How Nodes Can Fix Broken Networks: cipher
montana-and-wyoming-travel-log: tidewater
```

- The **post name** can be the title exactly as it appears on the post's card, or
  the short name from its web address (the bit after `?post=`). Either works.
- Capitals, spaces and punctuation don't matter, so you can copy a title
  straight off the page.
- Lines starting with `#` are notes to yourself and are ignored.
- A misspelled profile name (`tidewatr`) is ignored, and the post falls back.
  If a setting isn't taking effect, check the spelling of both sides first.

To set a **default other than Foundry** for every post that has no more specific
setting, add a line:

```
everything: lantern
```

Posts with their own `profile:` line, and posts named individually in
`profiles.md`, still keep their own.

---

## Posts that come from Substack

There are two ways the site gets your Substack posts:

- **Live (recommended).** A small free Cloudflare Worker reads your Substack for
  the site. New posts appear within minutes with nothing to commit, and the
  search box on the front page searches the full text of every post. Setting it
  up takes about 10 minutes, once. Follow **`worker/README.md`**; the only
  thing that touches the site is the `substack-api` line near the top of
  `index.html`.
- **Saved copy (the fallback).** `posts/substack/` holds a snapshot of the
  publication. The site uses it when the `substack-api` line is empty or the
  Worker is down, so the site never goes blank. It does **not** update itself:
  refreshing it means running `python3 tools/fetch-substack.py` on a computer
  and committing the result.

Either way, Substack posts have no file to put a `profile:` line in, so to style
one, use `profiles.md` ([above](#set-it-in-profilesmd)). To edit or replace a
Substack post, write a `.md` file with the same `source:` link.

---

## Hide or restore a post

- **Hide:** open the post's `.md` file on GitHub, click the pencil, change the
  file name at the top from `name.md` to `name.md.offline`, and commit. The post
  disappears from the site. The text is still in the folder.
- **Restore:** rename it back to `name.md`.

Hiding is not the same as private. The repository is public, so anyone who
browses it on GitHub can still read the file. Don't commit anything you wouldn't
want read.

To delete a post permanently, open the file, click the **trash icon**, and
commit.

---

## If something looks wrong

| Problem | Likely cause |
|---|---|
| New post doesn't appear | Wait a minute and hard-refresh. Check the file is in `posts`, ends in exactly `.md`, and was committed. For a Substack post: is the Worker set up (`worker/README.md`)? Without it, new Substack posts don't appear. |
| Substack posts are out of date, or search only finds titles | The `substack-api` line in `index.html` is empty or wrong, or the Worker is down. Open the Worker's `/health` address. |
| Post appears but the title is the file name | The `title:` line is missing, or the `---` lines around the front matter are missing. |
| Post is in the wrong place in the list | The `date:` isn't in `2026-07-14` form, or is missing. |
| Profile isn't what I set | A higher layer is overriding it (the post's own `profile:` line beats `profiles.md`), or the profile name is misspelled. Names must be lowercase. |
| Picture missing | It isn't alone on its own line, or the link is broken. A picture that can't load is skipped. |
| Everything is broken after an edit | GitHub keeps every version. Open the file, click **History**, and restore the earlier one. |

For anything in the browser console: press **F12**, open the **Console** tab.
Messages starting `[assign]` mean `profiles.md` has a problem (usually a
misspelled name) and say which line.

---

## Where your own address goes (one-time setup)

When this folder is first copied to your own GitHub Pages repository, two things
carry a reference to the old location. You only do this once.

0. **The Substack Worker.** Do `worker/README.md` first; it ends with pasting
   an address into the `substack-api` line of `index.html`.
1. **`index.html`** has a line near the top:
   `<meta name="github-repo" content="williamrachuy/williamrachuy.github.io">`.
   Change the `owner/repo` part to yours (for example `nick/nick.github.io`).
   The site uses it to find the list of your posts. If your site lives at
   `yourname.github.io`, it works this out itself, but setting it is safer.
2. **The QR code** at the top of the front page points to the address baked into
   `assets/qr-site.svg`. To redraw it for your address: run
   `pip install segno`, then
   `python3 tools/make-qr.py --url https://your-address/ --out assets/qr-site.svg`.
   Also update `SITE_URL` near the top of `assets/feed.js` to the same address.
   Skip both if you don't want the QR code — it only affects that one image.

---

## What's in the folder (and what to leave alone)

```
index.html          the page itself
profiles.md         ← you edit this: which profile each post uses
posts/              ← you edit this: one .md file per post
  images/           pictures used by posts
  substack/         the saved copy of your Substack (don't edit by hand)
assets/             the code that makes the site work
tools/              helper scripts (refresh Substack, redraw the QR code)
worker/             the Substack Worker and its setup guide (not part of the site itself)
```

**You only ever need `posts/` and `profiles.md`.** Everything in `assets/` is the
engine; leave it alone unless you want to change how a profile behaves (each
profile is one file in `assets/profiles/`, such as `lantern.js`). If you do edit
code, the safety net is the same as for posts: every version is kept in the
file's **History**, so nothing is ever lost.

If you want deeper technical detail on how the profiles are built, it is in the
`nick-website-demo/README.md` of the original repository
(`williamrachuy/williamrachuy.github.io`).
