# Webhook-triggered builds

Replaces manually running `kubectl create -f tekton/pipelineruns/*.yaml`
with an automatic build on every push — a git push to `main` fires a
webhook, the EventListener here fans it out to the Trigger(s) whose CEL
path filter matches what actually changed, and each matching Trigger
starts the same Pipeline the manual PipelineRuns already use.

**Requires Tekton Triggers**, a separate component from Tekton Pipelines
— confirm it's actually installed (`kubectl get pods -n tekton-pipelines
-l app.kubernetes.io/part-of=tekton-triggers` or wherever this cluster's
Tekton lives) before applying anything here, it won't be covered by
"Tekton is installed" alone. Every manifest here uses `apiVersion:
triggers.tekton.dev/v1beta1` (the long-stable version at time of writing)
— `kubectl explain eventlistener` will show what the installed version
actually serves if these are rejected.

## Layout

- `rbac.yaml` — the ServiceAccount the EventListener runs as, scoped to
  only create PipelineRuns, bound to Tekton Triggers' own pre-installed
  ClusterRoles.
- `secret-webhook.yaml` — **template only**, same rule as
  `abies-gitops/common/secret.yaml`: apply the real HMAC secret
  out-of-band, don't commit it.
- `triggerbinding-push.yaml` — extracts the commit SHA to build from the
  webhook payload (shaped for GitHub; adjust for a different git host).
- `triggerbinding-app-*.yaml` — one tiny static binding per app
  (just `app-name`), merged with the push binding on each Trigger.
- `triggertemplate-app.yaml` / `triggertemplate-migrator.yaml` —
  instantiate `build-and-deploy`/`build-migrator` the same way the manual
  `pipelineruns/*.yaml` examples do, using the Pipelines' own real
  defaults (Gitea/Harbor URLs from `docs/platform/CONTRACT.md`) — nothing
  left to fill in here, unlike the app repo's own TODOs elsewhere.
- `trigger-*.yaml` — one `Trigger` per app plus one for the migrator, each
  gated by a `github` interceptor (signature validation — see "Still
  open" on whether this actually works unmodified against Gitea) then a
  `cel` interceptor (only fires if the push actually touched a path that
  app depends on — see each file's own comment for exactly which paths).
- `eventlistener.yaml` — ties all five Triggers to one webhook endpoint.
- `httproute.yaml` — exposes that endpoint externally via Gateway API
  (the real `abies-internal-gateway`), on its own `TODO-webhooks-domain`
  rather than `dev.abies.in`.

## Setup, once the remaining TODOs (webhooks hostname, webhook secret) are filled in

```sh
kubectl apply -n abies-ci -f tekton/triggers/rbac.yaml
kubectl apply -n abies-ci -f tekton/triggers/secret-webhook.yaml   # after editing in the real secret value
kubectl apply -n abies-ci -f tekton/triggers/triggerbinding-push.yaml -f tekton/triggers/triggerbinding-app-client-web.yaml \
  -f tekton/triggers/triggerbinding-app-partner-web.yaml -f tekton/triggers/triggerbinding-app-management-web.yaml \
  -f tekton/triggers/triggerbinding-app-platform-api.yaml
kubectl apply -n abies-ci -f tekton/triggers/triggertemplate-app.yaml -f tekton/triggers/triggertemplate-migrator.yaml
kubectl apply -n abies-ci -f tekton/triggers/trigger-client-web.yaml -f tekton/triggers/trigger-partner-web.yaml \
  -f tekton/triggers/trigger-management-web.yaml -f tekton/triggers/trigger-platform-api.yaml \
  -f tekton/triggers/trigger-migrator.yaml
kubectl apply -n abies-ci -f tekton/triggers/eventlistener.yaml
kubectl apply -n abies-ci -f tekton/triggers/httproute.yaml
```

Also requires the `abies-ci-sa` ServiceAccount with the Gitea credentials
Secret attached (see `../README.md`'s "Gitea credentials" setup step) —
the PipelineRuns these Triggers create use it the same way the manual
ones do.

Then register the webhook at Gitea: the repo's Settings → Webhooks → Add
Webhook → Gitea, target URL `https://<TODO-webhooks-domain>/`, content
type `application/json`, secret = the same value put in
`abies-webhook-secret`, trigger on `push` only.

## Still open

- Written assuming GitHub's push payload shape — if the git host is
  something else, `triggerbinding-push.yaml`'s two field paths and each
  Trigger's `github` interceptor (there's a generic one for non-GitHub
  hosts, or drop signature validation and rely on a shared-secret query
  param instead) need adjusting.
- No retry/dead-letter handling if a PipelineRun fails to even start
  (e.g. a quota limit) — failures are visible via `kubectl get
  pipelineruns` / the Tekton dashboard, not surfaced back to the git host.
