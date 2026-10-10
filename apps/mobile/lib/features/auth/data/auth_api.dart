import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';
import '../domain/session_user.dart';

/// Talks to the existing `/api/v1/auth/*` routes only — nothing here invents
/// an endpoint (docs/mobile/CURRENT-BACKEND-API.md §3). Behind an interface
/// so [AuthController] is unit-testable with a fake, with no real `ApiClient`.
///
/// Password-first (docs/password-auth-backend.md): [login]/[register] are
/// the primary sign-in path. OTP survives only inside [requestPasswordReset]
/// / [completePasswordSetup] / [resetPassword] — proving control of the
/// account's mobile number before a password is set or changed — never as a
/// user-facing "sign in with a code" option in this app any more.
abstract class AuthApi {
  Future<LoginResult> login({String? mobile, String? email, required String password});

  Future<RegisterResult> register({
    required String name,
    required String mobile,
    required String email,
    required String password,
  });

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
  Future<RegisterResult> register({
    required String name,
    required String mobile,
    required String email,
    required String password,
  }) {
    return _client.post<RegisterResult>(
      '/api/v1/auth/register',
      body: {'name': name, 'mobile': mobile, 'email': email, 'password': password},
      decode: (json) => RegisterResult.fromJson(json as Map<String, dynamic>),
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
