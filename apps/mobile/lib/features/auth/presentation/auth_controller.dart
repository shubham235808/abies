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

/// The one piece of state the whole app needs: are we signed in, and as whom.
/// Built by calling `GET /api/v1/auth/me` — the backend's session cookie is
/// the source of truth; this never guesses "probably still signed in" from
/// local storage alone (docs/mobile/MOBILE-ARCHITECTURE.md §3).
class AuthController extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final api = ref.watch(authApiProvider);
    // A 401 on any call means the session is gone server-side — drop to
    // signed-out immediately, never keep showing signed-in UI past that.
    final subscription = api.onUnauthorized.listen((_) {
      state = const AsyncValue.data(AuthState.signedOut());
    });
    ref.onDispose(subscription.cancel);

    final user = await api.me();
    return user == null ? const AuthState.signedOut() : AuthState.signedIn(user);
  }

  /// Called by the OTP screen right after a successful verify — the backend
  /// already set the session cookie; this just updates in-memory state so
  /// the router's redirect (lib/core/router/app_router.dart) reacts.
  void onVerified(SessionUser user) {
    state = AsyncValue.data(AuthState.signedIn(user));
  }

  Future<void> signOut() async {
    await ref.read(authApiProvider).logout();
    state = const AsyncValue.data(AuthState.signedOut());
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
