#!/usr/bin/env bash
set -euo pipefail

# Promote the current dev branch to production:
#   1. commit deploy metadata on dev
#   2. push dev to origin/dev so any machine can resume from the same state
#   3. fast-forward local main to dev
#   4. push main to origin/main for GitHub Pages
#
# This script intentionally keeps you on dev.

# Require that I am currently on dev.
current_branch="$(git branch --show-current)"
if [[ "$current_branch" != "dev" ]]; then
  echo "ERROR: not on dev. Current branch: $current_branch"
  exit 1
fi

# Require that all dev changes are already committed.
if [[ -n "$(git status --short)" ]]; then
  echo "ERROR: dev has uncommitted changes. Commit or discard them first:"
  git --no-pager status --short
  exit 1
fi

# Refresh remote-tracking refs without changing files or branches.
git fetch origin

# Refuse to deploy from a stale or diverged dev branch. Deploy should start from
# a dev branch that can be pushed cleanly to origin/dev.
read -r dev_behind dev_ahead < <(git rev-list --left-right --count origin/dev...dev)
if (( dev_behind > 0 )); then
  echo "ERROR: local dev is behind origin/dev by $dev_behind commit(s)."
  echo "Sync dev first:"
  echo "  git pull --rebase origin dev"
  exit 1
fi

# Safety check: make sure dev contains the latest origin/main.
# This prevents accidentally overwriting production with an older dev branch.
if ! git merge-base --is-ancestor origin/main dev; then
  echo "ERROR: dev does not contain origin/main."
  echo "Fix first with one of these:"
  echo "  git merge origin/main"
  echo "  git rebase origin/main"
  exit 1
fi

next_version="$(
python3 - <<'PY'
import json
import re
from datetime import datetime
from pathlib import Path

today = datetime.now().strftime('%Y%m%d')
version_re = re.compile(r'(\d{8})\.(\d+)')
html_version_re = re.compile(r"const VERSION = '(\d{8}\.\d+)'")

def parse_version(value):
    match = version_re.fullmatch(value or '')
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)))

versions = []

version_path = Path('version.json')
if version_path.exists():
    try:
        value = json.loads(version_path.read_text()).get('version')
        parsed = parse_version(value)
        if parsed:
            versions.append(parsed)
    except Exception:
        pass

for path in (Path('index.html'), Path('meowdividiardi/index.html')):
    match = html_version_re.search(path.read_text())
    if not match:
        continue
    parsed = parse_version(match.group(1))
    if parsed:
        versions.append(parsed)

latest_date, latest_iteration = max(versions) if versions else (int(today), 0)
if latest_date == int(today):
    iteration = latest_iteration + 1
else:
    iteration = 1

print(f'{today}.{iteration}')
PY
)"

export NEXT_VERSION="$next_version"
python3 - <<'PY'
import json
import os
import re
from pathlib import Path

next_version = os.environ['NEXT_VERSION']
files = [Path('index.html'), Path('meowdividiardi/index.html')]
version_pattern = re.compile(r"(const VERSION = ')\d{8}\.\d+(')")
commit_pattern = re.compile(r"(const COMMIT  = ')[^']+(')")

for path in files:
    text = path.read_text()
    updated, version_count = version_pattern.subn(rf"\g<1>{next_version}\2", text, count=1)
    updated, commit_count = commit_pattern.subn(r"\g<1>pending\2", updated, count=1)
    if version_count != 1:
        raise SystemExit(f'Could not update VERSION in {path}')
    if commit_count != 1:
        raise SystemExit(f'Could not update COMMIT in {path}')
    path.write_text(updated)

Path('version.json').write_text(json.dumps({
    'version': next_version,
    'commit': 'pending',
}, indent=2) + '\n')
PY

git add index.html meowdividiardi/index.html version.json
git commit -m "Bump site version to $next_version"

# Push dev so origin/dev becomes the canonical shared development state.
git push origin dev

# Move local main to the exact same commit as dev.
# This does not switch branches; you remain on dev.
git branch -f main dev

# Push the promoted main branch to production.
git push origin main

# Confirm final state.
echo
echo "Deployed dev to origin/dev, local main, and origin/main."
echo "Site version: $next_version"
echo "dev was ahead of origin/dev by: $dev_ahead commit(s) before deploy"
echo "Still on branch: $(git branch --show-current)"
echo
git --no-pager log --oneline --decorate -3
