#!/bin/bash
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID -eq 0 ]] || exit 1
[[ $# -eq 1 && $1 =~ ^deploy\ ([0-9a-f]{40})\ (sha256:[0-9a-f]{64})\ ([0-9a-f]{64})$ ]] || {
  echo 'Expected: deploy COMMIT IMAGE_ID ARCHIVE_SHA256' >&2; exit 1;
}
commit=${BASH_REMATCH[1]}; image_id=${BASH_REMATCH[2]}; archive_hash=${BASH_REMATCH[3]}
exec 9>/run/lock/omeumes-deployment.lock
flock -n 9 || { echo 'Another deployment/backup is running.' >&2; exit 1; }
cd /opt/omeumes
compose() { docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml "$@"; }
write_release() {
  local draft
  draft=$(mktemp /etc/omeumes/release-XXXXXX)
  printf '%s\n' "$1" > "$draft"
  mv -- "$draft" /etc/omeumes/release.env
}
route() {
  install -o root -g caddy -m 0640 "/etc/omeumes/route-$1.caddy" /etc/caddy/omeumes-route.caddy
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl reload caddy
}
ready() {
  for ((attempt=0;attempt<45;attempt++)); do
    if compose exec -T app node scripts/healthcheck.mjs; then return 0; fi
    sleep 2
  done
  return 1
}
install -d -m 0700 /var/cache/omeumes /var/backups/omeumes
archive=$(mktemp /var/cache/omeumes/image-XXXXXX.tar.gz)
previous=$(cat /etc/omeumes/release.env)
switched=0
cleanup() { rm -f -- "$archive"; }
trap cleanup EXIT
# Maximum compressed upload 1.5 GiB. A failed/truncated upload never stops the app.
head -c 1610612737 > "$archive"
[[ $(stat -c %s "$archive") -le 1610612736 ]]
printf '%s  %s\n' "$archive_hash" "$archive" | sha256sum --check --status
gzip -dc "$archive" | docker load
[[ $(docker image inspect "omeumes:$commit" --format '{{.Id}}') == "$image_id" ]]
new_schema=$(docker run --rm --network none --read-only "$image_id" node scripts/hosted.mjs schema)
[[ $new_schema =~ ^[0-9]+$ ]]
rollback() {
  trap - ERR
  echo 'Deployment failed.' >&2
  if (( switched )); then
    compose stop app || true
    # Never start old code against a schema it cannot read. Never restore data implicitly.
    current_schema=$(compose run --rm --no-deps -T app node --input-type=module -e \
      'import {DatabaseSync} from "node:sqlite";const d=new DatabaseSync(process.env.OMEUMES_DB_PATH,{readOnly:true});console.log(d.prepare("PRAGMA user_version").get().user_version);d.close()' 2>/dev/null) || current_schema=unknown
    write_release "$previous"
    if [[ $current_schema == "$old_schema" ]] && compose up -d --no-build --force-recreate app && ready; then
      route app || true
      echo 'Previous image resumed; data was not restored.' >&2
    else
      route maintenance || true
      echo 'Kept maintenance. Use the paired snapshot and matching image for explicit recovery.' >&2
    fi
  fi
  exit 1
}
old_schema=$(compose run --rm --no-deps -T app node scripts/hosted.mjs schema)
trap rollback ERR
route maintenance
compose stop app
switched=1
snapshot="/var/backups/omeumes/predeploy-$(date -u +%Y%m%dT%H%M%SZ)-$commit.tar.gz"
# Complete stopped pair, including WAL and recovery authority. Stored outside the app volume.
tar -czf "$snapshot" -C / var/lib/omeumes etc/omeumes/app.env etc/omeumes/release.env
# Pin by immutable ID: rerunning CI for the same commit may produce a different build ID.
write_release "OMEUMES_IMAGE=$image_id"
compose run --rm --no-deps -T -e OMEUMES_OFFLINE_SNAPSHOT=confirmed app node scripts/hosted.mjs prepare
compose up -d --no-build --force-recreate app
ready
route app
printf '%s %s\n' "$commit" "$image_id" > /etc/omeumes/deployed
echo "Deployed $commit; snapshot $snapshot"
