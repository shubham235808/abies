import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';

/// Talks to the existing `/api/v1/auth/*` routes only. Same shape as
/// apps/mobile's `AuthApi`, minus `register` — ops/staff accounts are always
/// admin-provisioned (apps/management-web/src/app/ops/login/page.tsx renders
/// `PasswordAuthFlow` with no `allowSelfRegistration` and no
/// `otpSignupHref`), so this app has no self-registration or OTP-apply path
/// at all. Plus [verifyMfa], which the patient app never needs.
abstract class AuthApi {
  Future<LoginResult> login({String? mobile, String? email, required String password});

  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email});

  Future<SetPasswordResult> completePasswordSetup({
    required String requestId,
    required String otp,
    required String newPassword,
  });

  Future<SetPasswordResult> resetPassword({
    required String requestId,
    required String otp,
    required String newPassword,
  });

  /// `POST /api/v1/auth/mfa/verify` with `{ code }` (verifyMfaSchema: 4-10
  /// chars). Completes an ADMIN session's MFA challenge.
  Future<void> verifyMfa(String code);

  /// Returns null on a 401 — "not signed in yet" is the expected outcome at
  /// app start, not an error to throw.
  Future<MeResult?> me();

  Future<void> logout();

  /// Fires on any 401 from any call this app makes.
  Stream<void> get onUnauthorized;
}

class AuthApiImpl implements AuthApi {
  AuthApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<LoginResult> login({String? mobile, String? email, required String password}) {
    assert((mobile == null) != (email == null), 'pass exactly one of mobile or email');
    return _client.post<LoginResult>(
      '/api/v1/auth/login',
      body: {
        if (mobile != null) 'mobile': mobile,
        if (email != null) 'email': email,
        'password': password,
      },
      decode: (json) => LoginResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email}) {
    assert((mobile == null) != (email == null), 'pass exactly one of mobile or email');
    return _client.post<RequestPasswordResetResult>(
      '/api/v1/auth/password/forgot',
      body: {if (mobile != null) 'mobile': mobile, if (email != null) 'email': email},
      decode: (json) => RequestPasswordResetResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<SetPasswordResult> completePasswordSetup({
    required String requestId,
    required String otp,
    required String newPassword,
  }) {
    return _client.post<SetPasswordResult>(
      '/api/v1/auth/password/setup',
      body: {'requestId': requestId, 'otp': otp, 'newPassword': newPassword},
      decode: (json) => SetPasswordResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<SetPasswordResult> resetPassword({
    required String requestId,
    required String otp,
    required String newPassword,
  }) {
    return _client.post<SetPasswordResult>(
      '/api/v1/auth/password/reset',
      body: {'requestId': requestId, 'otp': otp, 'newPassword': newPassword},
      decode: (json) => SetPasswordResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<void> verifyMfa(String code) {
    return _client.post<void>('/api/v1/auth/mfa/verify', body: {'code': code}, decode: (_) {});
  }

  @override
  Future<MeResult?> me() async {
    try {
      return await _client.get<MeResult>(
        '/api/v1/auth/me',
        decode: (json) => MeResult.fromJson(json as Map<String, dynamic>),
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
