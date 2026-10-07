import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/appointments/presentation/appointment_list_screen.dart';
import '../../features/appointments/presentation/booking_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/doctors/presentation/doctor_detail_screen.dart';
import '../../features/doctors/presentation/doctor_search_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';

/// Navigation (docs/mobile/MOBILE-ARCHITECTURE.md §4). `/sign-in` and
/// `/otp` are reachable signed out; everything else requires a session —
/// enforced here by `redirect`, not by each screen checking for itself.
///
/// `/doctor/:slug` (Phase 4) is a real deep-link route — reachable both from
/// in-app navigation and as a web-style link — and resolves the slug
/// against the real backend itself before showing anything
/// (`DoctorDetailScreen`, docs/mobile/API-GAP-ANALYSIS.md §7). The other
/// `/product/:id`, `/appointment/:id`, `/diagnostics/:id`, `/panchakarma/:id`
/// deep-link routes remain Phase 1 placeholders — Phases 5-7's own screens.
final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final authAsync = ref.read(authControllerProvider);
      return authAsync.when(
        data: (auth) {
          final loggingIn = state.matchedLocation == '/sign-in' || state.matchedLocation == '/otp';
          if (!auth.isSignedIn && !loggingIn) return '/sign-in';
          if (auth.isSignedIn && loggingIn) return '/';
          return null;
        },
        // Nothing to redirect to yet — wait for the first /auth/me to resolve.
        loading: () => null,
        // Treat an unexpected failure to even check the session as signed-out,
        // never as a silent "stay on whatever screen this was".
        error: (_, __) => '/sign-in',
      );
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(
        path: '/otp',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          return OtpScreen(
            requestId: extra['requestId'] as String,
            isNewAccount: extra['isNewAccount'] as bool? ?? false,
            devOtp: extra['devOtp'] as String?,
          );
        },
      ),
      GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
      GoRoute(path: '/doctors', builder: (context, state) => const DoctorSearchScreen()),
      GoRoute(
        path: '/doctor/:slug',
        builder: (context, state) => DoctorDetailScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/doctor/:slug/book',
        builder: (context, state) {
          final extra = state.extra as Map<String, dynamic>? ?? const {};
          return BookingScreen(slug: state.pathParameters['slug']!, initialMode: extra['mode'] as String?);
        },
      ),
      GoRoute(path: '/appointments', builder: (context, state) => const AppointmentListScreen()),
      GoRoute(path: '/product/:id', builder: (context, state) => _PlaceholderScreen(title: 'Product ${state.pathParameters['id']}')),
      GoRoute(path: '/appointment/:id', builder: (context, state) => _PlaceholderScreen(title: 'Appointment ${state.pathParameters['id']}')),
      GoRoute(path: '/diagnostics/:id', builder: (context, state) => _PlaceholderScreen(title: 'Diagnostics ${state.pathParameters['id']}')),
      GoRoute(path: '/panchakarma/:id', builder: (context, state) => _PlaceholderScreen(title: 'Panchakarma ${state.pathParameters['id']}')),
    ],
  );
});

/// Bridges Riverpod state changes into go_router's `Listenable`-based
/// refresh mechanism, so a sign-in/sign-out re-runs `redirect` without the
/// app needing to call `router.refresh()` by hand at every call site.
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

class _PlaceholderScreen extends StatelessWidget {
  const _PlaceholderScreen({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(child: Text('$title — not built yet (Phase 1 placeholder)')),
    );
  }
}
