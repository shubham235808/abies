import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/practice/presentation/dashboard_controller.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  final now = DateTime(2026, 10, 10, 9, 0);

  ProviderContainer containerWith(FakeDoctorApi doctor, {bool signedIn = true}) {
    final auth = FakeAuthApi()..meResult = signedIn ? doctorUser : null;
    final c = ProviderContainer(overrides: [
      authApiProvider.overrideWithValue(auth),
      doctorApiProvider.overrideWithValue(doctor),
      clockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  test('throws when read signed out', () async {
    final c = containerWith(FakeDoctorApi(), signedIn: false);
    await expectLater(c.read(dashboardControllerProvider.future), throwsA(isA<StateError>()));
  });

  test('an unapproved doctor gets the profile only — appointments are never fetched', () async {
    final doctor = FakeDoctorApi(profile: profileJson(status: 'SUBMITTED'));
    final data = await containerWith(doctor).read(dashboardControllerProvider.future);
    expect(data.profile.verificationStatus, 'SUBMITTED');
    expect(data.appointments, isEmpty);
    expect(doctor.appointmentsCalls, 0);
  });

  test('an approved doctor sees upcoming, today and next patient split like the web overview', () async {
    final doctor = FakeDoctorApi()
      ..appointmentRows = [
        appointmentJson(id: 'later-today', scheduledAt: DateTime(2026, 10, 10, 15), consultationId: 'c2'),
        appointmentJson(id: 'early-today-done', scheduledAt: DateTime(2026, 10, 10, 8), status: 'COMPLETED', consultationId: 'c1', consultationStatus: 'COMPLETED'),
        appointmentJson(id: 'tomorrow-unpaid', scheduledAt: DateTime(2026, 10, 11, 10), status: 'PENDING_PAYMENT'),
        appointmentJson(id: 'yesterday', scheduledAt: DateTime(2026, 10, 9, 10), consultationId: 'c0'),
        appointmentJson(id: 'cancelled-today', scheduledAt: DateTime(2026, 10, 10, 11), status: 'CANCELLED'),
      ];
    final data = await containerWith(doctor).read(dashboardControllerProvider.future);

    expect(data.todaysSchedule.map((a) => a.id), ['early-today-done', 'later-today']);
    expect(data.nextPatient?.id, 'later-today');
    expect(data.nextPatient?.consultationId, 'c2');
    expect(data.upcoming.map((a) => a.id), ['later-today', 'tomorrow-unpaid']);
    expect(data.history.map((a) => a.id), ['cancelled-today', 'early-today-done', 'yesterday']);
    expect(data.upcoming.first.patientName, 'Ravi K');
  });
}
