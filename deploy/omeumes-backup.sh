#!/bin/bash
set -Eeuo pipefail
umask 077
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID -eq 0 && $# -eq 0 ]] || exit 1
exec 9>/run/lock/omeumes-deployment.lock
flock -n 9 || { echo 'Deployment/backup already running.' >&2; exit 1; }
compose() { docker compose --env-file /etc/omeumes/release.env -f /opt/omeumes/compose.yaml "$@"; }
[[ -s /etc/omeumes/backup-recipients.txt ]]
[[ -n $(compose ps --status running -q app) ]]
command -v age >/dev/null
install -d -m 0700 /var/backups/omeumes /var/cache/omeumes
image_dir=$(mktemp -d /var/cache/omeumes/backup-image-XXXXXX)
file="/var/backups/omeumes/offsite-$(date -u +%Y%m%dT%H%M%SZ).tar.gz.age"
prior_route=$(mktemp /var/backups/omeumes/route-XXXXXX)
cp /etc/caddy/omeumes-route.caddy "$prior_route"
resume() {
  trap - EXIT
  rm -f -- "$image_dir/image.tar"
  rmdir -- "$image_dir"
  if compose up -d --no-build app; then
    for ((i=0;i<45;i++)); do
      if compose exec -T app node scripts/healthcheck.mjs; then
        install -o root -g caddy -m 0640 "$prior_route" /etc/caddy/omeumes-route.caddy
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
        rm -f -- "$prior_route"
        return
      fi
      sleep 2
    done
  fi
  echo 'Backup ended but app did not become ready; maintenance retained.' >&2
  rm -f -- "$prior_route"
  return 1
}
trap resume EXIT
# Carry the exact executable release off-server too; registry/artifact retention is finite.
release_image=$(sed -n 's/^OMEUMES_IMAGE=//p' /etc/omeumes/release.env)
docker image save "$release_image" -o "$image_dir/image.tar"
install -o root -g caddy -m 0640 /etc/omeumes/route-maintenance.caddy /etc/caddy/omeumes-route.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
compose stop app
# The independent recovery authority and encryption keys belong to the same stopped point.
# The age private key is NEVER needed on the VPS.
tar -czf - -C / var/lib/omeumes etc/omeumes/app.env etc/omeumes/release.env -C "$image_dir" image.tar |
  age -R /etc/omeumes/backup-recipients.txt -o "$file.partial"
mv -- "$file.partial" "$file"
sha256sum "$file"
echo 'Download the encrypted file and its hash; verify and retain both off-server.'
