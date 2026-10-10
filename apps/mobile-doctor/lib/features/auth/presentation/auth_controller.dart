import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../data/auth_api.dart';
import '../domain/session_user.dart';

enum AuthStatusKind { signedOut, signedIn }

class AuthState {
  const AuthState._(this.kind, this.user);

  const AuthState.signedOut() : this._(AuthStatusKind.signedOut, null);
  const AuthState.signedIn(SessionUser user) : this._(AuthStatusKind.signedIn, user);

  final AuthStatusKind kind;
  final SessionUser? user;

  bool get isSignedIn => kind == AuthStatusKind.signedIn;
}

final authApiProvider = Provider<AuthApi>((ref) => AuthApiImpl(ref.watch(apiClientProvider)));

/// Shown when a valid ABIES session belongs to a non-DOCTOR account.
const wrongRoleMessage =
    'This app is for ABIES doctors only. Patients can use the ABIES Ayurveda app; '
    'labs, pharmacies and Panchakarma centres can use the partner portal at abies.in.';

/// Are we signed in, and as which doctor. Built from `GET /api/v1/auth/me` —
/// the backend's session cookie is the source of truth, same as apps/mobile.
///
/// Doctor-specific rule: a session whose role isn't DOCTOR is never treated
/// as signed in here, because every doctor route this app calls is
/// `requireRole(ctx, 'DOCTOR')` server-side and would just 403. Such a
/// session is logged out (best-effort) so it doesn't linger in this app's
/// cookie jar.
class AuthController extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final api = ref.watch(authApiProvider);
    final subscription = api.onUnauthorized.listen((_) {
      state = const AsyncValue.data(AuthState.signedOut());
    });
    ref.onDispose(subscription.cancel);

    final user = await api.me();
    if (user == null) return const AuthState.signedOut();
    if (!user.isDoctor) {
      await _bestEffortLogout(api);
      return const AuthState.signedOut();
    }
    return AuthState.signedIn(user);
  }

  /// Called right after any successful authentication call (password login,
  /// OTP verify, password setup/reset) — the backend already set the cookie;
  /// this updates in-memory state so the router's redirect reacts. Returns
  /// false (and drops the session) when [user] isn't a DOCTOR.
  Future<bool> onVerified(SessionUser user) async {
    if (!user.isDoctor) {
      await _bestEffortLogout(ref.read(authApiProvider));
      state = const AsyncValue.data(AuthState.signedOut());
      return false;
    }
    state = AsyncValue.data(AuthState.signedIn(user));
    return true;
  }

  Future<void> signOut() async {
    await ref.read(authApiProvider).logout();
    state = const AsyncValue.data(AuthState.signedOut());
  }

  Future<void> _bestEffortLogout(AuthApi api) async {
    try {
      await api.logout();
    } catch (_) {
      // Never block the "you're not a doctor" path on a logout failure.
    }
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
