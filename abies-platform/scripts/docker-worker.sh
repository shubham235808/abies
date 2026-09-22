# Sourced by deploy-server.sh only when the host session cannot use Docker.
abies_docker_gid=$(getent group docker | cut -d: -f3)
[[ -n "$abies_docker_gid" ]] || { echo 'Docker group is missing; rerun bootstrap.' >&2; exit 1; }
if ! id -G "$(id -un)" | tr ' ' '\n' | grep -qx "$abies_docker_gid"; then
  echo 'The deployment account is not authorized in the Docker group.' >&2; exit 1
fi
printf 'Using a temporary Kubernetes Docker build worker (UID %s, Docker GID %s).\n' "$(id -u)" "$abies_docker_gid"
# This worker has the same already-granted Docker socket access as a fresh user login.
# It is not privileged, does not receive a service-account token, and is removed on exit.
kubectl -n default get pod abies-build-worker >/dev/null 2>&1 && { echo 'A build worker already exists; inspect the other deployment before continuing.' >&2; exit 1; }
kubectl apply -f - <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: abies-build-worker
  namespace: default
  labels: {app.kubernetes.io/name: abies-build-worker}
spec:
  restartPolicy: Never
  activeDeadlineSeconds: 3600
  automountServiceAccountToken: false
  securityContext:
    runAsUser: $(id -u)
    runAsGroup: $(id -g)
    supplementalGroups: [$abies_docker_gid]
    runAsNonRoot: true
    seccompProfile: {type: RuntimeDefault}
  containers:
    - name: docker
      image: docker:29-cli
      command: [sh, -c, 'sleep 3600']
      env:
        - {name: HOME, value: /tmp}
        - {name: DOCKER_CONFIG, value: /tmp/docker-config}
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: {drop: [ALL]}
      volumeMounts:
        - {name: source, mountPath: /workspace, readOnly: true}
        - {name: socket, mountPath: /var/run/docker.sock, readOnly: true}
      resources:
        requests: {cpu: 50m, memory: 64Mi}
        limits: {cpu: "1", memory: 512Mi}
  volumes:
    - name: source
      hostPath: {path: "$abies_root", type: Directory}
    - name: socket
      hostPath: {path: /var/run/docker.sock, type: Socket}
YAML
abies_builder_created=true
kubectl -n default wait --for=condition=Ready pod/abies-build-worker --timeout=180s
docker() {
  kubectl -n default exec -i abies-build-worker -- sh -c 'cd /workspace && exec docker "$@"' sh "$@"
}
docker info >/dev/null
