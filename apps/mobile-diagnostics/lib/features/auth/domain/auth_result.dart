import 'session_user.dart';

/// The only role this app signs in as. `/api/v1/labs/me/*` all call
/// `requireRole(ctx, 'LAB')` (e.g. apps/platform-api/src/app/api/v1/labs/me/
/// orders/route.ts) — an ADMIN session, which the web lab portal also
/// admits, would 403 on every screen here, so it's rejected at sign-in.
const kLabRole = 'LAB';

/// Matches `LoginResult` from `packages/domain/src/modules/auth/auth.service.ts`
/// as serialized by `apps/platform-api/src/app/api/v1/auth/login/route.ts`.
/// A legacy OTP-only account (`passwordHash` never set) isn't a login
/// failure — it's [requiresPasswordSetup], carrying the account's [mobile]
/// so the caller can drive `POST /auth/password/forgot` then
/// `POST /auth/password/setup` without retyping the identifier.
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
  /// auth.service.ts) — a LAB session never has it. Surfaced as an error if
  /// ever unexpectedly true rather than silently ignored.
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
/// first-time setup) and `POST /api/v1/auth/password/reset` — both sign the
/// caller into a fresh session.
class SetPasswordResult {
  const SetPasswordResult({required this.user});

  final SessionUser user;

  factory SetPasswordResult.fromJson(Map<String, dynamic> json) {
    return SetPasswordResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}

/// `POST /api/v1/auth/otp/request` — `RequestOtpResult` in auth.service.ts.
/// [isNewAccount] means verifying will *create* the LAB account (only
/// possible when `ALLOW_LAB_SELF_ONBOARDING` is on server-side), so the
/// verify step must ask for a name. [devOtp] is present only on a
/// non-locked-down deployment with `EXPOSE_DEV_OTP` set.
class RequestOtpResult {
  const RequestOtpResult({required this.requestId, required this.expiresInSeconds, required this.isNewAccount, this.devOtp});

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

/// `POST /api/v1/auth/otp/verify` — `{ user, mfaRequired }`
/// (apps/platform-api/src/app/api/v1/auth/otp/verify/route.ts). The
/// session cookie arrives on the same response.
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
