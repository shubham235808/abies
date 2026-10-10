import 'package:abies_doctor/core/router/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('only the pre-auth screens are public', () {
    for (final p in ['/sign-in', '/apply', '/forgot-password', '/password-setup']) {
      expect(isPublicRoute(p), isTrue, reason: p);
    }
    for (final p in ['/', '/availability', '/profile', '/consultation/:id', '/consultation/:id/prescription', null]) {
      expect(isPublicRoute(p), isFalse, reason: '$p');
    }
  });

  test('signed out: protected routes go to sign-in, auth screens allowed', () {
    expect(decideAuthRedirect(isSignedIn: false, fullPath: '/'), AuthRedirectDecision.goSignIn);
    expect(decideAuthRedirect(isSignedIn: false, fullPath: '/consultation/:id'), AuthRedirectDecision.goSignIn);
    expect(decideAuthRedirect(isSignedIn: false, fullPath: '/apply'), AuthRedirectDecision.allow);
  });

  test('signed in: auth screens go home, everything else allowed', () {
    expect(decideAuthRedirect(isSignedIn: true, fullPath: '/sign-in'), AuthRedirectDecision.goHome);
    expect(decideAuthRedirect(isSignedIn: true, fullPath: '/apply'), AuthRedirectDecision.goHome);
    expect(decideAuthRedirect(isSignedIn: true, fullPath: '/consultation/:id'), AuthRedirectDecision.allow);
  });
}
