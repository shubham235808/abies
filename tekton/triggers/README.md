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
  (app-name, overlay-path), merged with the push binding on each Trigger.
- `triggertemplate-app.yaml` / `triggertemplate-migrator.yaml` —
  instantiate `build-and-deploy`/`build-migrator` the same way the manual
  `pipelineruns/*.yaml` examples do. Same `TODO-*` placeholders apply here
  too (`app-repo-url`, `image-repo`, `gitops-repo-url`) — fill in both
  places.
- `trigger-*.yaml` — one `Trigger` per app plus one for the migrator, each
  gated by a `github` interceptor (signature validation) then a `cel`
  interceptor (only fires if the push actually touched a path that app
  depends on — see each file's own comment for exactly which paths).
- `eventlistener.yaml` — ties all five Triggers to one webhook endpoint.
- `httproute.yaml` — exposes that endpoint externally via Gateway API, on
  its own `TODO-webhooks-domain` rather than the public app domain.

## Setup, once the TODOs are filled in

```sh
kubectl apply -f tekton/triggers/rbac.yaml
kubectl apply -f tekton/triggers/secret-webhook.yaml   # after editing in the real secret value
kubectl apply -f tekton/triggers/triggerbinding-push.yaml -f tekton/triggers/triggerbinding-app-client-web.yaml \
  -f tekton/triggers/triggerbinding-app-partner-web.yaml -f tekton/triggers/triggerbinding-app-management-web.yaml \
  -f tekton/triggers/triggerbinding-app-platform-api.yaml
kubectl apply -f tekton/triggers/triggertemplate-app.yaml -f tekton/triggers/triggertemplate-migrator.yaml
kubectl apply -f tekton/triggers/trigger-client-web.yaml -f tekton/triggers/trigger-partner-web.yaml \
  -f tekton/triggers/trigger-management-web.yaml -f tekton/triggers/trigger-platform-api.yaml \
  -f tekton/triggers/trigger-migrator.yaml
kubectl apply -f tekton/triggers/eventlistener.yaml
kubectl apply -f tekton/triggers/httproute.yaml
```

Then register the webhook at the git host: Settings → Webhooks → Add
webhook, payload URL `https://<TODO-webhooks-domain>/`, content type
`application/json`, secret = the same value put in
`abies-webhook-secret`, events = just `push`.

## Still open

- Written assuming GitHub's push payload shape — if the git host is
  something else, `triggerbinding-push.yaml`'s two field paths and each
  Trigger's `github` interceptor (there's a generic one for non-GitHub
  hosts, or drop signature validation and rely on a shared-secret query
  param instead) need adjusting.
- No retry/dead-letter handling if a PipelineRun fails to even start
  (e.g. a quota limit) — failures are visible via `kubectl get
  pipelineruns` / the Tekton dashboard, not surfaced back to the git host.
