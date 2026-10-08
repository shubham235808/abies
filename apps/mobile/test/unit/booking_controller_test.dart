import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/appointments/data/appointments_api.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_detail.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_hold.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_slot.dart';
import 'package:abies_mobile/features/appointments/domain/review_submission.dart';
import 'package:abies_mobile/features/appointments/presentation/appointments_controller.dart';
import 'package:abies_mobile/features/appointments/presentation/booking_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeAppointmentsApi implements AppointmentsApi {
  List<AppointmentSlot> initialSlots = [];

  /// What the *second* (re-fetch-before-hold) call returns. Null means
  /// "same as the initial load".
  List<AppointmentSlot>? refetchSlots;
  int slotsCallCount = 0;
  final List<String?> fromArgs = [];

  Object? holdError;
  AppointmentHold? holdResultValue;
  int holdCallCount = 0;
  final List<String?> holdIdempotencyKeys = [];

  @override
  Future<List<AppointmentSlot>> slots({required String doctorProfileId, String? mode, String? from, int days = 14}) async {
    slotsCallCount += 1;
    fromArgs.add(from);
    if (slotsCallCount == 1) return initialSlots;
    return refetchSlots ?? initialSlots;
  }

  @override
  Future<AppointmentHold> hold({
    required String doctorProfileId,
    required String mode,
    required DateTime startsAt,
    String? careRecipientFamilyMemberId,
    String? reasonForVisit,
    String? idempotencyKey,
  }) async {
    holdCallCount += 1;
    holdIdempotencyKeys.add(idempotencyKey);
    if (holdError != null) throw holdError!;
    return holdResultValue!;
  }

  @override
  Future<AppointmentDetail> verifyPayment({
    required String appointmentId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<AppointmentDetail> cancel(String appointmentId, {String? reason}) => throw UnimplementedError('not used in these tests');

  @override
  Future<ReviewSubmission> review(String appointmentId, {required int rating, String? comment}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<List<AppointmentDetail>> mine() => throw UnimplementedError('not used in these tests');
}

final _slotA = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 9), endsAt: DateTime(2026, 10, 10, 9, 30), mode: 'VIDEO');
final _slotB = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 10), endsAt: DateTime(2026, 10, 10, 10, 30), mode: 'VIDEO');

Future<void> _flush() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  group('BookingController', () {
    test('loads slots for the initial mode on construction', () async {
      final api = _FakeAppointmentsApi()..initialSlots = [_slotA, _slotB];
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');

      container.read(bookingControllerProvider(params));
      await _flush();

      expect(container.read(bookingControllerProvider(params)).slots.value, [_slotA, _slotB]);
    });

    test('selectSlot sets the selected slot and clears any previous outcome', () async {
      final api = _FakeAppointmentsApi()..initialSlots = [_slotA];
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();

      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      expect(container.read(bookingControllerProvider(params)).selectedSlot, _slotA);
      expect(container.read(bookingControllerProvider(params)).holdOutcome.kind, HoldOutcomeKind.none);
    });

    test('changeMode reloads slots for the new mode and clears the selection', () async {
      final api = _FakeAppointmentsApi()..initialSlots = [_slotA];
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).changeMode('CLINIC');

      final state = container.read(bookingControllerProvider(params));
      expect(state.mode, 'CLINIC');
      expect(state.selectedSlot, isNull);
      expect(api.slotsCallCount, 2);
    });

    test('confirmBooking re-fetches slots before holding, and holds when the slot is still free', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA]
        ..refetchSlots = [_slotA]
        ..holdResultValue = const AppointmentHold(
          appointmentId: 'appt1',
          appointmentStatus: 'PENDING_PAYMENT',
          amount: 500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).confirmBooking();

      expect(api.slotsCallCount, 2, reason: 'one initial load + one re-fetch right before hold');
      expect(api.holdCallCount, 1);
      final state = container.read(bookingControllerProvider(params));
      expect(state.holdOutcome.kind, HoldOutcomeKind.success);
      expect(state.holdOutcome.hold!.appointmentId, 'appt1');
      expect(state.submitting, isFalse);
    });

    test('confirmBooking sends an idempotency key, the same one on a retry of the same slot', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA]
        ..refetchSlots = [_slotA]
        ..holdResultValue = const AppointmentHold(
          appointmentId: 'appt1',
          appointmentStatus: 'PENDING_PAYMENT',
          amount: 500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).confirmBooking();
      await container.read(bookingControllerProvider(params).notifier).confirmBooking();

      expect(api.holdIdempotencyKeys, hasLength(2));
      expect(api.holdIdempotencyKeys[0], isNotNull);
      expect(api.holdIdempotencyKeys[0], api.holdIdempotencyKeys[1], reason: 'retrying the same slot must reuse the same key, not mint a new one');
    });

    test('selecting a different slot generates a new idempotency key', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA, _slotB]
        ..refetchSlots = [_slotA, _slotB]
        ..holdResultValue = const AppointmentHold(
          appointmentId: 'appt1',
          appointmentStatus: 'PENDING_PAYMENT',
          amount: 500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      final notifier = container.read(bookingControllerProvider(params).notifier);

      notifier.selectSlot(_slotA);
      await notifier.confirmBooking();
      notifier.selectSlot(_slotB);
      await notifier.confirmBooking();

      expect(api.holdIdempotencyKeys, hasLength(2));
      expect(api.holdIdempotencyKeys[0], isNot(api.holdIdempotencyKeys[1]), reason: 'a different slot is a different booking, not a retry');
    });

    test('confirmBooking refuses to hold a slot missing from the fresh re-fetch, and never calls /hold', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA]
        ..refetchSlots = []; // slot was taken in the meantime
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).confirmBooking();

      expect(api.holdCallCount, 0, reason: 'never calls /hold for a slot the fresh re-fetch no longer lists');
      final state = container.read(bookingControllerProvider(params));
      expect(state.holdOutcome.kind, HoldOutcomeKind.conflict);
      expect(state.selectedSlot, isNull);
    });

    test('confirmBooking surfaces a 503 from /hold as serviceUnavailable, not a generic error', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA]
        ..refetchSlots = [_slotA]
        ..holdError = const ApiException(message: 'Online payments are not configured in this environment yet — booking is unavailable.', statusCode: 503);
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).confirmBooking();

      final state = container.read(bookingControllerProvider(params));
      expect(state.holdOutcome.kind, HoldOutcomeKind.serviceUnavailable);
      expect(state.holdOutcome.message, contains('not configured'));
      expect(state.submitting, isFalse);
    });

    test('confirmBooking surfaces a 409 from /hold as a conflict and reloads the slot list', () async {
      final api = _FakeAppointmentsApi()
        ..initialSlots = [_slotA]
        ..refetchSlots = [_slotA]
        ..holdError = const ApiException(message: 'This slot was just booked by someone else — please pick another.', statusCode: 409);
      final container = ProviderContainer(overrides: [appointmentsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      const params = BookingParams(doctorProfileId: 'doc1', initialMode: 'VIDEO');
      await _flush();
      container.read(bookingControllerProvider(params).notifier).selectSlot(_slotA);

      await container.read(bookingControllerProvider(params).notifier).confirmBooking();
      await _flush();

      final state = container.read(bookingControllerProvider(params));
      expect(state.holdOutcome.kind, HoldOutcomeKind.conflict);
      expect(api.slotsCallCount, 3, reason: 'initial load + re-fetch-before-hold + reload after the 409');
    });
  });
}
