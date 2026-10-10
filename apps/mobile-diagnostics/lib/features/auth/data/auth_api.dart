import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';
import '../domain/session_user.dart';

/// Talks to the existing `/api/v1/auth/*` routes only. Behind an interface
/// so [AuthController] and the apply flow are unit-testable with a fake.
///
/// Mirrors apps/mobile's `AuthApi` (password-first) plus [requestOtp] /
/// [verifyOtp], which the patient app dropped but a lab still needs: the
/// partner portal's "Apply as a lab" path
/// (apps/partner-web/src/app/partner/login/apply/page.tsx) creates a LAB
/// account by OTP when `ALLOW_LAB_SELF_ONBOARDING` is on, because
/// `POST /auth/register` only ever creates a PATIENT. There is no
/// `register()` here for that reason.
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

  /// `role` is always [kLabRole] from this app. Server-side
  /// (auth.service.ts `requestOtp`): an unknown number is only allowed when
  /// `ALLOW_LAB_SELF_ONBOARDING` is on; a number already registered under a
  /// different role is always a 403.
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, String role = kLabRole});

  /// [name] is required by the server only when this verify creates the
  /// account (`isNewAccount` from [requestOtp]); [acceptedTerms] must be true.
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
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, String role = kLabRole}) {
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
