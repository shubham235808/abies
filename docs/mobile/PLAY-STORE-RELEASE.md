# ABIES Mobile — Play Store release (Android)

What someone with an actual Google Play Console developer account needs to do, using what this
repository's Phase 11 work (`docs/mobile/IMPLEMENTATION-PLAN.md` §11) actually produced. This document
does not claim any of these steps have been done — none of them have, because no Play Console account,
no signing keystore, and no store assets exist in this environment. See
`docs/mobile/PRODUCTION-READINESS.md` for the full honest state of every phase; this document is only
about the path from "code builds" to "a real Play Store listing."

## 1. What this repo gives you today

- **Three Android product flavors** (`android/app/build.gradle.kts`): `dev` (`in.abies.abies_mobile.dev`,
  label "Abies Dev"), `uat` (`in.abies.abies_mobile.uat`, "Abies UAT"), `prod`
  (`in.abies.abies_mobile`, "Abies") — only `prod` is ever meant to reach the Play Store.
- **A release `signingConfig`** that's ready but inactive: it loads `android/key.properties` if that
  file exists, and falls back to debug signing if it doesn't (which is every build in this environment,
  since that file has never existed here — see §2). This is why `flutter build apk --release` already
  succeeds in this repo today, producing a real but **debug-signed, not store-distributable** APK.
- **`.github/workflows/mobile-ci.yml`**: an `android-build` job (matrix dev/uat/prod, debug APKs,
  uploaded as workflow artifacts, needs no secrets) and an `android-release-signed` job that's real but
  gated behind four GitHub Actions secrets that don't exist in this repository yet (see §2).

None of this is a shortcut around needing a real account and a real keystore — it's the pipeline that
starts producing real artifacts the moment those two things exist.

## 2. What you need before any of this reaches a device outside this environment

1. **A Google Play Console developer account** (one-time USD 25 registration fee, Google's own
   verification process — can take a few days). Not something this environment can create or pay for.
2. **A real Android signing keystore**, generated once, on a machine you control, and backed up
   somewhere durable *outside* source control:
   ```
   keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias abies
   ```
   **Losing this file or its passwords after the first Play Store upload permanently blocks all future
   updates to that app listing** — Google cannot reissue it. Store it somewhere with real backup
   discipline (this repo's own `docs/security/SECRET-ROTATION-CHECKLIST.md` discipline should extend to
   it), never in git (`android/key.properties` and `**/*.jks`/`**/*.keystore` are already in
   `apps/mobile/.gitignore` and `android/.gitignore` — verified with `git check-ignore` in this phase,
   not just assumed from the pattern).
3. Once you have it, create `android/key.properties` (next to `android/settings.gradle.kts`, **not**
   committed):
   ```
   storePassword=<the keystore's password>
   keyPassword=<the signing key's own password>
   keyAlias=abies
   storeFile=/absolute/path/to/release.jks
   ```
   `flutter build apk --release --flavor prod --dart-define=ABIES_ENV=prod -t lib/main_prod.dart` then
   produces a real, store-signed `app-prod-release.apk` — the signing config in
   `android/app/build.gradle.kts` picks this file up automatically, no code change needed.
4. For an actual Play Store upload, build an **App Bundle**, not an APK — Google requires `.aab` for new
   apps:
   ```
   flutter build appbundle --release --flavor prod --dart-define=ABIES_ENV=prod -t lib/main_prod.dart
   ```
   (not yet exercised in this environment — same signing config applies).
5. **Confirm the real `prod` backend hostname first.** `lib/core/env/app_env.dart`'s `prod` base URL
   (`https://abies.in`) is a placeholder — `docs/mobile/CURRENT-BACKEND-API.md` §7 states plainly that
   only a `dev` environment exists today. Shipping a `prod`-flavored build to the Play Store before a
   real production backend exists at that hostname would ship an app that can't reach any API.

## 3. Creating the app listing in Play Console

1. Play Console → "Create app" → name "ABIES" (or your chosen store-facing name, which need not match
   the internal `abies_mobile` project name), default language, "App" (not game), free.
2. **Package name**: `in.abies.abies_mobile` (the `prod` flavor's unsuffixed application id — this
   cannot be changed after the first upload, confirm it's the one you want registered).
3. Category: Medical or Health & Fitness, matching ABIES's actual Ayurveda healthcare-adjacent domain —
   pick based on what the app actually does (appointment booking, diagnostics, pharmacy, Panchakarma),
   not a generic "Lifestyle" category.
4. Content rating questionnaire, target audience, and the standard "App content" declarations — answer
   based on what the app actually is (a healthcare booking/ordering app with OTP-based account login,
   not UGC, not ads, no violent/mature content).

## 4. Store assets — what exists, what doesn't

**Nothing exists yet.** This phase did not and could not create any of these — no app icon beyond the
Flutter-template placeholder (`android/app/src/main/res/mipmap-*/ic_launcher.png`, never replaced with
real ABIES branding), no screenshots (would need a running build on a device/emulator, which doesn't
exist here either), and no feature graphic. Before a listing can go live, someone needs:

- A real app icon (replacing every `mipmap-*/ic_launcher.png` density, plus an adaptive icon if desired)
  — a design asset, not something to generate from code.
- Phone screenshots (Play Console currently requires at least 2, up to 8, per supported device type) —
  needs an actual running build on a device or emulator, which this Linux environment without an
  Android emulator image couldn't produce even for this phase's own verification (this phase confirmed
  the APK builds and is validly signed, not that any screen renders correctly on a real device — see
  `docs/mobile/PRODUCTION-READINESS.md`).
- A feature graphic (1024×500 PNG/JPEG) for the store listing's top banner.
- A short description (≤80 chars) and full description (≤4000 chars) — marketing copy this document
  doesn't attempt to write, since it's not an engineering artifact.

## 5. Privacy policy URL — a real gap, checked directly, not assumed

Play Console's store listing **requires** a privacy policy URL before an app with login/health-adjacent
data can be published. `apps/client-web/src/app/(public)/privacy/page.tsx` exists and is reachable (once
a real prod hostname exists) at `/privacy`, but reading it directly shows it's explicitly **not** a
finished policy:

> Full policy text is pending legal review and isn't published yet. What's below is the real, currently
> active set of consent artifacts your account is asked to accept — not placeholder legal copy.

That page is honest and real (it lists live consent artifacts from the database), but it is not the
lawyer-reviewed privacy policy document Play Console's Data Safety section expects a URL to point to.
**This blocks a real Play Store submission** until legal produces that policy and it's published at a
stable URL — flagging this now rather than letting it surface for the first time at submission.

## 6. Data Safety form — what this app actually collects, not generic boilerplate

Based on what's actually implemented through Phase 10 (`docs/mobile/CURRENT-BACKEND-API.md`,
`docs/mobile/SECURITY-DESIGN.md`), not a generic healthcare-app template:

| Data type | Collected? | Purpose | Shared with third parties? | Notes |
|---|---|---|---|---|
| Phone number / email | Yes | Account creation, OTP sign-in | No | Used only as the sign-in identifier; OTP itself is never stored in plaintext past verification |
| Name | Yes | Patient profile, family-member profiles | No | |
| Health-adjacent booking data (appointments, diagnostic orders, Panchakarma bookings, medicine orders, prescriptions) | Yes | Core app function — this is a healthcare booking/ordering app | No, not to a third-party ad/analytics network | This is the category Play Console is strictest about; declare under "Health information" |
| Precise/approximate location | **No** | — | — | Phase 3 made a deliberate decision to use the patient's profile `city` field instead of device geolocation — no location permission is ever requested, confirmed by reading `lib/features/home/` (no `geolocator`/location package is a dependency at all) |
| Crash/error reports | Conditionally | Observability (`SentryHttpObservability`) | **Yes, if `SENTRY_DSN` is ever configured** | Inactive (Noop) in every build produced so far — no build in this repo has ever actually sent data anywhere. Once a real DSN is provisioned, declare "Crash logs" / "Diagnostics" as collected and shared with the error-reporting provider, and update this table |
| Payment information | Not directly by this app | Razorpay handles payment instrument entry | Yes, to Razorpay, once integrated | Not yet wired to a real Razorpay SDK in any build (every booking/checkout flow currently stops at a `serviceUnavailable` state because `RAZORPAY_KEY_ID`/`SECRET` are blank in every environment that exists) — re-check this row the moment Razorpay is actually integrated, since the data-safety declaration must change with it |
| Push notification token | Not yet collected | — | — | Phase 9 (device-token registration) is not built at all — blocked on a Firebase project and backend work; nothing to declare here yet |

Re-verify this table against the actual code before submitting the form — it reflects Phase 10's state,
and anything Phase 9/12+ adds (push tokens, a real payment SDK) changes it.

## 7. How the CI pipeline fits in, once secrets exist

`.github/workflows/mobile-ci.yml`'s `android-release-signed` job builds a real `prod`-flavor
release-signed APK, but only runs once these four repository secrets are added under this repo's
Settings → Secrets and variables → Actions (not before — the job's `if:` condition skips it entirely
otherwise, visibly, not silently):

- `ANDROID_KEYSTORE_BASE64` — `base64 -w0 release.jks` of the real keystore from §2.
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` — the same values from the
  `key.properties` in §2.

Once those exist and that job runs green, its uploaded artifact is the APK you'd hand-upload to Play
Console's release track (or adapt the job to run `flutter build appbundle` for the `.aab` Play Console
actually wants for new apps — see §2.4). A further `play-store-upload` job (commented out, not written,
in the same workflow file) is the natural next step once Console API access exists
(`secrets.PLAY_STORE_SERVICE_ACCOUNT_JSON`, from Play Console's own API access settings, on top of an
app listing that already exists per §3) — deliberately left unwritten rather than built against
credentials that don't exist.

## 8. Suggested order of operations

1. Register the Play Console account (§2.1) — start this first, it has the longest lead time.
2. Generate and safely back up the signing keystore (§2.2).
3. Get the real `prod` backend hostname live (§2.5) — otherwise everything downstream ships against a
   dead API.
4. Commission real app icon + screenshots + feature graphic (§4) — needs a device/emulator this
   environment doesn't have.
5. Get the real privacy policy published (§5) — needed before Play Console will accept the listing.
6. Create the app listing (§3), fill in the Data Safety form accurately against the current code (§6).
7. Add the four signing secrets to GitHub Actions (§7), let `android-release-signed` produce a real
   signed artifact, upload it to the listing's internal testing track first — never straight to
   production.
