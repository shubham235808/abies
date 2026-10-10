import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/domain/auth_result.dart';
import 'package:abies_pharmacy/features/auth/presentation/apply_controller.dart';
import 'package:abies_pharmacy/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

Future<ProviderContainer> _container(FakeAuthApi fake) async {
  final container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
  addTearDown(container.dispose);
  // Keep the autoDispose controller alive for the whole test.
  container.listen(applyControllerProvider, (_, __) {});
  await container.read(authControllerProvider.future);
  return container;
}

void main() {
  group('ApplyController', () {
    test('requestCode always asks for role PHARMACY and moves to the code step, keeping devOtp', () async {
      final fake = FakeAuthApi()
        ..requestOtpResult = const RequestOtpResult(requestId: 'req1', expiresInSeconds: 300, isNewAccount: true, devOtp: '123456');
      final container = await _container(fake);

      await container.read(applyControllerProvider.notifier).requestCode(' 98765 43210 ');

      expect(fake.lastRequestOtp, {'mobile': '98765 43210', 'email': null, 'role': 'PHARMACY'});
      final state = container.read(applyControllerProvider);
      expect(state.step, ApplyStep.otp);
      expect(state.requestId, 'req1');
      expect(state.isNewAccount, isTrue);
      expect(state.devOtp, '123456');
    });

    test('requestCode sends an email identifier as email', () async {
      final fake = FakeAuthApi()..requestOtpResult = const RequestOtpResult(requestId: 'r', expiresInSeconds: 300, isNewAccount: false);
      final container = await _container(fake);

      await container.read(applyControllerProvider.notifier).requestCode('owner@pharmacy.test');

      expect(fake.lastRequestOtp?['email'], 'owner@pharmacy.test');
      expect(fake.lastRequestOtp?['mobile'], isNull);
    });

    test('surfaces the server rejection when self-onboarding is off', () async {
      final fake = FakeAuthApi()
        ..requestOtpError = const ApiException(message: 'This account is not enabled for the selected role', statusCode: 403);
      final container = await _container(fake);

      await container.read(applyControllerProvider.notifier).requestCode('9876543210');

      final state = container.read(applyControllerProvider);
      expect(state.step, ApplyStep.identifier);
      expect(state.error, 'This account is not enabled for the selected role');
      expect(state.submitting, isFalse);
    });

    test('verify requires terms acceptance and, for a new account, a name — without calling the server', () async {
      final fake = FakeAuthApi()..requestOtpResult = const RequestOtpResult(requestId: 'r', expiresInSeconds: 300, isNewAccount: true);
      final container = await _container(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      expect(await notifier.verify(otp: '123456', acceptedTerms: false, name: 'Ravi Kumar'), isFalse);
      expect(container.read(applyControllerProvider).error, contains('Terms'));
      expect(await notifier.verify(otp: '123456', acceptedTerms: true, name: ' '), isFalse);
      expect(container.read(applyControllerProvider).error, contains('name'));
      expect(fake.lastVerifyOtp, isNull);
    });

    test('verify signs a new pharmacy in, sending the name', () async {
      final fake = FakeAuthApi()
        ..requestOtpResult = const RequestOtpResult(requestId: 'req9', expiresInSeconds: 300, isNewAccount: true)
        ..verifyOtpResult = const VerifyOtpResult(user: pharmacyUser, mfaRequired: false);
      final container = await _container(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      final ok = await notifier.verify(otp: '123456', acceptedTerms: true, name: 'Ravi Kumar');

      expect(ok, isTrue);
      expect(fake.lastVerifyOtp, {'requestId': 'req9', 'otp': '123456', 'acceptedTerms': true, 'name': 'Ravi Kumar'});
      expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
    });

    test('verify does not send a name for an existing account', () async {
      final fake = FakeAuthApi()
        ..requestOtpResult = const RequestOtpResult(requestId: 'r', expiresInSeconds: 300, isNewAccount: false)
        ..verifyOtpResult = const VerifyOtpResult(user: pharmacyUser, mfaRequired: false);
      final container = await _container(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      await notifier.verify(otp: '654321', acceptedTerms: true, name: 'ignored');

      expect(fake.lastVerifyOtp?['name'], isNull);
    });

    test('verify shows the backend error on a wrong code and stays signed out', () async {
      final fake = FakeAuthApi()
        ..requestOtpResult = const RequestOtpResult(requestId: 'r', expiresInSeconds: 300, isNewAccount: false)
        ..verifyOtpError = const ApiException(message: 'Incorrect OTP', statusCode: 401);
      final container = await _container(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      final ok = await notifier.verify(otp: '000000', acceptedTerms: true);

      expect(ok, isFalse);
      expect(container.read(applyControllerProvider).error, 'Incorrect OTP');
      expect(container.read(applyControllerProvider).submitting, isFalse);
    });

    test('back returns to the identifier step', () async {
      final fake = FakeAuthApi()..requestOtpResult = const RequestOtpResult(requestId: 'r', expiresInSeconds: 300, isNewAccount: false);
      final container = await _container(fake);
      final notifier = container.read(applyControllerProvider.notifier);
      await notifier.requestCode('9876543210');

      notifier.back();

      expect(container.read(applyControllerProvider).step, ApplyStep.identifier);
      expect(container.read(applyControllerProvider).requestId, isNull);
    });
  });
}
