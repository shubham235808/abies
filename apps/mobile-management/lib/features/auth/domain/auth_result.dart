import 'session_user.dart';

/// `POST /api/v1/auth/login` (apps/platform-api/src/app/api/v1/auth/login/
/// route.ts). A legacy account with no password yet isn't a login failure —
/// it's [requiresPasswordSetup], carrying the account's [mobile] so the
/// caller can drive `POST /auth/password/forgot` then `/auth/password/setup`.
///
/// Unlike the patient app, [mfaRequired] is a real, expected outcome here:
/// an ADMIN session starts `mfaVerified=false` when admin MFA is enforced
/// (packages/domain/src/server/session.ts), and the app routes to the MFA
/// step instead of treating it as an error — same as the web
/// `PasswordAuthFlow`'s `mfa` step.
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

/// `GET /api/v1/auth/me` returns `{ user, mfaVerified }`
/// (apps/platform-api/src/app/api/v1/auth/me/route.ts:9).
class MeResult {
  const MeResult({required this.user, required this.mfaVerified});

  final SessionUser user;
  final bool mfaVerified;

  factory MeResult.fromJson(Map<String, dynamic> json) {
    return MeResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      mfaVerified: json['mfaVerified'] as bool? ?? true,
    );
  }
}

/// `POST /api/v1/auth/password/forgot` — same generic response whether or
/// not the account exists.
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

/// Shared response of `POST /auth/password/setup` and `/auth/password/reset`
/// — both sign the caller into a fresh session.
class SetPasswordResult {
  const SetPasswordResult({required this.user});

  final SessionUser user;

  factory SetPasswordResult.fromJson(Map<String, dynamic> json) {
    return SetPasswordResult(user: SessionUser.fromJson(json['user'] as Map<String, dynamic>));
  }
}
