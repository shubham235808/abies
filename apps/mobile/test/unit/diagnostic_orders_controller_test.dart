import 'dart:async';

import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/diagnostics/data/diagnostics_api.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_creation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_facets.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_order_detail.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_recommendation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_report_ref.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_search_result.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostic_orders_controller.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostics_search_controller.dart';
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

DiagnosticOrderDetail _order({required String id, required String status}) {
  return DiagnosticOrderDetail.fromJson({
    'id': id,
    'labId': 'lab1',
    'collectionMode': 'LAB_VISIT',
    'scheduledAt': DateTime.now().toIso8601String(),
    'address': null,
    'status': status,
    'createdAt': DateTime.now().toIso8601String(),
    'cancelledAt': null,
    'cancellationReason': null,
    'lab': {'name': 'City Diagnostics'},
    'items': [
      {'test': {'name': 'CBC'}, 'package': null, 'price': 500},
    ],
    'report': {'releasedToPatientAt': null, 'criticalFlag': false},
  });
}

class _FakeDiagnosticsApi implements DiagnosticsApi {
  List<DiagnosticOrderDetail> mineList = [];
  int mineCallCount = 0;
  Object? cancelError;
  String? lastCancelledId;
  String? lastCancelReason;

  @override
  Future<List<DiagnosticOrderDetail>> mine() async {
    mineCallCount += 1;
    return mineList;
  }

  @override
  Future<DiagnosticOrderDetail> cancel(String orderId, {String? reason}) async {
    lastCancelledId = orderId;
    lastCancelReason = reason;
    if (cancelError != null) throw cancelError!;
    return _order(id: orderId, status: 'CANCELLED');
  }

  @override
  Future<DiagnosticOrderDetail> detail(String orderId) => throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticFacets> facets() => throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticBookingCreationResult> book({
    required String labId,
    List<String>? testIds,
    String? packageId,
    String? recommendationId,
    required String collectionMode,
    required String scheduledAt,
    String? address,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticRecommendation>> myRecommendations() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticReportRef>> myReports() => throw UnimplementedError('not used in these tests');

  @override
  Future<String> reportDownloadUrl(String reportId) => throw UnimplementedError('not used in these tests');
}

ProviderContainer _buildContainer(_FakeDiagnosticsApi api) {
  return ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    diagnosticsApiProvider.overrideWithValue(api),
  ]);
}

void main() {
  group('DiagnosticOrdersController', () {
    test('loads the full /mine list once signed in', () async {
      final api = _FakeDiagnosticsApi()..mineList = [_order(id: 'o1', status: 'SCHEDULED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final list = await container.read(diagnosticOrdersControllerProvider.future);

      expect(list.map((o) => o.id), ['o1']);
    });

    test('cancel calls the backend then reloads the list', () async {
      final api = _FakeDiagnosticsApi()..mineList = [_order(id: 'o1', status: 'BOOKED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(diagnosticOrdersControllerProvider.future);
      api.mineList = [_order(id: 'o1', status: 'CANCELLED')];

      final error = await container.read(diagnosticOrdersControllerProvider.notifier).cancel('o1', reason: 'Change of plan');

      expect(error, isNull);
      expect(api.lastCancelledId, 'o1');
      expect(api.lastCancelReason, 'Change of plan');
      expect(api.mineCallCount, 2, reason: 'initial build + reload after cancel');
      final list = container.read(diagnosticOrdersControllerProvider).value!;
      expect(list.single.status, 'CANCELLED');
    });

    test('cancel returns the backend error message without touching the list on failure', () async {
      final api = _FakeDiagnosticsApi()
        ..mineList = [_order(id: 'o1', status: 'PROCESSING')]
        ..cancelError = const ApiException(message: 'This order can no longer be cancelled', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(diagnosticOrdersControllerProvider.future);

      final error = await container.read(diagnosticOrdersControllerProvider.notifier).cancel('o1');

      expect(error, 'This order can no longer be cancelled');
      expect(api.mineCallCount, 1, reason: 'no reload happened because the cancel call itself failed');
    });
  });
}
