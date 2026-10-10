import 'session_user.dart';

/// Matches `LoginResult` from `packages/domain/src/modules/auth/auth.service.ts`
/// (`login()`, ~line 256). An account with no password yet (e.g. one created
/// through the OTP "Apply" flow below) isn't a login failure — it's
/// [requiresPasswordSetup], carrying the account's [mobile] so the caller can
/// drive `POST /auth/password/forgot` then `POST /auth/password/setup`.
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

  /// Admin-only MFA (`MFA_CAPABLE_ROLES` in auth.service.ts) — a PHARMACY
  /// session never carries it. Surfaced as an error if ever true rather than
  /// silently ignored.
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

/// `POST /api/v1/auth/password/forgot` — same response whether or not the
/// account exists.
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

/// Shared response shape of `POST /auth/password/setup` and
/// `POST /auth/password/reset` — both sign the caller into a fresh session.
class SetPasswordResult {
  const SetPasswordResult({required this.user});

  final SessionUser user;

  factory SetPasswordResult.fromJson(Map<String, dynamic> json) {
    return SetPasswordResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}

/// `POST /api/v1/auth/otp/request` — `RequestOtpResult` in auth.service.ts
/// (~line 33). [isNewAccount] drives whether the verify step asks for a
/// name; [devOtp] is only ever present on a non-locked-down deployment with
/// `EXPOSE_DEV_OTP` on, and is used to pre-fill the code field exactly like
/// the web `LoginFlow` does.
class RequestOtpResult {
  const RequestOtpResult({
    required this.requestId,
    required this.expiresInSeconds,
    required this.isNewAccount,
    this.devOtp,
  });

  final String requestId;
  final int expiresInSeconds;
  final bool isNewAccount;
  final String? devOtp;

  factory RequestOtpResult.fromJson(Map<String, dynamic> json) {
    return RequestOtpResult(
      requestId: json['requestId'] as String,
      expiresInSeconds: json['expiresInSeconds'] as int,
      isNewAccount: json['isNewAccount'] as bool? ?? false,
      devOtp: json['devOtp'] as String?,
    );
  }
}

/// `POST /api/v1/auth/otp/verify` — the route returns
/// `{ user: session.user, mfaRequired }` and sets the session cookie.
class VerifyOtpResult {
  const VerifyOtpResult({required this.user, required this.mfaRequired});

  final SessionUser user;
  final bool mfaRequired;

  factory VerifyOtpResult.fromJson(Map<String, dynamic> json) {
    return VerifyOtpResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      mfaRequired: json['mfaRequired'] as bool? ?? false,
    );
  }
}
