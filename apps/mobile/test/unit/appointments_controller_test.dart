import 'dart:async';

import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/appointments/data/appointments_api.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_detail.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_hold.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_slot.dart';
import 'package:abies_mobile/features/appointments/domain/review_submission.dart';
import 'package:abies_mobile/features/appointments/presentation/appointments_controller.dart';
import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _testUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT');

class _FakeAuthApi implements AuthApi {
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;
  @override
  Future<SessionUser?> me() async => _testUser;
  @override
  Future<void> logout() async {}
  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) => throw UnimplementedError();
  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) =>
      throw UnimplementedError();
}

AppointmentDetail _appointment({required String id, required String status}) {
  return AppointmentDetail.fromJson({
    'id': id,
    'scheduledAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
    'durationMinutes': 30,
    'status': status,
    'mode': 'VIDEO',
    'reasonForVisit': null,
    'cancelledAt': null,
    'cancellationReason': null,
    'doctorProfile': {'slug': 'dr-asha-rao', 'title': 'Dr.', 'firstName': 'Asha', 'lastName': 'Rao'},
  });
}

class _FakeAppointmentsApi implements AppointmentsApi {
  List<AppointmentDetail> mineList = [];
  int mineCallCount = 0;
  Object? cancelError;
  Object? reviewError;
  String? lastCancelledId;
  String? lastCancelReason;
  String? lastReviewedId;
  int? lastReviewRating;

  @override
  Future<List<AppointmentDetail>> mine() async {
    mineCallCount += 1;
    return mineList;
  }

  @override
  Future<AppointmentDetail> cancel(String appointmentId, {String? reason}) async {
    lastCancelledId = appointmentId;
    lastCancelReason = reason;
    if (cancelError != null) throw cancelError!;
    return _appointment(id: appointmentId, status: 'CANCELLED');
  }

  @override
  Future<ReviewSubmission> review(String appointmentId, {required int rating, String? comment}) async {
    lastReviewedId = appointmentId;
    lastReviewRating = rating;
    if (reviewError != null) throw reviewError!;
    return ReviewSubmission(id: 'r1', rating: rating, comment: comment);
  }

  @override
  Future<List<AppointmentSlot>> slots({required String doctorProfileId, String? mode, String? from, int days = 14}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<AppointmentHold> hold({
    required String doctorProfileId,
    required String mode,
    required DateTime startsAt,
    String? careRecipientFamilyMemberId,
    String? reasonForVisit,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<AppointmentDetail> verifyPayment({
    required String appointmentId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');
}

ProviderContainer _buildContainer(_FakeAppointmentsApi api) {
  return ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    appointmentsApiProvider.overrideWithValue(api),
  ]);
}

void main() {
  group('AppointmentsController', () {
    test('loads the full /mine list once signed in', () async {
      final api = _FakeAppointmentsApi()..mineList = [_appointment(id: 'a1', status: 'CONFIRMED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final list = await container.read(appointmentsControllerProvider.future);

      expect(list.map((a) => a.id), ['a1']);
    });

    test('cancel calls the backend then reloads the list', () async {
      final api = _FakeAppointmentsApi()..mineList = [_appointment(id: 'a1', status: 'CONFIRMED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(appointmentsControllerProvider.future);
      api.mineList = [_appointment(id: 'a1', status: 'CANCELLED')];

      final error = await container.read(appointmentsControllerProvider.notifier).cancel('a1', reason: 'Change of plan');

      expect(error, isNull);
      expect(api.lastCancelledId, 'a1');
      expect(api.lastCancelReason, 'Change of plan');
      expect(api.mineCallCount, 2, reason: 'initial build + reload after cancel');
      final list = container.read(appointmentsControllerProvider).value!;
      expect(list.single.status, 'CANCELLED');
    });

    test('cancel returns the backend error message without touching the list on failure', () async {
      final api = _FakeAppointmentsApi()
        ..mineList = [_appointment(id: 'a1', status: 'CANCELLED')]
        ..cancelError = const ApiException(message: 'This appointment can no longer be cancelled', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(appointmentsControllerProvider.future);

      final error = await container.read(appointmentsControllerProvider.notifier).cancel('a1');

      expect(error, 'This appointment can no longer be cancelled');
      expect(api.mineCallCount, 1, reason: 'no reload happened because the cancel call itself failed');
    });

    test('review calls the backend with the given rating/comment then reloads the list', () async {
      final api = _FakeAppointmentsApi()..mineList = [_appointment(id: 'a1', status: 'COMPLETED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(appointmentsControllerProvider.future);

      final error = await container.read(appointmentsControllerProvider.notifier).review('a1', rating: 5, comment: 'Great');

      expect(error, isNull);
      expect(api.lastReviewedId, 'a1');
      expect(api.lastReviewRating, 5);
      expect(api.mineCallCount, 2);
    });

    test('review surfaces a duplicate-review conflict as a message, not a thrown exception', () async {
      final api = _FakeAppointmentsApi()
        ..mineList = [_appointment(id: 'a1', status: 'COMPLETED')]
        ..reviewError = const ApiException(message: 'You already reviewed this appointment', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(appointmentsControllerProvider.future);

      final error = await container.read(appointmentsControllerProvider.notifier).review('a1', rating: 4);

      expect(error, 'You already reviewed this appointment');
    });
  });
}
