/// Crash/error-reporting abstraction (docs/mobile/MOBILE-ARCHITECTURE.md §7),
/// same interface as apps/mobile's. Feature code reports through this, never
/// a provider SDK directly. This app ships only [NoopObservability] for now —
/// apps/mobile's DSN-gated `SentryHttpObservability` is not ported yet (no
/// build of either app supplies a `SENTRY_DSN`, so it would be dead code).
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
