import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/domain/auth_result.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/auth/presentation/doctor_apply_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeAuthApi fake;
  late ProviderContainer container;

  setUp(() async {
    fake = FakeAuthApi();
    container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
    // Keep the auto-dispose provider alive for the whole test.
    container.listen(doctorApplyControllerProvider, (_, __) {});
    await container.read(authControllerProvider.future);
  });
  tearDown(() => container.dispose());

  DoctorApplyController notifier() => container.read(doctorApplyControllerProvider.notifier);
  DoctorApplyState state() => container.read(doctorApplyControllerProvider);

  test('requestCode moves to the OTP step carrying isNewAccount and devOtp', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true, devOtp: '123456');
    await notifier().requestCode('98000 00009');
    expect(fake.lastArgs['mobile'], '98000 00009');
    expect(state().step, ApplyStep.otp);
    expect(state().requestId, 'r1');
    expect(state().isNewAccount, isTrue);
    expect(state().devOtp, '123456');
  });

  test('requestCode surfaces the backend error and stays on the identifier step', () async {
    fake.throwOnRequestOtp = const ApiException(message: 'Too many requests', statusCode: 429);
    await notifier().requestCode('9800000009');
    expect(state().step, ApplyStep.identifier);
    expect(state().error, 'Too many requests');
  });

  test('verify refuses without accepted terms, and a new account without a name', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
    await notifier().requestCode('9800000009');

    expect(await notifier().verify(otp: '123456', acceptedTerms: false, name: 'Asha Rao'), isFalse);
    expect(state().error, contains('Terms'));
    expect(await notifier().verify(otp: '123456', acceptedTerms: true, name: ' '), isFalse);
    expect(state().error, 'Enter your full name');
    expect(fake.calls.where((c) => c == 'verifyOtp'), isEmpty);
  });

  test('a successful verify signs in as DOCTOR, sending the name only for a new account', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
    fake.verifyOtpResult = const VerifyOtpResult(user: doctorUser, mfaRequired: false);
    await notifier().requestCode('9800000009');
    final ok = await notifier().verify(otp: ' 123456 ', acceptedTerms: true, name: ' Asha Rao ');
    expect(ok, isTrue);
    expect(fake.lastArgs, {'requestId': 'r1', 'otp': '123456', 'acceptedTerms': true, 'name': 'Asha Rao'});
    expect(state().step, ApplyStep.done);
    expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
  });

  test('an existing account verifies without a name', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r2', expiresInSeconds: 300, isNewAccount: false);
    fake.verifyOtpResult = const VerifyOtpResult(user: doctorUser, mfaRequired: false);
    await notifier().requestCode('9800000001');
    expect(await notifier().verify(otp: '123456', acceptedTerms: true, name: 'ignored'), isTrue);
    expect(fake.lastArgs['name'], isNull);
  });

  test('"must be provisioned by an administrator" is shown when self-onboarding is off', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
    fake.throwOnVerify = const ApiException(message: 'Account must be provisioned by an administrator', statusCode: 403);
    await notifier().requestCode('9800000009');
    expect(await notifier().verify(otp: '123456', acceptedTerms: true, name: 'Asha Rao'), isFalse);
    expect(state().error, 'Account must be provisioned by an administrator');
    expect(state().submitting, isFalse);
  });

  test('back() returns to the identifier step', () async {
    fake.requestOtpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false);
    await notifier().requestCode('9800000001');
    notifier().back();
    expect(state().step, ApplyStep.identifier);
    expect(state().requestId, isNull);
  });
}
