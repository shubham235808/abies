import 'package:abies_mobile/core/router/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

/// Exercises `decideAuthRedirect`/`isPublicRoute` directly — the pure,
/// side-effect-free decision logic `app_router.dart`'s `redirect` callback
/// delegates to (see that file's own doc comment for the full
/// public/protected classification this mirrors). No `GoRouter`/
/// `WidgetTester` needed since the decision takes no `BuildContext` or
/// `GoRouterState`.
void main() {
  group('isPublicRoute', () {
    test('every documented public route template is public', () {
      const publicPaths = [
        '/',
        '/sign-in',
        '/register',
        '/forgot-password',
        '/password-setup',
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
      ];
      for (final path in publicPaths) {
        expect(isPublicRoute(path), isTrue, reason: '$path should be public');
      }
    });

    test('every documented protected route template is not public', () {
      const protectedPaths = [
        '/profile',
        '/doctor/:slug/book',
        '/appointments',
        '/panchakarma/bookings',
        '/panchakarma/bookings/:id',
        '/diagnostics/orders',
        '/diagnostics/orders/:id',
        '/diagnostics/recommendations',
        '/pharmacy/checkout',
        '/pharmacy/orders',
        '/pharmacy/orders/:id',
        '/prescriptions',
        '/prescriptions/:id',
        '/prescriptions/:id/purchase',
        '/appointment/:id',
      ];
      for (final path in protectedPaths) {
        expect(isPublicRoute(path), isFalse, reason: '$path should be protected');
      }
    });

    test('a null fullPath (no matched route) is never treated as public', () {
      expect(isPublicRoute(null), isFalse);
    });
  });

  group('decideAuthRedirect', () {
    test('signed in, on a protected route: allow', () {
      final decision = decideAuthRedirect(isSignedIn: true, loggingIn: false, fullPath: '/profile');
      expect(decision, AuthRedirectDecision.allow);
    });

    test('signed in, on any auth-flow screen: go home', () {
      expect(decideAuthRedirect(isSignedIn: true, loggingIn: true, fullPath: '/sign-in'), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, loggingIn: true, fullPath: '/register'), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, loggingIn: true, fullPath: '/forgot-password'), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, loggingIn: true, fullPath: '/password-setup'), AuthRedirectDecision.goHome);
    });

    test('signed out, on /sign-in: allow (not a redirect loop)', () {
      expect(decideAuthRedirect(isSignedIn: false, loggingIn: true, fullPath: '/sign-in'), AuthRedirectDecision.allow);
    });

    test('signed out, on a public route (home): allow — the actual bug this fixes', () {
      expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: '/'), AuthRedirectDecision.allow);
    });

    test('signed out, browsing doctors/panchakarma/diagnostics/pharmacy catalogues: allow', () {
      for (final path in ['/doctors', '/doctor/:slug', '/panchakarma', '/diagnostics', '/pharmacy', '/pharmacy/cart']) {
        expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: path), AuthRedirectDecision.allow, reason: path);
      }
    });

    test('signed out, on the panchakarma/diagnostics booking screens: allow (gated at confirm, not the route)', () {
      expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: '/panchakarma/book'), AuthRedirectDecision.allow);
      expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: '/diagnostics/book'), AuthRedirectDecision.allow);
    });

    test('signed out, on a genuinely protected route: go to sign-in', () {
      for (final path in ['/profile', '/doctor/:slug/book', '/appointments', '/pharmacy/checkout', '/prescriptions']) {
        expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: path), AuthRedirectDecision.goSignIn, reason: path);
      }
    });

    test('signed out, on an unmatched route (fullPath null): go to sign-in, never silently allowed', () {
      expect(decideAuthRedirect(isSignedIn: false, loggingIn: false, fullPath: null), AuthRedirectDecision.goSignIn);
    });
  });
}
