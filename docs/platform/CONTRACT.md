# ABIES Ayurveda — Platform Environment & Deployment Contract

Pasted into this session on 2026-10-04 by the project owner, describing
the real on-premises Kubernetes platform this application is being made
ready for. Saved verbatim here as the source of truth the other
`docs/platform/*.md` files assess against — do not paraphrase or summarize
in place of this file; update it (with the user) if the real platform
changes, rather than letting it drift from what's actually true.

---

You are developing the ABIES Ayurveda application for an existing enterprise-grade,
on-premises Kubernetes platform.

IMPORTANT:
Do NOT redesign the infrastructure.
Do NOT install Kubernetes, Rancher, Argo CD, Harbor, Envoy Gateway, Tekton, PostgreSQL
infrastructure, ingress controllers, or other platform components unless explicitly instructed.

The platform already exists.

Your responsibility is to make the ABIES application production-ready for this environment.

## 1. Platform overview

Platform:
- Kubernetes distribution: RKE2
- Kubernetes version: v1.36.4+rke2r1
- OS: RHEL 9.8
- Container runtime: containerd
- Cluster type: 3-node HA RKE2 cluster
- SELinux: Enforcing
- GitOps: Argo CD
- CI: Tekton Pipelines
- Registry: Harbor
- Traffic management: Envoy Gateway / Kubernetes Gateway API
- Storage: NFS CSI/dynamic provisioning
- Secrets target architecture: Vault + External Secrets
- Policy target architecture: Kyverno
- Image scanning: Harbor Trivy
- Image signing target: Cosign
- Monitoring: Prometheus + Grafana
- Logging: Loki + Fluent Bit
- Telemetry: OpenTelemetry
- Backup: Velero + existing RKE2 etcd backup architecture

DO NOT assume Docker or Docker Compose exists on Kubernetes nodes.

DO NOT use: Docker socket, DinD, privileged containers, hostPath unless specifically
approved, insecure TLS, nginx ingress, Traefik, Kubernetes Ingress resources.

Use Kubernetes Gateway API.

## 2. Cluster nodes

RKE2 nodes:
- rke2-01.abies.local — 192.168.3.111
- rke2-02.abies.local — 192.168.3.112
- rke2-03.abies.local — 192.168.3.113

All three nodes: control-plane, etcd, worker/schedulable.

Kubernetes API VIP reserved: 192.168.3.110

Do NOT hard-code node IP addresses into application manifests.

## 3. Application environments

Three application environments currently share the RKE2 cluster.

Namespaces:
- DEV: abies-dev
- UAT: abies-uat
- PROD: abies-prod
- CI: abies-ci
- Gateway infrastructure: abies-gateway

Platform namespaces such as argocd, harbor, gitea, cattle-system,
tekton-pipelines, etc. are NOT application namespaces.

Application workloads must remain isolated by namespace.

## 4. Git architecture

Primary Git service: Gitea — https://git.abies.in
Organization: abies

Repositories:
- abies/abies-application
- abies/abies-gitops
- abies/abies-platform

**abies-application** — Application source code: frontend, backend/API,
application tests, Dockerfile/Containerfile, CI definitions where
appropriate, database migration code, application documentation.

**abies-gitops** — Authoritative Kubernetes desired state: Kubernetes
manifests, Kustomize bases/overlays, environment configuration, immutable
image references, Gateway API routes, deployment/service configuration.

**abies-platform** — Platform/infrastructure configuration. Application
agents should NOT modify abies-platform unless explicitly instructed.

GitHub may later be used as an external mirror/off-site copy. Gitea
remains the primary internal source of truth.

## 5. Argo CD

https://argocd.abies.in — Version v3.5.3

GitOps repository: https://git.abies.in/abies/abies-gitops.git

Argo CD AppProject: abies

Applications: abies-bootstrap, abies-dev, abies-uat, abies-prod

Current GitOps behavior:
- DEV: automatic synchronization, selfHeal=true, prune=true
- UAT: automatic synchronization, selfHeal=true, prune=true
- PROD: MANUAL synchronization

Production must maintain an explicit approval boundary. DO NOT configure
automatic PROD synchronization.

The root bootstrap Application uses an App-of-Apps model and recursively
manages bootstrap resources.

Application agents MUST NOT manually kubectl apply production application
manifests as the normal deployment mechanism. Git is authoritative.

## 6. Container registry

https://harbor.abies.in — Harbor project: abies

Images: `harbor.abies.in/abies/<component>:<tag>` e.g.
`harbor.abies.in/abies/web:<tag>`, `harbor.abies.in/abies/api:<tag>`.

Deployment must ultimately use IMMUTABLE IMAGE DIGESTS, e.g.
`harbor.abies.in/abies/api@sha256:<digest>`, NOT
`harbor.abies.in/abies/api:latest`.

Build once and promote the SAME digest through DEV -> UAT -> PROD. Never
rebuild an image specifically for production.

Harbor includes Trivy vulnerability scanning. Runtime Kubernetes access
uses a pull-only Harbor robot credential. CI uses a separate push/pull
robot credential. DO NOT place Harbor passwords/robot secrets in Git.

## 7. CI/CD

Tekton Pipelines v1.15.0 LTS — CI namespace: abies-ci
Tekton Dashboard: https://tekton.abies.in

Container builds use: ghcr.io/osscontainertools/kaniko (no privileged
containers, no Docker daemon, no Docker socket, no DinD).

Expected pipeline: Developer -> Gitea/abies-application -> Tekton (source
checkout, dependency installation, lint, unit tests, application build,
container build, Harbor push, vulnerability/security checks, obtain
immutable SHA256 digest) -> update/promote abies-gitops -> Argo CD -> RKE2.

Production promotion must remain controlled/manual.

## 8. Networking

DO NOT create Kubernetes Ingress objects. Use `gateway.networking.k8s.io/v1`
HTTPRoute and other Gateway API resources when required.

Envoy Gateway already exists.

Internal Gateway:
- Namespace: abies-gateway
- Gateway name: abies-internal-gateway
- GatewayClass: envoy-internal
- Internal wildcard TLS: *.abies.in
- TLS termination occurs at Envoy Gateway.
- Internal VIP: 192.168.3.116

Internal platform services use SNI routing through this VIP.

Application Services should normally remain `type: ClusterIP`. Do NOT
create NodePort or LoadBalancer Services unless explicitly required. Do
NOT embed VIP or node addresses in application code. Application routing
should use Kubernetes Service DNS internally.

## 9. Internal platform endpoints

https://rancher.abies.in, https://harbor.abies.in, https://argocd.abies.in,
https://tekton.abies.in, https://git.abies.in, https://grafana.abies.in,
https://prometheus.abies.in, https://vault.abies.in — resolve internally
through the ABIES DNS/platform routing architecture. Do NOT expose these
management endpoints publicly.

## 10. Storage

Default StorageClass: abies-nfs — Provisioner: abies.in/nfs

Dynamic provisioning available. Reclaim policy: Retain.
archiveOnDelete: true.

Current NFS infrastructure: infra-01.abies.local — 192.168.3.118

Application PVCs should normally request `storageClassName: abies-nfs`.
Do NOT use hostPath. Do NOT bind applications to individual Kubernetes
nodes for storage. Persistent storage requirements must be explicitly
documented.

## 11. Security requirements

All workloads should be designed for Kubernetes Pod Security Restricted
compatibility. Prefer: `runAsNonRoot: true`, `allowPrivilegeEscalation:
false`, `readOnlyRootFilesystem: true` where application compatibility
permits, `capabilities: {drop: [ALL]}`, `seccompProfile: {type:
RuntimeDefault}`.

Do not use privileged containers, hostNetwork, hostPID, hostIPC. Do not
mount container runtime sockets. Containers must not require root unless
technically unavoidable and explicitly documented.

Define CPU/memory requests and limits for every production workload.
Implement startupProbe/readinessProbe/livenessProbe where appropriate.
Applications must support graceful termination
(`terminationGracePeriodSeconds`, correct SIGTERM handling).

## 12. Secrets

NEVER commit secrets to Git — including database passwords, JWT secrets,
OTP secrets, API keys, SMS/WhatsApp credentials, payment gateway
credentials, SMTP credentials, encryption keys, Harbor credentials, Gitea
tokens, OAuth secrets, certificates/private keys.

Target architecture: Vault + External Secrets. Application manifests
should reference Kubernetes Secrets rather than contain secret values,
e.g.:

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: abies-database
        key: database-url
```

Generate templates/placeholders only. Never generate real credentials.

## 13. Application configuration

Separate CONFIGURATION from SECRETS. Non-secret environment configuration
via ConfigMaps or explicit environment configuration (e.g. NODE_ENV,
LOG_LEVEL, PUBLIC_BASE_URL, FEATURE_FLAGS, OTEL endpoint). Secrets from
Secret/ExternalSecret resources. Application code must not depend on
hard-coded DEV/UAT/PROD URLs.

## 14. Database

The existing legacy ABIES deployment currently uses PostgreSQL. The
current production/legacy system must NOT be modified or migrated
automatically. Database migration requires a separate controlled
migration plan. Application code should use a standard DATABASE_URL/
configuration mechanism. Database schema changes must be version
controlled.

If Prisma is used: keep migrations in source control, never run
destructive migration behavior automatically in PROD, do not use `prisma
db push` as the production schema-management strategy, use controlled
migration execution. Migration jobs must be idempotent/safely retryable
where possible. Do NOT deploy a new production PostgreSQL instance
without explicit approval.

## 15. Health endpoints

Recommended API endpoints: `/api/v1/health`, `/api/v1/health/ready`,
`/api/v1/health/live`.

Semantics: live = is the process alive; ready = can this instance safely
receive traffic; health = general diagnostic status.

Kubernetes probes must not depend on external third-party services unless
there is a strong reason. Readiness may check critical local dependencies
such as database connectivity. Liveness should generally NOT fail simply
because an external dependency is unavailable.

## 16. Observability

Structured logs to stdout/stderr, prefer JSON for backend services.
Include: timestamp, level, service, environment, request/correlation ID,
message. Never log passwords, tokens, OTP values, medical-sensitive data,
payment information, authorization headers.

Target monitoring stack: Prometheus, Grafana, Loki, Fluent Bit,
OpenTelemetry.

## 17. ABIES healthcare security

Application architecture must support: strong authentication, RBAC, least
privilege, audit logging, consent tracking, secure session handling, API
authorization, rate limiting, input validation, secure file upload,
encryption in transit, protection of sensitive patient information,
traceability of administrative actions.

Authorization must be enforced SERVER-SIDE. Never rely solely on hiding
frontend buttons/pages. Every protected API endpoint must perform
authorization.

## 18. API design

The same backend APIs will eventually serve: web application, Android
application, iOS application, administrative portals, partner
integrations where approved. APIs must not depend on browser-only
behavior. Use versioned APIs: `/api/v1/...`. Implement consistent
authentication, authorization, validation, error responses, pagination,
filtering, audit events, rate limits. Design APIs with mobile clients in
mind.

## 19. Deployment availability

Production workloads should support rolling deployments. Where
appropriate, `replicas >= 2`. Use `podAntiAffinity` or
`topologySpreadConstraints` to avoid concentrating replicas on one RKE2
node. Create PodDisruptionBudgets for critical workloads. Loss of one
Kubernetes node should not normally make critical stateless ABIES
services unavailable.

## 20. Kustomize/GitOps structure

Use Kustomize unless there is a strong technical reason not to. Target
structure in abies-gitops:

```
applications/
  abies/
    base/
      deployment.yaml
      service.yaml
      configmap.yaml
      httproute.yaml
      pdb.yaml
      networkpolicy.yaml
      kustomization.yaml

environments/
  dev/
    kustomization.yaml
  uat/
    kustomization.yaml
  prod/
    kustomization.yaml
```

Base contains common application definitions. Overlays contain
environment-specific differences. Avoid copying complete manifests three
times.

## 21. Environment promotion

SOURCE COMMIT -> TEKTON -> BUILD ONCE -> HARBOR IMAGE DIGEST -> DEV -> UAT
-> PROD APPROVAL -> PROD.

The SAME SHA256 image digest should be promoted. Do not rebuild between
environments.

## 22. Current legacy application

An existing ABIES application is still running separately on an Ubuntu VM
using Docker Compose, PostgreSQL and Nginx. THIS SYSTEM MUST REMAIN
UNTOUCHED. Do not stop it, migrate its DB, modify its DNS, replace its
certificates, change its Nginx, change its Docker Compose, or change
production routing until the Kubernetes implementation has been fully
built, validated and explicitly approved for migration/cutover. The
Kubernetes deployment is currently a PARALLEL deployment.

## 23. Development expectations

Before changing code, inspect the existing repository. Do NOT rewrite
working application functionality unnecessarily.

First produce: CURRENT-STATE.md, KUBERNETES-READINESS.md,
DEPLOYMENT-ARCHITECTURE.md, SECURITY-GAP-ANALYSIS.md,
REQUIRED-CHANGES.md.

Inspect: application architecture, frontend, backend, database,
Prisma/schema/migrations, authentication, authorization/RBAC, sessions,
APIs, health endpoints, logging, configuration, secrets, file storage,
background jobs, WebSockets if any, scheduled jobs, payment integrations,
SMS/WhatsApp integrations, email integrations, external APIs.

Classify findings as: READY, CHANGE REQUIRED, SECURITY ISSUE, KUBERNETES
ISSUE, PRODUCTION BLOCKER.

Do not start a massive rewrite before producing this assessment.

## 24. Required deliverables

After assessment, prepare the application for: local developer execution,
containerized execution, Kubernetes DEV, Kubernetes UAT, Kubernetes PROD,
Tekton CI, Harbor image publishing, Argo CD GitOps delivery, Envoy
Gateway exposure, observability, secure secrets integration, controlled
database migrations.

Every generated Kubernetes resource must be suitable for GitOps.

## 25. Do not modify platform components

Do NOT independently modify: RKE2, Rancher, Envoy Gateway installation,
GatewayClass, Argo CD installation, Tekton installation, Harbor
installation, Gitea installation, CoreDNS, HAProxy, Keepalived, OPNsense,
NFS server, RKE2 etcd backup configuration.

If application requirements need a platform change: STOP. Create
`docs/PLATFORM-CHANGE-REQUEST.md` documenting required change, reason,
affected component, security implications, downtime/risk, rollback plan.
Do not execute the platform change.

## 26. Important architectural principle

The application team owns: CODE, APPLICATION CONTAINERS, APPLICATION
CONFIGURATION, APPLICATION MANIFESTS.

The platform owns: KUBERNETES, NETWORK, GATEWAY, REGISTRY, CI ENGINE,
GITOPS ENGINE, STORAGE, PKI, SECRETS PLATFORM, OBSERVABILITY PLATFORM.

Do not cross this boundary without explicit approval.

## 27. First task

Do NOT deploy anything yet. Study the complete existing ABIES application
repository. Then generate the five `docs/platform/*.md` deliverables and
report findings A-T. WAIT FOR APPROVAL BEFORE PERFORMING THE DEPLOYMENT
PHASE.
