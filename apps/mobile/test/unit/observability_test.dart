import 'dart:convert';

import 'package:abies_mobile/core/observability/observability.dart';
import 'package:abies_mobile/core/observability/sentry_http_observability.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records every call [SentryHttpObservability] makes through its injected
/// [EventSender] instead of ever touching a real socket (dart:io's
/// `HttpClient` is not faked here — this is the seam [tryCreate] exposes
/// for exactly that reason).
class _RecordingSender {
  final List<Map<String, dynamic>> events = [];
  final List<String> authHeaders = [];
  Object? throwOnNextSend;

  Future<void> call(Uri uri, String authHeader, List<int> body) async {
    authHeaders.add(authHeader);
    events.add(jsonDecode(utf8.decode(body)) as Map<String, dynamic>);
    final toThrow = throwOnNextSend;
    if (toThrow != null) {
      throwOnNextSend = null;
      throw toThrow;
    }
  }
}

const _validDsn = 'https://fakepublickey@example.test/1';

void main() {
  group('buildObservability (DSN-gated activation)', () {
    test('an empty DSN returns NoopObservability — the state of every build so far', () {
      final observability = buildObservability(dsn: '', environment: 'dev');
      expect(observability, isA<NoopObservability>());
    });

    test('a well-formed DSN returns a real SentryHttpObservability', () {
      final observability = buildObservability(dsn: _validDsn, environment: 'dev');
      expect(observability, isA<SentryHttpObservability>());
    });

    test('a malformed DSN (no public key) falls back to NoopObservability, never throws', () {
      final observability = buildObservability(dsn: 'https://example.test/1', environment: 'dev');
      expect(observability, isA<NoopObservability>());
    });

    test('a malformed DSN (no project id segment) falls back to NoopObservability, never throws', () {
      final observability = buildObservability(dsn: 'https://key@example.test/', environment: 'dev');
      expect(observability, isA<NoopObservability>());
    });

    test('garbage that is not even a URI falls back to NoopObservability, never throws', () {
      final observability = buildObservability(dsn: 'not a uri at all', environment: 'dev');
      expect(observability, isA<NoopObservability>());
    });

    test('resolveObservability (the real dart-define-reading entry point) is Noop with no SENTRY_DSN define', () {
      // This test run itself has no --dart-define=SENTRY_DSN, exactly like
      // every build this phase actually produced — see the README/
      // IMPLEMENTATION-PLAN.md verification commands.
      final observability = resolveObservability(environment: 'dev');
      expect(observability, isA<NoopObservability>());
    });
  });

  group('SentryHttpObservability sends real-shaped events through the injected sender', () {
    test('recordApiFailure delivers path/statusCode/requestId and nothing else PII-shaped', () async {
      final sender = _RecordingSender();
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      observability.recordApiFailure(path: '/api/v1/appointments/mine', statusCode: 404, requestId: 'req-42');
      await Future<void>.delayed(Duration.zero);

      expect(sender.events, hasLength(1));
      final event = sender.events.single;
      expect(event['environment'], 'dev');
      expect(event['level'], 'warning');
      expect(event['extra']['path'], '/api/v1/appointments/mine');
      expect(event['extra']['status_code'], 404);
      expect(event['extra']['request_id'], 'req-42');
      expect(sender.authHeaders.single, contains('sentry_key=fakepublickey'));
    });

    test('recordApiFailure on a 5xx/transport failure is level "error", not "warning"', () async {
      final sender = _RecordingSender();
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      observability.recordApiFailure(path: '/api/v1/auth/me', statusCode: -1, requestId: null);
      await Future<void>.delayed(Duration.zero);

      expect(sender.events.single['level'], 'error');
    });

    test('recordError redacts an email embedded in the error message before it is sent', () async {
      final sender = _RecordingSender();
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      observability.recordError(Exception('failed for asha@example.test'), StackTrace.current, context: 'ProfileController');
      await Future<void>.delayed(Duration.zero);

      final message = sender.events.single['message']['formatted'] as String;
      expect(message, isNot(contains('asha@example.test')));
      expect(message, contains('[redacted-email]'));
    });

    test('recordError redacts an OTP/mobile-number-shaped digit run embedded in the error message', () async {
      final sender = _RecordingSender();
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      observability.recordError(Exception('otp 482913 did not match for +919876543210'), StackTrace.current);
      await Future<void>.delayed(Duration.zero);

      final message = sender.events.single['message']['formatted'] as String;
      expect(message, isNot(contains('482913')));
      expect(message, isNot(contains('9876543210')));
      expect(message, contains('[redacted-number]'));
    });

    test('setUserContext redacts its own input and attaches it to subsequent events', () async {
      final sender = _RecordingSender();
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      observability.setUserContext(userIdHash: 'hash-5551234567');
      observability.recordApiFailure(path: '/api/v1/auth/me', statusCode: 401, requestId: null);
      await Future<void>.delayed(Duration.zero);

      final user = sender.events.single['user'] as Map<String, dynamic>;
      expect(user['id'], isNot(contains('5551234567')));
    });

    test('a sender that throws (unreachable host, bad DSN) never propagates out of recordError', () async {
      final sender = _RecordingSender()..throwOnNextSend = Exception('connection refused');
      final observability = SentryHttpObservability.tryCreate(dsn: _validDsn, environment: 'dev', sender: sender.call)!;

      // Must not throw — a crash reporter that can itself crash the caller
      // (ApiClient's error path, FlutterError.onError) defeats its own
      // purpose (SECURITY-DESIGN.md's "never block/throw" discipline this
      // implementation documents).
      expect(() => observability.recordError(Exception('boom'), StackTrace.current), returnsNormally);
      await Future<void>.delayed(Duration.zero);
    });
  });

  group('redactForObservability', () {
    test('masks an email address', () {
      expect(redactForObservability('contact asha@example.test now'), 'contact [redacted-email] now');
    });

    test('masks a 6-digit OTP-shaped run', () {
      expect(redactForObservability('otp was 482913'), 'otp was [redacted-number]');
    });

    test('masks a 10-digit mobile-number-shaped run', () {
      expect(redactForObservability('mobile 9876543210 invalid'), 'mobile [redacted-number] invalid');
    });

    test('leaves short numbers (fewer than 4 digits) alone — e.g. a status code', () {
      expect(redactForObservability('status 503'), 'status 503');
    });

    test('leaves plain text with no email/digit-run untouched', () {
      expect(redactForObservability("This doctor isn't available right now."), "This doctor isn't available right now.");
    });
  });

  group('NoopObservability', () {
    test('every method is a true no-op and never throws', () {
      const observability = NoopObservability();
      expect(() => observability.recordError(Exception('x'), StackTrace.current, context: 'c'), returnsNormally);
      expect(() => observability.recordApiFailure(path: '/x', statusCode: 500, requestId: 'r'), returnsNormally);
      expect(() => observability.setUserContext(userIdHash: 'h'), returnsNormally);
    });
  });
}
