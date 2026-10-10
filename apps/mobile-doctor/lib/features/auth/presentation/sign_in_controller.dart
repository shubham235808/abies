import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/session_user.dart';
import 'auth_controller.dart';

/// What one password sign-in attempt resolved to — kept out of the widget so
/// the whole decision tree is unit-testable (test/unit/sign_in_controller_test.dart).
sealed class SignInOutcome {
  const SignInOutcome();
}

class SignedIn extends SignInOutcome {
  const SignedIn(this.user);
  final SessionUser user;
}

/// An account with no password yet (e.g. a doctor who self-onboarded via
/// OTP) — `POST /auth/password/forgot` has already been sent for it, so the
/// caller just navigates to `/password-setup` with these two values.
class NeedsPasswordSetup extends SignInOutcome {
  const NeedsPasswordSetup({required this.requestId, required this.mobile});
  final String requestId;
  final String mobile;
}

class SignInFailed extends SignInOutcome {
  const SignInFailed(this.message);
  final String message;
}

/// Parses the single "mobile number or email" field the same way the web
/// `PasswordAuthFlow`/`LoginFlow` do: anything containing `@` is an email.
({String? mobile, String? email}) splitIdentifier(String raw) {
  final identifier = raw.trim();
  return identifier.contains('@') ? (mobile: null, email: identifier) : (mobile: identifier, email: null);
}

class SignInController {
  SignInController(this._ref);

  final Ref _ref;

  Future<SignInOutcome> signIn({required String identifier, required String password}) async {
    final api = _ref.read(authApiProvider);
    final id = splitIdentifier(identifier);
    try {
      final result = await api.login(mobile: id.mobile, email: id.email, password: password);
      if (result.requiresPasswordSetup) {
        final reset = await api.requestPasswordReset(mobile: result.mobile);
        return NeedsPasswordSetup(requestId: reset.requestId, mobile: result.mobile!);
      }
      if (result.mfaRequired) {
        return const SignInFailed('This account requires additional verification not supported in this app.');
      }
      return await completeVerified(result.user!);
    } on ApiException catch (e) {
      return SignInFailed(e.message);
    }
  }

  /// Shared tail of every successful auth call (also used by password
  /// setup/reset and the OTP apply flow): enforce DOCTOR, update auth state.
  Future<SignInOutcome> completeVerified(SessionUser user) async {
    final accepted = await _ref.read(authControllerProvider.notifier).onVerified(user);
    return accepted ? SignedIn(user) : const SignInFailed(wrongRoleMessage);
  }
}

final signInControllerProvider = Provider<SignInController>((ref) => SignInController(ref));
