# UAT on the abies.in hostname — decision record

**Decision, 2026-10-08 (user's explicit, confirmed choice):** the new `abies-uat` Kubernetes
environment (`abies-gitops` repo, `environments/uat/`) answers on the real `abies.in` /
`www.abies.in` hostnames — not a `uat.abies.in` subdomain like `dev.abies.in`'s pattern.

This was flagged as a real conflict before building it, because at the time this hostname was
still the one the separate, standalone production VM serves live traffic on (Docker Compose
stack, real Let's Encrypt cert issued 2026-10-01 — see this repo's own hosting notes). The user
was shown both readings explicitly and chose the literal `abies.in` hostname anyway.

## What was actually done

- `environments/uat/` built in `abies-gitops`, mirroring `environments/dev/`'s shape: namespace
  `abies-uat`, every `applications/*/base` aggregated, a `configmap-patch.yaml`, and one
  `httproute-*-patch.yaml` per app (`client-web`, `partner-web`, `management-web`,
  `platform-api`) overriding each HTTPRoute's `parentRefs`/`hostnames`.
- The HTTPRoutes attach to `abies-gateway` (the Gateway already listening on `abies.in` with
  TLS secret `abies-tls`), **not** `abies-internal-gateway` (the `*.abies.in` wildcard dev uses).
- `configmap-patch.yaml` sets `APP_BASE_URL: https://abies.in` and switches `EMAIL_PROVIDER`
  from the common base's `mock` default to the real `msg91` provider — deliberately does **not**
  enable `ALLOW_DEV_AUTH_BYPASS_IN_PROD`/`EXPOSE_DEV_OTP` the way `environments/dev` does, since
  this environment answers on a real-looking production hostname and must behave like a secure
  deployment, not a dev sandbox.
- Image digests seeded from `abies-dev`'s current, verified-running digests as of 2026-10-08.

## What this does NOT do

Applying this GitOps config alone does **not** move any real traffic. `abies.in`'s public DNS
still points at the standalone VM right now — this cluster's `abies-gateway` simply becomes
*able* to answer for that hostname once/if DNS is ever pointed at it. Until that DNS change
happens (a separate, much bigger decision — effectively retiring or replacing the VM-hosted
site), the live site at `abies.in` is unaffected by anything in `environments/uat/`.

## Still open — needs a cluster admin, not ArgoCD

`applications/db-service/cluster-rbac/clusterrolebinding.yaml` (in `abies-gitops`) is
cluster-scoped and explicitly applied by hand, never by ArgoCD. It was edited to add
`abies-uat`'s `db-service` ServiceAccount as a second subject alongside `abies-dev`'s — without
that, `db-service`'s TokenReview calls fail for every request in the new namespace. That edit
itself was blocked by this environment's own tooling policy (category: "Permission Grant" — it's
a ClusterRoleBinding), so the diff was handed to the user instead of applied directly. Re-apply
it by hand:

```bash
kubectl apply -f applications/db-service/cluster-rbac/clusterrolebinding.yaml
```

## Before this is actually ready for real UAT testers

- Decide and execute the DNS move (or decide it's not happening yet and this stays dormant).
- Confirm the `abies-tls` secret's certificate actually covers `www.abies.in`, not just
  `abies.in` (not verified from here — no access to inspect that Secret's contents).
- Run the same build-and-verify pass every other environment got before being called live
  (migration success, all four apps healthy, a real OTP round-trip against the real `msg91`
  provider since dev's OTP bypass is deliberately off here).
