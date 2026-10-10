import 'session_user.dart';

/// Matches `LoginResult` from `packages/domain/src/modules/auth/auth.service.ts`.
/// A legacy OTP-only account (`passwordHash` never set) isn't a login
/// failure — it's [requiresPasswordSetup], carrying the account's [mobile]
/// so the caller can drive `POST /auth/password/forgot` then
/// `POST /auth/password/setup` without asking the visitor to type their
/// identifier a second time.
class LoginResult {
  const LoginResult.needsPasswordSetup(this.mobile)
      : requiresPasswordSetup = true,
        user = null,
        mfaRequired = false;

  const LoginResult.authenticated({required this.user, required this.mfaRequired})
      : requiresPasswordSetup = false,
        mobile = null;

  final bool requiresPasswordSetup;
  final String? mobile;
  final SessionUser? user;
  /// Admin MFA, not a patient-app concern — the mobile app only ever
  /// authenticates as PATIENT, which never has `mfaEnabled`. Surfaced as an
  /// error if ever unexpectedly true rather than silently ignored, same
  /// policy as the old OTP flow's `VerifyOtpResult.mfaRequired`.
  final bool mfaRequired;

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    if (json['requiresPasswordSetup'] as bool) {
      return LoginResult.needsPasswordSetup(json['mobile'] as String);
    }
    return LoginResult.authenticated(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      mfaRequired: json['mfaRequired'] as bool,
    );
  }
}

/// `POST /api/v1/auth/register` — always creates a PATIENT account with a
/// password already set, so there is no `mfaRequired` here at all (only an
/// ADMIN session ever carries one, and register() never creates one).
class RegisterResult {
  const RegisterResult({required this.user});

  final SessionUser user;

  factory RegisterResult.fromJson(Map<String, dynamic> json) {
    return RegisterResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}

/// `POST /api/v1/auth/password/forgot` — same shape, and same "always
/// succeeds" response, whether or not the account exists
/// (auth.service.ts's `requestPasswordReset`); never carries a `devOtp`
/// the way the old OTP-request result did.
class RequestPasswordResetResult {
  const RequestPasswordResetResult({required this.requestId, required this.expiresInSeconds});

  final String requestId;
  final int expiresInSeconds;

  factory RequestPasswordResetResult.fromJson(Map<String, dynamic> json) {
    return RequestPasswordResetResult(
      requestId: json['requestId'] as String,
      expiresInSeconds: json['expiresInSeconds'] as int,
    );
  }
}

/// Shared response shape of `POST /api/v1/auth/password/setup` (forced
/// first-time setup) and `POST /api/v1/auth/password/reset` (voluntary
/// forgot-password) — both sign the caller into a fresh session.
class SetPasswordResult {
  const SetPasswordResult({required this.user});

  final SessionUser user;

  factory SetPasswordResult.fromJson(Map<String, dynamic> json) {
    return SetPasswordResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}
