import 'package:abies_diagnostics/core/api/api_exception.dart';
import 'package:abies_diagnostics/features/auth/domain/auth_result.dart';
import 'package:abies_diagnostics/features/auth/presentation/apply_controller.dart';
import 'package:abies_diagnostics/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeAuthApi fake;
  late ProviderContainer container;
  late ProviderSubscription<ApplyState> sub;

  setUp(() {
    fake = FakeAuthApi();
    container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
    // Keep the autoDispose provider alive for the whole test.
    sub = container.listen(applyControllerProvider, (_, __) {});
  });
  tearDown(() {
    sub.close();
    container.dispose();
  });

  ApplyController ctrl() => container.read(applyControllerProvider.notifier);
  ApplyState state() => container.read(applyControllerProvider);

  test('requests an OTP as role LAB with a mobile identifier', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true, devOtp: '123456');
    await ctrl().requestCode(' 98765 43299 ');
    expect(fake.otpRequests.single, {'mobile': '98765 43299', 'email': null, 'role': 'LAB'});
    expect(state().step, ApplyStep.otp);
    expect(state().isNewAccount, isTrue);
    expect(state().devOtp, '123456');
  });

  test('sends an email identifier as email, not mobile', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false);
    await ctrl().requestCode('lab@example.test');
    expect(fake.otpRequests.single['email'], 'lab@example.test');
    expect(fake.otpRequests.single['mobile'], isNull);
  });

  test('surfaces the server 403 when self-onboarding is disabled', () async {
    fake.otpError = const ApiException(message: 'This account is not enabled for the selected role', statusCode: 403);
    await ctrl().requestCode('9876543299');
    expect(state().step, ApplyStep.identifier);
    expect(state().error, 'This account is not enabled for the selected role');
  });

  test('a new account must supply a name and accept terms before verify is sent', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
    await ctrl().requestCode('9876543299');

    expect(await ctrl().verify(otp: '123456', acceptedTerms: false, name: 'City Labs'), isNull);
    expect(state().error, contains('Terms'));
    expect(await ctrl().verify(otp: '123456', acceptedTerms: true, name: 'C'), isNull);
    expect(state().error, 'Enter your full name');
    expect(fake.verifyRequests, isEmpty);
  });

  test('verifies and returns the new LAB user, sending the name only for a new account', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: true);
    fake.verifyResult = const VerifyOtpResult(user: labUser, mfaRequired: false);
    await ctrl().requestCode('9876543299');

    final user = await ctrl().verify(otp: ' 123456 ', acceptedTerms: true, name: 'Ravi Kumar');

    expect(user?.role, 'LAB');
    expect(fake.verifyRequests.single, {'requestId': 'r1', 'otp': '123456', 'acceptedTerms': true, 'name': 'Ravi Kumar'});
  });

  test('an existing account verifies without a name', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r2', expiresInSeconds: 300, isNewAccount: false);
    fake.verifyResult = const VerifyOtpResult(user: labUser, mfaRequired: false);
    await ctrl().requestCode('9876543212');
    await ctrl().verify(otp: '123456', acceptedTerms: true, name: 'ignored');
    expect(fake.verifyRequests.single['name'], isNull);
  });

  test('an incorrect OTP leaves the user on the OTP step with the server message', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false);
    fake.verifyError = const ApiException(message: 'Incorrect OTP', statusCode: 401);
    await ctrl().requestCode('9876543212');
    final user = await ctrl().verify(otp: '000000', acceptedTerms: true);
    expect(user, isNull);
    expect(state().step, ApplyStep.otp);
    expect(state().error, 'Incorrect OTP');
    expect(state().submitting, isFalse);
  });

  test('backToIdentifier resets the flow', () async {
    fake.otpResult = const RequestOtpResult(requestId: 'r1', expiresInSeconds: 300, isNewAccount: false);
    await ctrl().requestCode('9876543212');
    ctrl().backToIdentifier();
    expect(state().step, ApplyStep.identifier);
    expect(state().requestId, isNull);
  });
}
