import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
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
      final state = await _container(FakeAuthApi()).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
    });

    test('restores a persisted PHARMACY session as signed-in', () async {
      final fake = FakeAuthApi()..meResult = pharmacyUser;
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isTrue);
      expect(state.user?.role, 'PHARMACY');
    });

    test('treats a leftover non-pharmacy session as signed-out', () async {
      final fake = FakeAuthApi()..meResult = patientUser;
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
    });

    test('acceptSession signs a pharmacy in with no extra /auth/me call', () async {
      final container = _container(FakeAuthApi());
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).acceptSession(pharmacyUser);

      expect(error, isNull);
      expect(container.read(authControllerProvider).value?.user?.id, 'u-ph');
    });

    test('acceptSession rejects a non-pharmacy account and revokes its session', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).acceptSession(patientUser);

      expect(error, wrongRoleMessage);
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      final fake = FakeAuthApi()..meResult = pharmacyUser;
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);

      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('signOut calls the backend logout and clears local state', () async {
      final fake = FakeAuthApi()..meResult = pharmacyUser;
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).signOut();

      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });
}
