#!/usr/bin/env bash
# Deploys whatever is on origin/main to the server this runs on (lafamiliapop.ro, under cPanel's
# Passenger). It replaces the hand-typed `git pull --ff-only && touch tmp/restart.txt`, and adds
# the one step that was easy to forget: installing dependencies when package-lock.json changed.
#
#   ~/repos/family-hub/scripts/deploy.sh                  # in the cPanel terminal
#   ssh <user>@lafamiliapop.ro repos/family-hub/scripts/deploy.sh   # from anywhere
#
# Ends with `DEPLOY-OK <commit> <subject>` on success. Anything else (a pull that is not a
# fast-forward, a failed npm install) stops it before the restart, so the running app keeps
# serving the old code instead of half of the new one.
set -euo pipefail

cd "$(dirname "$0")/.."

before=$(git rev-parse HEAD)
git pull --ff-only
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  echo "Already at $(git rev-parse --short HEAD), restarting anyway."
fi

if ! git diff --quiet "$before" "$after" -- package-lock.json; then
  echo "package-lock.json changed, installing dependencies…"
  # cPanel's "Setup Node.js App" keeps node_modules in a virtualenv under ~/nodevenv, and npm is
  # only on PATH once it is activated. Outside cPanel (or when it already is), npm is used as is.
  if ! command -v npm >/dev/null 2>&1; then
    activate=$(ls -d "$HOME/nodevenv/${PWD#"$HOME"/}"/*/bin/activate 2>/dev/null | sort -V | tail -n 1 || true)
    if [ -z "$activate" ]; then
      echo "npm not found and no nodevenv for $PWD; activate the app's Node environment and re-run." >&2
      exit 1
    fi
    # shellcheck disable=SC1090
    source "$activate"
  fi
  # `install`, not `ci`: ci deletes node_modules first, and under cPanel that is a symlink into
  # the nodevenv.
  npm install --omit=dev --no-audit --no-fund
fi

mkdir -p tmp
touch tmp/restart.txt

echo "DEPLOY-OK $(git log -1 --format='%h %s')"
