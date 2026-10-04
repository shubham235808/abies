# Proposed Deployment Architecture

Target state only — nothing here has been applied to any cluster or
pushed to `abies-gitops`/`abies-application`'s real Gitea remotes yet.
Supersedes this session's pre-contract draft (GitHub/generic-registry/
tag-based/single-namespace) wherever they conflict; see
`KUBERNETES-READINESS.md`'s "Platform-specific fit" table for exactly
what changes and why.

## Components

Four Deployments + one migration Job, same as the pre-contract draft:

| Component | Image | Serves |
|---|---|---|
| `web` | `harbor.abies.in/abies/web@sha256:...` | client-web: public site + patient portal (catch-all `/`) |
| `partner` | `harbor.abies.in/abies/partner@sha256:...` | doctor/lab/pharmacy/panchakarma-centre (`/partner/*`) |
| `ops` | `harbor.abies.in/abies/ops@sha256:...` | admin/support/sales/care-coordination (`/ops/*`) |
| `api` | `harbor.abies.in/abies/api@sha256:...` | every `/api/v1/*` route |
| `migrator` | `harbor.abies.in/abies/migrator@sha256:...` | one-shot `prisma migrate deploy`, ArgoCD PreSync hook |

(Image component names shortened from the app repo's `client-web`/
`partner-web`/`management-web`/`platform-api` folder names — `<component>`
in `harbor.abies.in/abies/<component>:<tag>` reads more naturally short;
open to keeping the longer names instead if the platform team prefers
matching folder names exactly.)

No separate worker Deployment — `bullmq` is unused (CURRENT-STATE.md §11).

## Namespaces

`abies-dev`, `abies-uat`, `abies-prod` each get the full component set
above. `abies-ci` holds Tekton `Pipeline`/`Task`/`Trigger` resources
only — no application workloads. `abies-gateway` is platform-owned, not
touched by this repo except via `HTTPRoute`'s `parentRefs`.

## Kustomize layout (replaces the pre-contract per-app-overlay draft)

Per `CONTRACT.md` §20, in `abies-gitops`:

```
applications/
  web/
    base/ {deployment.yaml, service.yaml, httproute.yaml, kustomization.yaml}
  partner/
    base/ {...}
  ops/
    base/ {...}
  api/
    base/ {...}
  migrator/
    base/ {job.yaml, kustomization.yaml}
  common/
    base/ {namespace.yaml, configmap.yaml, networkpolicy.yaml, kustomization.yaml}

environments/
  dev/
    kustomization.yaml   # references every applications/*/base, patches namespace=abies-dev, replicas, image tags
  uat/
    kustomization.yaml   # same shape, namespace=abies-uat
  prod/
    kustomization.yaml   # same shape, namespace=abies-prod, PDBs, anti-affinity, stricter resource limits
```

Each `environments/<env>/kustomization.yaml` is the actual ArgoCD sync
target (not `applications/*/base` directly) — it pulls in all five
components' bases plus `common/base`, and patches what differs per
environment: namespace, replica count, resource requests/limits, and
(critically) which image digest each component runs. `applications/*/base`
stays identical across all three environments — only `environments/*`
differs, directly satisfying "avoid copying complete manifests three
times."

## Image promotion (replaces the pre-contract draft's build-and-tag-per-push model)

```
commit -> Tekton (abies-ci) -> kaniko build -> push harbor.abies.in/abies/<component>
       -> Trivy scan (Harbor, automatic) -> record the digest
       -> patch environments/dev/kustomization.yaml's image digest for <component>, commit
       -> ArgoCD syncs abies-dev automatically (selfHeal, prune)
       -> [manual promotion] patch environments/uat/... with the SAME digest, commit
       -> ArgoCD syncs abies-uat automatically
       -> [manual promotion + approval] patch environments/prod/... with the SAME digest, commit
       -> ArgoCD shows abies-prod out-of-sync; a human runs the sync (no automated PROD sync)
```

Tekton's role stops at DEV — UAT and PROD promotion is a digest copy
between `environments/*/kustomization.yaml` files, not a rebuild. This
could be a second small Tekton `Task` (`kustomize edit set image
--digest ... ` against the target environment's overlay, invoked
manually or via a promotion PipelineRun) or done directly via `git`/
`kustomize` by whoever approves the promotion — a detail for
`IMPLEMENTATION-PLAN.md` to settle, not fixed here.

## ArgoCD

AppProject `abies`. Four Applications, matching `CONTRACT.md` §5 exactly
(replacing the draft's six per-component Applications):

| Application | Source path | Sync |
|---|---|---|
| `abies-bootstrap` | `argocd/` (app-of-apps root) | automated |
| `abies-dev` | `environments/dev` | automated, selfHeal, prune |
| `abies-uat` | `environments/uat` | automated, selfHeal, prune |
| `abies-prod` | `environments/prod` | **manual only** |

`abies-bootstrap` is the one Application applied by hand; it owns
`abies-dev`/`abies-uat`/`abies-prod` the same way the draft's
`app-of-apps.yaml` worked, just with environment-scoped children instead
of component-scoped ones.

## Gateway API

One `HTTPRoute` per component per environment (12 total, or fewer if
`environments/*` patches a shared base route's hostname rather than
templating 12 separate files), all attaching to the existing
`abies-internal-gateway` (namespace `abies-gateway`):

```yaml
spec:
  parentRefs:
    - name: abies-internal-gateway
      namespace: abies-gateway
  hostnames:
    - dev.abies.in     # or whatever the real per-env hostname convention is — not yet confirmed
  rules:
    - matches: [{path: {type: PathPrefix, value: /partner}}]
      backendRefs: [{name: partner, port: 3000}]
```

Still open: the actual per-environment hostname convention under
`*.abies.in` (`dev.abies.in`/`uat.abies.in`/`abies.in`? or a path-based
split instead?) — not stated in the contract, needs confirming before
these are finalized.

## Health endpoints (application-side change, not infra)

`platform-api`'s existing `/api/health` and `/api/ready` move to
`/api/v1/health/live` and `/api/v1/health/ready` respectively (logic
unchanged — liveness has no dependency checks, readiness checks
Postgres/Redis/storage). `/api/v1/health` becomes a general diagnostic
endpoint per the contract's three-endpoint shape. `web`/`partner`/`ops`
each get a minimal new route returning 200 with no dependency checks
(they have nothing meaningful to check locally beyond "the Next.js server
responded").

## Resilience

Every component: `replicas: 2` minimum in `uat`/`prod` overlays (`dev`
can stay at 1 to save resources), `topologySpreadConstraints` keyed on
`kubernetes.io/hostname` across the three RKE2 nodes, and a
`PodDisruptionBudget` (`minAvailable: 1`) per component in `prod` at
least.

## Secrets (target state — Vault + External Secrets)

Each component's Deployment references an `ExternalSecret` (not a raw
`Secret`) per environment, e.g.:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: abies-secrets
spec:
  secretStoreRef: {name: vault-backend, kind: ClusterSecretStore}  # platform-owned, name TBD
  target: {name: abies-secrets}
  data:
    - {secretKey: DATABASE_URL, remoteRef: {key: abies/prod/database-url}}
    # ... one entry per secret name in CURRENT-STATE.md §9
```

Exact Vault path convention and `ClusterSecretStore` name are
platform-owned and unconfirmed — `IMPLEMENTATION-PLAN.md` treats this as
a dependency to request, not something to guess at.

## Still open, not this document's call to make

- Per-environment hostname convention (above).
- Whether Postgres/Redis/object-storage stay on the existing VM or move
  in-cluster (pre-existing open question, unaffected by this contract —
  `DATABASE_URL`/`REDIS_URL`/`STORAGE_ENDPOINT` arrive via secret either
  way, nothing here depends on which).
- Vault path convention / `ClusterSecretStore` name.
- Whether Cosign image signing is required before first `abies-prod`
  cutover or can follow after.
