#!/usr/bin/env bash
# Non-root application deployment after bootstrap-server.sh.
set -Eeuo pipefail
abies_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$abies_root"
export PATH="$abies_root/.runtime/bin:$PATH"
export KUBECONFIG="${KUBECONFIG:-$abies_root/.runtime/kubeconfig}"
abies_host=${ABIES_HOST:-192.168.1.160}
if [[ ! "$abies_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]; then echo 'ABIES_HOST must be an IPv4 address or hostname.' >&2; exit 1; fi
for tool in docker helm kubectl python3 openssl git; do command -v "$tool" >/dev/null || { echo "Missing $tool; run bootstrap-server.sh first." >&2; exit 1; }; done
[[ -r "$KUBECONFIG" ]] || { echo 'Run the privileged bootstrap-server.sh first.' >&2; exit 1; }
kubectl get nodes
# Prefer the host's Docker access; a Kubernetes worker handles stale login groups.
abies_builder_created=false
abies_cleanup() {
  rm -f "${abies_secret_file:-}"
  if [[ "$abies_builder_created" == true ]]; then kubectl -n default delete pod abies-build-worker --wait=false >/dev/null 2>&1 || true; fi
}
trap abies_cleanup EXIT
if ! docker info >/dev/null 2>&1; then
  if command -v sg >/dev/null && [[ ${ABIES_DOCKER_GROUP_RETRY:-0} != 1 ]]; then
    printf -v abies_command 'ABIES_DOCKER_GROUP_RETRY=1 ABIES_HOST=%q KUBECONFIG=%q bash %q' "$abies_host" "$KUBECONFIG" "$abies_root/scripts/deploy-server.sh"
    exec sg docker -c "$abies_command"
  fi
  source "$abies_root/scripts/docker-worker.sh"
fi
mkdir -p .runtime
chmod 700 .runtime
# Content-address application builds independently of changing environment values.
abies_tag=$(python3 - <<'PYCODE'
from pathlib import Path
import hashlib
h=hashlib.sha256()
for folder in ['backend','frontend','db','infrastructure/git']:
 for p in sorted(Path(folder).rglob('*')):
  if not p.is_file() or any(x in p.parts for x in ['node_modules','.next']):continue
  if p.name.endswith(('.tsbuildinfo','.log')):continue
  h.update(str(p).encode());h.update(p.read_bytes())
print(h.hexdigest()[:16])
PYCODE
)
for abies_service in api web git; do
  case "$abies_service" in
    api) abies_dockerfile=backend/Dockerfile ;;
    web) abies_dockerfile=frontend/Dockerfile ;;
    git) abies_dockerfile=infrastructure/git/Dockerfile ;;
  esac
  docker build --progress=plain -f "$abies_dockerfile" -t "127.0.0.1:5000/abies-$abies_service:$abies_tag" .
  if [[ "$abies_service" == git ]]; then
    docker run --rm --entrypoint sh "127.0.0.1:5000/abies-git:$abies_tag" -c 'test -x "$(git --exec-path)/git-daemon"'
  fi
  docker push "127.0.0.1:5000/abies-$abies_service:$abies_tag"
done
kubectl create namespace abies --dry-run=client -o yaml | kubectl apply -f -
if ! kubectl -n abies get secret abies-secrets >/dev/null 2>&1; then
  abies_secret_file=$(mktemp "$abies_root/.runtime/secrets.XXXXXX")
  chmod 600 "$abies_secret_file"
  abies_pg_password=$(openssl rand -hex 32)
  abies_redis_password=$(openssl rand -hex 32)
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$abies_pg_password"
    printf 'REDIS_PASSWORD=%s\n' "$abies_redis_password"
    printf 'DATABASE_URL=postgresql://abies:%s@abies-postgres:5432/abies\n' "$abies_pg_password"
    printf 'REDIS_URL=redis://:%s@abies-redis:6379/0\n' "$abies_redis_password"
  } > "$abies_secret_file"
  kubectl -n abies create secret generic abies-secrets --from-env-file="$abies_secret_file"
  rm -f "$abies_secret_file"
  unset abies_pg_password abies_redis_password
fi
# Preserve credentials/certificates on rerun. Supply a trusted certificate secret if available.
if ! kubectl -n abies get secret abies-tls >/dev/null 2>&1; then
  abies_san="DNS:$abies_host"
  if [[ "$abies_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then abies_san="IP:$abies_host"; fi
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 365 \
    -keyout .runtime/tls.key -out .runtime/tls.crt -subj "/CN=$abies_host" \
    -addext "subjectAltName=$abies_san" 2>/dev/null
  chmod 600 .runtime/tls.key
  kubectl -n abies create secret tls abies-tls --cert=.runtime/tls.crt --key=.runtime/tls.key
fi
# Retain a public cert copy for local health verification and workstation trust setup.
kubectl -n abies get secret abies-tls -o jsonpath='{.data.tls\.crt}' | base64 -d > .runtime/tls.crt
if [[ "$abies_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  openssl x509 -in .runtime/tls.crt -noout -checkip "$abies_host" >/dev/null || { echo 'Existing TLS certificate does not cover this IP; replace abies-tls first.' >&2; exit 1; }
else
  openssl x509 -in .runtime/tls.crt -noout -checkhost "$abies_host" >/dev/null || { echo 'Existing TLS certificate does not cover this hostname; replace abies-tls first.' >&2; exit 1; }
fi
python3 - "$abies_host" "$abies_tag" <<'PYCODE'
from pathlib import Path
import sys
host,tag=sys.argv[1:]
Path('environments/server/values.yaml').write_text(f"""# Server-specific deployment values. Application images are content-addressed.
fullnameOverride: abies
existingSecret: abies-secrets
images:
  api:
    repository: 127.0.0.1:5000/abies-api
    tag: "{tag}"
  web:
    repository: 127.0.0.1:5000/abies-web
    tag: "{tag}"
app:
  origin: https://{host}
  secureCookie: true
ingress:
  host: "{host}"
  tlsSecretName: abies-tls
  defaultCertificate: {str(all(c.isdigit() or c=='.' for c in host)).lower()}
""")
PYCODE
helm lint charts/abies -f environments/server/values.yaml
bash scripts/publish-local.sh
abies_expected_revision=$(git -C .runtime/source rev-parse HEAD)
helm upgrade --install abies-git charts/git-source -n gitops --create-namespace \
  --set-string "image.tag=$abies_tag" --set-string "repositoryPath=$abies_root/.runtime/git" --wait --timeout 5m
helm repo add argo https://argoproj.github.io/argo-helm --force-update
helm repo update argo
helm upgrade --install argocd argo/argo-cd --version 10.9.2 \
  -n argocd --create-namespace -f environments/server/argocd-values.yaml \
  --set-string "global.domain=$abies_host:30443" --wait --timeout 15m
kubectl apply -f apps/argocd/project.yaml
kubectl apply -f apps/argocd/application.yaml
kubectl -n argocd annotate application abies-platform argocd.argoproj.io/refresh=hard --overwrite
abies_ready=false
for ((abies_attempt=0; abies_attempt<120; abies_attempt++)); do
  abies_state=$(kubectl -n argocd get application abies-platform -o jsonpath='{.status.sync.status}/{.status.health.status}/{.status.sync.revision}')
  if [[ "$abies_state" == "Synced/Healthy/$abies_expected_revision" ]]; then
    abies_api_image=$(kubectl -n abies get deployment abies-backend -o jsonpath='{.spec.template.spec.containers[0].image}')
    abies_web_image=$(kubectl -n abies get deployment abies-frontend -o jsonpath='{.spec.template.spec.containers[0].image}')
    if [[ "$abies_api_image" == "127.0.0.1:5000/abies-api:$abies_tag" && "$abies_web_image" == "127.0.0.1:5000/abies-web:$abies_tag" ]]; then abies_ready=true; break; fi
  fi
  printf 'Waiting for ArgoCD: %s\n' "$abies_state"
  sleep 5
done
if [[ "$abies_ready" != true ]]; then
  kubectl -n argocd get application abies-platform -o yaml
  kubectl -n abies get pods,pvc,events
  exit 1
fi
kubectl -n abies rollout status deployment/abies-backend --timeout=180s
kubectl -n abies rollout status deployment/abies-frontend --timeout=180s
if kubectl -n argocd get secret argocd-initial-admin-secret >/dev/null 2>&1; then
  (umask 077; kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d > .runtime/argocd-admin-password)
fi
printf '\nAbies: https://%s\nArgoCD: https://%s:30443 (user: admin)\n' "$abies_host" "$abies_host"
printf 'Initial ArgoCD password is stored locally in .runtime/argocd-admin-password (mode 600).\n'
printf 'The generated local TLS certificate must be trusted on your workstation, or replaced with a trusted certificate.\n'
