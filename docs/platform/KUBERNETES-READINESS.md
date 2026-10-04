# Kubernetes Readiness Assessment

Classifies each area against `docs/platform/CONTRACT.md`. Legend:
**READY** (no change needed) · **CHANGE REQUIRED** (non-security gap) ·
**SECURITY ISSUE** · **KUBERNETES ISSUE** (platform-fit gap) ·
**PRODUCTION BLOCKER** (blocks real users specifically, not just the
assessment).

## Application code

| Area | Status | Why |
|---|---|---|
| Database migrations | **READY** | `prisma migrate deploy` only, 27 tracked migrations, no `db push` anywhere. |
| RBAC / server-side authz | **READY** | `requireSession`/`requireRole`/`requirePermission`/`requireAdminMfa` consistently gate route handlers; no frontend-only authz found. |
| Session handling | **READY** | HTTP-only cookie, opaque token, server-side hash lookup, sliding expiry, explicit revocation. |
| Audit logging | **READY** | `recordAuditEvent()` used across 36 files. |
| Consent tracking | **READY** | `ConsentArtifact`/`ConsentRecord` models, recorded on OTP verify. |
| Payment webhook/signature verification | **READY** | HMAC-SHA256 + `timingSafeEqual` (constant-time), not plain `===`. |
| Rate limiting | **READY** (platform-api) | IP-scoped Redis limits on OTP request, ticket creation, payment webhook. The 3 frontend apps' copies are inert post-Gateway-routing, not buggy — see CURRENT-STATE.md §6. |
| Structured logging | **CHANGE REQUIRED** | Already JSON/structured, zero raw `console.*` remaining — just missing `service`/`environment`/correlation-id fields in the base shape the contract wants (§16). Small addition, not a rewrite. |
| File upload validation | **CHANGE REQUIRED** / **SECURITY ISSUE** (minor) | Size + MIME-type allow-list enforced everywhere uploads happen, but MIME type is the client-declared `Content-Type`, not sniffed from file content. See SECURITY-GAP-ANALYSIS.md §4. |
| API versioning | **CHANGE REQUIRED** | No `/api/v1/` prefix anywhere; contract §18 requires it. Mechanical change (route folder rename + any client fetch paths), not a logic change. |
| Health endpoints | **CHANGE REQUIRED** | `platform-api` already has the right liveness/readiness *semantics* (`/api/health`, `/api/ready`) — needs moving to `/api/v1/health`, `/api/v1/health/live`, `/api/v1/health/ready`. `client-web`/`partner-web`/`management-web` need a lightweight equivalent of their own (none exist today). |
| SMS/Email/WhatsApp delivery | **PRODUCTION BLOCKER** | No real provider implemented, and — more fundamentally — `requestOtp()` never attempts delivery through any channel at all, even if a provider existed. Blocks real login for every role in `abies-prod`. Does not block `abies-dev`/`abies-uat` (dev-OTP-bypass path still works there, same as today's review deployment). See SECURITY-GAP-ANALYSIS.md §1. |

## Containers & workload shape

| Area | Status | Why |
|---|---|---|
| Non-root container | **READY** | `Dockerfile` already runs as `nextjs` (uid 1001), no Docker socket, kaniko-buildable (already proven working in this session). |
| `runAsNonRoot`/`allowPrivilegeEscalation: false`/capability drop/seccomp | **KUBERNETES ISSUE** | None of this is set at the Pod/container `securityContext` level in any manifest built so far (this session's pre-contract draft didn't include one). Straightforward to add; needs runtime verification once applied (see below). |
| `readOnlyRootFilesystem` | **KUBERNETES ISSUE — needs verification** | Likely safe (every route is dynamic, no ISR/`.next/cache` writes expected at runtime), but not yet confirmed by actually running a container with it set. Flag as "verify before relying on," not "assumed safe." |
| CPU/memory requests+limits | **CHANGE REQUIRED** | Present in this session's pre-contract draft manifests but with placeholder values, never validated against this cluster's actual node sizing. |
| Replicas / anti-affinity across nodes | **KUBERNETES ISSUE** | Pre-contract draft used `replicas: 2` with no `topologySpreadConstraints`/`podAntiAffinity` — needs adding so a single RKE2 node loss doesn't take out both replicas of a service. |
| PodDisruptionBudget | **KUBERNETES ISSUE** | Not present anywhere yet. |
| Graceful termination / SIGTERM | **CHANGE REQUIRED — needs verification** | Next.js's standalone `server.js` handles `SIGTERM` by default; not yet explicitly verified against this app's specific shutdown behavior (in-flight DB/Redis connections). |
| Background worker Deployment | **READY (not needed)** | `bullmq` is an unused dependency — no queue, no worker, nothing to deploy. |

## Platform-specific fit (this contract vs. this session's earlier draft)

| Area | Status | Why |
|---|---|---|
| Ingress mechanism | **READY (already corrected)** | Already Gateway API (`HTTPRoute`), not classic Ingress — this was fixed earlier in the session once Gateway API was confirmed, independent of this contract. |
| Gateway identity | **CHANGE REQUIRED** | Draft manifests had `TODO-gateway-name`/`TODO-domain` placeholders; contract gives the real values (`abies-internal-gateway` in `abies-gateway` namespace, `*.abies.in`) — substitution, not redesign. |
| Namespace model | **KUBERNETES ISSUE** | Draft used one `abies` namespace; contract requires `abies-dev`/`abies-uat`/`abies-prod` (+ `abies-ci` for Tekton resources) — needs restructuring, not just renaming (affects every manifest's `metadata.namespace` and the Kustomize layout itself). |
| Kustomize structure | **KUBERNETES ISSUE** | Draft used `apps/<app>/{base,overlays/production}` (overlay per app); contract wants `applications/<app>/base` + top-level `environments/{dev,uat,prod}` (overlay per environment, referencing all apps' bases together) — a real restructure. |
| Image registry | **KUBERNETES ISSUE** | Draft assumed a generic registry with `--insecure --skip-tls-verify` kaniko flags and tag-based references; contract is Harbor with a trusted-internally cert (presumably), digest-pinned promotion (`@sha256:...`, not `:tag`), and separate push/pull robot credentials. Both the Tekton build Task and every Kustomize overlay's `images:` block need rework. |
| Image promotion model | **KUBERNETES ISSUE** | Draft's Tekton pipeline rebuilds+repushes on every triggered push and bumps a tag per environment; contract wants build-once, promote-the-same-digest DEV→UAT→PROD with a manual PROD gate — a different pipeline shape, not a parameter change. |
| Git host | **KUBERNETES ISSUE** | Draft's Tekton Triggers (`tekton/triggers/`) are shaped for GitHub's webhook payload; actual git host is Gitea (`git.abies.in`) — the `github` interceptor and payload field paths need swapping for Gitea's equivalents. |
| ArgoCD Application model | **KUBERNETES ISSUE** | Draft used an app-of-apps with 6 per-component Applications (`abies-common`, `abies-migration`, `abies-client-web`, ...); contract specifies `abies-bootstrap`/`abies-dev`/`abies-uat`/`abies-prod` under an `abies` AppProject, with DEV/UAT auto-sync + selfHeal + prune and **PROD manual only** — draft's app-of-apps didn't distinguish per-environment sync policy at all. |
| Secrets | **SECURITY ISSUE** | Draft used plain Kubernetes `Secret` templates applied out-of-band via `kubectl create secret`. Contract's target is Vault + External Secrets — `ExternalSecret` resources referencing a Vault path, not raw `Secret` manifests (even as apply-time templates). See SECURITY-GAP-ANALYSIS.md §2. |
| NetworkPolicy | **KUBERNETES ISSUE** | None drafted. Contract's §20 target structure explicitly includes `networkpolicy.yaml` per app. |
| Storage | **READY (not yet needed)** | No PVC requirement identified yet — object storage is S3-compatible (MinIO today), not a filesystem mount; nothing in the current app needs `abies-nfs`. Revisit if that changes (e.g. in-cluster MinIO were chosen for the still-open Postgres/Redis/MinIO placement decision). |
| Image scanning (Trivy) | **KUBERNETES ISSUE (platform-owned, app-visible)** | Harbor provides this automatically on push — no app-repo change needed, but the Tekton pipeline's "vulnerability/security checks" step (contract §7's pipeline diagram) isn't drafted yet. |
| Image signing (Cosign) | **KUBERNETES ISSUE** | Not drafted at all; contract lists it as a target, not yet confirmed mandatory for first cutover. |
| Kyverno policy compliance | **KUBERNETES ISSUE — unverified** | No manifests have been validated against any Kyverno `ClusterPolicy` this platform may already enforce (e.g. Pod Security Restricted admission) — can't confirm compliance without seeing the actual policies. |
