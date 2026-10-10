import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';

enum ApplyStep { identifier, otp }

class ApplyState {
  const ApplyState({
    this.step = ApplyStep.identifier,
    this.requestId,
    this.isNewAccount = false,
    this.devOtp,
    this.submitting = false,
    this.error,
  });

  final ApplyStep step;
  final String? requestId;

  /// From `POST /auth/otp/request` — true means verifying will *create* the
  /// account, so the server requires a name (auth.service.ts `verifyOtp`:
  /// "Enter your name to create your account").
  final bool isNewAccount;

  /// Dev-mode code (only present when the backend has `EXPOSE_DEV_OTP` on and
  /// isn't a locked-down deployment) — pre-fills the code field, same as the
  /// web `LoginFlow`.
  final String? devOtp;
  final bool submitting;
  final String? error;

  ApplyState copyWith({
    ApplyStep? step,
    String? requestId,
    bool? isNewAccount,
    String? devOtp,
    bool? submitting,
    String? error,
    bool clearError = false,
  }) {
    return ApplyState(
      step: step ?? this.step,
      requestId: requestId ?? this.requestId,
      isNewAccount: isNewAccount ?? this.isNewAccount,
      devOtp: devOtp ?? this.devOtp,
      submitting: submitting ?? this.submitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// The OTP "Apply as a pharmacy partner" flow — the mobile counterpart of
/// apps/partner-web/src/app/partner/login/apply/page.tsx (`LoginFlow` with
/// the role fixed to PHARMACY, since this app serves one role only).
///
/// `POST /api/v1/auth/otp/request` `{mobile|email, role: 'PHARMACY'}` then
/// `POST /api/v1/auth/otp/verify` `{requestId, otp, acceptedTerms, name?}`.
/// Where `ALLOW_PHARMACY_SELF_ONBOARDING` is off, the request step fails with
/// the server's own "This account is not enabled for the selected role"
/// (403) for an unknown number — surfaced verbatim, never guessed around.
/// An *existing* pharmacy account can also sign in through here (the server
/// allows it regardless of the flag), which is how an account with no
/// password yet gets in without the password-setup detour.
class ApplyController extends AutoDisposeNotifier<ApplyState> {
  @override
  ApplyState build() => const ApplyState();

  Future<void> requestCode(String identifier) async {
    final trimmed = identifier.trim();
    final isEmail = trimmed.contains('@');
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final result = await ref.read(authApiProvider).requestOtp(
            mobile: isEmail ? null : trimmed,
            email: isEmail ? trimmed : null,
            role: pharmacyRole,
          );
      state = ApplyState(
        step: ApplyStep.otp,
        requestId: result.requestId,
        isNewAccount: result.isNewAccount,
        devOtp: result.devOtp,
      );
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
    }
  }

  /// Returns true once signed in as a pharmacy (the caller navigates home).
  Future<bool> verify({required String otp, required bool acceptedTerms, String? name}) async {
    final requestId = state.requestId;
    if (requestId == null) return false;
    if (!acceptedTerms) {
      state = state.copyWith(error: 'You must accept the Terms and Privacy Notice to continue');
      return false;
    }
    if (state.isNewAccount && (name == null || name.trim().length < 2)) {
      state = state.copyWith(error: 'Enter your full name to create your account');
      return false;
    }
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final result = await ref.read(authApiProvider).verifyOtp(
            requestId: requestId,
            otp: otp.trim(),
            acceptedTerms: acceptedTerms,
            name: state.isNewAccount ? name : null,
          );
      if (result.mfaRequired) {
        state = state.copyWith(submitting: false, error: 'This account requires additional verification not supported in this app.');
        return false;
      }
      final roleError = await ref.read(authControllerProvider.notifier).acceptSession(result.user);
      if (roleError != null) {
        state = state.copyWith(submitting: false, error: roleError);
        return false;
      }
      state = state.copyWith(submitting: false);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
      return false;
    }
  }

  void back() => state = const ApplyState();
}

final applyControllerProvider = NotifierProvider.autoDispose<ApplyController, ApplyState>(ApplyController.new);
