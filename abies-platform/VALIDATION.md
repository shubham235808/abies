# Live deployment validation

Verified on 2026-09-22 on `abies-01` (`192.168.1.160`).

## Running services

| Component | Verified state |
|---|---|
| K3s v1.36.4+k3s1 | Node Ready; containerd and Traefik running |
| Helm v4.3.0 | Application/Git-source charts validated and packaged |
| Docker + loopback registry | API, frontend and Git images built and pushed locally |
| ArgoCD v3.5.3 (Helm chart 10.9.2) | Running; HTTPS and administrator login verified |
| Abies ArgoCD Application | **Synced / Healthy** |
| Frontend | 2/2 replicas ready |
| API | 2/2 replicas ready; migration completed |
| PostgreSQL | 1/1 ready; 10 Gi persistent volume bound |
| Redis | 1/1 ready; 1 Gi persistent volume bound |
| HTTPS ingress | `https://192.168.1.160`; certificate SAN and trust verified with local certificate |
| Temporary Docker build worker | Removed after deployment |

## Functional verification

- Production Docker image builds completed. Frontend compilation and strict TypeScript passed.
- Server-side Kubernetes dry-run validated all 18 application resources, including Traefik TLSStore.
- Chromium tested the **live HTTPS K3s endpoint**: registration/login, doctor consultation, mock video room, medicine search, cart/checkout, prescription upload/private download, Panchkarma booking, home diagnostic collection, home physiotherapy booking, cancellation and mobile navigation.
- No browser runtime exceptions or mobile horizontal overflow were detected. Test appointments were cancelled; the sample account/order/prescription remain as demonstration records.
- `/api/health/ready` returns HTTP 200 and checks the deployed PostgreSQL and Redis connections.
- ArgoCD administrator authentication was tested without printing credentials.
- GitOps self-healing was verified: frontend replicas were temporarily changed from two to one; ArgoCD restored two and the rollout returned Ready.
- The local Git snapshot excludes credentials, `.runtime`, node_modules and build output. No source was pushed to GitHub and the original working repository was not committed by the deployment.
- Kubeconfig, TLS key and initial ArgoCD password files have mode 600.
- Earlier native frontend/API preview processes were stopped after successful K3s verification.

The earlier 18 API/unit integration checks also passed using isolated PostgreSQL/Redis test databases. Those destructive test fixtures were not run against the deployed application database.

## Repairs made during deployment

- Ubuntu 26.04 lacked `sg`; bootstrap now includes `util-linux-extra`. For existing sessions, a temporary non-root Kubernetes worker uses the deployment account’s already-authorized Docker group/socket and a read-only source mount. Socket permissions were not relaxed.
- A standalone kubectl avoids harmless K3s CLI warnings about root-only config directories.
- Alpine requires the separate `git-daemon` package. The Git image now includes it and the pipeline checks for the daemon before publishing.
- Helm ownership of a manually repaired Git image field was explicitly restored. The corrected installer subsequently completed a clean rerun.

## Access and limits

- Abies: **https://192.168.1.160**
- ArgoCD: **https://192.168.1.160:30443** (username `admin`)
- Initial ArgoCD password: `.runtime/argocd-admin-password` (read locally; rotate after first use).
- Application public certificate: `.runtime/tls.crt`. Trust it on your workstation or replace it with a trusted certificate. ArgoCD initially uses its own generated certificate.

This is a single-server deployment with node-local persistence, not HA. Video, payments, products and practitioners remain demonstrations. See README.md for the production clinical/commerce scope and SERVER.md for operations and backups.
