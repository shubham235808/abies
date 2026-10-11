import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/practice/domain/profile_inputs.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:abies_doctor/features/practice/presentation/profile_controller.dart';
import 'package:abies_doctor/features/practice/presentation/profile_management.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeDoctorApi doctor;
  late ProviderContainer container;

  Future<void> start(String status) async {
    doctor = FakeDoctorApi(profile: profileJson(status: status));
    container = ProviderContainer(overrides: [
      doctorApiProvider.overrideWithValue(doctor),
      authApiProvider.overrideWithValue(FakeAuthApi()..meResult = doctorUser),
    ]);
    addTearDown(container.dispose);
    container.listen(profileControllerProvider, (_, __) {});
    await container.read(profileControllerProvider.future);
  }

  ProfileController notifier() => container.read(profileControllerProvider.notifier);
  ProfileWorkState state() => container.read(profileControllerProvider).requireValue;

  test('save in DRAFT sends the cleaned PATCH body and keeps the returned profile', () async {
    await start('DRAFT');
    final meBefore = doctor.meCalls;
    final input = ProfileFormInput.fromProfile(state().profile);
    final ok = await notifier().save(ProfileFormInput(
      title: input.title,
      firstName: 'Asha',
      lastName: 'Rao',
      registrationCouncil: 'NCISM',
      registrationNumber: 'AY-123',
      registrationYear: '2012',
      primaryQualification: 'BAMS',
      yearsExperience: '11',
      specialties: 'Panchakarma',
      languages: 'English',
      video: true,
      videoFee: '600',
    ));
    expect(ok, isTrue);
    expect(doctor.calls, ['updateProfile']);
    expect(doctor.lastPatch!['registrationYear'], 2012);
    expect(doctor.lastPatch!['videoFee'], 600);
    expect(doctor.lastPatch!.containsKey('clinicFee'), isFalse);
    expect(doctor.meCalls, meBefore, reason: 'PATCH /doctors/me already returns { profile, completion }');
    expect(state().profile.registrationCouncil, 'NCISM');
    expect(state().message, 'Profile saved.');
  });

  test('saving a REJECTED application moves it back to DRAFT (backend D3 rule)', () async {
    await start('REJECTED');
    expect(await notifier().save(const ProfileFormInput(firstName: 'Asha')), isTrue);
    expect(state().profile.verificationStatus, 'DRAFT');
  });

  test('outside DRAFT/REJECTED the profile is locked and never reaches the backend', () async {
    for (final s in ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'SUSPENDED']) {
      await start(s);
      expect(await notifier().save(const ProfileFormInput(firstName: 'X')), isFalse, reason: s);
      expect(doctor.calls, isEmpty, reason: s);
      expect(state().error, ProfileController.lockedMessage);
    }
  });

  test('client-side validation errors are per-field and skip the network', () async {
    await start('DRAFT');
    expect(await notifier().save(const ProfileFormInput(yearsExperience: '200')), isFalse);
    expect(doctor.calls, isEmpty);
    expect(state().fieldErrors['yearsExperience'], 'Must be between 0 and 80');
  });

  test('backend zod issues are mapped onto field errors', () async {
    await start('DRAFT');
    doctor.throwOnWrite = const ApiException(
      message: 'Invalid request',
      statusCode: 400,
      issues: [ApiFieldIssue(path: ['registrationNumber'], message: 'Too long')],
    );
    expect(await notifier().save(const ProfileFormInput(registrationNumber: 'X')), isFalse);
    expect(state().error, 'Invalid request');
    expect(state().fieldErrors, {'registrationNumber': 'Too long'});
    expect(state().busy, isFalse);
  });

  group('submit', () {
    test('requires the declaration', () async {
      await start('DRAFT');
      expect(await notifier().submit(declarationAccepted: false), isFalse);
      expect(doctor.calls, isEmpty);
    });

    test('submits and re-fetches the new status', () async {
      await start('DRAFT');
      expect(await notifier().submit(declarationAccepted: true), isTrue);
      expect(doctor.calls, ['submit:true']);
      expect(state().profile.verificationStatus, 'SUBMITTED');
      expect(state().profile.isEditableApplication, isFalse);
    });

    test("surfaces the backend's missing-items message as-is", () async {
      await start('DRAFT');
      doctor.throwOnWrite = const ApiException(
        message: 'Complete the application before submission: registration council, degree certificate',
        statusCode: 400,
      );
      expect(await notifier().submit(declarationAccepted: true), isFalse);
      expect(state().error, contains('degree certificate'));
      expect(state().profile.verificationStatus, 'DRAFT');
    });
  });
}
