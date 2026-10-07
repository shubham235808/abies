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
        // No UAT environment exists yet (docs/mobile/CURRENT-BACKEND-API.md §7).
        // Placeholder — confirm the real hostname before this is used for anything.
        return const AppEnv._(Flavor.uat, 'https://uat.abies.in');
      case 'prod':
        // No production environment exists yet either. Placeholder.
        return const AppEnv._(Flavor.prod, 'https://abies.in');
      case 'dev':
      default:
        return const AppEnv._(Flavor.dev, 'https://dev.abies.in');
    }
  }

  bool get isProd => flavor == Flavor.prod;
}
