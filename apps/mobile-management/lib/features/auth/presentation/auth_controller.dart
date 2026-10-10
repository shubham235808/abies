import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../data/auth_api.dart';
import '../domain/session_user.dart';

enum AuthStatusKind { signedOut, mfaPending, signedIn }

class AuthState {
  const AuthState._(this.kind, this.user);

  const AuthState.signedOut() : this._(AuthStatusKind.signedOut, null);

  /// Password accepted, session cookie issued, but an ADMIN session still
  /// has `mfaVerified=false` — the router holds the user on `/mfa`.
  const AuthState.mfaPending(SessionUser user) : this._(AuthStatusKind.mfaPending, user);
  const AuthState.signedIn(SessionUser user) : this._(AuthStatusKind.signedIn, user);

  final AuthStatusKind kind;
  final SessionUser? user;

  bool get isSignedIn => kind == AuthStatusKind.signedIn;
  bool get isMfaPending => kind == AuthStatusKind.mfaPending;
}

/// Shown when a real, valid account signs in but isn't one this app serves.
const unsupportedRoleMessage =
    'This app is for ABIES support staff (Customer Support, Technical Support, Sales, Care Coordination, Admin). '
    'Please use the ABIES web portal for this account.';

final authApiProvider = Provider<AuthApi>((ref) => AuthApiImpl(ref.watch(apiClientProvider)));

/// Same contract as apps/mobile's `AuthController`: the backend session
/// cookie is the source of truth, read via `GET /api/v1/auth/me`; a 401 on
/// any call drops straight to signed-out. Two additions for staff accounts:
/// the ADMIN MFA step, and turning away roles that have no support queue
/// (see [supportQueueRoles]) — after revoking the session server-side, so
/// no usable cookie is left behind on the device.
class AuthController extends AsyncNotifier<AuthState> {
  @override
  Future<AuthState> build() async {
    final api = ref.watch(authApiProvider);
    final subscription = api.onUnauthorized.listen((_) {
      state = const AsyncValue.data(AuthState.signedOut());
    });
    ref.onDispose(subscription.cancel);

    final me = await api.me();
    if (me == null) return const AuthState.signedOut();
    if (!supportQueueRoles.contains(me.user.role)) {
      await _revokeQuietly(api);
      return const AuthState.signedOut();
    }
    return me.mfaVerified ? AuthState.signedIn(me.user) : AuthState.mfaPending(me.user);
  }

  /// Called right after `POST /auth/login` returned an authenticated
  /// session. Returns null on success, or a user-facing message when the
  /// account isn't a support-staff role (the session is revoked first).
  Future<String?> onAuthenticated(SessionUser user, {required bool mfaRequired}) async {
    if (!supportQueueRoles.contains(user.role)) {
      await _revokeQuietly(ref.read(authApiProvider));
      state = const AsyncValue.data(AuthState.signedOut());
      return unsupportedRoleMessage;
    }
    state = AsyncValue.data(mfaRequired ? AuthState.mfaPending(user) : AuthState.signedIn(user));
    return null;
  }

  /// After `/auth/password/setup` or `/auth/password/reset` — those
  /// responses carry no `mfaRequired` flag, so ask the backend for the
  /// fresh session's real MFA state instead of guessing (the web flow
  /// assumes `false` here; an ADMIN would then bounce off MFA-gated pages).
  Future<String?> syncFromServer() async {
    final api = ref.read(authApiProvider);
    final me = await api.me();
    if (me == null) {
      state = const AsyncValue.data(AuthState.signedOut());
      return 'Your session could not be started. Please sign in again.';
    }
    return onAuthenticated(me.user, mfaRequired: !me.mfaVerified);
  }

  /// Returns null on success, else the backend's message (e.g.
  /// "Incorrect MFA code").
  Future<String?> verifyMfa(String code) async {
    final current = state.valueOrNull;
    if (current == null || current.user == null) return 'Please sign in again.';
    try {
      await ref.read(authApiProvider).verifyMfa(code);
      state = AsyncValue.data(AuthState.signedIn(current.user!));
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<void> signOut() async {
    await ref.read(authApiProvider).logout();
    state = const AsyncValue.data(AuthState.signedOut());
  }

  Future<void> _revokeQuietly(AuthApi api) async {
    try {
      await api.logout();
    } on ApiException {
      // Already gone server-side, or unreachable — either way this app
      // shows signed-out and never uses the session.
    }
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
