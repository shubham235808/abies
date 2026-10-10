import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../data/auth_api.dart';
import '../domain/auth_result.dart';
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

/// Shown when a valid ABIES account that isn't a LAB account signs in here.
const wrongRoleMessage = 'This app is for ABIES diagnostic lab partners. Use the ABIES app or website for other accounts.';

final authApiProvider = Provider<AuthApi>((ref) => AuthApiImpl(ref.watch(apiClientProvider)));

/// Same contract as apps/mobile's `AuthController`: `GET /api/v1/auth/me`
/// (the server's session cookie) is the source of truth, and any 401 drops
/// to signed-out. One addition — a session whose role isn't [kLabRole] is
/// never treated as signed in here, because every lab endpoint would 403 on
/// it; it's logged out server-side instead of left dangling.
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
    if (user.role != kLabRole) {
      await _bestEffortLogout(api);
      return const AuthState.signedOut();
    }
    return AuthState.signedIn(user);
  }

  /// Called right after any successful authentication (password login,
  /// OTP apply/verify, password setup/reset) — the backend already set the
  /// session cookie. Returns false (and revokes that session) when the
  /// account isn't a LAB account; the caller shows [wrongRoleMessage].
  Future<bool> onVerified(SessionUser user) async {
    if (user.role != kLabRole) {
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
      // The session is wrong-role either way; failing to revoke it server-side
      // must not leave the app stuck. It expires on its own.
    }
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);

/// The signed-in user's id, or null. Every lab-data controller watches this
/// so its cached data is dropped and re-fetched whenever the session changes
/// (sign-out, or a different lab signing in on the same device) — never
/// showing one lab's orders under another lab's session.
final sessionUserIdProvider = Provider<String?>((ref) => ref.watch(authControllerProvider).valueOrNull?.user?.id);
