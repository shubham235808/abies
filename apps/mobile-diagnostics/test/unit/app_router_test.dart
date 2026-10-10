import 'package:abies_diagnostics/core/router/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('decideRedirect', () {
    test('holds on /splash while the first session check is in flight', () {
      expect(decideRedirect(isLoading: true, isSignedIn: false, location: '/'), '/splash');
      expect(decideRedirect(isLoading: true, isSignedIn: false, location: '/splash'), isNull);
    });

    test('signed out: every lab screen goes to /sign-in, auth-flow screens are allowed', () {
      for (final loc in ['/', '/splash', '/orders/o1', '/catalogue', '/profile']) {
        expect(decideRedirect(isLoading: false, isSignedIn: false, location: loc), '/sign-in', reason: loc);
      }
      for (final loc in authFlowRoutes) {
        expect(decideRedirect(isLoading: false, isSignedIn: false, location: loc), isNull, reason: loc);
      }
    });

    test('signed in: auth-flow and splash go home, lab screens are allowed', () {
      for (final loc in [...authFlowRoutes, '/splash']) {
        expect(decideRedirect(isLoading: false, isSignedIn: true, location: loc), '/', reason: loc);
      }
      for (final loc in ['/', '/orders/o1', '/catalogue', '/profile']) {
        expect(decideRedirect(isLoading: false, isSignedIn: true, location: loc), isNull, reason: loc);
      }
    });
  });
}
