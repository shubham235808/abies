import 'package:abies_panchakarma/core/api/api_exception.dart';
import 'package:abies_panchakarma/features/auth/presentation/auth_controller.dart';
import 'package:abies_panchakarma/features/centre/domain/centre_models.dart';
import 'package:abies_panchakarma/features/centre/presentation/booking_detail_controller.dart';
import 'package:abies_panchakarma/features/centre/presentation/catalogue_controllers.dart';
import 'package:abies_panchakarma/features/centre/presentation/dashboard_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

ProviderContainer _container(FakeCentreApi api, {FakeAuthApi? auth}) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(auth ?? FakeAuthApi()),
    centreApiProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('DashboardController', () {
    test('loads centre and bookings for an approved centre', () async {
      final api = FakeCentreApi();
      final dash = await _container(api).read(dashboardControllerProvider.future);
      expect(dash.centre.isApproved, isTrue);
      expect(dash.bookings, hasLength(1));
      expect(dash.bookings.single.patientName, 'Asha Rao');
    });

    test('does not fetch bookings for a centre that is not approved yet', () async {
      final api = FakeCentreApi(centre: centreJson(status: 'DRAFT'));
      final dash = await _container(api).read(dashboardControllerProvider.future);
      expect(dash.centre.isEditable, isTrue);
      expect(dash.bookings, isEmpty);
      expect(api.bookingsCalls, 0);
    });

    test('refuses to build signed out', () async {
      final container = _container(FakeCentreApi(), auth: FakeAuthApi()..meResult = null);
      await expectLater(container.read(dashboardControllerProvider.future), throwsA(isA<StateError>()));
    });

    test('buckets bookings the way the partner web overview does', () {
      final now = DateTime(2026, 10, 10, 9);
      final today = DateTime(2026, 10, 10, 15);
      final tomorrow = DateTime(2026, 10, 11, 10);
      final bookings = [
        // BOOKED, nothing scheduled -> awaiting scheduling.
        CentreBooking.fromJson(bookingJson(id: 'a', status: 'BOOKED', sessionCount: 2)),
        // SCHEDULED, 1/2 scheduled today -> today + awaiting + active.
        CentreBooking.fromJson(bookingJson(id: 'b', status: 'SCHEDULED', sessionCount: 2, sessions: [sessionJson(id: 's1', n: 1, at: today)])),
        // IN_PROGRESS, fully scheduled, next one tomorrow -> upcoming + active, not awaiting.
        CentreBooking.fromJson(bookingJson(id: 'c', status: 'IN_PROGRESS', sessionCount: 2, sessions: [
          sessionJson(id: 's2', n: 1, at: today, attendedAt: today),
          sessionJson(id: 's3', n: 2, at: tomorrow),
        ])),
        CentreBooking.fromJson(bookingJson(id: 'd', status: 'COMPLETED', sessionCount: 1, sessions: [sessionJson(id: 's4', n: 1, at: today, attendedAt: today)])),
        CentreBooking.fromJson(bookingJson(id: 'e', status: 'CANCELLED', sessionCount: 1)),
      ];
      final dash = CentreDashboard(centre: CentreProfile.fromJson(centreJson()), bookings: bookings, now: now);

      expect(dash.todaysSessions.map((e) => e.session.id), ['s1']);
      expect(dash.upcomingSessions.map((e) => e.session.id), ['s3']);
      expect(dash.awaitingScheduling.map((b) => b.id), ['a', 'b']);
      expect(dash.activeCourses.map((b) => b.id), ['b', 'c']);
      expect(dash.completed.map((b) => b.id), ['d']);
      expect(dash.activeBookings.map((b) => b.id), ['a', 'b', 'c']);
    });

    test('submitApplication surfaces the backend missing-fields message', () async {
      final api = FakeCentreApi(centre: centreJson(status: 'DRAFT'));
      final container = _container(api);
      await container.read(dashboardControllerProvider.future);
      api.nextError = const ApiException(message: 'Complete the following before submitting: centre name', statusCode: 400);

      final error = await container.read(dashboardControllerProvider.notifier).submitApplication();

      expect(error, 'Complete the following before submitting: centre name');
    });

    test('submitApplication moves the centre to SUBMITTED', () async {
      final api = FakeCentreApi(centre: centreJson(status: 'DRAFT'));
      final container = _container(api);
      await container.read(dashboardControllerProvider.future);

      expect(await container.read(dashboardControllerProvider.notifier).submitApplication(), isNull);
      expect(container.read(dashboardControllerProvider).value?.centre.verificationStatus, CentreVerificationStatus.submitted);
    });
  });

  group('BookingDetailController — centre fulfilment', () {
    Future<ProviderContainer> ready(FakeCentreApi api, String id) async {
      final container = _container(api);
      container.listen(bookingDetailControllerProvider(id), (_, __) {});
      await container.read(bookingDetailControllerProvider(id).future);
      return container;
    }

    test('loads the booking and only active therapists', () async {
      final container = await ready(FakeCentreApi(), 'b1');
      final state = container.read(bookingDetailControllerProvider('b1')).value!;
      expect(state.booking.id, 'b1');
      expect(state.therapists.map((t) => t.id), ['th1']);
    });

    test('walks a paid booking through scheduling, attendance, and course completion', () async {
      final api = FakeCentreApi(bookings: [bookingJson(sessionCount: 2)]);
      final container = await ready(api, 'b1');
      final c = container.read(bookingDetailControllerProvider('b1').notifier);
      CentreBooking booking() => container.read(bookingDetailControllerProvider('b1')).value!.booking;

      final when = DateTime.now().add(const Duration(days: 1));
      expect(await c.scheduleSession(scheduledAt: when, therapistId: 'th1'), isNull);
      expect(api.lastSchedule, {'bookingId': 'b1', 'scheduledAt': when, 'therapistId': 'th1'});
      expect(booking().status, BookingStatus.scheduled);
      expect(booking().sessions.single.sessionNumber, 1);
      expect(booking().sessions.single.therapistName, 'Meera');

      expect(await c.markAttended(booking().sessions.single.id, notes: 'Went well'), isNull);
      expect(booking().status, BookingStatus.inProgress);

      expect(await c.scheduleSession(scheduledAt: when.add(const Duration(days: 1))), isNull);
      expect(booking().sessions.last.sessionNumber, 2);

      expect(await c.markAttended(booking().sessions.last.id), isNull);
      expect(booking().status, BookingStatus.completed);
      expect(booking().attendedCount, 2);
      expect(booking().canScheduleMore, isFalse);
      expect(booking().isCancellable, isFalse);
    });

    test('refuses to schedule beyond the booked session count without calling the backend', () async {
      final api = FakeCentreApi(bookings: [bookingJson(sessionCount: 1)]);
      final container = await ready(api, 'b1');
      final c = container.read(bookingDetailControllerProvider('b1').notifier);
      expect(await c.scheduleSession(scheduledAt: DateTime.now()), isNull);
      api.lastSchedule = null;

      final error = await c.scheduleSession(scheduledAt: DateTime.now());

      expect(error, 'All sessions for this booking have already been scheduled.');
      expect(api.lastSchedule, isNull);
    });

    test('refuses marking a session attended twice', () async {
      final api = FakeCentreApi(bookings: [bookingJson(sessionCount: 2)]);
      final container = await ready(api, 'b1');
      final c = container.read(bookingDetailControllerProvider('b1').notifier);
      await c.scheduleSession(scheduledAt: DateTime.now());
      final sessionId = container.read(bookingDetailControllerProvider('b1')).value!.booking.sessions.single.id;
      expect(await c.markAttended(sessionId), isNull);

      expect(await c.markAttended(sessionId), 'This session is already marked attended.');
    });

    test('surfaces the backend message when the backend refuses (stale local state)', () async {
      final api = FakeCentreApi(bookings: [bookingJson(sessionCount: 2)]);
      final container = await ready(api, 'b1');
      api.nextError = const ApiException(message: 'This booking cannot be scheduled further', statusCode: 400);

      final error = await container.read(bookingDetailControllerProvider('b1').notifier).scheduleSession(scheduledAt: DateTime.now());

      expect(error, 'This booking cannot be scheduled further');
      expect(container.read(bookingDetailControllerProvider('b1')).value!.booking.status, BookingStatus.booked);
    });

    test('cancels a BOOKED booking and refreshes it', () async {
      final api = FakeCentreApi();
      final container = await ready(api, 'b1');

      expect(await container.read(bookingDetailControllerProvider('b1').notifier).cancel(reason: 'Patient unwell'), isNull);

      final booking = container.read(bookingDetailControllerProvider('b1')).value!.booking;
      expect(booking.status, BookingStatus.cancelled);
      expect(booking.canScheduleMore, isFalse);
    });

    test('canMarkAttended mirrors the backend status guard', () {
      final booked = CentreBooking.fromJson(bookingJson(status: 'BOOKED', sessions: [sessionJson(id: 's1', n: 1, at: DateTime.now())]));
      final scheduled = CentreBooking.fromJson(bookingJson(status: 'SCHEDULED', sessions: [sessionJson(id: 's1', n: 1, at: DateTime.now())]));
      expect(booked.canMarkAttended(booked.sessions.single), isFalse);
      expect(scheduled.canMarkAttended(scheduled.sessions.single), isTrue);
    });
  });

  group('Catalogue controllers', () {
    test('therapies: create prepends, setActive patches, remove drops', () async {
      final api = FakeCentreApi()
        ..therapyList = [const Therapy(id: 't1', name: 'Abhyanga', description: null, durationMinutes: 60, prerequisites: null, contraindications: null, price: 1500, requiredSupervision: false, active: true)];
      final container = _container(api);
      await container.read(therapiesControllerProvider.future);
      final c = container.read(therapiesControllerProvider.notifier);

      expect(await c.create(const TherapyInput(name: 'Shirodhara', price: 2500, durationMinutes: 45)), isNull);
      expect(container.read(therapiesControllerProvider).value!.map((t) => t.name), ['Shirodhara', 'Abhyanga']);

      final abhyanga = container.read(therapiesControllerProvider).value!.last;
      expect(await c.setActive(abhyanga, false), isNull);
      expect(container.read(therapiesControllerProvider).value!.last.active, isFalse);

      expect(await c.remove('t1'), isNull);
      expect(container.read(therapiesControllerProvider).value!.map((t) => t.id), ['tn2']);
    });

    test('therapists: a refused removal leaves the list untouched and returns the message', () async {
      final api = FakeCentreApi();
      final container = _container(api);
      await container.read(therapistsControllerProvider.future);
      api.nextError = const ApiException(message: 'Reassign this therapist’s upcoming sessions before removing them', statusCode: 400);

      final error = await container.read(therapistsControllerProvider.notifier).remove('th1');

      expect(error, contains('Reassign'));
      expect(container.read(therapistsControllerProvider).value, hasLength(2));
    });

    test('therapists: create sends languages', () async {
      final container = _container(FakeCentreApi());
      await container.read(therapistsControllerProvider.future);
      expect(await container.read(therapistsControllerProvider.notifier).create(const TherapistInput(name: 'Ravi', languages: ['Hindi', 'English'])), isNull);
      expect(container.read(therapistsControllerProvider).value!.first.languages, ['Hindi', 'English']);
    });
  });
}
