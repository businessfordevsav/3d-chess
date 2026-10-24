#!/bin/sh
# Copies the app to /opt/3d-chess on the VPS and (re)starts it there: ./deploy/deploy.sh [root@host]
# The server needs a filled-in /opt/3d-chess/.env (see DEPLOY.md). The database stays in its Docker volume,
# and nothing outside /opt/3d-chess is touched.
set -eu
host=${1:-root@72.61.231.244}
cd "$(dirname "$0")/.."
ssh "$host" 'test -f /opt/3d-chess/.env' || { echo "no /opt/3d-chess/.env on $host yet: see DEPLOY.md, step 2" >&2; exit 1; }
rsync -az --delete --exclude .git --exclude node_modules --exclude data --exclude .env --exclude backups ./ "$host:/opt/3d-chess/"
ssh "$host" 'cd /opt/3d-chess && docker compose up -d --build && docker compose ps'
