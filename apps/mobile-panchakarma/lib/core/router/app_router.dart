import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/apply_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/password_setup_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/centre/presentation/booking_detail_screen.dart';
import '../../features/centre/presentation/home_screen.dart';

/// Navigation — same go_router + Riverpod refresh pattern as
/// apps/mobile/lib/core/router/app_router.dart, but simpler: unlike the
/// patient app there is no public browsing here. Every centre screen calls
/// a `requireRole('PANCHAKARMA_CENTRE')` route, so everything except the
/// pre-auth screens below requires a (centre) session.
const _authFlowRoutePaths = <String>{'/sign-in', '/forgot-password', '/password-setup', '/apply'};

enum AuthRedirectDecision { allow, goHome, goSignIn }

/// Pure, unit-testable redirect decision (see test/unit/app_router_test.dart).
AuthRedirectDecision decideAuthRedirect({required bool isSignedIn, required String location}) {
  final onAuthFlow = _authFlowRoutePaths.contains(location);
  if (isSignedIn) return onAuthFlow ? AuthRedirectDecision.goHome : AuthRedirectDecision.allow;
  return onAuthFlow ? AuthRedirectDecision.allow : AuthRedirectDecision.goSignIn;
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  String? apply(AuthRedirectDecision decision) => switch (decision) {
        AuthRedirectDecision.allow => null,
        AuthRedirectDecision.goHome => '/',
        AuthRedirectDecision.goSignIn => '/sign-in',
      };

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final location = state.matchedLocation;
      return ref.read(authControllerProvider).when(
            data: (auth) => apply(decideAuthRedirect(isSignedIn: auth.isSignedIn, location: location)),
            // Wait for the first /auth/me — the splash route shows meanwhile.
            loading: () => null,
            error: (_, __) => apply(decideAuthRedirect(isSignedIn: false, location: location)),
          );
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const _AuthGate()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/apply', builder: (context, state) => const ApplyScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/password-setup',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          final requestId = extra['requestId'] as String?;
          final mobile = extra['mobile'] as String?;
          // Not cold-deep-linkable: needs the requestId from sign-in.
          if (requestId == null || mobile == null) return const SignInScreen();
          return PasswordSetupScreen(requestId: requestId, mobile: mobile);
        },
      ),
      GoRoute(
        path: '/bookings/:id',
        builder: (context, state) => BookingDetailScreen(bookingId: state.pathParameters['id']!),
      ),
    ],
  );
});

/// `/` while the very first `/auth/me` is in flight shows a splash instead
/// of briefly rendering a signed-in screen that would immediately 401.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull?.isSignedIn ?? false) return const HomeScreen();
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    _subscription = ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }

  late final ProviderSubscription<AsyncValue<AuthState>> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}
