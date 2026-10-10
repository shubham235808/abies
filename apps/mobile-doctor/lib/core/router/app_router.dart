import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/apply_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/password_setup_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/consultations/presentation/consultation_screen.dart';
import '../../features/consultations/presentation/prescription_editor_screen.dart';
import '../../features/practice/presentation/availability_screen.dart';
import '../../features/practice/presentation/dashboard_screen.dart';
import '../../features/practice/presentation/profile_screen.dart';

/// Navigation, same pattern as apps/mobile's router (redirect driven by
/// [authControllerProvider], pure decision function for unit tests) — but
/// with the opposite default: unlike the patient app there is nothing a
/// signed-out doctor can browse, so **only the pre-auth screens are
/// public**; everything else (dashboard, consultations, availability,
/// profile) needs a DOCTOR session, since every backend route behind them is
/// `requireRole(ctx, 'DOCTOR')`.
const _authFlowRoutePaths = <String>{'/sign-in', '/apply', '/forgot-password', '/password-setup'};

/// True for a route template (`GoRouterState.fullPath`) reachable signed out.
bool isPublicRoute(String? fullPath) => fullPath != null && _authFlowRoutePaths.contains(fullPath);

enum AuthRedirectDecision { allow, goHome, goSignIn }

AuthRedirectDecision decideAuthRedirect({required bool isSignedIn, required String? fullPath}) {
  final onAuthFlow = isPublicRoute(fullPath);
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
      final authAsync = ref.read(authControllerProvider);
      return authAsync.when(
        data: (auth) => apply(decideAuthRedirect(isSignedIn: auth.isSignedIn, fullPath: state.fullPath)),
        // Wait for the first /auth/me to resolve — `/` shows a splash meanwhile.
        loading: () => null,
        error: (_, __) => apply(decideAuthRedirect(isSignedIn: false, fullPath: state.fullPath)),
      );
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const _HomeGate()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/apply', builder: (context, state) => const ApplyScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/password-setup',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          final requestId = extra['requestId'] as String?;
          final mobile = extra['mobile'] as String?;
          if (requestId == null || mobile == null) return const SignInScreen();
          return PasswordSetupScreen(requestId: requestId, mobile: mobile);
        },
      ),
      GoRoute(path: '/availability', builder: (context, state) => const AvailabilityScreen()),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(
        path: '/consultation/:id',
        builder: (context, state) => ConsultationScreen(consultationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/consultation/:id/prescription',
        builder: (context, state) => PrescriptionEditorScreen(
          consultationId: state.pathParameters['id']!,
          prescriptionId: state.extra as String?,
        ),
      ),
    ],
  );
});

/// `/` while the initial `/auth/me` is still in flight shows a splash rather
/// than a dashboard that would immediately throw "read before sign-in".
class _HomeGate extends ConsumerWidget {
  const _HomeGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth.valueOrNull?.isSignedIn == true) return const DashboardScreen();
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/images/abies-mark.png', width: 72, height: 72, excludeFromSemantics: true),
            const SizedBox(height: 16),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
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
