import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../data/auth_api.dart';
import '../domain/session_user.dart';

/// The only role this app serves. `POST /auth/login` itself accepts any
/// role's credentials (auth.service.ts `login()` never checks role), and
/// every `/api/v1/pharmacies/me/*` route enforces `requireRole(ctx,
/// 'PHARMACY')` server-side — so the client-side check here is UX, not
/// security: it stops a patient/doctor who signs in here from landing on a
/// dashboard where every call 403s.
const pharmacyRole = 'PHARMACY';

const wrongRoleMessage =
    'This app is for ABIES pharmacy partners. Your account is registered for a different role — please use the matching ABIES app or portal.';

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

/// Are we signed in, and as whom. Built from `GET /api/v1/auth/me` — the
/// backend session cookie (persisted in the secure cookie jar, so the
/// session survives an app restart) is the source of truth.
class AuthController extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final api = ref.watch(authApiProvider);
    final subscription = api.onUnauthorized.listen((_) {
      state = const AsyncValue.data(AuthState.signedOut());
    });
    ref.onDispose(subscription.cancel);

    final user = await api.me();
    // A leftover session for some other role is treated as signed-out:
    // nothing in this app works for it.
    if (user == null || user.role != pharmacyRole) return const AuthState.signedOut();
    return AuthState.signedIn(user);
  }

  /// Called after any successful authentication (password login, password
  /// setup/reset, OTP apply). Returns null on success, or a user-facing
  /// error when the account isn't a pharmacy — in which case the
  /// just-created session is revoked server-side so it doesn't linger.
  Future<String?> acceptSession(SessionUser user) async {
    if (user.role != pharmacyRole) {
      try {
        await ref.read(authApiProvider).logout();
      } catch (_) {
        // Best effort — the session is unusable in this app either way.
      }
      state = const AsyncValue.data(AuthState.signedOut());
      return wrongRoleMessage;
    }
    state = AsyncValue.data(AuthState.signedIn(user));
    return null;
  }

  /// Same rule as apps/mobile: local state only drops after the backend has
  /// confirmed the session is revoked — a failed logout throws to the
  /// caller rather than leaving a still-valid session the user can't reach.
  Future<void> signOut() async {
    await ref.read(authApiProvider).logout();
    state = const AsyncValue.data(AuthState.signedOut());
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
