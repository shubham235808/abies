import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/apply_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/password_setup_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/home/presentation/profile_screen.dart';
import '../../features/inventory/presentation/add_batch_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/orders/presentation/order_detail_screen.dart';
import '../../features/orders/presentation/order_list_screen.dart';
import '../../features/pos/presentation/pos_controller.dart';
import '../../features/pos/presentation/pos_screen.dart';
import '../../features/pos/presentation/sale_receipt_screen.dart';
import '../../features/tax/presentation/tax_settings_screen.dart';

/// Same go_router + pure-redirect-function pattern as apps/mobile. Unlike
/// the patient app there is no public browsing here: everything except the
/// pre-auth screens is a pharmacy's own operational data, so the rule is
/// simply "signed out -> /sign-in".
const _authFlowRoutePaths = <String>{'/sign-in', '/forgot-password', '/password-setup', '/apply'};

bool isAuthFlowRoute(String location) => _authFlowRoutePaths.contains(location);

enum AuthRedirectDecision { allow, goHome, goSignIn }

/// Pure function of its inputs so it's unit-testable without a router.
AuthRedirectDecision decideAuthRedirect({required bool isSignedIn, required bool onAuthFlowRoute}) {
  if (isSignedIn) return onAuthFlowRoute ? AuthRedirectDecision.goHome : AuthRedirectDecision.allow;
  return onAuthFlowRoute ? AuthRedirectDecision.allow : AuthRedirectDecision.goSignIn;
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  String? apply(AuthRedirectDecision d) => switch (d) {
        AuthRedirectDecision.allow => null,
        AuthRedirectDecision.goHome => '/',
        AuthRedirectDecision.goSignIn => '/sign-in',
      };

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final onAuthFlowRoute = isAuthFlowRoute(state.matchedLocation);
      return ref.read(authControllerProvider).when(
            data: (auth) => apply(decideAuthRedirect(isSignedIn: auth.isSignedIn, onAuthFlowRoute: onAuthFlowRoute)),
            // Wait for the first /auth/me to resolve (HomeScreen shows a spinner).
            loading: () => null,
            // Couldn't even check the session — treat as signed out.
            error: (_, __) => apply(decideAuthRedirect(isSignedIn: false, onAuthFlowRoute: onAuthFlowRoute)),
          );
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/apply', builder: (context, state) => const ApplyScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/password-setup',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>?;
          if (extra == null) return const SignInScreen();
          return PasswordSetupScreen(requestId: extra['requestId'] as String, mobile: extra['mobile'] as String);
        },
      ),
      GoRoute(path: '/orders', builder: (context, state) => const OrderListScreen()),
      GoRoute(path: '/orders/:id', builder: (context, state) => OrderDetailScreen(orderId: state.pathParameters['id']!)),
      GoRoute(path: '/inventory', builder: (context, state) => const InventoryScreen()),
      GoRoute(path: '/inventory/add', builder: (context, state) => const AddBatchScreen()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(path: '/tax-settings', builder: (context, state) => const TaxSettingsScreen()),
      GoRoute(path: '/pos', builder: (context, state) => const PosScreen()),
      GoRoute(path: '/pos/sales', builder: (context, state) => const SalesListScreen()),
      GoRoute(
        path: '/pos/sales/:id',
        builder: (context, state) => SaleReceiptScreen(
          saleId: state.pathParameters['id']!,
          checkout: state.extra is PosCheckoutResult ? state.extra as PosCheckoutResult : null,
        ),
      ),
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
