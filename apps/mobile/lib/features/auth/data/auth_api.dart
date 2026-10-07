import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';
import '../domain/session_user.dart';

/// Talks to the existing `/api/v1/auth/*` routes only — nothing here invents
/// an endpoint (docs/mobile/CURRENT-BACKEND-API.md §3). Behind an interface
/// so [AuthController] is unit-testable with a fake, with no real `ApiClient`.
abstract class AuthApi {
  Future<RequestOtpResult> requestOtp({String? mobile, String? email});

  Future<VerifyOtpResult> verifyOtp({
    required String requestId,
    required String otp,
    required bool acceptedTerms,
    String? name,
  });

  /// Returns null on a 401 — "not signed in yet" is the expected outcome at
  /// app start, not an error to throw.
  Future<SessionUser?> me();

  Future<void> logout();

  /// Fires on any 401 from any call this app makes, not only from this
  /// interface's own methods — [AuthController] drops to signed-out on it.
  /// Exposed here (not read from [ApiClient] directly by the controller) so
  /// the controller depends on one interface it can fake in tests.
  Stream<void> get onUnauthorized;
}

class AuthApiImpl implements AuthApi {
  AuthApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) {
    assert((mobile == null) != (email == null), 'pass exactly one of mobile or email');
    return _client.post<RequestOtpResult>(
      '/api/v1/auth/otp/request',
      body: {
        if (mobile != null) 'mobile': mobile,
        if (email != null) 'email': email,
        // The mobile app only ever provisions PATIENT accounts — the other
        // roles this endpoint accepts are for the staff/partner web portals.
        'role': 'PATIENT',
      },
      decode: (json) => RequestOtpResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<VerifyOtpResult> verifyOtp({
    required String requestId,
    required String otp,
    required bool acceptedTerms,
    String? name,
  }) {
    return _client.post<VerifyOtpResult>(
      '/api/v1/auth/otp/verify',
      body: {
        'requestId': requestId,
        'otp': otp,
        'acceptedTerms': acceptedTerms,
        if (name != null) 'name': name,
      },
      decode: (json) => VerifyOtpResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<SessionUser?> me() async {
    try {
      return await _client.get<SessionUser>(
        '/api/v1/auth/me',
        decode: (json) => SessionUser.fromJson((json as Map<String, dynamic>)['user'] as Map<String, dynamic>),
      );
    } on ApiException catch (e) {
      if (e.isUnauthorized) return null;
      rethrow;
    }
  }

  @override
  Future<void> logout() async {
    await _client.post<void>('/api/v1/auth/logout', decode: (_) {});
    await _client.clearSession();
  }

  @override
  Stream<void> get onUnauthorized => _client.onUnauthorized;
}
