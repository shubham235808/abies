/// Crash/error-reporting abstraction (docs/mobile/MOBILE-ARCHITECTURE.md §7),
/// same interface as apps/mobile's. Feature code reports through this, never
/// a specific provider SDK directly.
///
/// [NoopObservability] is the only implementation in this app so far —
/// apps/mobile's opt-in `SentryHttpObservability` (activated by a
/// `SENTRY_DSN` dart-define no build supplies yet) was deliberately not
/// ported into this MVP; it can be dropped in later behind this same
/// interface without touching feature code.
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
