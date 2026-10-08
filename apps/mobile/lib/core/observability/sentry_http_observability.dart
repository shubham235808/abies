import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'observability.dart';

/// Sends crash/error events to a Sentry-compatible HTTP ingestion endpoint,
/// using only the DSN's own plain "store" protocol
/// (https://develop.sentry.dev/sdk/data-model/envelopes/ — a simplified,
/// single-event call, not the full envelope/session protocol) over
/// `dart:io`'s `HttpClient` — **no `package:sentry_flutter` dependency**.
///
/// Why not the official SDK, despite it being the obvious first choice
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 10's own brief): it was
/// actually tried in this environment, not assumed. `flutter pub add
/// sentry_flutter` resolved and `flutter pub get` succeeded, but
/// `flutter build apk --debug` then failed at
/// `:sentry_flutter:compileDebugKotlin` —
/// `e: Language version 1.6 is no longer supported; use version 2.0 or
/// greater instead` — because `sentry_flutter` is a real Flutter *plugin*
/// (confirmed by reading its pubspec: `flutter.plugin.platforms.android.
/// pluginClass: SentryFlutterPlugin`), carrying Android/Kotlin native code
/// whose own Gradle/Kotlin toolchain requirement is incompatible with this
/// sandbox's installed Kotlin Gradle Plugin version. That's exactly the
/// "needs Android-side native setup beyond what `flutter pub get`/a build
/// can handle" case the Phase 10 brief told this pass to watch for and
/// route around, so the change was reverted (`pubspec.yaml`/`pubspec.lock`
/// are back to what Phase 8 left them — `git diff` shows no dependency
/// added) and this hand-rolled sender took its place instead.
///
/// This still talks to the *real* Sentry ingestion wire protocol a genuine
/// DSN needs, so if a real Sentry project is ever provisioned, reporting
/// starts working the moment a real `SENTRY_DSN` is supplied — no app code
/// change required, only the dart-define. It trades the SDK's richer
/// features (breadcrumbs, session tracking, native/NDK crash capture,
/// automatic release health) for something that reliably compiles here.
///
/// Redaction (docs/mobile/SECURITY-DESIGN.md §7): [Observability]'s own
/// method signatures never accept a raw request/response body in the first
/// place (`recordApiFailure` takes `path`/`statusCode`/`requestId` only,
/// never the response), so there is structurally nothing here to redact a
/// body *out of*. What callers do pass — an error's `toString()`, a
/// `context` label — is still run through [redactForObservability] as a
/// second layer, in case a caller's error message happens to embed
/// something email- or OTP/mobile-number-shaped.
class SentryHttpObservability implements Observability {
  SentryHttpObservability._({
    required this.environment,
    required Uri storeUri,
    required String publicKey,
    required EventSender sender,
  })  : _storeUri = storeUri,
        _publicKey = publicKey,
        _sender = sender;

  /// Parses [dsn] and returns a working instance, or `null` if it's
  /// malformed (no public key, no host, no project id) — callers
  /// ([buildObservability]) fall back to [NoopObservability] rather than
  /// ever letting a bad DSN string crash app startup.
  static SentryHttpObservability? tryCreate({
    required String dsn,
    required String environment,
    EventSender? sender,
  }) {
    try {
      final uri = Uri.parse(dsn);
      final publicKey = uri.userInfo.split(':').first;
      if (publicKey.isEmpty || uri.host.isEmpty || uri.pathSegments.isEmpty) return null;
      final projectId = uri.pathSegments.last;
      if (projectId.isEmpty) return null;
      final storeUri = Uri(
        scheme: uri.scheme.isEmpty ? 'https' : uri.scheme,
        host: uri.host,
        port: uri.hasPort ? uri.port : null,
        path: '/api/$projectId/store/',
      );
      return SentryHttpObservability._(
        environment: environment,
        storeUri: storeUri,
        publicKey: publicKey,
        sender: sender ?? _defaultSender,
      );
    } catch (_) {
      // Malformed DSN (bad URI syntax, etc.) — behave exactly like no DSN
      // was configured, never throw out of a factory called from app
      // startup over a typo in a dart-define.
      return null;
    }
  }

  final String environment;
  final Uri _storeUri;
  final String _publicKey;
  final EventSender _sender;
  String? _userIdHash;

  @override
  void setUserContext({String? userIdHash}) {
    _userIdHash = userIdHash == null ? null : redactForObservability(userIdHash);
  }

  @override
  void recordError(Object error, StackTrace stackTrace, {String? context}) {
    _dispatch(
      level: 'error',
      message: redactForObservability(error.toString()),
      extra: {
        if (context != null) 'context': redactForObservability(context),
        'stack': redactForObservability(_truncate(stackTrace.toString(), 4000)),
      },
    );
  }

  @override
  void recordApiFailure({required String path, required int statusCode, String? requestId}) {
    // Only path + status code + request id ever reach this method in the
    // first place (SECURITY-DESIGN.md §7) — the signature doesn't accept a
    // request/response body, so there's nothing here that could leak one.
    final safePath = redactForObservability(path);
    _dispatch(
      level: statusCode >= 500 || statusCode < 0 ? 'error' : 'warning',
      message: 'API failure: $statusCode $safePath',
      extra: {
        'path': safePath,
        'status_code': statusCode,
        if (requestId != null) 'request_id': requestId,
      },
    );
  }

  void _dispatch({required String level, required String message, required Map<String, Object?> extra}) {
    final body = utf8.encode(jsonEncode({
      'event_id': _newEventId(),
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'platform': 'other',
      'level': level,
      'logger': 'abies_mobile',
      'environment': environment,
      'message': {'formatted': message},
      'extra': extra,
      if (_userIdHash != null) 'user': {'id': _userIdHash},
    }));
    final authHeader = 'Sentry sentry_version=7, sentry_client=abies-mobile-http/1.0, sentry_key=$_publicKey';
    // Fire-and-forget, deliberately: a crash/failure reporter must never
    // throw into, or block, the caller — ApiClient's error-mapping path and
    // main()'s FlutterError/PlatformDispatcher handlers all call this
    // synchronously and must return immediately regardless of whether the
    // DSN host is reachable. One attempt, no retry — a bad/unreachable DSN
    // must never turn into its own retry storm (SECURITY-DESIGN.md §11).
    unawaited(_sendSafely(authHeader, body));
  }

  Future<void> _sendSafely(String authHeader, List<int> body) async {
    try {
      await _sender(_storeUri, authHeader, body);
    } catch (_) {
      // Swallowed — see _dispatch's doc comment above.
    }
  }

  static Future<void> _defaultSender(Uri uri, String authHeader, List<int> body) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 5);
    try {
      final request = await client.postUrl(uri).timeout(const Duration(seconds: 5));
      request.headers.set(HttpHeaders.contentTypeHeader, 'application/json');
      request.headers.set('X-Sentry-Auth', authHeader);
      request.add(body);
      final response = await request.close().timeout(const Duration(seconds: 5));
      await response.drain<void>().timeout(const Duration(seconds: 5));
    } finally {
      client.close(force: true);
    }
  }

  static String _newEventId() {
    final rand = Random.secure();
    return List.generate(32, (_) => rand.nextInt(16).toRadixString(16)).join();
  }

  static String _truncate(String input, int maxLength) => input.length <= maxLength ? input : input.substring(0, maxLength);
}

/// Sends one event's raw HTTP POST. The real implementation
/// ([SentryHttpObservability._defaultSender]) is swapped for a fake in
/// tests so they never make a real network call.
typedef EventSender = Future<void> Function(Uri uri, String authHeader, List<int> body);

/// Gated factory, taking [dsn] as a plain argument rather than reading the
/// environment itself — this is what makes the DSN-gated branch
/// unit-testable without recompiling with a different dart-define (see
/// `test/unit/observability_test.dart`). [resolveObservability] below is
/// the thin, actually-used wrapper that reads the real dart-define.
///
/// Empty [dsn] (every build so far) returns [NoopObservability], same as
/// every phase before this one. A non-empty but malformed DSN also falls
/// back to [NoopObservability] rather than crashing startup — this mirrors
/// the backend's own inactive-until-configured pattern (`EMAIL_PROVIDER=
/// mock`, blank Razorpay keys, both of which also degrade to a calm
/// no-op/unavailable state instead of crashing when unconfigured).
Observability buildObservability({required String dsn, required String environment, EventSender? sender}) {
  if (dsn.isEmpty) return const NoopObservability();
  return SentryHttpObservability.tryCreate(dsn: dsn, environment: environment, sender: sender) ?? const NoopObservability();
}

/// Reads the `SENTRY_DSN` dart-define at compile time. This is the actual
/// entry point used by `main_dev.dart`/`main_uat.dart`/`main_prod.dart` and
/// by `app_providers.dart`'s `observabilityProvider` — nothing else in this
/// app should read `SENTRY_DSN` directly.
Observability resolveObservability({required String environment}) {
  const dsn = String.fromEnvironment('SENTRY_DSN');
  return buildObservability(dsn: dsn, environment: environment);
}

/// Mirrors the backend's `redactForStorage()` discipline
/// (`packages/domain/src/modules/notifications/notifications.service.ts`)
/// on the client (docs/mobile/SECURITY-DESIGN.md §7): masks anything
/// email-shaped and any run of 4+ digits (covers OTP codes — always 4-6
/// digits in this app — and mobile numbers, at the cost of also masking
/// harmless numeric ids) before a string is allowed anywhere near a crash
/// report. Deliberately conservative: over-redacting a harmless numeric id
/// is an acceptable cost next to under-redacting an OTP.
String redactForObservability(String input) {
  var result = input.replaceAll(_emailPattern, '[redacted-email]');
  result = result.replaceAll(_digitRunPattern, '[redacted-number]');
  return result;
}

final RegExp _emailPattern = RegExp(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}');
final RegExp _digitRunPattern = RegExp(r'\d{4,}');
