# On-server Helm installation

**Deployed and verified:** Abies is running at [https://192.168.1.160](https://192.168.1.160), with ArgoCD at [https://192.168.1.160:30443](https://192.168.1.160:30443). See [VALIDATION.md](VALIDATION.md) for the live checks.

## Topology

```text
Browser → K3s Traefik HTTPS → Abies Next.js → Express → PostgreSQL / Redis
                                  ↑
                            ArgoCD reconciles
                                  ↑
                    local read-only Git repository

Host Docker → loopback registry :5000 → K3s containerd pulls images
Helm releases: argocd + abies-git
ArgoCD-managed Helm chart: abies-platform/charts/abies
```

This is designed for this one Ubuntu server (`192.168.1.160`, user `devops`, amd64), with systemd, about 16 GB RAM and local disk. The registry and Git snapshot persist across reboots. Additional nodes need a reachable authenticated registry and portable Git/storage rather than the loopback registry and hostPath source used here.

## 1. Privileged prerequisites

Review and run:

```bash
cd /home/devops/abies.com/abies-platform
sudo bash scripts/bootstrap-server.sh
```

The script performs the following system changes:

- Installs Ubuntu Docker/buildx packages, `util-linux-extra` (providing `sg` on Ubuntu 26.04), and prerequisites.
- Enables Docker, adds the invoking user to its group, and starts `registry:3`, bound only to `127.0.0.1:5000`, with storage at `/var/lib/abies/registry`.
- Installs **K3s v1.36.4+k3s1**, the official stable release selected for this implementation. K3s provides its own containerd, Traefik ingress controller, local-path provisioner, metrics server and network policy controller.
- Configures containerd to pull from the local HTTP registry. The endpoint is loopback-only, not an unauthenticated LAN registry.
- Installs checksum-verified **Helm v4.3.0** if Helm is absent.
- Copies the cluster-admin kubeconfig to `.runtime/kubeconfig`, owned by the invoking user with mode 600. Treat it as an administrator credential.

It does not require you to send a password to the agent. The password is entered only into your terminal's sudo prompt. Docker group membership grants host-level control; this is the deployment operator account.

The script preserves an existing K3s service and refuses to overwrite an unrelated registry configuration. If reusing an existing cluster, verify its registry mirror manually. It does not disable an existing firewall or expose the Kubernetes API more broadly than K3s defaults. LAN access may require your existing firewall/router to permit HTTPS 443 and ArgoCD 30443 from trusted clients. Do not forward database or registry ports.

## 2. Build and deploy

```bash
bash scripts/deploy-server.sh
```

For a custom DNS name on the first deployment:

```bash
ABIES_HOST=wellness.example.com bash scripts/deploy-server.sh
```

The command:

1. Validates K3s/Docker access, entering the newly granted Docker group if possible. If an existing session cannot refresh its group, it uses a temporary non-root Kubernetes worker with the account’s already-authorized Docker group and socket. The source is mounted read-only, no service-account token is mounted, and the worker is removed on exit.
2. Builds API, frontend and read-only Git-server images using a content-derived tag, then pushes them to `127.0.0.1:5000`.
3. Creates credentials only when absent. Existing database passwords are never silently regenerated.
4. Creates a local TLS certificate when absent, with a hostname or IP SAN, and stores it in the `abies-tls` Kubernetes secret.
5. Updates `environments/server/values.yaml` with the deployment hostname and image tags.
6. Publishes the non-ignored application files to a dedicated local Git repository. Credentials, `.runtime`, `.env`, node_modules and browser artifacts are excluded.
7. Installs the `abies-git` Helm release in `gitops` and the official **argo/argo-cd chart 10.9.2** in `argocd`.
8. Creates the restricted Abies ArgoCD project and Application. ArgoCD renders the Helm chart, synchronizes resources and watches for drift.
9. Waits for `Synced/Healthy` and API/web rollouts, then stores the ArgoCD initial admin password locally with mode 600.

Commands are rerunnable. The deployment script owns hostname and image settings in the server values file; put reusable custom settings in chart defaults or extend the script deliberately. Existing passwords and database volumes are retained.

## 3. Open and verify

- Abies: `https://192.168.1.160`
- ArgoCD: `https://192.168.1.160:30443`, username `admin`
- Initial ArgoCD password: `.runtime/argocd-admin-password` (read it locally; rotate it after sign-in).

Local certificates are not publicly trusted. Install `.runtime/tls.crt` in your workstation's trust store or replace the application TLS secret with a certificate from your CA. ArgoCD uses its own generated certificate initially. For IP access the application creates a Traefik default TLSStore, because IP connections may omit SNI. This changes the default certificate for the server's Traefik instance and is intended for this dedicated server. For a shared ingress, use a DNS name and set `ingress.defaultCertificate=false`.

```bash
export KUBECONFIG="$PWD/.runtime/kubeconfig"
bash scripts/server-status.sh
curl --cacert .runtime/tls.crt https://192.168.1.160/api/health/ready
```

When accessing from another machine, use the server's LAN IP, not localhost. A LAN IP is not an Internet-reachable public address.

## Changing TLS or hostname

Install a certificate matching the new hostname first, then redeploy with `ABIES_HOST`:

```bash
kubectl -n abies create secret tls abies-tls --cert=/secure/new.crt --key=/secure/new.key \
  --dry-run=client -o yaml | kubectl apply -f -
ABIES_HOST=wellness.example.com bash scripts/deploy-server.sh
```

The script preserves an existing TLS secret; it does not silently replace a user-supplied certificate. Configure DNS and keep the app origin, ingress host and certificate SAN consistent. Do not disable secure cookies for network-facing use.

## Helm customization

`charts/abies/values.yaml` supports images/tags/pull policies, replica counts, resource requests/limits, existing secrets, storage class/sizes, ingress/TLS, network policies and disruption budgets. Selectors include the release name so multiple releases can coexist. Each release needs its own credentials with URLs referencing its backend/database service names.

```bash
helm lint charts/abies -f environments/server/values.yaml
helm template abies charts/abies -n abies -f environments/server/values.yaml > /tmp/abies.yaml
kubectl apply --dry-run=server -f /tmp/abies.yaml
```

For a separate environment managed directly by Helm, supply its own namespace, values and secrets, then `helm upgrade --install ...` and `helm test ...`. Do not introduce a direct Helm release for the same resources already owned by ArgoCD. ArgoCD uses Helm as a renderer and does not create an application Helm release.

PVCs and consumers are in the same sync wave so K3s `WaitForFirstConsumer` provisioning can complete. API migration init containers serialize schema initialization with a PostgreSQL advisory lock. Add version-tracked migrations for future schema changes. Retaining a PVC on uninstall is not a backup.

## Backups and updates

```bash
export KUBECONFIG="$PWD/.runtime/kubeconfig"
# Choose a secure path outside the Git working directory:
kubectl -n abies exec deployment/abies-postgres -- pg_dump -U abies abies > /secure/abies-backup.sql
```

Also back up the local bare Git source, credential/TLS secrets and cluster configuration securely. Store backups off-server and test restore procedures. The PostgreSQL backup includes prescription file records. Redis holds sessions; users can sign in again after session loss.

For code changes run `bash scripts/deploy-server.sh`. For Helm-only changes run `bash scripts/publish-local.sh`. The original repository's commits/remotes are untouched by the publishing script. Roll back by publishing the reviewed prior source/image tags to the local Git repository. Database migrations must be compatible with the application version you restore.

## Diagnostics

```bash
export KUBECONFIG="$PWD/.runtime/kubeconfig"
kubectl -n abies get pods,pvc,ingress
kubectl -n abies logs deployment/abies-backend -c migrate
kubectl -n abies logs deployment/abies-backend -c backend
kubectl -n argocd get application abies-platform -o yaml
kubectl -n argocd logs deployment/argocd-repo-server
kubectl -n gitops logs deployment/abies-git
sudo journalctl -u k3s -n 100 --no-pager
```

- `ImagePullBackOff`: check that the local registry is running and `/etc/rancher/k3s/registries.yaml` contains the loopback mirror.
- PVC pending: inspect pod scheduling and the local-path provisioner. Do not assign PVCs an earlier sync wave than consumers.
- Git repository unavailable: confirm `.runtime/git/abies.git` exists, the Git pod is ready, and the repo-server labels match the NetworkPolicy.
- Login origin rejection: the browser's scheme/host must exactly match `app.origin`.
- Permission denied during bootstrap: run the script interactively with sudo. A non-root terminal without sudo authentication cannot install system services.

## References

[K3s quick start](https://docs.k3s.io/quick-start), [Helm installation](https://helm.sh/docs/intro/install/), [ArgoCD Helm integration](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/).

## Bootstrap fixes for minimal Ubuntu 26.04

`sg` comes from `util-linux-extra`; the bootstrap now installs it explicitly. Existing installations can either start a fresh login to activate Docker group membership, install that package, or use the deployment script’s Kubernetes build-worker fallback. No Docker socket permissions are relaxed.

The K3s-linked kubectl can print harmless warnings when it probes `/etc/rancher/k3s/config.yaml.d` as a non-root user. The scripts prefer a standalone kubectl under `.runtime/bin`, so the root-only K3s configuration stays private.

### Application administrator and staff panels

The Abies application administrator is separate from the ArgoCD administrator. Sign in to the main website as `admin@abies.local`; its generated password is in the private `.runtime/admin-account.json` file. Change it under **My profile** after first login. Read [STAFF.md](STAFF.md) for creating staff accounts, linking doctors and assigning deliveries.

Database migrations run automatically before the upgraded backend starts. Existing catalogs and transactional data are retained; migration versions are recorded in `schema_migrations`. Pre-upgrade database backups are kept privately under `.runtime/backups/` on this server.
