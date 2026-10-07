import 'dart:async';

import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeAuthApi implements AuthApi {
  SessionUser? meResult;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  int logoutCalls = 0;

  void triggerUnauthorized() => _unauthorized.add(null);

  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;

  @override
  Future<SessionUser?> me() async => meResult;

  @override
  Future<void> logout() async {
    logoutCalls += 1;
    meResult = null;
  }

  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) {
    throw UnimplementedError('not used in these tests');
  }

  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) {
    throw UnimplementedError('not used in these tests');
  }
}

const SessionUser testUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT');

void main() {
  group('AuthController', () {
    test('resolves signed-out when GET /auth/me returns no user', () async {
      final fake = FakeAuthApi();
      final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
      addTearDown(container.dispose);

      final state = await container.read(authControllerProvider.future);

      expect(state.isSignedIn, isFalse);
    });

    test('resolves signed-in when GET /auth/me returns a user', () async {
      final fake = FakeAuthApi();
      fake.meResult = testUser;
      final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
      addTearDown(container.dispose);

      final state = await container.read(authControllerProvider.future);

      expect(state.isSignedIn, isTrue);
      expect(state.user?.id, 'u1');
    });

    test('onVerified moves straight to signed-in without another /auth/me call', () async {
      final fake = FakeAuthApi();
      final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);

      container.read(authControllerProvider.notifier).onVerified(testUser);

      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      final fake = FakeAuthApi();
      fake.meResult = testUser;
      final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);

      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);

      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('signOut calls the backend logout and clears local state', () async {
      final fake = FakeAuthApi();
      fake.meResult = testUser;
      final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
      addTearDown(container.dispose);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).signOut();

      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });
}
