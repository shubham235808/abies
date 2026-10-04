# Implementation Plan

Sequenced, each stage ending at a checkpoint — per `CONTRACT.md` §27,
nothing past Stage 0 happens without explicit approval, and this plan
itself is part of what's being submitted for that approval.

## Stage 0 — this assessment (done)

`CURRENT-STATE.md`, `KUBERNETES-READINESS.md`, `SECURITY-GAP-ANALYSIS.md`,
`DEPLOYMENT-ARCHITECTURE.md`, this file. No deployment-phase work started.

## Stage 1 — application changes (in `abies-application`/this repo)

Everything here is ordinary code review + CI, no cluster/platform access
needed, so it can start as soon as approved without waiting on anything
platform-owned (Harbor credentials, Vault path, etc.).

1. **API versioning** — move every route under `apps/platform-api/src/app/api/`
   to `apps/platform-api/src/app/api/v1/`. Mechanical; update the three
   frontend apps' `api-client.ts` base path to match.
2. **Health endpoints** — add `/api/v1/health`, `/api/v1/health/live`,
   `/api/v1/health/ready` to `platform-api` (move existing `/api/health`→
   `.../live`, `/api/ready`→`.../ready` logic, no behavior change). Add a
   minimal equivalent to `client-web`/`partner-web`/`management-web`.
3. **Structured log fields** — add `service`/`environment` to
   `logger.ts`'s base shape (read from `APP_NAME`/`NODE_ENV` env vars
   already available), and thread the existing `x-request-id` (already
   stamped by `proxy.ts`) into the per-request log context.
4. **File upload content sniffing** — close the MIME-type-trust gap
   (`SECURITY-GAP-ANALYSIS.md` §3). Smallest fix: a content-sniffing check
   (e.g. magic-byte detection) in `assertUploadAllowed()` alongside the
   existing declared-MIME-type check.
5. **OTP delivery — decision + implementation** (`SECURITY-GAP-ANALYSIS.md`
   §1). Two separable parts:
   - **Business decision** (not this team's call): which SMS provider,
     budget, live vs. sandbox credentials, timeline. Blocks real
     `abies-prod` traffic regardless of how fast the code side moves.
   - **Code**: once a provider is chosen, implement a real adapter next to
     `mock-adapter.ts` and wire `requestOtp()` to call `notify()` (or the
     adapter directly) after creating the `OtpChallenge` row. Can be built
     and tested against a sandbox/test-mode credential before the real
     production credential exists, the same way Razorpay's test-mode
     pattern already works in this codebase.
   - `abies-dev`/`abies-uat` do **not** need this to be useful — they can
     run with the existing dev-OTP-bypass path from day one.

**Checkpoint**: Stage 1 changes reviewed/merged, CI (typecheck/lint/test,
already passing per this session's EXPANSION-5 work) green.

## Stage 2 — `abies-gitops` rebuild

Replaces this session's pre-contract draft (`/home/devops/abies/abies-gitops`
locally — never pushed to any remote) with the structure in
`DEPLOYMENT-ARCHITECTURE.md`. Concretely:

1. Restructure `applications/<component>/base` + `environments/{dev,uat,prod}`
   per the Kustomize layout above (replaces the draft's `apps/<app>/
   {base,overlays/production}`).
2. Switch every `images:` reference from tag to digest-pinned
   (`newName`/`digest` Kustomize image transformer fields, not `newTag`).
3. Add `ExternalSecret` resources per environment (replaces the draft's
   plain `Secret` template) — blocked on the Vault path convention and
   `ClusterSecretStore` name (platform-owned, not yet known — flag as a
   dependency to request, don't guess at it).
4. Add `securityContext` (Pod Security Restricted shape), resource
   requests/limits sized for real traffic (not the draft's placeholder
   values), `topologySpreadConstraints`, `PodDisruptionBudget`,
   `NetworkPolicy` per component.
5. Rewrite the four `HTTPRoute`s with the real `abies-internal-gateway`/
   `abies-gateway` values — straightforward substitution, no structural
   change (Gateway API usage itself was already correct).
6. Replace the draft's 6-Application app-of-apps with the 4-Application
   structure (`abies-bootstrap`/`abies-dev`/`abies-uat`/`abies-prod`),
   DEV/UAT auto-sync + selfHeal + prune, **PROD sync policy omitted
   entirely** (manual-only is the *absence* of an `automated:` block, not
   a special flag — double-check this explicitly before considering PROD
   done, it's easy to accidentally leave automation on from a copy-paste).
7. Push to the real `abies/abies-gitops` Gitea repo (requires: Gitea
   credentials/token, confirmation of the `main` branch convention).

**Checkpoint**: `environments/dev/kustomization.yaml` builds cleanly
locally (`kustomize build`) before anything is pushed or applied.

## Stage 3 — Tekton rebuild (in `abies-ci` namespace)

Replaces this session's pre-contract draft (`abies/tekton/`):

1. **Build**: same kaniko approach, retarget `--destination` to
   `harbor.abies.in/abies/<component>`, swap the `--insecure
   --skip-tls-verify` flags for Harbor's actual (presumably
   internally-trusted) TLS — confirm which.
2. **Push credentials**: a CI-side Harbor robot account (push/pull),
   separate from the cluster's pull-only robot account per `CONTRACT.md`
   §6 — two different credentials, not one reused for both.
3. **Capture the digest**: kaniko's `--digest-file` output (or Harbor's
   API) after push, used by the next step instead of a tag.
4. **DEV promotion**: patch `environments/dev/kustomization.yaml`'s image
   digest for the built component, commit+push to `abies-gitops` — same
   shape as the draft's `update-gitops-image` Task, just digest instead
   of tag, and targeting the new Kustomize layout's path.
5. **UAT/PROD promotion**: a separate, explicitly-invoked
   `promote-digest` Task/Pipeline — takes an existing digest (not a fresh
   build) and a target environment, patches that environment's
   `kustomization.yaml` with the *same* digest. For PROD this should
   require a human trigger (manual `PipelineRun`, or a Tekton Trigger
   gated behind an approval step if the platform has one) — never
   automatic on a plain push.
6. **Git host**: retarget Tekton Triggers' `github` interceptor and
   `triggerbinding-push.yaml`'s payload field paths to Gitea's webhook
   shape (`https://git.abies.in` — Gitea's push payload is close to
   GitHub's but not identical; needs checking against Gitea's actual docs
   once Triggers work starts, not assumed).
7. Vulnerability-check step: likely a no-op Tekton-side (Harbor/Trivy
   scans automatically on push per `CONTRACT.md` §6) — confirm whether
   the pipeline should also *gate* on the scan result (fail the promotion
   step if Trivy finds a critical CVE) or just rely on Harbor surfacing it
   for manual review.

**Checkpoint**: a full DEV build+deploy cycle works end-to-end for one
component before wiring the rest, and before touching UAT/PROD promotion
at all.

## Stage 4 — first DEV deploy

1. Apply `abies-bootstrap` to ArgoCD.
2. Confirm `abies-dev` Application syncs: namespace, ConfigMap, migration
   Job (PreSync hook) completes, then all five components reach Ready.
3. Verify `HTTPRoute`s actually route correctly through
   `abies-internal-gateway` — hit each path prefix from inside the
   cluster's network (or via `*.abies.in` if DNS is already pointed at
   the dev hostname).
4. Confirm health probes behave correctly under real conditions (kill
   Redis briefly, confirm readiness flips to `503` and recovers — don't
   just trust the code).

**Checkpoint**: DEV genuinely working, reviewed by the platform team if
they want visibility before UAT.

## Stage 5 — UAT, then PROD

Same deploy, promoted by digest (not rebuilt) per
`DEPLOYMENT-ARCHITECTURE.md`'s promotion flow. PROD specifically needs,
before cutover is even considered:

- Stage 1 item 5 (OTP delivery) actually shipped with real credentials —
  otherwise `abies-prod` is reachable but unusable for real users.
- Explicit human approval for the first `abies-prod` ArgoCD sync (manual
  by design, not a formality to skip).
- A rollback plan verified ahead of time (ArgoCD's history/rollback, not
  improvised during an incident).
- The existing Docker Compose VM deployment (`abies.in`) still untouched
  and still the live system — this cutover is a separate, later, explicit
  decision per `CONTRACT.md` §22, not implied by UAT/PROD existing and
  working in parallel.

## Explicit dependencies on the platform team (not this team's to decide or build)

- Vault path convention + `ClusterSecretStore` name (Stage 2.3).
- Confirmation of Harbor's TLS trust (internal CA vs. public) (Stage 3.1).
- Two separate Harbor robot credentials — CI push/pull, runtime pull-only
  (Stage 3.2; `CONTRACT.md` §6).
- Per-environment hostname convention under `*.abies.in`
  (`DEPLOYMENT-ARCHITECTURE.md`'s Gateway section).
- Confirmation of any existing Kyverno policies these manifests need to
  satisfy beyond the general Pod Security Restricted guidance already
  designed for (`KUBERNETES-READINESS.md`'s last row).
- Whether Cosign image signing gates the first `abies-prod` cutover or
  can follow it.
