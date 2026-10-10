import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';
import '../domain/session_user.dart';

/// Talks to the existing `/api/v1/auth/*` routes only. Same shape as
/// apps/mobile's `AuthApi`, with two differences for a partner app:
///
/// - No `register()`: `POST /auth/register` always creates a PATIENT
///   (auth.schemas.ts `registerSchema` — "Role is never accepted from the
///   request body"), so it can never create a pharmacy account.
/// - [requestOtp]/[verifyOtp] are back: the OTP create-account-on-verify flow
///   is the *only* way a brand-new pharmacy self-onboards (when
///   `ALLOW_PHARMACY_SELF_ONBOARDING` is on — packages/domain/src/lib/env.ts
///   line 77, enforced in auth.service.ts `requestOtp`/`verifyOtp`). Mirrors
///   apps/partner-web/src/app/partner/login/apply/page.tsx.
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

  /// Always sent with `role: 'PHARMACY'` from this app.
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, required String role});

  /// [name] is required by the server only when this verify creates the
  /// account (`isNewAccount` from [requestOtp]).
  Future<VerifyOtpResult> verifyOtp({
    required String requestId,
    required String otp,
    required bool acceptedTerms,
    String? name,
  });

  /// Returns null on a 401 — "not signed in yet" is the expected outcome at
  /// app start, not an error.
  Future<SessionUser?> me();

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
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, required String role}) {
    assert((mobile == null) != (email == null), 'pass exactly one of mobile or email');
    return _client.post<RequestOtpResult>(
      '/api/v1/auth/otp/request',
      body: {
        if (mobile != null) 'mobile': mobile,
        if (email != null) 'email': email,
        'role': role,
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
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
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
