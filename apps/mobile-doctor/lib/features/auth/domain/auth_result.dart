import 'session_user.dart';

/// Matches `LoginResult` from `packages/domain/src/modules/auth/auth.service.ts`
/// (`login()`, ~line 257). An OTP-only account (`passwordHash` never set —
/// e.g. a doctor who self-onboarded via the OTP apply flow) isn't a login
/// failure — it's [requiresPasswordSetup], carrying the account's [mobile]
/// so the caller can drive `POST /auth/password/forgot` then
/// `POST /auth/password/setup` without asking for the identifier again.
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

  /// Admin MFA only (`MFA_CAPABLE_ROLES` = ADMIN/SUPER_ADMIN/FINANCE in
  /// auth.service.ts) — a DOCTOR session never carries it. Surfaced as an
  /// error if ever unexpectedly true rather than silently ignored.
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

/// `POST /api/v1/auth/otp/request` — `RequestOtpResult` in auth.service.ts.
/// Used only by the "Apply as a doctor" flow in this app (the patient app
/// dropped OTP sign-in entirely; partner self-onboarding still needs it,
/// since `register()` only ever creates PATIENT — see
/// apps/partner-web/src/app/partner/login/apply/page.tsx).
class RequestOtpResult {
  const RequestOtpResult({
    required this.requestId,
    required this.expiresInSeconds,
    required this.isNewAccount,
    this.devOtp,
  });

  final String requestId;
  final int expiresInSeconds;

  /// True when no account exists for this mobile yet — the verify step must
  /// then send a `name` (auth.service.ts `verifyOtp` rejects without one).
  final bool isNewAccount;

  /// Only present when the backend runs with `EXPOSE_DEV_OTP` (dev/UAT).
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

/// `POST /api/v1/auth/password/forgot` — same "always succeeds" response
/// whether or not the account exists (auth.service.ts `requestPasswordReset`).
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
