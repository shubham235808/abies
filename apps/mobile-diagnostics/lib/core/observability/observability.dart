/// Crash/error-reporting abstraction (docs/mobile/MOBILE-ARCHITECTURE.md §7).
/// Feature code reports through this interface, never a specific provider
/// SDK directly — so Sentry/Crashlytics/anything else can be swapped in
/// later by changing only the implementation registered here.
///
/// [NoopObservability] is the default, and remains the real behavior for
/// every build so far — Phase 10 added a real implementation
/// ([SentryHttpObservability] in `sentry_http_observability.dart`), but it
/// only activates when a `SENTRY_DSN` dart-define is actually supplied
/// (`resolveObservability()`), which no build (`main_dev.dart`/
/// `main_uat.dart`/`main_prod.dart`) does yet. See that file's doc comment
/// for why it's a hand-rolled HTTP sender rather than `package:
/// sentry_flutter` directly.
abstract class Observability {
  void recordError(Object error, StackTrace stackTrace, {String? context});

  /// [statusCode] and [path] only — never the request or response body
  /// (docs/mobile/SECURITY-DESIGN.md §7, §11).
  void recordApiFailure({required String path, required int statusCode, String? requestId});

  void setUserContext({String? userIdHash});
}

class NoopObservability implements Observability {
  const NoopObservability();

  @override
  void recordError(Object error, StackTrace stackTrace, {String? context}) {}

  @override
  void recordApiFailure({required String path, required int statusCode, String? requestId}) {}

  @override
  void setUserContext({String? userIdHash}) {}
}
