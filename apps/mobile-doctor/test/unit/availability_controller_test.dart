import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/practice/presentation/availability_controller.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeDoctorApi doctor;
  late ProviderContainer container;

  setUp(() async {
    doctor = FakeDoctorApi();
    container = ProviderContainer(overrides: [
      doctorApiProvider.overrideWithValue(doctor),
      authApiProvider.overrideWithValue(FakeAuthApi()..meResult = doctorUser),
    ]);
    container.listen(availabilityControllerProvider, (_, __) {});
    await container.read(availabilityControllerProvider.future);
  });
  tearDown(() => container.dispose());

  AvailabilityController notifier() => container.read(availabilityControllerProvider.notifier);
  AvailabilityState state() => container.read(availabilityControllerProvider).requireValue;

  group('validateAvailabilityInput mirrors the backend rules', () {
    test('accepts a valid video window', () {
      expect(validateAvailabilityInput(startTime: '09:00', endTime: '12:30', slotMinutes: 30, mode: 'VIDEO'), isNull);
    });
    test('rejects bad times, reversed ranges, slot bounds, and clinic windows without a clinic', () {
      expect(validateAvailabilityInput(startTime: '9:00', endTime: '12:00', slotMinutes: 30, mode: 'VIDEO'), isNotNull);
      expect(validateAvailabilityInput(startTime: '12:00', endTime: '12:00', slotMinutes: 30, mode: 'VIDEO'), 'End time must be after start time');
      expect(validateAvailabilityInput(startTime: '09:00', endTime: '12:00', slotMinutes: 4, mode: 'VIDEO'), isNotNull);
      expect(validateAvailabilityInput(startTime: '09:00', endTime: '12:00', slotMinutes: 30, mode: 'CLINIC'), isNotNull);
    });
  });

  test('loads windows, clinics and enabled modes from GET /doctors/me', () {
    expect(state().windows.single.id, 'av1');
    expect(state().activeClinics.single.id, 'c1');
    expect(state().enabledModes, ['VIDEO', 'CLINIC']);
  });

  test('add posts the window and re-fetches the profile', () async {
    final meBefore = doctor.meCalls;
    expect(await notifier().add(dayOfWeek: 3, startTime: '16:00', endTime: '18:00', slotMinutes: 20, mode: 'CLINIC', clinicId: 'c1'), isTrue);
    expect(doctor.calls, ['add:3:16:00-18:00:CLINIC:c1']);
    expect(doctor.meCalls, meBefore + 1);
    expect(state().windows.map((w) => w.id), ['av1', 'av-new']);
  });

  test('an invalid window never reaches the backend', () async {
    expect(await notifier().add(dayOfWeek: 3, startTime: '18:00', endTime: '16:00', slotMinutes: 20, mode: 'VIDEO'), isFalse);
    expect(doctor.calls, isEmpty);
    expect(state().error, 'End time must be after start time');
  });

  test('pause/resume and remove', () async {
    expect(await notifier().setActive('av1', false), isTrue);
    expect(state().windows.single.active, isFalse);
    expect(await notifier().remove('av1'), isTrue);
    expect(state().windows, isEmpty);
  });

  test('a backend error is surfaced and the previous windows kept', () async {
    doctor.throwOnWrite = const ApiException(message: 'Enable CLINIC consultation mode on your profile first', statusCode: 400);
    expect(await notifier().add(dayOfWeek: 1, startTime: '09:00', endTime: '10:00', slotMinutes: 30, mode: 'VIDEO'), isFalse);
    expect(state().error, 'Enable CLINIC consultation mode on your profile first');
    expect(state().windows.single.id, 'av1');
  });
}
