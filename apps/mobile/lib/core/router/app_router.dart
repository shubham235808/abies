import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/appointments/presentation/appointment_list_screen.dart';
import '../../features/appointments/presentation/booking_screen.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/otp_screen.dart';
import '../../features/auth/presentation/pending_redirect.dart';
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
import '../../features/network_diagnostics/presentation/connection_diagnostics_screen.dart';
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
///
/// **Auth classification — who needs a session, verified against real
/// backend calls, not guessed** (fixing the bug where this app forced
/// `/sign-in` on *every* route including home/browsing before anything
/// protected was even touched).
///
/// Public — reachable signed out:
/// - `/`, `/sign-in`, `/otp`, `/connection-diagnostics` — entry points.
///   `/` (`HomeController`) only attempts the four `/mine`-shaped
///   dashboard sections when actually signed in; signed out it shows the
///   public catalogue previews only (see that controller's own doc
///   comment).
/// - `/doctors`, `/doctor/:slug` — `GET /public/doctors`,
///   `/public/doctors/[slug]`, both route files confirmed to have no
///   `requireSession` call at all.
/// - `/panchakarma`, `/panchakarma/centres`, `/panchakarma/therapy/:id` —
///   `GET /public/panchakarma`, `/public/panchakarma-centres` (therapy
///   detail renders from navigation `extra`, no network call of its own).
/// - `/diagnostics`, `/diagnostics/test/:id`, `/diagnostics/package/:id` —
///   `GET /public/diagnostics`, `/public/diagnostics/packages` (detail from
///   `extra`).
/// - `/pharmacy`, `/pharmacy/medicine/:id`, `/pharmacy/store/:id` —
///   `GET /public/medicines`, `/public/pharmacies` (detail from `extra`;
///   medicine reviews via `GET /public/medicines/[id]/reviews`, also
///   public).
/// - `/pharmacy/cart` — browsable without an account on purpose. Every
///   route under `/api/v1/patients/me/cart*`
///   (`cart/route.ts`, `cart/items/[id]/route.ts`,
///   `cart/[id]/checkout/route.ts` — read directly) calls both
///   `requireSession` and `requireRole(ctx, 'PATIENT')`; there is no
///   guest-cart endpoint, and per the "don't invent/duplicate backend
///   endpoints" rule this app doesn't add one. So this route never calls
///   `/patients/me/cart` for a signed-out visitor — it shows a
///   **local-only, on-device cart** instead (`LocalCartController`,
///   `lib/features/pharmacy/presentation/local_cart_controller.dart`),
///   flushed into the real backend cart the moment sign-in succeeds
///   (`OtpScreen`).
/// - `/panchakarma/book`, `/diagnostics/book` — **the ambiguous ones,
///   resolved by reading the controller, not guessed**:
///   `PanchakarmaBookingFlowController`/`DiagnosticBookingFlowController`
///   only ever call the public search endpoints while the user is picking
///   a session count / collection mode / schedule. The one call that
///   actually needs a session — `POST /panchakarma-bookings`,
///   `POST /diagnostic-orders` (both `requireSession` +
///   `requireRole('PATIENT')`, confirmed in those route files) — fires
///   only from `confirmBooking()`, on "Confirm booking". So the route
///   itself is public; both controllers check `authControllerProvider`
///   themselves at the top of `confirmBooking()` and, signed out, surface
///   a `requiresAuth` outcome instead of ever calling the backend — the
///   screen reacts to that by sending the visitor to `/sign-in` and
///   straight back, never by gating the whole route here.
///
/// Protected — forced through `/sign-in`:
/// - `/profile` — `ProfileController` reads the patient's own record
///   (`GET /patients/me`), and throws if built signed out.
/// - `/doctor/:slug/book` — **looks like the two routes above, isn't**:
///   its first paint already calls `GET /api/v1/appointments/slots`
///   (`BookingController._loadSlots()`), confirmed `requireSession` +
///   `requireRole('PATIENT')` in `appointments/slots/route.ts` — there's
///   nothing real to render signed out, so (unlike the booking screens
///   above) this route is gated here at the router, not inside the
///   controller.
/// - `/appointments`, `/panchakarma/bookings`, `/panchakarma/bookings/:id`,
///   `/diagnostics/orders`, `/diagnostics/orders/:id`,
///   `/diagnostics/recommendations`, `/pharmacy/orders`,
///   `/pharmacy/orders/:id`, `/prescriptions`, `/prescriptions/:id`,
///   `/prescriptions/:id/purchase` — every one of these is backed by a
///   controller that explicitly throws `StateError('... read before
///   sign-in')` if ever built signed out (`appointments_controller.dart`,
///   `panchakarma_bookings_controller.dart`,
///   `diagnostic_orders_controller.dart`,
///   `diagnostic_recommendations_controller.dart`,
///   `medicine_orders_controller.dart`, `prescriptions_controller.dart`) —
///   every one a personal record, behind the backend's own `/mine`-shaped
///   routes.
/// - `/pharmacy/checkout` — checkout always needs a *real*, already-created
///   backend cart (`checkoutCart()`, `requireSession`); there is no guest
///   path through this screen — a signed-out cart is local-only (see
///   `/pharmacy/cart` above) and must be flushed into a real cart by
///   signing in first.
/// - `/appointment/:id` — the Phase 1 deep-link placeholder for one
///   specific appointment. Treated the same as any other personal record
///   even though nothing backs it yet, rather than left public by default.
const _publicRoutePaths = <String>{
  '/',
  '/sign-in',
  '/otp',
  '/connection-diagnostics',
  '/doctors',
  '/doctor/:slug',
  '/panchakarma',
  '/panchakarma/centres',
  '/panchakarma/therapy/:id',
  '/panchakarma/book',
  '/diagnostics',
  '/diagnostics/test/:id',
  '/diagnostics/package/:id',
  '/diagnostics/book',
  '/pharmacy',
  '/pharmacy/medicine/:id',
  '/pharmacy/store/:id',
  '/pharmacy/cart',
};

/// True for a route template (`GoRouteState.fullPath`, e.g. `/doctor/:slug`
/// — the pattern, never the resolved path) that's reachable signed out, per
/// the classification above. Exposed (not `_`-private) so
/// `test/unit/app_router_test.dart` can exercise it directly without
/// standing up a real `GoRouter`/`WidgetTester`.
bool isPublicRoute(String? fullPath) => fullPath != null && _publicRoutePaths.contains(fullPath);

enum AuthRedirectDecision {
  /// Render whatever route was requested.
  allow,

  /// Signed in, but on `/sign-in` or `/otp` — send home instead.
  goHome,

  /// Signed out, on a protected route — send to `/sign-in`.
  goSignIn,
}

/// The actual auth-redirect decision, as a pure function of the three
/// things it depends on — no `BuildContext`, no `GoRouterState`, no `Ref` —
/// so it's unit-testable on its own (see `test/unit/app_router_test.dart`)
/// without constructing a real router or a widget tree.
AuthRedirectDecision decideAuthRedirect({required bool isSignedIn, required bool loggingIn, required String? fullPath}) {
  if (isSignedIn) return loggingIn ? AuthRedirectDecision.goHome : AuthRedirectDecision.allow;
  if (loggingIn) return AuthRedirectDecision.allow;
  if (isPublicRoute(fullPath)) return AuthRedirectDecision.allow;
  return AuthRedirectDecision.goSignIn;
}

final appRouterProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshNotifier(ref);
  ref.onDispose(refreshNotifier.dispose);

  String? applyDecision(AuthRedirectDecision decision, GoRouterState state) {
    switch (decision) {
      case AuthRedirectDecision.allow:
        return null;
      case AuthRedirectDecision.goHome:
        return '/';
      case AuthRedirectDecision.goSignIn:
        // Remember exactly where this visit was headed — `OtpScreen` reads
        // and clears this right after a successful verify (brief: "return
        // the customer to the exact action they were performing").
        ref.read(pendingRedirectProvider.notifier).state = PendingRedirect(location: state.uri.toString(), extra: state.extra);
        return '/sign-in';
    }
  }

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/sign-in' || state.matchedLocation == '/otp';
      final authAsync = ref.read(authControllerProvider);
      return authAsync.when(
        data: (auth) => applyDecision(
          decideAuthRedirect(isSignedIn: auth.isSignedIn, loggingIn: loggingIn, fullPath: state.fullPath),
          state,
        ),
        // Nothing to redirect to yet — wait for the first /auth/me to resolve.
        loading: () => null,
        // Treat an unexpected failure to even check the session as signed-out,
        // never as a silent "stay on whatever screen this was" — but still
        // through the same public/protected classification, not a blanket
        // sign-in wall.
        error: (_, __) => applyDecision(
          decideAuthRedirect(isSignedIn: false, loggingIn: loggingIn, fullPath: state.fullPath),
          state,
        ),
      );
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/sign-in', builder: (context, state) => const SignInScreen()),
      GoRoute(path: '/connection-diagnostics', builder: (context, state) => const ConnectionDiagnosticsScreen()),
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
