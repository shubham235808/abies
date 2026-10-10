import 'package:abies_diagnostics/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('AuthController', () {
    late FakeAuthApi fake;
    late ProviderContainer container;

    setUp(() {
      fake = FakeAuthApi();
      container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
    });
    tearDown(() => container.dispose());

    test('resolves signed-out when GET /auth/me returns no user', () async {
      final state = await container.read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
    });

    test('resolves signed-in for a LAB session (session persists across restarts via /auth/me)', () async {
      fake.meResult = labUser;
      final state = await container.read(authControllerProvider.future);
      expect(state.isSignedIn, isTrue);
      expect(state.user?.role, 'LAB');
      expect(container.read(sessionUserIdProvider), 'lab-u1');
    });

    test('a persisted non-LAB session is logged out, not treated as signed in', () async {
      fake.meResult = patientUser;
      final state = await container.read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
      expect(fake.logoutCalls, 1);
    });

    test('onVerified accepts a LAB user', () async {
      await container.read(authControllerProvider.future);
      final ok = await container.read(authControllerProvider.notifier).onVerified(labUser);
      expect(ok, isTrue);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('onVerified rejects and revokes a non-LAB user', () async {
      await container.read(authControllerProvider.future);
      final ok = await container.read(authControllerProvider.notifier).onVerified(patientUser);
      expect(ok, isFalse);
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      fake.meResult = labUser;
      await container.read(authControllerProvider.future);
      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
      expect(container.read(sessionUserIdProvider), isNull);
    });

    test('signOut calls the backend logout and clears local state', () async {
      fake.meResult = labUser;
      await container.read(authControllerProvider.future);
      await container.read(authControllerProvider.notifier).signOut();
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });
}
