// assign.js — which profile a post is set in.
//
// Three answers, in order of how specific they are, and the most specific one
// that exists wins:
//
//   1. Foundry. A post that says nothing about it should still look like a page
//      someone meant to publish.
//   2. `profile:` in the post's own front matter. A .md file carries its
//      preference the same way it carries its title, right there in the file
//      you are already editing.
//   3. profiles.md, next to index.html. One line per post, and it beats the
//      post's own front matter — which is the whole point of it. A post pulled
//      in from Substack is not a file anyone here can edit, so there has to be
//      somewhere outside the post to say how it should read, and once such a
//      place exists it may as well be able to overrule the posts that do have
//      files. `everything:` in the same file re-skins the lot.
//
// Above all of that sits `?profile=` in the address, but that is a preview
// rather than a decision: it is what the chips write and what makes one
// particular rendering shareable as a link. Nothing here reads or writes it.
//
// The file is optional. No file, no assignments, and every post falls through
// to its own front matter or to Foundry.

const FILE = 'profiles.md';
const LOAD_TIMEOUT_MS = 4000;

export const DEFAULT_PROFILE = 'foundry';

// Keys that mean "every post", so the line reads like a sentence whichever of
// them an author reaches for.
const GLOBAL = new Set(['everything', 'every-post', 'all', 'all-posts']);

/**
 * Both sides of a line are matched loosely, because an author reading a title
 * off a card should not have to reproduce its punctuation. Case, spaces,
 * apostrophes — curly or straight — and any other punctuation all collapse, so
 * `A Night in Mendocino`, `a-night-in-mendocino` and `A NIGHT IN MENDOCINO!`
 * are one key.
 */
export function assignKey(s) {
  return (s || '')
    .toString()
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `name: profile`, one per line. Blank lines and `#` comments are skipped, and
 * so is a line of dashes — an author who has typed front matter at the top of
 * every post will sooner or later fence this file the same way, and that should
 * work rather than swallow the first entry.
 *
 * `isKnown` decides what counts as a profile. A line naming one that does not
 * exist is reported rather than obeyed: silently ignoring it would leave the
 * author looking at an unchanged page with nothing to go on.
 */
export function parseAssignments(text, isKnown) {
  const out = { everything: '', byKey: new Map(), unknown: [] };
  for (const raw of String(text || '').split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^-{3,}$/.test(line)) continue;

    const m = /^(.+?)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m) continue;

    const want = assignKey(m[2]);
    if (!isKnown(want)) { out.unknown.push(line); continue; }

    const who = assignKey(m[1]);
    if (GLOBAL.has(who)) out.everything = want;
    else if (who) out.byKey.set(who, want);
  }
  return out;
}

const EMPTY = { everything: '', byKey: new Map(), unknown: [] };

export async function loadAssignments(isKnown) {
  let text;
  try {
    const r = await Promise.race([
      fetch(FILE, { cache: 'no-cache' }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), LOAD_TIMEOUT_MS))
    ]);
    if (!r.ok) throw new Error(String(r.status));
    text = await r.text();
  } catch (err) {
    console.info('[assign] no ' + FILE + ' (' + err.message + '); posts keep their own profiles');
    return EMPTY;
  }

  // A static host that serves index.html for anything it does not have would
  // otherwise hand us a page of HTML to read as assignments.
  if (/^\s*</.test(text)) {
    console.info('[assign] ' + FILE + ' came back as HTML; ignoring it');
    return EMPTY;
  }

  const a = parseAssignments(text, isKnown);
  for (const line of a.unknown) {
    console.warn('[assign] ' + FILE + ': no such profile in "' + line + '"');
  }
  return a;
}

/**
 * The cascade, top down. `post` supplies the names this file can be keyed by;
 * `doc` supplies the post's own front matter.
 */
export function profileFor(post, doc, assign, isKnown) {
  const a = assign || EMPTY;

  // Named outright, by slug or by title, whichever the author wrote.
  for (const name of [post && post.slug, post && post.title]) {
    const hit = name && a.byKey.get(assignKey(name));
    if (hit) return hit;
  }

  if (a.everything) return a.everything;

  const own = assignKey(doc && doc.meta && doc.meta.profile);
  if (own && isKnown(own)) return own;

  return DEFAULT_PROFILE;
}
