#!/usr/bin/env bash
# Creates a separate application administrator; never resets an existing account.
set -Eeuo pipefail
abies_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export PATH="$abies_root/.runtime/bin:$PATH"
export KUBECONFIG="${KUBECONFIG:-$abies_root/.runtime/kubeconfig}"
umask 077
mkdir -p "$abies_root/.runtime"
abies_credentials="$abies_root/.runtime/admin-account.json"
[[ ! -e "$abies_credentials" ]] || { echo "Credential file already exists: $abies_credentials. No account changed." >&2; exit 1; }
abies_tmp=$(mktemp "$abies_root/.runtime/admin-account.XXXXXX")
trap 'rm -f "$abies_tmp"' EXIT
kubectl -n abies exec deploy/abies-backend -- node app/admin.js "${1:-admin@abies.local}" "${2:-Abies Administrator}" > "$abies_tmp"
mv "$abies_tmp" "$abies_credentials"
printf 'Administrator created. Private credentials: %s\n' "$abies_credentials"
