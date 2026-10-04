# ABIES CI (Tekton)

Runs in the `abies-ci` namespace (docs/platform/CONTRACT.md §3/§7).
Builds the four apps (`client-web`, `partner-web`, `management-web`,
`platform-api`) and the shared `migrator` image from this repo's root
`Dockerfile`, pushes each to Harbor (`harbor.abies.in/abies/<component>`),
and hands off to CD by committing that image's **digest** (not a mutable
tag) into the separate `abies-gitops` repo that ArgoCD watches. Tekton
never talks to the cluster's application namespace directly — ArgoCD owns
that.

**Setting this up for the first time?** `abies-gitops/DEPLOY.md` is the
ordered runbook covering both repos. The sections below are reference.

## Layout

- `tasks/build-push-image.yaml` — kaniko build + push for any one app or
  the migrator target; emits the pushed image's digest as a Task result.
- `tasks/update-gitops-image.yaml` — bumps an image reference (by digest)
  in `abies-gitops`'s `environments/dev/kustomization.yaml` and pushes the
  commit (the CI→CD handoff).
- `pipelines/build-and-deploy.yaml` — per-app pipeline: clone → build+push
  → update GitOps. Run once per app, not once for all four, so one app's
  commit doesn't force a rebuild of the other three. Its `image-repo`/
  `gitops-repo-url`/`overlay-path` params default to the real values from
  `docs/platform/CONTRACT.md` — only `app-name`/`app-repo-url` need
  setting per invocation.
- `pipelines/build-migrator.yaml` — same shape, for the Prisma migration
  image. Separate from the four app pipelines since migrations are run
  once per deploy regardless of how many apps changed.
- `pipelineruns/*.yaml` — example manual triggers (`kubectl create -f
  tekton/pipelineruns/client-web.yaml`) for each.
- `triggers/` — webhook-driven builds (Tekton Triggers): a push to `main`
  starts the right Pipeline automatically, scoped per app by which paths
  actually changed. Optional layer on top of everything above — the
  manual `pipelineruns/` always work without it. See `triggers/README.md`.

## One-time cluster setup

1. **`git-clone` Task** — confirmed live against this cluster: `ClusterTask`
   isn't a registered kind on this Tekton Pipelines version at all
   (`kubectl api-resources --api-group=tekton.dev` won't list it), so this
   installs as a namespaced `Task` in `abies-ci` — the catalog's own v0.9
   manifest already ships as `kind: Task`, no edit needed:
   ```
   kubectl apply -n abies-ci -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
   ```
2. **Apply the Tasks and Pipelines** to `abies-ci`:
   ```
   kubectl apply -n abies-ci -f tasks/
   kubectl apply -n abies-ci -f pipelines/
   ```
3. **Gitea credentials** — a Secret attached to the `abies-ci-sa`
   ServiceAccount (not a workspace binding — Tekton's own
   credential-initializer picks this up automatically for every step of
   every Task in a PipelineRun that uses this ServiceAccount, covering
   both the `git-clone` steps and `update-gitops-image`'s own `git push`):
   ```
   kubectl create secret generic gitea-credentials -n abies-ci \
     --type=kubernetes.io/basic-auth \
     --from-literal=username=x-access-token \
     --from-literal=password=<a Gitea access token with push rights on abies-gitops>
   kubectl annotate secret gitea-credentials -n abies-ci tekton.dev/git-0=https://git.abies.in
   kubectl create serviceaccount abies-ci-sa -n abies-ci
   kubectl patch serviceaccount abies-ci-sa -n abies-ci -p '{"secrets": [{"name": "gitea-credentials"}]}'
   ```
4. **Harbor push credentials** — the CI robot account (separate from the
   cluster's runtime pull-only one per `docs/platform/CONTRACT.md` §6):
   ```
   kubectl create secret docker-registry harbor-push -n abies-ci \
     --docker-server=harbor.abies.in \
     --docker-username=<CI robot account> --docker-password=<its token>
   ```
   kaniko (`build-push-image`'s own step image) reads registry
   credentials from `/kaniko/.docker/config.json` by convention — mount
   this Secret there via the Task/Pod if it isn't already picked up
   automatically; confirm against the actual `gcr.io/kaniko-project/
   executor` image version in use, not assumed here.

## Still open (blocking a real run, not just credentials)

- **Harbor TLS**: `build-push-image` currently passes kaniko `--insecure
  --skip-tls-verify`, a conservative default since Harbor's actual TLS
  trust hasn't been confirmed. Remove those two flags once it's verified
  Harbor serves a trusted (or internally-trusted) cert — likely, since
  it's an enterprise platform service, but not assumed here.
- **`triggers/`'s git-host assumption**: written for GitHub's webhook
  payload shape — Gitea's is close but not confirmed identical; see
  `triggers/README.md`'s "Still open" before relying on it.
