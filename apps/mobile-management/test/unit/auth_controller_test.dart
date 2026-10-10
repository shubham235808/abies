import 'package:abies_mobile_management/core/api/api_exception.dart';
import 'package:abies_mobile_management/features/auth/domain/auth_result.dart';
import 'package:abies_mobile_management/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakeAuthApi fake) {
  final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('AuthController', () {
    test('resolves signed-out when GET /auth/me returns no user', () async {
      final fake = FakeAuthApi();
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.kind, AuthStatusKind.signedOut);
    });

    test('resolves signed-in for a support-staff session', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: agentUser, mfaVerified: true);
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isTrue);
      expect(state.user?.role, 'CUSTOMER_SUPPORT');
    });

    test('an ADMIN session with mfaVerified=false resolves to mfaPending, not signed-in', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: adminUser, mfaVerified: false);
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.kind, AuthStatusKind.mfaPending);
    });

    test('a stored session for a non-staff role is revoked and treated as signed-out', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: patientUser, mfaVerified: true);
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.kind, AuthStatusKind.signedOut);
      expect(fake.logoutCalls, 1);
    });

    test('onAuthenticated signs a staff user in, or routes to MFA when required', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);
      final notifier = container.read(authControllerProvider.notifier);

      expect(await notifier.onAuthenticated(agentUser, mfaRequired: false), isNull);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);

      expect(await notifier.onAuthenticated(adminUser, mfaRequired: true), isNull);
      expect(container.read(authControllerProvider).value?.isMfaPending, isTrue);
    });

    test('onAuthenticated rejects a non-staff account, revoking its fresh session', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).onAuthenticated(patientUser, mfaRequired: false);

      expect(error, unsupportedRoleMessage);
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.kind, AuthStatusKind.signedOut);
    });

    test('syncFromServer (after password reset/setup) uses /auth/me for the real MFA state', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      fake.meResult = const MeResult(user: adminUser, mfaVerified: false);
      expect(await container.read(authControllerProvider.notifier).syncFromServer(), isNull);
      expect(container.read(authControllerProvider).value?.isMfaPending, isTrue);
    });

    test('verifyMfa success moves mfaPending to signed-in', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: adminUser, mfaVerified: false);
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).verifyMfa('654321');

      expect(error, isNull);
      expect(fake.verifiedCodes, ['654321']);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('verifyMfa failure returns the backend message and stays mfaPending', () async {
      final fake = FakeAuthApi()
        ..meResult = const MeResult(user: adminUser, mfaVerified: false)
        ..verifyMfaError = const ApiException(message: 'Incorrect MFA code', statusCode: 401);
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).verifyMfa('000000');

      expect(error, 'Incorrect MFA code');
      expect(container.read(authControllerProvider).value?.isMfaPending, isTrue);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: agentUser, mfaVerified: true);
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);

      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('signOut calls the backend logout and clears local state', () async {
      final fake = FakeAuthApi()..meResult = const MeResult(user: agentUser, mfaVerified: true);
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).signOut();

      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });

  group('LoginResult / MeResult JSON', () {
    test('parses the requiresPasswordSetup branch', () {
      final r = LoginResult.fromJson({'requiresPasswordSetup': true, 'mobile': '+919000000001'});
      expect(r.requiresPasswordSetup, isTrue);
      expect(r.mobile, '+919000000001');
    });

    test('parses an authenticated login with mfaRequired', () {
      final r = LoginResult.fromJson({
        'requiresPasswordSetup': false,
        'user': {'id': 'a', 'mobile': '+91', 'email': null, 'role': 'ADMIN'},
        'mfaRequired': true,
      });
      expect(r.user?.role, 'ADMIN');
      expect(r.mfaRequired, isTrue);
    });

    test('parses GET /auth/me', () {
      final r = MeResult.fromJson({
        'user': {'id': 'a', 'mobile': '+91', 'email': 'x@y.z', 'role': 'TECH_SUPPORT'},
        'mfaVerified': true,
      });
      expect(r.user.role, 'TECH_SUPPORT');
      expect(r.mfaVerified, isTrue);
    });
  });
}
