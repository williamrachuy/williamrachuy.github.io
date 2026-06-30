# Development

## Staging vs production

- `main` on GitHub Pages is production.
- Local preview over Tailscale is staging.
- This repo is a plain static site and can be served directly from the repo root.

## Local Tailscale staging preview

From the repo root:

```bash
./serve-tailnet.sh
```

Or choose a different port:

```bash
./serve-tailnet.sh 8080
```

The script binds Python's static server to this machine's Tailscale IPv4 address, then prints a preview URL such as:

- `http://100.x.y.z:8080`
- `http://asus-vivopc:8080` if MagicDNS is enabled on your tailnet

Open that URL from another device on your tailnet to verify the staged site before publishing.

## Suggested workflow

1. Create a feature branch for the site change.
2. Run `./serve-tailnet.sh` from this repo.
3. Open the preview from another tailnet device and verify behavior there.
4. Merge or push to `main` only after staging looks correct.
