#!/bin/sh
# Daily database backup, run on the VPS from root's crontab (see DEPLOY.md). Takes a consistent copy while the game
# runs (VACUUM INTO) and keeps the last 14 in /opt/3d-chess-backups, outside the folder a deploy syncs.
set -eu
cd "$(dirname "$0")/.."
dir=/opt/3d-chess-backups name="chess-$(date +%F).db"
mkdir -p "$dir"
docker compose exec -T app node --no-warnings -e "new (require('node:sqlite').DatabaseSync)('/data/chess.db').exec(\"VACUUM INTO '/data/$name'\")"
docker compose cp "app:/data/$name" "$dir/$name"
docker compose exec -T app rm "/data/$name"
ls -1t "$dir"/chess-*.db | tail -n +15 | xargs -r rm --
echo "backed up to $dir/$name"
