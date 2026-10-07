import 'session_user.dart';

/// Matches `RequestOtpResult` from `packages/domain/src/modules/auth/auth.service.ts`.
class RequestOtpResult {
  const RequestOtpResult({required this.requestId, required this.expiresInSeconds, required this.isNewAccount, this.devOtp});

  final String requestId;
  final int expiresInSeconds;
  /// True when there's no account yet for this identifier — the OTP screen
  /// asks for a name in that case, matching the backend's own requirement
  /// (`verifyOtp` rejects a new account with no name).
  final bool isNewAccount;
  /// Only present outside production (`EXPOSE_DEV_OTP`) — see this repo's
  /// seeded test accounts. Never rely on this being present in a real build.
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

/// Matches the JSON body of `POST /api/v1/auth/otp/verify`
/// (`{ user, mfaRequired }` — the session token itself arrives only as the
/// `Set-Cookie` header, handled entirely by the API client's cookie jar).
class VerifyOtpResult {
  const VerifyOtpResult({required this.user, required this.mfaRequired});

  final SessionUser user;
  /// Admin MFA, not a patient-app concern (docs/mobile/CURRENT-BACKEND-API.md
  /// §3) — the mobile app only ever authenticates as PATIENT, which never
  /// has `mfaEnabled`. Kept here because the field exists on the real
  /// response; surfaced as an error if it's ever unexpectedly true rather
  /// than silently ignored.
  final bool mfaRequired;

  factory VerifyOtpResult.fromJson(Map<String, dynamic> json) {
    return VerifyOtpResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      mfaRequired: json['mfaRequired'] as bool,
    );
  }
}
