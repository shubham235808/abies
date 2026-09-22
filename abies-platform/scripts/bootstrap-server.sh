#!/usr/bin/env bash
# Host prerequisites only. Run once with sudo; application deployment runs as devops.
set -Eeuo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run this script with sudo.' >&2; exit 1; fi
abies_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
abies_user=${SUDO_USER:-devops}
abies_group=$(id -gn "$abies_user")
abies_tmp=$(mktemp -d)
trap 'rm -rf "$abies_tmp"' EXIT
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl git docker.io docker-buildx util-linux-extra
systemctl enable --now docker
usermod -aG docker "$abies_user"
install -d -m 0750 /var/lib/abies/registry
if ! docker container inspect abies-registry >/dev/null 2>&1; then
  docker run -d --name abies-registry --restart=unless-stopped \
    -p 127.0.0.1:5000:5000 -v /var/lib/abies/registry:/var/lib/registry registry:3
else
  docker start abies-registry >/dev/null
fi
if ! systemctl cat k3s >/dev/null 2>&1; then
  install -d -m 0700 /etc/rancher/k3s
  if [[ -e /etc/rancher/k3s/registries.yaml ]]; then
    echo 'Existing K3s registry configuration detected. Review it before installing.' >&2; exit 1
  fi
  cat > /etc/rancher/k3s/registries.yaml <<'YAML'
mirrors:
  "127.0.0.1:5000":
    endpoint:
      - "http://127.0.0.1:5000"
YAML
  chmod 600 /etc/rancher/k3s/registries.yaml
  curl --fail --show-error --location --retry 3 https://get.k3s.io -o "$abies_tmp/install-k3s.sh"
  INSTALL_K3S_VERSION='v1.36.4+k3s1' INSTALL_K3S_EXEC='server --write-kubeconfig-mode 600' sh "$abies_tmp/install-k3s.sh"
fi
if ! command -v helm >/dev/null 2>&1; then
  abies_helm_version=v4.3.0
  curl --fail --show-error --location --retry 3 "https://get.helm.sh/helm-${abies_helm_version}-linux-amd64.tar.gz" -o "$abies_tmp/helm.tar.gz"
  curl --fail --show-error --location --retry 3 "https://get.helm.sh/helm-${abies_helm_version}-linux-amd64.tar.gz.sha256sum" -o "$abies_tmp/helm.sha256"
  abies_helm_sum=$(awk '{print $1}' "$abies_tmp/helm.sha256")
  printf '%s  %s\n' "$abies_helm_sum" "$abies_tmp/helm.tar.gz" | sha256sum -c -
  tar -xzf "$abies_tmp/helm.tar.gz" -C "$abies_tmp"
  install -m 0755 "$abies_tmp/linux-amd64/helm" /usr/local/bin/helm
fi
install -d -o "$abies_user" -g "$abies_group" -m 0700 "$abies_root/.runtime"
install -o "$abies_user" -g "$abies_group" -m 0600 /etc/rancher/k3s/k3s.yaml "$abies_root/.runtime/kubeconfig"
# A standalone kubectl avoids K3s CLI probing root-only server config directories.
install -d -o "$abies_user" -g "$abies_group" -m 0755 "$abies_root/.runtime/bin"
if [[ ! -x "$abies_root/.runtime/bin/kubectl" ]]; then
  curl --fail --show-error --location --retry 3 https://dl.k8s.io/release/v1.36.4/bin/linux/amd64/kubectl -o "$abies_tmp/kubectl"
  curl --fail --show-error --location --retry 3 https://dl.k8s.io/release/v1.36.4/bin/linux/amd64/kubectl.sha256 -o "$abies_tmp/kubectl.sha256"
  printf '%s  %s\n' "$(cat "$abies_tmp/kubectl.sha256")" "$abies_tmp/kubectl" | sha256sum -c -
  install -o "$abies_user" -g "$abies_group" -m 0755 "$abies_tmp/kubectl" "$abies_root/.runtime/bin/kubectl"
fi
k3s kubectl wait --for=condition=Ready node --all --timeout=180s
printf '\nHost prerequisites ready. Kubeconfig: %s/.runtime/kubeconfig\n' "$abies_root"
printf 'Docker group membership applies in a new login or via sg docker.\n'
