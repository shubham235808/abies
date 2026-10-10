# ABIES Mobile — App Store release (iOS)

## Status — honest, as of 2026-10-08 (second pass)

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
default, matching `SECURITY-DESIGN.md` §1), and nothing else in this app's current dependency set needs a
usage-description string to function.

### Third pass (2026-10-10): flavors, bundle IDs, branding — still never built

Still Linux-only: `flutter build -h` here doesn't even list an `ios` subcommand, and `xcodebuild`/`pod`
are absent. Everything below is config prepared and structurally checked, not built.

- **Flavors mirror Android exactly.** Android uses `--flavor` (Gradle `productFlavors`) plus the
  independent `--dart-define=ABIES_ENV=<flavor>` and `-t lib/main_<flavor>.dart`. iOS now accepts the
  same three flags: `Runner.xcodeproj` has nine build configurations (`Debug-dev`, `Profile-dev`,
  `Release-dev`, and the same for `uat` and `prod`) on the project, `Runner` and `RunnerTests`, plus
  shared schemes `dev`, `uat` and `prod`. That is the naming `flutter_tools`
  (`ios/xcodeproj.dart`, `schemeFor`/`buildConfigurationFor`) looks up for `--flavor`. The stock
  `Runner` scheme and the plain `Debug`/`Release`/`Profile` configurations were removed, so iOS needs
  `--flavor`, the same as Android. `Podfile` maps all nine configurations (Debug → `:debug`,
  Profile/Release → `:release`).
- **Per-flavor values** live in `ios/Flutter/Flavor-<flavor>.xcconfig`. Each of the nine Runner
  configurations uses `ios/Flutter/<Mode>-<flavor>.xcconfig` as its base configuration, which includes
  the optional CocoaPods xcconfig, `Generated.xcconfig`, and the flavor file. The old
  `Flutter/Debug.xcconfig`/`Release.xcconfig` are kept because `flutter_tools` still writes to them,
  but no build configuration references them any more.

  | Flavor | Bundle ID | Home-screen name | Android equivalent |
  |---|---|---|---|
  | dev | `in.abies.abiesMobile.dev` | Abies Dev | `in.abies.abies_mobile.dev` |
  | uat | `in.abies.abiesMobile.uat` | Abies UAT | `in.abies.abies_mobile.uat` |
  | prod | `in.abies.abiesMobile` | Abies | `in.abies.abies_mobile` |

  iOS bundle IDs can't contain `_`, which is why `flutter create` generated `abiesMobile`. (Earlier
  versions of this doc said `in.abies.abies_mobile`, which was wrong.)
- **Branding:** every `AppIcon.appiconset` slot and the `LaunchImage` set (160/320/480 px, centred on the
  white launch screen) now use `assets/images/abies-mark.png`, the same mark the app and website use.
  That source is only 512×512, so the 1024×1024 App Store icon is an upscale. Get a native 1024 export
  from the brand source before you submit. Note that Android's `mipmap-*/ic_launcher.png` is **still
  the default Flutter icon**. Only the in-app UI uses the ABIES mark on Android.
- **Info.plist:** `CFBundleDisplayName`/`CFBundleName` = `$(APP_DISPLAY_NAME)` (per flavor). No new
  permission strings were added, because `lib/` uses no camera, photo library, location or microphone.
  `url_launcher` only opens `https` URLs externally, so no `LSApplicationQueriesSchemes` entry is
  needed. There is no ATS exception: every flavor uses `https://`.
- **Signing:** untouched. It is Xcode's automatic style with no team set. Choose a team per target in
  Xcode, or pass `DEVELOPMENT_TEAM`, before any device or archive build.

Exact commands on a Mac (from `apps/mobile/`):

```sh
flutter pub get
(cd ios && pod install)
flutter build ios --simulator --debug --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
flutter build ios --no-codesign --release --flavor prod --dart-define=ABIES_ENV=prod -t lib/main_prod.dart
open -a Simulator && flutter run --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
# signed archive, once an Apple Developer team exists:
flutter build ipa --flavor prod --dart-define=ABIES_ENV=prod -t lib/main_prod.dart
```

### This pass: a Podfile now exists, root cause confirmed, no guessing

`ios/Podfile` was missing entirely until this pass — verified absent before by `find apps/mobile/ios
-maxdepth 1` and by `git log --all --full-history -- "**/Podfile"` (empty: it was never committed, not
removed). Root cause, read directly out of the installed Flutter 3.47.6 SDK's own source rather than
guessed: `flutter_tools`' CocoaPods integration
(`packages/flutter_tools/lib/src/macos/cocoapods.dart`, `setupPodfile()`) opens with:

```dart
Future<void> setupPodfile(XcodeBasedProject xcodeProject) async {
  if (!_xcodeProjectInterpreter.isInstalled) {
    // Don't do anything for iOS when host platform doesn't support it.
    return;
  }
  ...
```

`_xcodeProjectInterpreter.isInstalled` is `xcodebuild`'s presence — always false on Linux. So neither
`flutter create --platforms=ios` nor `flutter pub get` will *ever* write `ios/Podfile` on this box, no
matter how many times either runs — confirmed for real: `flutter pub get` was re-run in this pass
(resolved cleanly, see below) and `ios/Podfile` was still absent afterward, exactly as the source predicts.
This was never a "forgot to commit it" accident; it is a structural gap every Flutter project generated
on Linux/CI-without-Xcode will have, and it only self-heals the first time `flutter pub get` or `flutter
build ios` runs on an actual Mac with Xcode installed (same function, `_xcodeProjectInterpreter.isInstalled`
now true).

**Fix applied**: `ios/Podfile` was hand-written from the *actual* current template the same `setupPodfile()`
copies from — `packages/flutter_tools/templates/cocoapods/Podfile-ios` in this installed Flutter 3.47.6
SDK, read verbatim, not reconstructed from memory. The only change from that template is uncommenting its
own example `platform :ios` line and setting it to `'15.0'`, matching `IPHONEOS_DEPLOYMENT_TARGET = 15.0`
already set in `Runner.xcodeproj/project.pbxproj` (confirmed with `grep -n
IPHONEOS_DEPLOYMENT_TARGET project.pbxproj` → all three build configs say `15.0`). Everything else —
`use_frameworks!`, the `flutter_install_all_ios_pods`/`flutter_ios_podfile_setup` calls into
`podhelper.rb`, the `RunnerTests` sub-target, the `post_install` hook — is copied unchanged. **No
`use_modular_headers!` line was added**: the real current template doesn't have one (every plugin pod in
this app's set that mixes Swift+Obj-C already sets `DEFINES_MODULE => YES` in its own podspec, e.g.
`flutter_secure_storage.podspec`), so adding it would be inventing syntax the template doesn't call for.

Also fixed, for the same structural reason (also gated behind `_xcodeProjectInterpreter.isInstalled` inside
`setupPodfile()`, specifically its `addPodsDependencyToFlutterXcconfig` call): `ios/Flutter/Debug.xcconfig`
and `ios/Flutter/Release.xcconfig` each gained one line,
`#include? "Pods/Target Support Files/Pods-Runner/Pods-Runner.<debug|release>.xcconfig"`, placed before the
existing `#include "Generated.xcconfig"` — the exact string and placement `_addPodsDependencyToFlutterXcconfig`
in the same source file produces. The leading `#include?` (with `?`) is intentionally safe before `Pods/`
exists: Xcode treats a missing optional include as a no-op, so this does nothing until a real `pod install`
on a Mac creates that file, at which point it's already wired in instead of needing a second manual step.

**Not fixed, because it cannot be from Linux**: the Podfile being present doesn't make `pod install` have
run. `Podfile.lock`/`Pods/` still don't exist (CocoaPods isn't installed here, and couldn't resolve
anything useful without Xcode/the iOS SDK anyway). The real Mac still has to run `pod install` for the
first time, and that is still the first genuine test of whether these pods resolve — see below for why
that risk is now much lower than "unverified," but it is still not verified.

### Dependency audit — every iOS-relevant pubspec.yaml package, checked in the resolved pub cache

`flutter pub get` was re-run in this pass (`apps/mobile`, Flutter 3.47.6) and resolved cleanly ("Got
dependencies!", 22 packages have newer-but-constrained versions available — unrelated to this audit).
Every package below was checked in the actual resolved `~/.pub-cache/hosted/pub.dev/<pkg>-<version>/`
directory, not assumed from its pub.dev listing:

| Package | Resolved version | iOS mechanism | Verified by |
|---|---|---|---|
| `flutter_riverpod` | 2.6.1 | Pure Dart — no native code on any platform | No `flutter.plugin.platforms` block in pubspec; platform-agnostic by construction |
| `go_router` | 14.8.1 | Pure Dart | Same |
| `dio` | 5.11.1 | Pure Dart (`dart:io` `HttpClient` on iOS) | Same |
| `cookie_jar` | 4.0.9 | Pure Dart | Same |
| `dio_cookie_manager` | 3.5.0 | Pure Dart | Same |
| `flutter_secure_storage` | 9.2.4 | Real native iOS: ships its own `ios/flutter_secure_storage.podspec` + `ios/Classes/*.{h,m,swift}` (Keychain-backed) directly in the main package, not a split platform package | `find ~/.pub-cache/.../flutter_secure_storage-9.2.4/ios` |
| `connectivity_plus` | 6.1.5 | Real native iOS: `ios/connectivity_plus.podspec` + `ios/connectivity_plus/Package.swift` + Swift sources under `Sources/connectivity_plus` | Same pattern, read directly |
| `local_auth` | 2.3.0 | `ios: default_package: local_auth_darwin`; `local_auth_darwin-1.6.1` ships `darwin/local_auth_darwin.podspec` (shared iOS+macOS podspec, `s.ios.deployment_target = '13.0'`) + Swift sources | Read podspec directly |
| `path_provider` | 2.1.6 | `ios: default_package: path_provider_foundation`; `path_provider_foundation-2.6.0` has **no podspec and no `ios/` folder at all** — it's FFI-based (`package:objective_c` + generated `ffi_bindings.g.dart`), calling straight into the `Foundation` framework that's always present on iOS, so it needs no CocoaPods target of its own | Read package contents directly; confirmed this is the modern ffigen-based plugin shape, not a missing-support gap |
| `url_launcher` | 6.3.3 | `ios: default_package: url_launcher_ios`; `url_launcher_ios-6.4.2` ships `ios/url_launcher_ios.podspec` + `ios/url_launcher_ios/Package.swift` + Swift sources | Read directly |

**Finding: all ten have genuine, verified iOS support.** None are Android-only with a silent iOS gap. The
one package worth flagging explicitly so it isn't mistaken for a gap on a future pass: `path_provider`'s
iOS implementation has no `ios/` directory and no podspec by design (FFI straight into `Foundation`, no
compiled native glue needed) — checked, found no issue, just a different (newer) plugin shape than the
podspec-based ones.

### Swift Package Manager scaffold — present, currently empty, not a problem

`Runner.xcodeproj/project.pbxproj` already wires in `FlutterGeneratedPluginSwiftPackage`
(`Flutter/ephemeral/Packages/FlutterGeneratedPluginSwiftPackage`) as a local Swift package dependency —
this is Flutter's newer dual CocoaPods/SPM plugin-integration scaffold, generated into the template by
default since Flutter 3.24+, independent of whether any plugin actually uses it. Re-running `flutter pub
get` on this Linux box regenerated the (gitignored) ephemeral package manifest for real:
`ios/Flutter/ephemeral/Packages/FlutterGeneratedPluginSwiftPackage/Package.swift` has `dependencies: []` —
empty. None of this app's four native-iOS plugins (`flutter_secure_storage`, `connectivity_plus`,
`local_auth_darwin`, `url_launcher_ios`) are being routed through SPM at their currently-resolved versions;
all four will be pulled in through CocoaPods via the `Podfile` added in this pass
(`flutter_install_all_ios_pods`). No conflict, no action needed — checked, found no issue.

### Platform-conditional code in `lib/` — none exists

`grep -rnE "Platform\.isAndroid|Platform\.isIOS|kIsWeb|defaultTargetPlatform|TargetPlatform\." lib/`
returned nothing. The only two `dart:io` imports in `lib/` are:

- `lib/core/observability/sentry_http_observability.dart` — uses `dart:io`'s `HttpClient` to send events
  over plain HTTP; platform-neutral, no branching.
- `lib/features/diagnostics/data/report_file_downloader.dart` — uses `dart:io`'s `File`/`Directory` plus
  `path_provider`'s `getApplicationDocumentsDirectory()`, which is itself cross-platform (resolves to the
  app sandbox on both Android and iOS without the caller branching).

**Finding: every code path in `lib/` is platform-neutral already.** There is no Android-only branch
missing an iOS counterpart, because there is no platform branching at all — checked, found no issue.

### `AppDelegate.swift` / `SceneDelegate.swift` — stock template, byte-for-byte

Both files were diffed directly against the installed Flutter 3.47.6 SDK's own
`packages/flutter_tools/templates/app/ios.tmpl/Runner/{AppDelegate.swift,SceneDelegate.swift}` and are
**identical** — no divergence at all. `AppDelegate.swift` uses the current
`FlutterImplicitEngineDelegate`/`didInitializeImplicitFlutterEngine` hook (this Flutter version's current
plugin-registration pattern) purely to call `GeneratedPluginRegistrant.register(...)`, which is exactly
what the template does for an app with no custom native code. `ios/RunnerTests/RunnerTests.swift` was
checked the same way against `RunnerTests.swift.tmpl` and matches the plain (non-plugin) branch of that
template exactly.

**Finding: nothing in this app's current feature set needs custom native iOS glue.** None of the four
native plugins (secure storage, connectivity, local auth, URL launching) require any `AppDelegate`/
`SceneDelegate` wiring beyond what `GeneratedPluginRegistrant` already does automatically — checked, found
no issue. If a future phase adds something that needs raw native hookup (e.g. a push-notification SDK for
the still-blocked Phase 9, or a custom URL scheme handler), that would be the first time this file needs a
real edit, and this note should be revisited then rather than assumed still true.

### Regression check — `flutter analyze` / `flutter test`, after the above changes

- `flutter analyze` → **No issues found!** (8.9s)
- `flutter test` → **all 187 tests pass**, same count as before this pass — these changes only touched
  `ios/` files; no Dart code changed, so this is confirming no regression, not new verification.

**What a real Mac still needs to do before this is trustworthy, in order:**

1. `flutter pub get` — now mainly a sanity re-resolve; `ios/Podfile` already exists from this pass, so the
   Mac's own `setupPodfile()` will see it's already there and only add the `Pods-Runner.xcconfig` include
   lines if they're somehow missing (they're already added here too).
2. `cd ios && pod install` — CocoaPods isn't installed here, so the `Podfile.lock`/`Pods/` that every
   Flutter plugin's native iOS code needs have still never been generated. This is still the first real
   test of whether `flutter_secure_storage`, `connectivity_plus`, `local_auth_darwin`, and `url_launcher_ios`
   actually resolve and build — this pass raised confidence (all four have genuine, directly-verified iOS
   native code, see the dependency audit above) but a `pod install`/Xcode build is the only thing that
   actually proves it. Don't assume it's clean on the first try.
3. Open `ios/Runner.xcworkspace` (not `.xcodeproj` — CocoaPods requires the workspace) in Xcode.
4. `flutter run` or `flutter build ios` against a simulator first, before a real device — catches the
   bulk of "does it even compile" issues without needing a provisioning profile yet.
5. `flutter analyze`/`flutter test` already pass on this Linux box (same Dart code, platform-independent)
   — re-run them on the Mac too as a sanity check that nothing differs, but they're not the gap here;
   the gap is entirely the native iOS build path, which has literally never run once.

## What you need before this can reach the App Store, beyond a Mac

- **An Apple Developer Program membership** (paid, annual) — required for a real provisioning profile,
  code signing identity, and App Store Connect access at all.
- **A bundle identifier decision**: `in.abies.abiesMobile` for prod (plus `.dev`/`.uat` suffixes, see the
  third-pass section above; iOS forbids the `_` in Android's `in.abies.abies_mobile`). Confirm this is the identifier you
  want registered in App Store Connect before first upload; it's awkward to change later.
- **App Store Connect app record**: name, primary category, age rating, and the same data-safety-style
  questionnaire Android's Play Console asks for (see `docs/mobile/PLAY-STORE-RELEASE.md` for what this
  app actually collects — the same facts apply here, Apple just calls the form something else: "App
  Privacy" / nutrition labels).
- **Store assets**: screenshots (per required device size class), a native 1024×1024 app icon (the current one is
  the 512 px ABIES mark upscaled, see above), and a support URL.
- **Push notification capability**: not relevant yet — Phase 9 (push) is blocked on a Firebase project
  regardless of platform; nothing iOS-specific to prepare for that until Phase 9 itself unblocks.
- **TestFlight** before a public release — the normal, recommended path once a signed build exists; not
  set up here since there's no signed build to upload yet.

## CI

No iOS build job exists in `.github/workflows/mobile-ci.yml` — GitHub-hosted macOS runners exist and are
a reasonable option once this is worth automating, but that's a cost/minutes trade-off to make
deliberately when someone is actually about to use it, not something to wire up speculatively against a
platform that's never been built even once by hand yet. Get a manual build working on a real Mac first.
