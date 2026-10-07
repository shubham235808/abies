import 'dart:async';

import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/panchakarma/data/panchakarma_api.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_creation.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_detail.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_centre.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_facets.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_search_result.dart';
import 'package:abies_mobile/features/panchakarma/presentation/panchakarma_bookings_controller.dart';
import 'package:abies_mobile/features/panchakarma/presentation/panchakarma_search_controller.dart';
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

PanchakarmaBookingDetail _booking({required String id, required String status}) {
  return PanchakarmaBookingDetail.fromJson({
    'id': id,
    'centreId': 'c1',
    'therapyId': 't1',
    'sessionCount': 3,
    'status': status,
    'createdAt': DateTime.now().toIso8601String(),
    'cancelledAt': null,
    'cancellationReason': null,
    'centre': {'name': 'Wellness Centre'},
    'therapy': {'name': 'Abhyanga'},
    'sessions': const [],
  });
}

class _FakePanchakarmaApi implements PanchakarmaApi {
  List<PanchakarmaBookingDetail> mineList = [];
  int mineCallCount = 0;
  Object? cancelError;
  String? lastCancelledId;
  String? lastCancelReason;

  @override
  Future<List<PanchakarmaBookingDetail>> mine() async {
    mineCallCount += 1;
    return mineList;
  }

  @override
  Future<PanchakarmaBookingDetail> cancel(String bookingId, {String? reason}) async {
    lastCancelledId = bookingId;
    lastCancelReason = reason;
    if (cancelError != null) throw cancelError!;
    return _booking(id: bookingId, status: 'CANCELLED');
  }

  @override
  Future<PanchakarmaBookingDetail> detail(String bookingId) => throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaSearchResult> search({String? q, String? city, int limit = 20, int offset = 0}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaFacets> facets() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<PanchakarmaCentre>> centres({String? city}) => throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaBookingCreationResult> book({required String centreId, required String therapyId, required int sessionCount}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<PanchakarmaBookingDetail> verifyPayment({
    required String bookingId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');
}

ProviderContainer _buildContainer(_FakePanchakarmaApi api) {
  return ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    panchakarmaApiProvider.overrideWithValue(api),
  ]);
}

void main() {
  group('PanchakarmaBookingsController', () {
    test('loads the full /mine list once signed in', () async {
      final api = _FakePanchakarmaApi()..mineList = [_booking(id: 'b1', status: 'SCHEDULED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final list = await container.read(panchakarmaBookingsControllerProvider.future);

      expect(list.map((b) => b.id), ['b1']);
    });

    test('cancel calls the backend then reloads the list', () async {
      final api = _FakePanchakarmaApi()..mineList = [_booking(id: 'b1', status: 'BOOKED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(panchakarmaBookingsControllerProvider.future);
      api.mineList = [_booking(id: 'b1', status: 'CANCELLED')];

      final error = await container.read(panchakarmaBookingsControllerProvider.notifier).cancel('b1', reason: 'Change of plan');

      expect(error, isNull);
      expect(api.lastCancelledId, 'b1');
      expect(api.lastCancelReason, 'Change of plan');
      expect(api.mineCallCount, 2, reason: 'initial build + reload after cancel');
      final list = container.read(panchakarmaBookingsControllerProvider).value!;
      expect(list.single.status, 'CANCELLED');
    });

    test('cancel returns the backend error message without touching the list on failure', () async {
      final api = _FakePanchakarmaApi()
        ..mineList = [_booking(id: 'b1', status: 'IN_PROGRESS')]
        ..cancelError = const ApiException(message: 'This booking can no longer be cancelled', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(panchakarmaBookingsControllerProvider.future);

      final error = await container.read(panchakarmaBookingsControllerProvider.notifier).cancel('b1');

      expect(error, 'This booking can no longer be cancelled');
      expect(api.mineCallCount, 1, reason: 'no reload happened because the cancel call itself failed');
    });
  });
}
