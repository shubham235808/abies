import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/domain/auth_result.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/auth/presentation/sign_in_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeAuthApi fake;
  late ProviderContainer container;

  setUp(() async {
    fake = FakeAuthApi();
    container = ProviderContainer(overrides: [authApiProvider.overrideWithValue(fake)]);
    await container.read(authControllerProvider.future);
  });
  tearDown(() => container.dispose());

  test('splitIdentifier: "@" means email, anything else mobile', () {
    expect(splitIdentifier(' a@b.in '), (mobile: null, email: 'a@b.in'));
    expect(splitIdentifier('98765 43210'), (mobile: '98765 43210', email: null));
  });

  test('a DOCTOR login signs in', () async {
    fake.loginResult = const LoginResult.authenticated(user: doctorUser, mfaRequired: false);
    final outcome = await container.read(signInControllerProvider).signIn(identifier: 'vaidya@example.test', password: 'pw');
    expect(outcome, isA<SignedIn>());
    expect(fake.lastArgs['email'], 'vaidya@example.test');
    expect(fake.lastArgs['mobile'], isNull);
    expect(container.read(authControllerProvider).value?.isSignedIn, isTrue);
  });

  test('an account with no password requests an OTP and routes to setup', () async {
    fake.loginResult = const LoginResult.needsPasswordSetup('+919800000001');
    final outcome = await container.read(signInControllerProvider).signIn(identifier: '9800000001', password: 'x');
    expect(outcome, isA<NeedsPasswordSetup>());
    final setup = outcome as NeedsPasswordSetup;
    expect(setup.requestId, 'reset-1');
    expect(setup.mobile, '+919800000001');
    expect(fake.calls, contains('requestPasswordReset:+919800000001'));
    expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
  });

  test('a PATIENT account is refused with the doctors-only message', () async {
    fake.loginResult = const LoginResult.authenticated(user: patientUser, mfaRequired: false);
    final outcome = await container.read(signInControllerProvider).signIn(identifier: '9800000002', password: 'pw');
    expect(outcome, isA<SignInFailed>());
    expect((outcome as SignInFailed).message, wrongRoleMessage);
    expect(fake.logoutCalls, 1);
  });

  test('mfaRequired is surfaced as a failure, never silently ignored', () async {
    fake.loginResult = const LoginResult.authenticated(user: doctorUser, mfaRequired: true);
    final outcome = await container.read(signInControllerProvider).signIn(identifier: '9800000001', password: 'pw');
    expect(outcome, isA<SignInFailed>());
    expect(container.read(authControllerProvider).value?.isSignedIn, isFalse);
  });

  test("the backend's own error message is shown on a bad password", () async {
    fake.throwOnLogin = const ApiException(message: 'Invalid credentials', statusCode: 401);
    final outcome = await container.read(signInControllerProvider).signIn(identifier: '9800000001', password: 'bad');
    expect((outcome as SignInFailed).message, 'Invalid credentials');
  });
}
