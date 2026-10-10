import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  ProviderContainer containerWith(FakeAuthApi fake) {
    final c = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
    addTearDown(c.dispose);
    return c;
  }

  group('AuthController', () {
    test('resolves signed-out when GET /auth/me returns no user', () async {
      final state = await containerWith(FakeAuthApi()).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
    });

    test('resolves signed-in for a persisted DOCTOR session', () async {
      final fake = FakeAuthApi()..meResult = doctorUser;
      final state = await containerWith(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isTrue);
      expect(state.user?.id, 'd1');
    });

    test('a persisted non-DOCTOR session is logged out, never treated as signed in', () async {
      final fake = FakeAuthApi()..meResult = patientUser;
      final state = await containerWith(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
      expect(fake.logoutCalls, 1);
    });

    test('onVerified accepts a DOCTOR', () async {
      final container = containerWith(FakeAuthApi());
      await container.read(authControllerProvider.future);
      final ok = await container.read(authControllerProvider.notifier).onVerified(doctorUser);
      expect(ok, isTrue);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('onVerified rejects a non-DOCTOR and drops its session', () async {
      final fake = FakeAuthApi();
      final container = containerWith(fake);
      await container.read(authControllerProvider.future);
      final ok = await container.read(authControllerProvider.notifier).onVerified(patientUser);
      expect(ok, isFalse);
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      final fake = FakeAuthApi()..meResult = doctorUser;
      final container = containerWith(fake);
      await container.read(authControllerProvider.future);
      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('signOut calls the backend logout and clears local state', () async {
      final fake = FakeAuthApi()..meResult = doctorUser;
      final container = containerWith(fake);
      await container.read(authControllerProvider.future);
      await container.read(authControllerProvider.notifier).signOut();
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });
}
