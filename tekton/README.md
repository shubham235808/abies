# ABIES CI (Tekton)

Builds the four apps (`client-web`, `partner-web`, `management-web`,
`platform-api`) and the shared `migrator` image from this repo's root
`Dockerfile`, and hands off to CD by committing the new image tag into the
separate GitOps repo (`abies-gitops`) that ArgoCD watches. Tekton never
talks to the cluster's application namespace directly — ArgoCD owns that.

**Setting this up for the first time?** `abies-gitops/DEPLOY.md` is the
ordered runbook covering both repos — placeholders, one-time cluster
setup, first build, verify. The sections below are reference.

## Layout

- `tasks/build-push-image.yaml` — kaniko build + push for any one app or
  the migrator target.
- `tasks/update-gitops-image.yaml` — bumps an image tag in a GitOps repo
  Kustomize overlay and pushes the commit (the CI→CD handoff).
- `pipelines/build-and-deploy.yaml` — per-app pipeline: clone → build+push
  → update GitOps. Run once per app, not once for all four, so one app's
  commit doesn't force a rebuild of the other three.
- `pipelines/build-migrator.yaml` — same shape, for the Prisma migration
  image. Separate from the four app pipelines since migrations are run
  once per deploy regardless of how many apps changed.
- `pipelineruns/*.yaml` — example manual triggers (`kubectl create -f
  tekton/pipelineruns/client-web.yaml`) for each.

## One-time cluster setup

1. **`git-clone` ClusterTask** — install from the Tekton catalog if not
   already present:
   ```
   kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
   ```
2. **Apply the Tasks and Pipelines** in this directory (`tasks/` then
   `pipelines/`) to the namespace Tekton runs in.
3. **Deploy key for the GitOps repo** — a Secret Tekton uses to clone *and
   push* `abies-gitops`:
   ```
   kubectl create secret generic gitops-deploy-key \
     --from-file=ssh-privatekey=/path/to/deploy-key \
     --type=kubernetes.io/ssh-auth
   ```
   The key's public half needs write access on the GitOps repo (a GitHub/
   GitLab "deploy key" with write enabled, or equivalent).
4. **Fill in the `TODO-*` placeholders** in every `pipelineruns/*.yaml`:
   `app-repo-url`, `image-repo` (the in-cluster registry host + path),
   `gitops-repo-url`. All three are currently unknown pending the registry
   URL and the GitOps repo being created.

## Still open (blocking a real run, not just these placeholders)

- **Registry TLS**: `build-push-image` currently passes kaniko
  `--insecure --skip-tls-verify`, assuming an internal registry without a
  publicly-trusted cert. Remove those two flags once the registry's actual
  TLS setup is confirmed.
- **Webhook-triggered builds**: these Pipelines are designed to be started
  manually or by any CI trigger; a push-triggered EventListener (Tekton
  Triggers) needs an Ingress route exposed for the git host's webhook —
  deferred until cluster ingress/networking details are shared.
- **Per-app triggering**: ideally only the app(s) whose paths changed in a
  push get rebuilt (e.g. a commit touching only `apps/client-web/**`
  shouldn't trigger `partner-web`'s pipeline). Not wired up yet — every
  PipelineRun is independent and manually scoped to one app for now.
