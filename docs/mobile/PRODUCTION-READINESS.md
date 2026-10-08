# ABIES Mobile — Production Readiness

Honest, as of 2026-10-08. This checks every phase actually shipped (Phases 1–10, plus this document
itself, Phase 11's achievable half) against every quality gate the brief's §27 names: **functional**,
**tested**, **secure**, **API-compatible**, **documented**, **reviewed**, **buildable-on-android**,
**buildable-on-ios**. It cites the phase/commit for what's actually done and says plainly what's blocked
and on what — this is not a template filled with "N/A", every row below reflects something actually
checked in this pass.

## Four gates are cross-cutting — true (or not) identically across every phase below

Rather than repeat the same finding eleven times, these four gates come out the same way for every
phase 1–10, so they're stated once here instead of in every row of the per-phase table.

### Tested — partially met, for every phase, the same way

`apps/mobile/test/` contains **only** `test/unit/` — 26 files, 187 tests, all passing
(`flutter test`, verified again in this pass, see "Verification" below). `docs/mobile/TEST-STRATEGY.md`
§1 itself defines a four-layer pyramid (unit, widget, integration, golden) and §9 explicitly requires
"both a widget-level test of every UI state *and* at least one integration test against the real
backend" before appointment booking, Panchakarma booking, diagnostic booking, medicine checkout, or any
payment-adjacent step is called done. **None of that exists**: no `test/widget/`, no `test/integration/`
(no `integration_test` dev-dependency even added to `pubspec.yaml`), no `test/goldens/`. Every phase's
own stated exit criteria that mentions integration testing (e.g. Phase 2's "exercised by integration
tests against a real dev-environment backend... in addition to unit/widget tests against mocks") has
not actually been met by any phase, including the phases whose IMPLEMENTATION-PLAN.md entry says
"implemented and verified" — that phrase has consistently meant "unit-tested, analyzer-clean, and a real
debug APK built," not "tested at every layer the project's own strategy calls for." This is the single
largest honest gap in this whole plan, flagged once, here, rather than soft-pedaled per phase.

### Reviewed — not done, for every phase, the same way

No second reviewer or approver exists in this environment — every commit from Phase 0 through Phase 10
landed by one engineer (agent) directly, with no PR review process exercised (no `gh` CLI available
here, no CODEOWNERS file in the repo, no recorded review comments anywhere). Phase 10's own entry in
`docs/mobile/IMPLEMENTATION-PLAN.md` explicitly says `SECURITY-REVIEW.md` (the brief's §22 process
artifact) was **not** produced as a separate document for that phase either. "Reviewed" here has meant
self-review against the written design docs (MOBILE-ARCHITECTURE.md, SECURITY-DESIGN.md,
API-GAP-ANALYSIS.md) and, for security, Phase 10's own section-by-section audit — real and substantive,
but not a second pair of eyes. Flag this honestly rather than claim a review process that didn't happen.

### Buildable-on-android — met, for every phase, as of this pass

Every phase's Dart code lives in one `lib/` tree compiled as a whole; this phase's own verification
(below) compiles all of Phases 1–10's code together, three ways (dev/uat/prod flavors, debug and
release build types), on a real Android SDK/Gradle toolchain, for real, right now. That's retroactive
proof every phase's code is still buildable on Android as of 2026-10-08, not evidence specific to one
phase in isolation — there is no way to build "just Phase 4's code" separately. `flutter analyze` is
also clean across the whole tree.

### Buildable-on-iOS — blocked entirely, for every phase, on the same thing

This is a Linux environment. There is no Xcode and no macOS here and never will be — `ios/` was
generated for real (`flutter create --platforms=ios`, commit `02a18ca`, a genuine Xcode project, not
hand-written) but has **never been opened, built, or run**, for any phase, because that step requires a
real Mac. `docs/mobile/APP-STORE-RELEASE.md` (owned by the separate iOS track, not this document) covers
exactly what a Mac needs to do first. Every phase below inherits this identical blocker — it is a
platform/hardware constraint, not a phase-specific gap.

## Per-phase: functional / secure / API-compatible / documented

| Phase | Functional | Secure | API-compatible | Documented |
|---|---|---|---|---|
| 1 — Foundation | Yes — api client, env/flavor config, router skeleton, secure-storage cookie jar, theme tokens (commit `8636c33`, verified for real in `8fc98c2`) | Yes — §1 (transport)/§2 (session storage) confirmed correct in Phase 10's audit | Yes — only `GET /api/v1/health` as a smoke test, nothing invented | Yes — README "Status", IMPLEMENTATION-PLAN.md Phase 1 |
| 2 — Auth & profile | Yes, with one known gap: a brand-new mobile-only sign-up has no live OTP delivery (WhatsApp OTP wired server-side, switched off pending template approval — `API-GAP-ANALYSIS.md` §3); works today via email or the backend's dev-mode OTP bypass (commit `17c45bd`) | Yes — §2 session storage, logout-calls-real-endpoint-before-clearing-cookie, confirmed in Phase 10 | Yes — `POST /auth/otp/request`+`/verify`, `GET /auth/me`, `POST /auth/logout`, `GET/PATCH /patients/me`, family CRUD, consent routes, all read from real route source | Yes — README "What Phase 2 added", IMPLEMENTATION-PLAN.md Phase 2 |
| 3 — Home dashboard | Yes — 8 independent sections, each own loading/empty/error/retry (commit `9130de2`) | Yes — nothing new to the surfaces Phase 10 covers; no new storage/transport path | Yes — `appointments/mine`, three order-list routes, four `public/<domain>?limit=8` previews, all real | Yes — README "What Phase 3 added", IMPLEMENTATION-PLAN.md Phase 3, including the deliberate city-not-geolocation decision |
| 4 — Doctors & appointments | Yes, with one real backend limit surfaced, not worked around: `holdSlot()` 503s because `RAZORPAY_KEY_ID`/`SECRET` are blank in this environment — the booking flow treats that as its own calm `serviceUnavailable` state, not a crash (commit `cc0d68a`) | Yes — availability never trusted from an earlier fetch; re-verified immediately before `/hold`, per SECURITY-DESIGN.md's own staleness concern | Yes — `public/doctors`+`/facets`+`/[slug]`+`/reviews`+`/photo`, `appointments/slots`+`/hold`+`/verify-payment`+`/[id]/cancel`+`/[id]/review`+`/mine`, all read from real source before use | Yes — README "What Phase 4 added", IMPLEMENTATION-PLAN.md Phase 4 |
| 5 — Panchakarma | Yes, same Razorpay-503-is-calm-state pattern as Phase 4; one real backend gap found and reported (no single-therapy/single-centre detail route) rather than invented (commit `aa1ef6f`) | Yes — re-verifies the therapy via a fresh search immediately before booking, same staleness discipline as Phase 4 | Yes — `public/panchakarma`+`/facets`+`-centres`, `panchakarma-bookings` CRUD + cancel, all confirmed by reading route source | Yes — README "What Phase 5 added", `lib/features/panchakarma/PHASE.md`, IMPLEMENTATION-PLAN.md Phase 5 |
| 6 — Diagnostics | Yes, same Razorpay pattern; two real backend-ownership gaps found (report-download and recommendation-cancel are doctor-only, not patient routes) and routed around correctly instead of 403-ing silently (commit `37f4b99`) | Yes — report access is two explicit user actions (view via external browser, download to app-private storage only), matching SECURITY-DESIGN.md §8 exactly | Yes — `public/diagnostics`+`/packages`+`/facets`, `diagnostic-orders` CRUD+cancel, `reports/mine`+`/[id]/download`, `diagnostic-recommendations/mine`, all confirmed from source | Yes — README "What Phase 6 added", `lib/features/diagnostics/PHASE.md`, IMPLEMENTATION-PLAN.md Phase 6 |
| 7 — Pharmacy & prescriptions | Yes, same Razorpay pattern; correctly distinguishes the two genuinely separate purchase paths (cart-checkout OTC-only vs. direct `bookOrder()` for prescription items) after reading `addToCart()`'s own 400 rather than assuming the brief's guessed shape (commit `473d23d`) | Yes — prescription-gated checkout is backend-authoritative only; no client-side duplicate of that check | Yes — `public/medicines`+`/facets`, multi-cart `patients/me/cart` + item PATCH/DELETE + checkout, `medicine-orders` CRUD, `patients/me/prescriptions`, `prescriptions/[id]/match`, all confirmed from source | Yes — README "What Phase 7 added", two `PHASE.md` files, IMPLEMENTATION-PLAN.md Phase 7 |
| 8 — Idempotency (payments hardening) | Yes — idempotency keys on all five booking/order write paths, same key on a retry of the same slot/therapy/cart, a new key once the target changes (commits `885680b`, `33270ad`) | Yes — directly closes the Phase 10 §10-adjacent "retried submission creates a duplicate" risk named in IMPLEMENTATION-PLAN.md Phase 8's own exit criteria | Yes — no new routes; this phase wires the existing Idempotency-Key header convention through five existing write paths | Yes — commit messages + the booking/checkout controllers' own test files describe the retry/new-key behavior; not a separate PHASE.md |
| 9 — Push, WhatsApp/email triggers, deep links | **Not built at all.** Blocked on two real prerequisites, neither available here: (a) `API-GAP-ANALYSIS.md` §4's device-token model + PUSH adapter, which is backend work this track doesn't own; (b) a Firebase project, needed before device-token registration can even be tested. Nothing in `lib/` implements this — no feature-folder content, no FCM package, no deep-link resolver | N/A — nothing shipped to audit | N/A | Yes, honestly: IMPLEMENTATION-PLAN.md Phase 9 states the blocker plainly; README's "Status" section names Phase 9 as explicitly not attempted, not silently skipped |
| 10 — Security hardening, observability, performance | Yes — real section-by-section SECURITY-DESIGN.md audit against Phases 1–8's actual code (not "in principle"), a real dependency-free `SentryHttpObservability` implementation (DSN-gated, redacting), one real performance fix (`Image.network` `cacheWidth`/`cacheHeight` on the doctor photo) (commit `35c1da4`) | Yes — this phase *is* the security gate for Phases 1–8; see the cross-cutting "Reviewed" note above for the one honest shortfall (no separate SECURITY-REVIEW.md) | N/A — no new backend routes consumed | Yes — README "What Phase 10 added" (extensive), SECURITY-DESIGN.md updated in place, IMPLEMENTATION-PLAN.md Phase 10 |
| 11 — Release engineering (this phase, Android half) | Yes for what's achievable: three Android product flavors with distinct application ids and app labels, a real signing-config with debug fallback, three updated CI job definitions. See "What Phase 11 added" in `apps/mobile/README.md` and the Verification section below | Yes — `android/key.properties` and `**/*.jks`/`**/*.keystore` confirmed actually gitignored (tested with `git check-ignore`, not assumed); CI's signed-release job is secret-gated, not a fake pass | N/A — no backend routes touched | Yes — this document, `PLAY-STORE-RELEASE.md`, README, IMPLEMENTATION-PLAN.md Phase 11, all updated in this pass |

## What's blocked, and on exactly what (not an engineering gap — a credential/account/hardware one)

- **Phase 9 (push notifications)**: a Firebase project (for FCM) — a business/account step, not something
  this environment can create — *and* the backend device-token model (`API-GAP-ANALYSIS.md` §4), which
  is backend work outside this track's remit.
- **Phase 11 — a real signed, store-distributable Android build**: an Android signing keystore. None
  exists in this repository or environment; `android/app/build.gradle.kts`'s release `signingConfig`
  is wired and ready (loads `android/key.properties` when present) but falls back to debug signing
  because that file has never existed here — see this phase's own build output below.
- **Play Store listing/publish**: a Google Play Console developer account (paid, one-time) and an app
  listing created inside it. See `docs/mobile/PLAY-STORE-RELEASE.md` for the exact steps once that
  account exists.
- **iOS, entirely**: a Mac with Xcode. Nothing here can substitute for that; see
  `docs/mobile/APP-STORE-RELEASE.md` (a separate track's document, not this one).
- **UAT/prod backend environments**: `docs/mobile/CURRENT-BACKEND-API.md` §7 — only `dev` exists today
  (`https://dev.abies.in`, the `abies-dev` ArgoCD app). The `uat`/`prod` base URLs hardcoded in
  `lib/core/env/app_env.dart` (`https://uat.abies.in`, `https://abies.in`) are placeholders; the `uat`
  and `prod` Android flavors this phase added build and install correctly, but point at hostnames that
  don't resolve to a running ABIES backend yet.
- **A real privacy policy**: see `docs/mobile/PLAY-STORE-RELEASE.md`'s own section on this —
  `apps/client-web`'s `/privacy` route exists but says plainly "Full policy text is pending legal
  review and isn't published yet," which is a real gap for the Play Console listing, not a documentation
  oversight here.

## Verification run for this pass (2026-10-08, same Flutter 3.47.6 / JDK 21 / Android SDK 36 as every prior phase)

```
$ flutter analyze
No issues found! (ran in 10.2s)

$ flutter test
...
+187: All tests passed!

$ flutter build apk --debug --flavor dev  --dart-define=ABIES_ENV=dev  -t lib/main_dev.dart   # succeeds
$ flutter build apk --debug --flavor uat  --dart-define=ABIES_ENV=uat  -t lib/main_uat.dart   # succeeds
$ flutter build apk --debug --flavor prod --dart-define=ABIES_ENV=prod -t lib/main_prod.dart  # succeeds

$ flutter build apk --release --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
✓ Built build/app/outputs/flutter-apk/app-dev-release.apk (57.9MB)
```

The release APK's signer was confirmed (via `apksigner verify --print-certs`) to be the local Android
debug keystore (`CN=Android Debug`, SHA-1 `c5:22:18:...`), matching `~/.android/debug.keystore`'s own
fingerprint exactly — proof the debug-signing fallback in `build.gradle.kts` is really what signed this
APK, not a stale cached artifact.
