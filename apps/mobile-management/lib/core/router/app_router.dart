import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/mfa_screen.dart';
import '../../features/auth/presentation/password_setup_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/support/presentation/ticket_detail_screen.dart';
import '../../features/support/presentation/ticket_queue_screen.dart';

/// Navigation (docs/mobile/MOBILE-ARCHITECTURE.md §4), same go_router +
/// `refreshListenable` pattern as apps/mobile. Unlike the patient app there
/// is nothing public here beyond the sign-in flow: every other route is
/// staff data, so the auth decision is a simple wall.
///
/// - `/splash`  — shown only while the first `GET /auth/me` resolves.
/// - `/sign-in`, `/forgot-password`, `/password-setup` — signed-out only.
/// - `/mfa`     — the only route an MFA-pending ADMIN session may see.
/// - `/`, `/tickets/:id` — signed-in only.
const signedOutRoutes = <String>{'/sign-in', '/forgot-password', '/password-setup'};

/// Pure, so it's unit-tested without a widget tree. [kind] null = still
/// loading the session. Returns the location to redirect to, or null to
/// allow [location].
String? decideAuthRedirect({required AuthStatusKind? kind, required String location}) {
  switch (kind) {
    case null:
      return location == '/splash' ? null : '/splash';
    case AuthStatusKind.signedOut:
      return signedOutRoutes.contains(location) ? null : '/sign-in';
    case AuthStatusKind.mfaPending:
      return location == '/mfa' ? null : '/mfa';
    case AuthStatusKind.signedIn:
      return (signedOutRoutes.contains(location) || location == '/mfa' || location == '/splash') ? '/' : null;
  }
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final AuthStatusKind? kind = auth.when(
        data: (a) => a.kind,
        loading: () => null,
        // Can't even check the session (e.g. offline at launch) — treat as
        // signed-out, never as a silent "probably still signed in".
        error: (_, __) => AuthStatusKind.signedOut,
      );
      return decideAuthRedirect(kind: kind, location: state.matchedLocation);
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const _SplashScreen()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/password-setup',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          final requestId = extra['requestId'] as String?;
          final mobile = extra['mobile'] as String?;
          // Only reachable from SignInScreen with both values; anything else
          // (e.g. a restored route with no extra) goes back to sign-in.
          if (requestId == null || mobile == null) return const SignInScreen();
          return PasswordSetupScreen(requestId: requestId, mobile: mobile);
        },
      ),
      GoRoute(path: '/mfa', builder: (context, state) => const MfaScreen()),
      GoRoute(path: '/', builder: (context, state) => const TicketQueueScreen()),
      GoRoute(
        path: '/tickets/:id',
        builder: (context, state) => TicketDetailScreen(ticketId: state.pathParameters['id']!),
      ),
    ],
  );
});

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/abies-mark.png', width: 72, height: 72, excludeFromSemantics: true),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

/// Re-runs the router's redirect whenever auth state changes.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _subscription = ref.listen<AsyncValue<AuthState>>(authControllerProvider, (_, __) => notifyListeners());
  }

  late final ProviderSubscription<AsyncValue<AuthState>> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}
