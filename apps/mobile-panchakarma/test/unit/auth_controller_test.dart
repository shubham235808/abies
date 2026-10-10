import 'package:abies_panchakarma/core/api/api_exception.dart';
import 'package:abies_panchakarma/features/auth/domain/auth_result.dart';
import 'package:abies_panchakarma/features/auth/presentation/apply_controller.dart';
import 'package:abies_panchakarma/features/auth/presentation/auth_controller.dart';
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
      final fake = FakeAuthApi()..meResult = null;
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
    });

    test('resolves signed-in for a PANCHAKARMA_CENTRE session', () async {
      final state = await _container(FakeAuthApi()).read(authControllerProvider.future);
      expect(state.isSignedIn, isTrue);
      expect(state.user?.role, centreRole);
    });

    test('a persisted session for another role is logged out and treated as signed-out', () async {
      final fake = FakeAuthApi()..meResult = patientUser;
      final state = await _container(fake).read(authControllerProvider.future);
      expect(state.isSignedIn, isFalse);
      expect(fake.logoutCalls, 1);
    });

    test('acceptAuthenticated signs a centre in', () async {
      final fake = FakeAuthApi()..meResult = null;
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).acceptAuthenticated(centreUser);

      expect(error, isNull);
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('acceptAuthenticated refuses a non-centre account and logs it out', () async {
      final fake = FakeAuthApi()..meResult = null;
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      final error = await container.read(authControllerProvider.notifier).acceptAuthenticated(patientUser);

      expect(error, wrongRoleMessage);
      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('a 401 on any call drops the session to signed-out', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      fake.triggerUnauthorized();
      await Future<void>.delayed(Duration.zero);

      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });

    test('signOut calls the backend logout and clears local state', () async {
      final fake = FakeAuthApi();
      final container = _container(fake);
      await container.read(authControllerProvider.future);

      await container.read(authControllerProvider.notifier).signOut();

      expect(fake.logoutCalls, 1);
      expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
    });
  });

  group('ApplyController (OTP centre onboarding)', () {
    Future<ProviderContainer> ready(FakeAuthApi fake) async {
      final container = _container(fake);
      await container.read(authControllerProvider.future);
      // Keep the auto-dispose controller alive for the test's duration.
      container.listen(applyControllerProvider, (_, __) {});
      return container;
    }

    test('requestCode sends email vs mobile correctly and moves to the OTP step', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true, devOtp: '123456');
      final container = await ready(fake);

      await container.read(applyControllerProvider.notifier).requestCode(' centre@example.test ');

      expect(fake.lastRequestOtp, {'mobile': null, 'email': 'centre@example.test'});
      final state = container.read(applyControllerProvider);
      expect(state.step, ApplyStep.otp);
      expect(state.requestId, 'r1');
      expect(state.isNewAccount, isTrue);
      expect(state.devOtp, '123456');
    });

    test('requestCode surfaces the backend refusal when self-onboarding is off', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpError = const ApiException(message: 'This account is not enabled for the selected role', statusCode: 403);
      final container = await ready(fake);

      await container.read(applyControllerProvider.notifier).requestCode('9876543210');

      final state = container.read(applyControllerProvider);
      expect(state.step, ApplyStep.identifier);
      expect(state.error, 'This account is not enabled for the selected role');
      expect(fake.lastRequestOtp, {'mobile': '9876543210', 'email': null});
    });

    test('verify requires a name for a new account and accepted terms, without calling the backend', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
      final container = await ready(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      expect(await notifier.verify(otp: '123456', acceptedTerms: true, name: 'A'), isFalse);
      expect(container.read(applyControllerProvider).error, 'Enter your full name');
      expect(await notifier.verify(otp: '123456', acceptedTerms: false, name: 'Asha Centre'), isFalse);
      expect(fake.lastVerifyOtp, isNull);
    });

    test('verify signs a new centre in, sending name and acceptedTerms', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true)
        ..verifyOtpResult = const VerifyOtpResult(user: centreUser, mfaRequired: false);
      final container = await ready(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      final ok = await notifier.verify(otp: ' 123456 ', acceptedTerms: true, name: ' Kerala Wellness ');

      expect(ok, isTrue);
      expect(fake.lastVerifyOtp, {'requestId': 'r1', 'otp': '123456', 'acceptedTerms': true, 'name': 'Kerala Wellness'});
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('verify omits name for an existing account', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false)
        ..verifyOtpResult = const VerifyOtpResult(user: centreUser, mfaRequired: false);
      final container = await ready(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      expect(await notifier.verify(otp: '123456', acceptedTerms: true, name: ''), isTrue);
      expect(fake.lastVerifyOtp?['name'], isNull);
    });

    test('verify surfaces a wrong code and stays on the OTP step', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false)
        ..verifyOtpError = const ApiException(message: 'Incorrect OTP', statusCode: 401);
      final container = await ready(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      expect(await notifier.verify(otp: '000000', acceptedTerms: true), isFalse);
      final state = container.read(applyControllerProvider);
      expect(state.error, 'Incorrect OTP');
      expect(state.step, ApplyStep.otp);
      expect(state.submitting, isFalse);
    });

    test('back returns to the identifier step', () async {
      final fake = FakeAuthApi()
        ..meResult = null
        ..requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false);
      final container = await ready(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');
      notifier.back();
      expect(container.read(applyControllerProvider).step, ApplyStep.identifier);
    });
  });
}
