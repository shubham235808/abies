import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/practice/domain/profile_inputs.dart';
import 'package:abies_doctor/features/practice/presentation/clinics_controller.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:abies_doctor/features/practice/presentation/profile_management.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeDoctorApi doctor;
  late ProviderContainer container;

  Future<void> start({String status = 'APPROVED'}) async {
    doctor = FakeDoctorApi(profile: profileJson(status: status));
    container = ProviderContainer(overrides: [
      doctorApiProvider.overrideWithValue(doctor),
      authApiProvider.overrideWithValue(FakeAuthApi()..meResult = doctorUser),
    ]);
    addTearDown(container.dispose);
    container.listen(clinicsControllerProvider, (_, __) {});
    await container.read(clinicsControllerProvider.future);
  }

  ClinicsController notifier() => container.read(clinicsControllerProvider.notifier);
  ProfileWorkState state() => container.read(clinicsControllerProvider).requireValue;
  const clinic = ClinicInput(name: 'Rao Wellness', addressLine1: '2 FC Road', city: 'Pune', state: 'MH', postalCode: '411004', phone: '+912000000');

  test('lists clinics from GET /doctors/me', () async {
    await start();
    expect(state().profile.clinics.single.postalCode, '411001');
  });

  test('add works in any verification status (clinics are not status-locked)', () async {
    for (final s in ['DRAFT', 'SUBMITTED', 'APPROVED']) {
      await start(status: s);
      expect(await notifier().add(clinic), isTrue, reason: s);
      expect(state().profile.clinics.map((c) => c.name), ['Rao Ayurveda', 'Rao Wellness']);
      expect(state().profile.clinics.last.phone, '+912000000');
    }
  });

  test('missing required fields never reach the backend', () async {
    await start();
    expect(await notifier().add(const ClinicInput(name: 'X', addressLine1: '', city: 'Pune', state: 'MH', postalCode: '')), isFalse);
    expect(doctor.calls, isEmpty);
    expect(state().fieldErrors.keys.toSet(), {'addressLine1', 'postalCode'});
  });

  test('edit PATCHes the clinic and re-fetches', () async {
    await start();
    final existing = ClinicInput.fromClinic(state().profile.clinics.single);
    final edited = ClinicInput(
      name: existing.name,
      addressLine1: '10 MG Road',
      city: existing.city,
      state: existing.state,
      postalCode: existing.postalCode,
    );
    expect(await notifier().edit('c1', edited), isTrue);
    expect(doctor.calls.single, startsWith('updateClinic:c1:'));
    expect(state().profile.clinics.single.addressLine1, '10 MG Road');
  });

  test('setActive sends only the active flag', () async {
    await start();
    expect(await notifier().setActive('c1', false), isTrue);
    expect(doctor.calls, ['updateClinic:c1:active']);
    expect(state().profile.clinics.single.active, isFalse);
  });

  test('remove deletes and surfaces a 404', () async {
    await start();
    expect(await notifier().remove('c1'), isTrue);
    expect(state().profile.clinics, isEmpty);

    doctor.throwOnWrite = const ApiException(message: 'Clinic not found', statusCode: 404);
    expect(await notifier().remove('c1'), isFalse);
    expect(state().error, 'Clinic not found');
  });
}
