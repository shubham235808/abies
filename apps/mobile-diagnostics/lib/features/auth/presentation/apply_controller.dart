import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/auth_result.dart';
import '../domain/session_user.dart';
import 'auth_controller.dart';

enum ApplyStep { identifier, otp }

class ApplyState {
  const ApplyState({
    this.step = ApplyStep.identifier,
    this.requestId,
    this.devOtp,
    this.isNewAccount = false,
    this.submitting = false,
    this.error,
  });

  final ApplyStep step;
  final String? requestId;
  final String? devOtp;
  final bool isNewAccount;
  final bool submitting;
  final String? error;

  ApplyState copyWith({
    ApplyStep? step,
    String? requestId,
    String? devOtp,
    bool? isNewAccount,
    bool? submitting,
    String? error,
    bool clearError = false,
  }) {
    return ApplyState(
      step: step ?? this.step,
      requestId: requestId ?? this.requestId,
      devOtp: devOtp ?? this.devOtp,
      isNewAccount: isNewAccount ?? this.isNewAccount,
      submitting: submitting ?? this.submitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// The "Apply as a lab" OTP flow — a mobile port of the web
/// `LoginFlow` (packages/design-system/src/components/auth/login-flow.tsx)
/// as used by apps/partner-web/src/app/partner/login/apply/page.tsx,
/// pinned to the single role [kLabRole]:
///
/// 1. `POST /api/v1/auth/otp/request {mobile|email, role: 'LAB'}`. Server
///    (auth.service.ts `requestOtp`, lines ~64-71): an unknown number is
///    accepted only when `ALLOW_LAB_SELF_ONBOARDING` is on (otherwise 403
///    "This account is not enabled for the selected role"); an existing
///    account with a different role is always 403.
/// 2. `POST /api/v1/auth/otp/verify {requestId, otp, acceptedTerms, name?}`.
///    For a new account the server creates a LAB user (`verifyOtp`, lines
///    ~170-185) and requires a name of at least 2 characters. The response
///    sets the session cookie.
///
/// The new lab lands in `DRAFT` verification status — the dashboard then
/// walks them through profile + submit, same as the web overview page.
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
        devOtp: result.devOtp,
        isNewAccount: result.isNewAccount,
      );
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
    }
  }

  /// Returns the signed-in user on success, null on failure (with
  /// [ApplyState.error] set). Client-side checks mirror the web form's zod
  /// schema so an obviously-invalid submit never reaches the server.
  Future<SessionUser?> verify({required String otp, required bool acceptedTerms, String? name}) async {
    final requestId = state.requestId;
    if (requestId == null) return null;
    if (!acceptedTerms) {
      state = state.copyWith(error: 'You must accept the Terms and Privacy Notice to continue');
      return null;
    }
    if (state.isNewAccount && (name == null || name.trim().length < 2)) {
      state = state.copyWith(error: 'Enter your full name');
      return null;
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
        return null;
      }
      state = state.copyWith(submitting: false);
      return result.user;
    } on ApiException catch (e) {
      state = state.copyWith(submitting: false, error: e.message);
      return null;
    }
  }

  void reportError(String message) {
    state = state.copyWith(submitting: false, error: message);
  }

  void backToIdentifier() {
    state = const ApplyState();
  }
}

final applyControllerProvider = AutoDisposeNotifierProvider<ApplyController, ApplyState>(ApplyController.new);
