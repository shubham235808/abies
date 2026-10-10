import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import 'auth_controller.dart';
import 'sign_in_controller.dart';

enum ApplyStep { identifier, otp, done }

/// State of the OTP-based "Apply as a doctor" flow — the mobile port of the
/// web `LoginFlow` used by apps/partner-web/src/app/partner/login/apply/
/// page.tsx, restricted to the DOCTOR role.
class DoctorApplyState {
  const DoctorApplyState({
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

  DoctorApplyState copyWith({
    ApplyStep? step,
    String? requestId,
    bool? isNewAccount,
    String? devOtp,
    bool? submitting,
    String? error,
    bool clearError = false,
  }) {
    return DoctorApplyState(
      step: step ?? this.step,
      requestId: requestId ?? this.requestId,
      isNewAccount: isNewAccount ?? this.isNewAccount,
      devOtp: devOtp ?? this.devOtp,
      submitting: submitting ?? this.submitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class DoctorApplyController extends AutoDisposeNotifier<DoctorApplyState> {
  @override
  DoctorApplyState build() => const DoctorApplyState();

  /// `POST /api/v1/auth/otp/request` with `role: 'DOCTOR'`.
  Future<void> requestCode(String identifier) async {
    state = state.copyWith(submitting: true, clearError: true);
    final id = splitIdentifier(identifier);
    try {
      final result = await ref.read(authApiProvider).requestOtp(mobile: id.mobile, email: id.email);
      state = DoctorApplyState(
        step: ApplyStep.otp,
        requestId: result.requestId,
        isNewAccount: result.isNewAccount,
        devOtp: result.devOtp,
      );
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
    }
  }

  /// `POST /api/v1/auth/otp/verify`. A brand-new account must send a name
  /// (auth.service.ts rejects one shorter than 2 chars) and accept terms
  /// (rejected outright otherwise). Returns true once signed in as a DOCTOR.
  Future<bool> verify({required String otp, required bool acceptedTerms, String? name}) async {
    if (!acceptedTerms) {
      state = state.copyWith(error: 'You must accept the Terms and Privacy Notice to continue');
      return false;
    }
    final trimmedName = name?.trim();
    if (state.isNewAccount && (trimmedName == null || trimmedName.length < 2)) {
      state = state.copyWith(error: 'Enter your full name');
      return false;
    }
    state = state.copyWith(submitting: true, clearError: true);
    try {
      final result = await ref.read(authApiProvider).verifyOtp(
            requestId: state.requestId!,
            otp: otp.trim(),
            acceptedTerms: acceptedTerms,
            name: state.isNewAccount ? trimmedName : null,
          );
      if (result.mfaRequired) {
        state = state.copyWith(submitting: false, error: 'This account requires additional verification not supported in this app.');
        return false;
      }
      final outcome = await ref.read(signInControllerProvider).completeVerified(result.user);
      if (outcome is SignInFailed) {
        state = state.copyWith(submitting: false, error: outcome.message);
        return false;
      }
      state = state.copyWith(step: ApplyStep.done, submitting: false);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
      return false;
    }
  }

  void back() => state = const DoctorApplyState();
}

final doctorApplyControllerProvider =
    AutoDisposeNotifierProvider<DoctorApplyController, DoctorApplyState>(DoctorApplyController.new);
