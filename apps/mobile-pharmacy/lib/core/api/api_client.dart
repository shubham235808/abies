import 'dart:async';
import 'dart:math';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import '../env/app_env.dart';
import '../observability/observability.dart';
import '../storage/secure_cookie_storage.dart';
import 'api_exception.dart';

/// Centralized API client (docs/mobile/MOBILE-ARCHITECTURE.md §3). Every
/// feature's `data/` layer goes through this — nothing else constructs a
/// `Dio` instance or reads `AppEnv` directly, so base URL, auth, retries and
/// error mapping stay in one place.
///
/// Session handling is Option A from docs/mobile/API-GAP-ANALYSIS.md §2: the
/// backend's `abies_session` cookie is carried by a real cookie jar, not
/// reimplemented as a bearer token. There is no refresh-token flow — the
/// backend only ever rotates the existing cookie on its own responses; this
/// client's only job on a 401 is to drop local session state and let the app
/// route to sign-in. It never attempts a silent re-auth.
class ApiClient {
  ApiClient({required AppEnv env, Dio? dio, PersistCookieJar? cookieJar, Observability? observability})
      : _env = env,
        _observability = observability ?? const NoopObservability(),
        _cookieJar = cookieJar ?? PersistCookieJar(storage: SecureCookieStorage()),
        _dio = dio ?? Dio(BaseOptions(baseUrl: env.baseUrl, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 20))) {
    _dio.interceptors.add(CookieManager(_cookieJar));
    _dio.interceptors.add(InterceptorsWrapper(onRequest: _attachRequestId));
  }

  final AppEnv _env;
  final Dio _dio;
  final PersistCookieJar _cookieJar;
  final Observability _observability;

  /// Fires once per 401 response, so the app (not this client) decides how to
  /// route to sign-in. This client never calls it more than once per actual
  /// server rejection — no retry loop lives here.
  final _unauthorizedController = StreamController<void>.broadcast();
  Stream<void> get onUnauthorized => _unauthorizedController.stream;

  AppEnv get env => _env;

  void _attachRequestId(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['X-Request-Id'] ??= _newRequestId();
    handler.next(options);
  }

  String _newRequestId() {
    final rand = Random.secure();
    return List.generate(16, (_) => rand.nextInt(16).toRadixString(16)).join();
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query, required T Function(dynamic json) decode}) {
    return _send(path, () => _dio.get(path, queryParameters: query), decode);
  }

  /// [idempotencyKey], when given, is sent as the `Idempotency-Key` header
  /// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 8). The backend replays the
  /// first response for a repeated key instead of re-running the write —
  /// generate one key per booking *attempt* with [newIdempotencyKey] and
  /// reuse it across that attempt's retries, not a fresh one per retry
  /// (a fresh key every time defeats the whole point).
  Future<T> post<T>(String path, {Object? body, String? idempotencyKey, required T Function(dynamic json) decode}) {
    final options = idempotencyKey == null ? null : Options(headers: {'Idempotency-Key': idempotencyKey});
    return _send(path, () => _dio.post(path, data: body, options: options), decode);
  }

  /// One key per booking/order attempt — reuse it across that attempt's own
  /// retries (e.g. a timeout-triggered resend), never generate a fresh one
  /// per retry, or every retry becomes a new, undeduplicated write.
  static String newIdempotencyKey() {
    final rand = Random.secure();
    return List.generate(24, (_) => rand.nextInt(16).toRadixString(16)).join();
  }

  Future<T> patch<T>(String path, {Object? body, required T Function(dynamic json) decode}) {
    return _send(path, () => _dio.patch(path, data: body), decode);
  }

  /// Full-replace upsert — e.g. `PUT /pharmacies/me/tax-settings`.
  Future<T> put<T>(String path, {Object? body, required T Function(dynamic json) decode}) {
    return _send(path, () => _dio.put(path, data: body), decode);
  }

  Future<T> delete<T>(String path, {required T Function(dynamic json) decode}) {
    return _send(path, () => _dio.delete(path), decode);
  }

  Future<T> _send<T>(String path, Future<Response<dynamic>> Function() request, T Function(dynamic json) decode) async {
    try {
      final response = await request();
      return decode(response.data);
    } on DioException catch (error) {
      final mapped = _mapError(error);
      // Status code + path + request id only — never the request/response
      // body (docs/mobile/SECURITY-DESIGN.md §7; recordApiFailure's own
      // signature doesn't accept one), and never blocking/throwing: a
      // broken DSN must never become a second failure on top of this one.
      _observability.recordApiFailure(path: path, statusCode: mapped.statusCode, requestId: mapped.requestId);
      if (mapped.isUnauthorized) {
        // Session is gone server-side (expired, revoked, or never existed) —
        // never attempt to keep using it. The app's own listener clears local
        // state and navigates; this client doesn't know about routing.
        _unauthorizedController.add(null);
      }
      throw mapped;
    }
  }

  ApiException _mapError(DioException error) {
    final response = error.response;
    if (response == null) {
      // Never reached the server: timeout, no connection, DNS failure, TLS
      // failure. Message is deliberately generic, never the raw Dio/socket
      // exception text (docs/mobile/SECURITY-DESIGN.md §7).
      return const ApiException(message: "Couldn't reach ABIES. Check your connection and try again.", statusCode: -1);
    }
    final body = response.data;
    final requestId = response.headers.value('x-request-id');
    if (body is Map<String, dynamic>) {
      final issuesJson = body['issues'];
      final issues = issuesJson is List
          ? issuesJson.whereType<Map<String, dynamic>>().map(ApiFieldIssue.fromJson).toList()
          : const <ApiFieldIssue>[];
      return ApiException(
        message: body['error'] as String? ?? 'Something went wrong. Please try again.',
        statusCode: response.statusCode ?? -1,
        issues: issues,
        requestId: requestId,
      );
    }
    return ApiException(message: 'Something went wrong. Please try again.', statusCode: response.statusCode ?? -1, requestId: requestId);
  }

  /// Clears the local cookie jar. Call only after the backend's own
  /// `/api/v1/auth/logout` call has succeeded (or definitively failed in a
  /// way that means the session is already gone) — never clear local state
  /// before the server confirms the session is revoked, or a flaky logout
  /// request could leave a still-valid session the user can no longer reach.
  Future<void> clearSession() => _cookieJar.deleteAll();

  void dispose() {
    _dio.close();
    unawaited(_unauthorizedController.close());
  }
}
