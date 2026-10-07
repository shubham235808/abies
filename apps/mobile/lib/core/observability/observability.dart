/// Crash/error-reporting abstraction (docs/mobile/MOBILE-ARCHITECTURE.md §7).
/// Feature code reports through this interface, never a specific provider
/// SDK directly — so Sentry/Crashlytics/anything else can be swapped in
/// later by changing only the implementation registered here.
///
/// No implementation is wired up yet (Phase 10). [NoopObservability] is the
/// default so nothing crashes for lack of a provider during Phases 1-9.
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
