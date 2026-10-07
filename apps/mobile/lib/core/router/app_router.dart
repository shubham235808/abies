import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/appointments/presentation/appointment_list_screen.dart';
import '../../features/appointments/presentation/booking_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/diagnostics/domain/diagnostic_booking_args.dart';
import '../../features/diagnostics/domain/diagnostic_package_summary.dart';
import '../../features/diagnostics/domain/diagnostic_test_summary.dart';
import '../../features/diagnostics/presentation/diagnostic_booking_screen.dart';
import '../../features/diagnostics/presentation/diagnostic_order_detail_screen.dart';
import '../../features/diagnostics/presentation/diagnostic_order_list_screen.dart';
import '../../features/diagnostics/presentation/diagnostic_package_detail_screen.dart';
import '../../features/diagnostics/presentation/diagnostic_recommendations_screen.dart';
import '../../features/diagnostics/presentation/diagnostic_test_detail_screen.dart';
import '../../features/diagnostics/presentation/diagnostics_search_screen.dart';
import '../../features/doctors/presentation/doctor_detail_screen.dart';
import '../../features/doctors/presentation/doctor_search_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/panchakarma/domain/panchakarma_therapy.dart';
import '../../features/panchakarma/presentation/panchakarma_booking_detail_screen.dart';
import '../../features/panchakarma/presentation/panchakarma_booking_list_screen.dart';
import '../../features/panchakarma/presentation/panchakarma_booking_screen.dart';
import '../../features/panchakarma/presentation/panchakarma_centres_screen.dart';
import '../../features/panchakarma/presentation/panchakarma_search_screen.dart';
import '../../features/panchakarma/presentation/panchakarma_therapy_detail_screen.dart';
import '../../features/pharmacy/domain/cart.dart';
import '../../features/pharmacy/domain/medicine_summary.dart';
import '../../features/pharmacy/domain/pharmacy_summary.dart';
import '../../features/pharmacy/presentation/cart_screen.dart';
import '../../features/pharmacy/presentation/checkout_screen.dart';
import '../../features/pharmacy/presentation/medicine_detail_screen.dart';
import '../../features/pharmacy/presentation/medicine_order_detail_screen.dart';
import '../../features/pharmacy/presentation/medicine_order_list_screen.dart';
import '../../features/pharmacy/presentation/medicine_search_screen.dart';
import '../../features/pharmacy/presentation/pharmacy_detail_screen.dart';
import '../../features/prescriptions/domain/prescription_summary.dart';
import '../../features/prescriptions/presentation/prescription_detail_screen.dart';
import '../../features/prescriptions/presentation/prescription_purchase_screen.dart';
import '../../features/prescriptions/presentation/prescriptions_list_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';

/// Navigation (docs/mobile/MOBILE-ARCHITECTURE.md §4). `/sign-in` and
/// `/otp` are reachable signed out; everything else requires a session —
/// enforced here by `redirect`, not by each screen checking for itself.
///
/// `/doctor/:slug` (Phase 4) is a real deep-link route — reachable both from
/// in-app navigation and as a web-style link — and resolves the slug
/// against the real backend itself before showing anything
/// (`DoctorDetailScreen`, docs/mobile/API-GAP-ANALYSIS.md §7). The
/// `/appointment/:id` deep-link route remains a Phase 1 placeholder (no
/// phase has claimed it as a cold deep link yet). The former `/product/:id`
/// placeholder is gone — Phase 7's real `/pharmacy*`/`/prescriptions*`
/// routes replace it below.
///
/// Phase 6's `/diagnostics*` routes are real (replacing the Phase 1
/// `/diagnostics/:id` placeholder entirely), but — same gap as Panchakarma
/// below — `/diagnostics/test/:id`, `/diagnostics/package/:id` and
/// `/diagnostics/book` are **not** cold-deep-linkable: there is no
/// `GET /public/diagnostics/[id]` either. See `DiagnosticTestSummary`'s doc
/// comment and `lib/features/diagnostics/PHASE.md`.
///
/// Phase 5's `/panchakarma*` routes are real, but `/panchakarma/therapy/:id`
/// and `/panchakarma/book` are **not** cold-deep-linkable the way
/// `/doctor/:slug` is — there is no `GET /public/panchakarma/[id]` to
/// resolve an id against (a real, reported gap; see
/// `PanchakarmaTherapyDetailScreen`'s doc comment). Both routes carry their
/// data via `extra` from in-app navigation; opened without it, they show an
/// honest "start from search" state rather than attempting a network call
/// that doesn't exist.
///
/// Phase 7's `/pharmacy*`/`/prescriptions*` routes are real, with the same
/// already-known gap once more: `/pharmacy/medicine/:id`, `/pharmacy/
/// store/:id` and `/prescriptions/:id` all carry their data via `extra`
/// rather than re-fetching (no `GET /public/medicines/[id]`, `/public/
/// pharmacies/[id]`, or `GET /prescriptions/[id]` exist). `/pharmacy/
/// checkout` likewise takes its `Cart` via `extra` — there is no
/// single-cart `GET` either, only the plural `/patients/me/cart`.
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
      GoRoute(path: '/panchakarma', builder: (context, state) => const PanchakarmaSearchScreen()),
      GoRoute(path: '/panchakarma/centres', builder: (context, state) => const PanchakarmaCentresScreen()),
      GoRoute(
        path: '/panchakarma/therapy/:id',
        builder: (context, state) => PanchakarmaTherapyDetailScreen(therapy: state.extra as PanchakarmaTherapy?),
      ),
      GoRoute(
        path: '/panchakarma/book',
        builder: (context, state) => PanchakarmaBookingScreen(therapy: state.extra as PanchakarmaTherapy?),
      ),
      GoRoute(path: '/panchakarma/bookings', builder: (context, state) => const PanchakarmaBookingListScreen()),
      GoRoute(
        path: '/panchakarma/bookings/:id',
        builder: (context, state) => PanchakarmaBookingDetailScreen(bookingId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/diagnostics', builder: (context, state) => const DiagnosticsSearchScreen()),
      GoRoute(
        path: '/diagnostics/test/:id',
        builder: (context, state) => DiagnosticTestDetailScreen(test: state.extra as DiagnosticTestSummary?),
      ),
      GoRoute(
        path: '/diagnostics/package/:id',
        builder: (context, state) => DiagnosticPackageDetailScreen(package: state.extra as DiagnosticPackageSummary?),
      ),
      GoRoute(
        path: '/diagnostics/book',
        builder: (context, state) => DiagnosticBookingScreen(args: state.extra as DiagnosticBookingArgs?),
      ),
      GoRoute(path: '/diagnostics/orders', builder: (context, state) => const DiagnosticOrderListScreen()),
      GoRoute(
        path: '/diagnostics/orders/:id',
        builder: (context, state) => DiagnosticOrderDetailScreen(orderId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/diagnostics/recommendations', builder: (context, state) => const DiagnosticRecommendationsScreen()),
      GoRoute(path: '/pharmacy', builder: (context, state) => const MedicineSearchScreen()),
      GoRoute(
        path: '/pharmacy/medicine/:id',
        builder: (context, state) => MedicineDetailScreen(medicine: state.extra as MedicineSummary?),
      ),
      GoRoute(
        path: '/pharmacy/store/:id',
        builder: (context, state) => PharmacyDetailScreen(pharmacy: state.extra as PharmacySummary?),
      ),
      GoRoute(path: '/pharmacy/cart', builder: (context, state) => const CartScreen()),
      GoRoute(
        path: '/pharmacy/checkout',
        builder: (context, state) => CheckoutScreen(cart: state.extra as Cart?),
      ),
      GoRoute(path: '/pharmacy/orders', builder: (context, state) => const MedicineOrderListScreen()),
      GoRoute(
        path: '/pharmacy/orders/:id',
        builder: (context, state) => MedicineOrderDetailScreen(orderId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/prescriptions', builder: (context, state) => const PrescriptionsListScreen()),
      GoRoute(
        path: '/prescriptions/:id',
        builder: (context, state) => PrescriptionDetailScreen(prescription: state.extra as PrescriptionSummary?),
      ),
      GoRoute(
        path: '/prescriptions/:id/purchase',
        builder: (context, state) => PrescriptionPurchaseScreen(prescription: state.extra as PrescriptionSummary?),
      ),
      GoRoute(path: '/appointment/:id', builder: (context, state) => _PlaceholderScreen(title: 'Appointment ${state.pathParameters['id']}')),
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
