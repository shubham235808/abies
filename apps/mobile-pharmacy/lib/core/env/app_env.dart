/// Build-time environment selection. Deliberately a compile-time Dart define,
/// not a runtime setting a build could be flipped into after signing — a
/// production build must not be able to point at dev by changing a setting in
/// the running app (docs/mobile/MOBILE-ARCHITECTURE.md §3).
///
/// Usage: `flutter run --dart-define=ABIES_ENV=dev`.
enum Flavor { dev, uat, prod }

class AppEnv {
  const AppEnv._(this.flavor, this.baseUrl);

  final Flavor flavor;
  final String baseUrl;

  /// Resolves the current build's environment from the `ABIES_ENV` dart-define.
  /// Defaults to [Flavor.dev] so a bare `flutter run` with no define still
  /// points at a real, deployed environment rather than failing or guessing.
  factory AppEnv.fromDefine() {
    const raw = String.fromEnvironment('ABIES_ENV', defaultValue: 'dev');
    switch (raw) {
      case 'uat':
        // abies-uat is real now (2026-10-08, docs/platform/UAT-ABIES-IN-HOSTNAME.md
        // in this repo) — deployed and healthy in-cluster on the abies-gateway
        // Gateway. Same hostname as below on purpose: see that doc's "what this
        // does NOT do" section before assuming this actually reaches abies-uat
        // from a real phone right now.
        return const AppEnv._(Flavor.uat, 'https://abies.in');
      case 'prod':
        // No production environment exists IN THIS CLUSTER yet — the real,
        // live abies.in today is the separate standalone VM (Docker Compose),
        // not Kubernetes. Same URL as uat above, deliberately: until abies.in's
        // DNS is pointed at this cluster, both flavors reach whatever abies.in
        // currently resolves to publicly (the VM), not abies-uat.
        return const AppEnv._(Flavor.prod, 'https://abies.in');
      case 'dev':
      default:
        return const AppEnv._(Flavor.dev, 'https://dev.abies.in');
    }
  }

  bool get isProd => flavor == Flavor.prod;
}
