import 'package:abies_mobile_management/core/router/app_router.dart';
import 'package:abies_mobile_management/features/auth/presentation/auth_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('decideAuthRedirect', () {
    test('holds on /splash while the session is still loading', () {
      expect(decideAuthRedirect(kind: null, location: '/splash'), isNull);
      expect(decideAuthRedirect(kind: null, location: '/'), '/splash');
    });

    test('signed-out may only see the sign-in flow — there is no register route', () {
      for (final path in ['/sign-in', '/forgot-password', '/password-setup']) {
        expect(decideAuthRedirect(kind: AuthStatusKind.signedOut, location: path), isNull);
      }
      expect(decideAuthRedirect(kind: AuthStatusKind.signedOut, location: '/'), '/sign-in');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedOut, location: '/tickets/t1'), '/sign-in');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedOut, location: '/mfa'), '/sign-in');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedOut, location: '/register'), '/sign-in');
    });

    test('an MFA-pending session is pinned to /mfa', () {
      expect(decideAuthRedirect(kind: AuthStatusKind.mfaPending, location: '/mfa'), isNull);
      expect(decideAuthRedirect(kind: AuthStatusKind.mfaPending, location: '/'), '/mfa');
      expect(decideAuthRedirect(kind: AuthStatusKind.mfaPending, location: '/tickets/t1'), '/mfa');
    });

    test('signed-in skips auth screens and may open tickets', () {
      expect(decideAuthRedirect(kind: AuthStatusKind.signedIn, location: '/sign-in'), '/');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedIn, location: '/mfa'), '/');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedIn, location: '/splash'), '/');
      expect(decideAuthRedirect(kind: AuthStatusKind.signedIn, location: '/'), isNull);
      expect(decideAuthRedirect(kind: AuthStatusKind.signedIn, location: '/tickets/t1'), isNull);
    });
  });
}
