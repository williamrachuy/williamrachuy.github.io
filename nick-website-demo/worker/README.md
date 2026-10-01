# The Substack Worker — live posts and search

`substack-proxy.js` is a tiny program that runs on Cloudflare (free) and lets
the site read your Substack **live**: new posts appear within minutes without
anyone committing anything, and the search box on the front page searches the
full text of every post.

You set it up **once**. It has no password, stores nothing, and only ever
repeats what Substack already shows the public.

> **Where does it go?** Nothing in this folder is part of the website itself.
> The website only needs the Worker's *address*, which goes on one line of
> `index.html` (step 4). You can keep this folder for reference or delete it.

## Why a Worker at all

Substack publishes every post publicly, but it does not let other websites read
that data from a browser, and it refuses requests from GitHub's build servers.
Cloudflare Workers run on Cloudflare's own network, which Substack *does* answer,
and a Worker can add the permission header browsers need. So the chain is:

```
visitor's browser  →  your Worker  →  Substack
                      (caches answers for 30 minutes, so Substack is
                       asked a few times an hour, not once per visitor)
```

## Setup (about 10 minutes, no software to install)

1. **Make a free Cloudflare account** at <https://dash.cloudflare.com/sign-up>.
   A credit card is not needed.
2. In the dashboard, go to **Workers & Pages → Create → Create Worker**. Give it
   a name such as `substack-proxy` and click **Deploy** (the sample code is
   fine for now).
3. Click **Edit code**. Delete everything in the editor, paste in the entire
   contents of `substack-proxy.js`, and click **Deploy**.
4. Go to the Worker's **Settings → Variables and Secrets → Add** and add:

   | Type | Name | Value |
   |---|---|---|
   | Text | `SUBSTACK_HOST` | your Substack address **without** `https://`, for example `tbhpress.substack.com` |

   Save and deploy. (Optional extras: `ALLOWED_ORIGIN` = your site's address,
   e.g. `https://nick.github.io`, to stop other websites using your Worker;
   `CACHE_SECONDS` = how long to keep answers, default 600.)
5. **Check it.** Open `https://<your-worker-name>.<your-account>.workers.dev/health`
   in a browser (the address is shown at the top of the Worker's page). You
   want to see `"verdict": "OK"`. Then open `.../index` — you should see your
   posts as data.
6. **Tell the site about it.** In the website's `index.html`, find this line
   near the top and paste your Worker's address between the quotes:

   ```html
   <meta name="substack-api" content="https://substack-proxy.yourname.workers.dev">
   ```

   No trailing slash. Commit. After a minute the front page shows your live
   posts and the search box reaches into their text.

If the line is left empty, or the Worker is ever down, the site quietly falls
back to the saved copy in `posts/substack/` — it never shows a blank page.

## Moving it from one account to another

The Worker is not tied to a GitHub repository, so moving it means creating the
same Worker under the new Cloudflare account and changing one line.

1. In **the new owner's** Cloudflare account, repeat steps 1–5 above. Use the
   new owner's `SUBSTACK_HOST` if the publication is different.
2. In **the new site's** `index.html`, change the `substack-api` address to the
   new Worker's address (step 6).
3. Optionally delete the old Worker from the old account. Nothing else refers
   to it.

While testing, the same `index.html` line is how you point one copy of the site
at your own Worker and another at the real one — the two do not interfere.

## How posts get their look

Live posts flow through the same rules as everything else: a `.md` file with the
same `source:` link replaces the Substack copy and its `profile:` wins; otherwise
a line in `profiles.md` (by title or by the post's address name) applies;
otherwise the post uses Foundry.

## Things to know

- **Paid posts** show the free preview, then a note that the rest is on Substack.
- **Pictures** in live posts are loaded from Substack's image servers rather
  than copied into the repository.
- **Cost:** the free Cloudflare plan allows 100,000 requests a day. Answers are
  cached, so a small publication will not come near that.
- **Changed a setting and nothing happened?** Answers are cached for up to 30
  minutes. Wait, or add `?x=1` to the address to bypass it while testing.
- **Substack sometimes refuses with "429 — too many requests".** Workers share
  Cloudflare's outgoing addresses with other people's Workers, so Substack can
  throttle that address for a while. The Worker retries, and if Substack keeps
  refusing it serves the last good copy it kept. If you see 429 on `/health`,
  see [If Substack keeps saying 429](#if-substack-keeps-saying-429).
- Substack's data endpoints are public but not officially documented, so
  Substack *could* change them someday. The Worker tries the JSON interface
  first and falls back to the RSS feed, and the site falls back to the saved
  copy, so a change degrades the experience instead of breaking it.

## If Substack keeps saying 429

`/health` showing `RATE LIMITED (429)` means Substack is throttling the address
the Worker happens to be using, not that anything is broken. Try, in order:

1. **Wait and reload `/health`** a few times over 10–15 minutes. It often clears
   by itself, and once one request gets through the Worker keeps that answer.
2. **Set `PUBLICATION_NAME`** (Settings → Variables, for example `TBH Press`).
   One less request to Substack each refresh.
3. **Add the KV store and a schedule** (5 minutes, free). This is the durable
   fix: a background job refreshes a copy of your posts every 30 minutes and
   visitors only ever read the copy, so Substack is asked only a few times an
   hour and one refusal changes nothing.
   1. Cloudflare dashboard → **Storage & Databases → KV → Create** a namespace,
      named for example `substack-store`.
   2. Open the Worker → **Settings → Bindings → Add → KV namespace**. Variable
      name **`STORE`** (exactly, capitals), pick the namespace, save.
   3. Worker → **Settings → Triggers → Cron Triggers → Add**, and enter
      `*/30 * * * *`.
   4. Wait up to 30 minutes (or reload `/index` once Substack answers). `/health`
      then says `kvBound: true` and shows when the last good copy was kept.

While it is throttled, the website keeps working: the Worker serves the last good
copy if it has one, and the site falls back to the saved copy in
`posts/substack/` if the Worker has nothing.

## Troubleshooting

| You see | Meaning | Try |
|---|---|---|
| `/health` says `SUBSTACK_HOST is not set` | Step 4 is missing | Add the variable and deploy |
| `/health` says `RATE LIMITED (429)` | Substack is throttling the Worker's shared address | See [above](#if-substack-keeps-saying-429) |
| `/health` says `BLOCKED` with status `403` | Substack refused the Worker | Check the address is exactly `name.substack.com` (or the custom domain); try again in a few minutes. If it persists, the snapshot fallback keeps the site working — ask for the feed to be routed differently |
| `/health` is OK but the site shows old posts | The `substack-api` line is empty, has a typo, or has a trailing slash/space | Re-check step 6; open the browser console (F12) and look for messages starting `[posts]` |
| Search finds nothing new | Only matches titles/intros | Needs the Worker; confirm `/search?q=word` returns posts when opened directly |

## Running it yourself from a computer (optional)

If you ever prefer the command line to the dashboard, install Node and use
Cloudflare's `wrangler` (these exact flags have not been tested here; the
dashboard steps above are the reliable route):

```sh
cd worker
npx wrangler deploy substack-proxy.js --name substack-proxy --compatibility-date 2024-09-01 --var SUBSTACK_HOST:tbhpress.substack.com
```

## If you change `tools/fetch-substack.py`

The Worker's `toMarkdown()` is a port of `to_markdown()` in
`tools/fetch-substack.py`, so a live post and a saved post read identically.
Keep them in step.
