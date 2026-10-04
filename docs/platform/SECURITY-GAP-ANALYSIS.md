# Security Gap Analysis

Ordered by severity. Each item states what's true today, why it matters,
and the shape of the fix — not the fix itself (per `CONTRACT.md` §27,
this assessment does not implement changes yet).

## 1. PRODUCTION BLOCKER — OTP delivery has no implementation, not just no provider

`requestOtp()` (`packages/domain/src/modules/auth/auth.service.ts`)
generates the one-time code, stores its HMAC hash, and returns it to the
*caller* only when both `!isLockedDownDeployment(env)` and
`EXPOSE_DEV_OTP` are true (today's dev/review-deployment convenience
path). **No code path sends the code to the user by SMS, WhatsApp, or any
other channel** — `notifications.service.ts`'s real delivery mechanism
(`notify()`/`getAdapter()`) exists and is correctly wired for *other*
notification types (appointment reminders etc.), but the login flow
itself never calls it.

In a deployment that's genuinely locked down (`NODE_ENV=production`
without `ALLOW_DEV_AUTH_BYPASS_IN_PROD`) — which `abies-prod` must be —
this means **no patient, doctor, lab, pharmacy, panchakarma-centre,
support, sales, care-coordination, or admin user can complete login**,
full stop. This is a known, previously-documented, deliberate deferral
(`docs/IMPLEMENTATION-STATUS.md`, 2026-09-23: "no real SMS/email/WhatsApp
provider is wired up yet... a decision for whoever owns the admin
operations budget"), not an oversight introduced by this assessment — but
it remains an absolute blocker for `abies-prod` regardless.

**Does not block `abies-dev`/`abies-uat`** — both can run with
`ALLOW_DEV_AUTH_BYPASS_IN_PROD` (or `NODE_ENV` left non-production) and
continue using the existing dev-OTP path, the same way today's Docker
Compose review deployment already does.

**Needs, before `abies-prod` can serve real users**: (a) a business
decision on which SMS provider (and, separately, whether WhatsApp/email
are needed at launch or can follow), (b) real credentials for it, (c) an
actual adapter implementation beyond `mock-adapter.ts`, (d) wiring
`requestOtp()` to call it. (a) and (b) are outside this assessment's
scope (platform/business decisions); (c) and (d) are application changes
this team owns.

## 2. SECURITY ISSUE — secrets modeled as plain Kubernetes `Secret`, not Vault/External Secrets

This session's pre-contract draft (`abies-gitops/common/secret.yaml`) is
a `Secret` **template** (placeholder values, explicit instructions not to
commit real ones, applied out-of-band via `kubectl create secret`) — it
already followed "never commit secrets to Git," but the *mechanism* isn't
what this contract's target architecture specifies. A raw `Secret`
resource, even one with real values applied directly and never committed,
still means: no centralized rotation, no audit trail of who read which
secret, no Vault-side access policy — all things External Secrets +
Vault exist to provide. Every app's required secret keys are already
enumerated precisely (`CURRENT-STATE.md` §9) and would map directly to
Vault paths once that's set up.

## 3. SECURITY ISSUE (minor) — file upload validation trusts client-declared MIME type

`assertUploadAllowed()` (`packages/domain/src/lib/storage.ts`) checks
`file.mimetype` against an allow-list — that value comes from the
upload's declared `Content-Type`, not from inspecting the file's actual
bytes (magic-number sniffing). A malicious uploader could label an
arbitrary file with an allowed MIME type and bypass the filter. Severity
is moderated by: every upload path requires an authenticated, authorized
session first (doctor credential docs, diagnostic reports, support
attachments — none of this is an anonymous public upload surface), and
uploaded files are served back through controlled download paths, not
executed. Still worth closing before handling real patient documents at
scale — e.g. a content-sniffing library or re-encoding images server-side.

## 4. KUBERNETES ISSUE — no Pod Security Restricted `securityContext` anywhere yet

Nothing drafted so far sets `runAsNonRoot`, `allowPrivilegeEscalation:
false`, `readOnlyRootFilesystem`, `capabilities.drop: [ALL]`, or
`seccompProfile`. The container image itself already runs non-root (uid
1001) by default, so `runAsNonRoot: true` should be a free win; the
others need adding explicitly and `readOnlyRootFilesystem` needs a real
run to confirm Next.js's standalone server doesn't write anywhere at
runtime this app doesn't already know about.

## 5. KUBERNETES ISSUE — no NetworkPolicy anywhere yet

Every workload currently has unrestricted east-west access within
whichever namespace it lands in. The contract's own target Kustomize
structure (§20) expects a `networkpolicy.yaml` per app — not yet drafted
in any form.

## 6. Not a current gap, but worth stating explicitly — things already done right

Listed so a future reviewer doesn't have to re-verify them from scratch:
server-side RBAC on every route handler (no frontend-only authorization
found anywhere), constant-time HMAC comparison for both Razorpay
signature checks, HTTP-only + properly-scoped session cookie (not
`localStorage`, not a JWT carrying trust-me claims), audit logging with
broad real coverage (36 call sites), consent tracking wired into the
actual login flow rather than bolted on separately, and zero raw
`console.*` logging left in the codebase (fully on the structured JSON
logger already).
