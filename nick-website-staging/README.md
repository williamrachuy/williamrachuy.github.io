# Staging — the site as Nick's visitors will see it

Same code as `../nick-website-demo/`, minus the demo controls: no panel, no
profile chips, no `?profile=` preview. Every post is set by the authored cascade
alone:

1. `profile:` in the post's own `.md` front matter
2. a line in `profiles.md`
3. Foundry

Profiles here are randomly assigned, to show what a mixed feed looks like.
What Nick copies to his own GitHub Pages is this folder; his real profiles go in
the same two places. `assets/app.js` treats a page with no `#controls` element
as the real site, so nothing else needs editing. See `../nick-website-demo/README.md`
for everything else.
