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
  final bool isNewAccount;
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

/// The OTP-based "Apply as a Panchakarma centre" flow — the mobile
/// equivalent of apps/partner-web/src/app/partner/login/apply/page.tsx
/// (`LoginFlow` with the PANCHAKARMA_CENTRE role):
///
/// 1. `POST /api/v1/auth/otp/request` `{mobile|email, role: PANCHAKARMA_CENTRE}`.
///    The backend (auth.service.ts `requestOtp`) refuses with 403 unless the
///    account already is a centre, or `ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING`
///    is on for a brand-new number.
/// 2. `POST /api/v1/auth/otp/verify` `{requestId, otp, acceptedTerms, name?}` —
///    creates the account on verify when it's new (name required, min 2
///    chars), and sets the session cookie.
///
/// A freshly created centre lands on a DRAFT `PanchakarmaCentre` profile
/// (`ensureCentreProfile`) and completes/submits it from the Profile tab.
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

  /// Returns true once signed in as a centre. On any failure (validation,
  /// wrong code, wrong role) returns false with [ApplyState.error] set.
  Future<bool> verify({required String otp, required bool acceptedTerms, String? name}) async {
    final requestId = state.requestId;
    if (state.step != ApplyStep.otp || requestId == null) return false;
    final validation = validateVerifyInput(otp: otp, acceptedTerms: acceptedTerms, name: name, isNewAccount: state.isNewAccount);
    if (validation != null) {
      state = state.copyWith(error: validation);
      return false;
    }
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final result = await ref.read(authApiProvider).verifyOtp(
            requestId: requestId,
            otp: otp.trim(),
            acceptedTerms: acceptedTerms,
            name: state.isNewAccount ? name!.trim() : null,
          );
      if (result.mfaRequired) {
        state = state.copyWith(submitting: false, error: 'This account requires additional verification not supported in this app.');
        return false;
      }
      final refused = await ref.read(authControllerProvider.notifier).acceptAuthenticated(result.user);
      if (refused != null) {
        state = state.copyWith(submitting: false, error: refused);
        return false;
      }
      // No further state write on success: signing in makes the router
      // leave `/apply`, which disposes this auto-dispose controller.
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
      return false;
    }
  }

  void back() => state = const ApplyState();
}

/// Mirrors the web `OtpStepForm` schema: otp 4-8 chars, terms must be
/// accepted, and a name (min 2 chars) only when the account is new.
String? validateVerifyInput({required String otp, required bool acceptedTerms, String? name, required bool isNewAccount}) {
  final code = otp.trim();
  if (code.length < 4 || code.length > 8) return 'Enter the code you received';
  if (isNewAccount && (name == null || name.trim().length < 2)) return 'Enter your full name';
  if (!acceptedTerms) return 'You must accept the Terms and Privacy Notice to continue';
  return null;
}

final applyControllerProvider = AutoDisposeNotifierProvider<ApplyController, ApplyState>(ApplyController.new);
