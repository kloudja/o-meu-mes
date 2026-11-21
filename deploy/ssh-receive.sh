#!/bin/bash
set -euo pipefail
# Installed root-owned, never writable by the restricted deployment account.
exec /usr/bin/sudo /usr/local/sbin/omeumes-deploy "${SSH_ORIGINAL_COMMAND:-}"
