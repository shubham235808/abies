# ABIES Mobile — App Store release (iOS)

## Status — honest, as of 2026-10-08

**`ios/` exists now, but has never been opened in Xcode, built, or run.** This environment is Linux —
there is no Xcode here and never will be; iOS can only be built and verified on a real Mac. That's not a
missing credential like Phase 9's Firebase project — it's a hardware/OS requirement nothing here can
work around. See `docs/mobile/IMPLEMENTATION-PLAN.md`'s own note on this.

What `ios/` actually is: the real output of `flutter create --platforms=ios` (run in this environment,
which doesn't need Xcode to *generate* the project files, only to *open/build* them) — a genuine Xcode
project (`Runner.xcodeproj`, `Runner.xcworkspace`), not hand-written. One deliberate edit was made on top
of the generated defaults: `Runner/Info.plist` gained `NSFaceIDUsageDescription`, since `local_auth` is
a declared dependency (`pubspec.yaml`) for the optional biometric-unlock gate described in
`docs/mobile/SECURITY-DESIGN.md` §3 — the string is there so iOS doesn't reject the app once that feature
is actually built, even though the feature itself isn't built yet (confirmed unused as of Phase 10's
audit). No other Info.plist key was touched — there's no App Transport Security exception (secure by
default, matching `SECURITY-DESIGN.md` §1), and nothing else in this app's current dependency set
(`flutter_secure_storage`, `dio`, `cookie_jar`, `connectivity_plus`, `path_provider`, `url_launcher`)
needs a usage-description string to function.

**What a real Mac needs to do before this is trustworthy, in order:**

1. `flutter pub get` (picks up `ios/` for the first time on that machine).
2. `cd ios && pod install` — CocoaPods isn't installed here, so the `Podfile.lock`/`Pods/` that every
   Flutter plugin's native iOS code needs have never been generated. This is the first real test of
   whether every plugin this app uses (the list above) actually has working iOS support — all of them
   are mainstream, actively-maintained packages with iOS support, but that's based on reading their
   `pubspec.yaml` platform declarations, not a verified build. Don't assume it's clean on the first try.
3. Open `ios/Runner.xcworkspace` (not `.xcodeproj` — CocoaPods requires the workspace) in Xcode.
4. `flutter run` or `flutter build ios` against a simulator first, before a real device — catches the
   bulk of "does it even compile" issues without needing a provisioning profile yet.
5. `flutter analyze`/`flutter test` already pass on this Linux box (same Dart code, platform-independent)
   — re-run them on the Mac too as a sanity check that nothing differs, but they're not the gap here;
   the gap is entirely the native iOS build path, which has literally never run once.

## What you need before this can reach the App Store, beyond a Mac

- **An Apple Developer Program membership** (paid, annual) — required for a real provisioning profile,
  code signing identity, and App Store Connect access at all.
- **A bundle identifier decision**: generated as `in.abies.abies_mobile` (matching the Android
  `applicationId`'s org, `--org in.abies` used for both platforms) — confirm this is the identifier you
  want registered in App Store Connect before first upload; it's awkward to change later.
- **App Store Connect app record**: name, primary category, age rating, and the same data-safety-style
  questionnaire Android's Play Console asks for (see `docs/mobile/PLAY-STORE-RELEASE.md` for what this
  app actually collects — the same facts apply here, Apple just calls the form something else: "App
  Privacy" / nutrition labels).
- **Store assets**: screenshots (per required device size class), an app icon (the generated
  `Assets.xcassets` has only placeholder icon slots, not real artwork), and a support URL.
- **Push notification capability**: not relevant yet — Phase 9 (push) is blocked on a Firebase project
  regardless of platform; nothing iOS-specific to prepare for that until Phase 9 itself unblocks.
- **TestFlight** before a public release — the normal, recommended path once a signed build exists; not
  set up here since there's no signed build to upload yet.

## CI

No iOS build job exists in `.github/workflows/mobile-ci.yml` — GitHub-hosted macOS runners exist and are
a reasonable option once this is worth automating, but that's a cost/minutes trade-off to make
deliberately when someone is actually about to use it, not something to wire up speculatively against a
platform that's never been built even once by hand yet. Get a manual build working on a real Mac first.
