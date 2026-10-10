import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/apply_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/password_setup_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/catalogue/domain/catalogue.dart';
import '../../features/catalogue/presentation/catalogue_forms.dart';
import '../../features/catalogue/presentation/catalogue_screen.dart';
import '../../features/lab_profile/presentation/lab_profile_screen.dart';
import '../../features/orders/presentation/dashboard_screen.dart';
import '../../features/orders/presentation/order_detail_screen.dart';

/// Navigation — same go_router + refreshListenable pattern as apps/mobile's
/// router. Unlike the patient app there is nothing to browse signed out: every
/// lab screen is backed by a `requireRole(ctx, 'LAB')` route, so everything
/// except the auth-flow screens is protected.
///
/// `/splash` is shown only while the first `GET /auth/me` is in flight, so
/// no protected screen ever fires a request before the session is known.
const authFlowRoutes = <String>{'/sign-in', '/apply', '/forgot-password', '/password-setup'};

/// Pure redirect decision, unit-tested in test/unit/app_router_test.dart.
/// [isLoading]: the initial session check hasn't resolved yet.
String? decideRedirect({required bool isLoading, required bool isSignedIn, required String location}) {
  if (isLoading) return location == '/splash' ? null : '/splash';
  final onAuthFlow = authFlowRoutes.contains(location);
  if (isSignedIn) return (onAuthFlow || location == '/splash') ? '/' : null;
  return onAuthFlow ? null : '/sign-in';
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      return decideRedirect(
        isLoading: auth.isLoading && !auth.hasValue,
        // An error checking the session is treated as signed-out (never as
        // "stay where you are").
        isSignedIn: auth.valueOrNull?.isSignedIn ?? false,
        location: state.matchedLocation,
      );
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const _SplashScreen()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/apply', builder: (context, state) => const ApplyScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/password-setup',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          final requestId = extra['requestId'] as String?;
          final mobile = extra['mobile'] as String?;
          // Opened without navigation extra (e.g. after process death):
          // nothing to verify against, so restart from sign-in.
          if (requestId == null || mobile == null) return const SignInScreen();
          return PasswordSetupScreen(requestId: requestId, mobile: mobile);
        },
      ),
      GoRoute(path: '/', builder: (context, state) => const DashboardScreen()),
      GoRoute(path: '/orders/:id', builder: (context, state) => OrderDetailScreen(orderId: state.pathParameters['id']!)),
      GoRoute(path: '/profile', builder: (context, state) => const LabProfileScreen()),
      GoRoute(path: '/catalogue', builder: (context, state) => const CatalogueScreen()),
      GoRoute(path: '/catalogue/test', builder: (context, state) => TestFormScreen(test: state.extra as LabTest?)),
      GoRoute(path: '/catalogue/package', builder: (context, state) => PackageFormScreen(package: state.extra as LabPackage?)),
    ],
  );
});

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
