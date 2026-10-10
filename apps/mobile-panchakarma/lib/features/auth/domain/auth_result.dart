import 'session_user.dart';

/// The one role this app serves. `POST /api/v1/auth/login` itself does not
/// check role (auth.service.ts `login()` signs in any account with a valid
/// password), so the app enforces it client-side after every successful
/// authentication — see `AuthController.acceptAuthenticated`.
const centreRole = 'PANCHAKARMA_CENTRE';

/// Matches `LoginResult` from `packages/domain/src/modules/auth/auth.service.ts`
/// as serialized by `apps/platform-api/src/app/api/v1/auth/login/route.ts`.
/// A legacy OTP-only account (`passwordHash` never set) isn't a login
/// failure — it's [requiresPasswordSetup], carrying the account's [mobile]
/// so the caller can drive `POST /auth/password/forgot` then
/// `POST /auth/password/setup`.
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

  /// Admin MFA only (`MFA_CAPABLE_ROLES` in auth.service.ts is
  /// ADMIN/SUPER_ADMIN/FINANCE) — a PANCHAKARMA_CENTRE session never has it.
  /// Surfaced as an error if ever unexpectedly true, never silently ignored.
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
/// whether or not the account exists.
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

/// Shared response shape of `POST /api/v1/auth/password/setup` and
/// `POST /api/v1/auth/password/reset` — both sign the caller into a fresh
/// session.
class SetPasswordResult {
  const SetPasswordResult({required this.user});

  final SessionUser user;

  factory SetPasswordResult.fromJson(Map<String, dynamic> json) {
    return SetPasswordResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}

/// Matches `RequestOtpResult` from auth.service.ts (`requestOtp`). Used only
/// by the centre "Apply" flow — partner self-onboarding is the one path that
/// still creates an account via OTP, since `POST /auth/register` always
/// creates a PATIENT (see apps/partner-web/src/app/partner/login/apply/page.tsx).
class RequestOtpResult {
  const RequestOtpResult({required this.requestId, required this.expiresInSeconds, required this.isNewAccount, this.devOtp});

  final String requestId;
  final int expiresInSeconds;

  /// True when there's no account yet for this identifier — the backend's
  /// `verifyOtp` then requires a name (min 2 chars) to create it.
  final bool isNewAccount;

  /// Only present outside production (`EXPOSE_DEV_OTP`). Never relied on.
  final String? devOtp;

  factory RequestOtpResult.fromJson(Map<String, dynamic> json) {
    return RequestOtpResult(
      requestId: json['requestId'] as String,
      expiresInSeconds: json['expiresInSeconds'] as int,
      isNewAccount: json['isNewAccount'] as bool,
      devOtp: json['devOtp'] as String?,
    );
  }
}

/// `POST /api/v1/auth/otp/verify` body: `{ user, mfaRequired }`. The session
/// token itself arrives only as the `Set-Cookie` header, handled by the
/// API client's cookie jar.
class VerifyOtpResult {
  const VerifyOtpResult({required this.user, required this.mfaRequired});

  final SessionUser user;
  final bool mfaRequired;

  factory VerifyOtpResult.fromJson(Map<String, dynamic> json) {
    return VerifyOtpResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      mfaRequired: json['mfaRequired'] as bool,
    );
  }
}
