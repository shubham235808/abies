import 'dart:async';

import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/diagnostics/data/diagnostics_api.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_creation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_facets.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_order_detail.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_summary.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_recommendation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_report_ref.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_summary.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostic_recommendations_controller.dart';
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

DiagnosticRecommendation _recommendation({required String id, required String status, bool isPackage = false}) {
  return DiagnosticRecommendation.fromJson({
    'id': id,
    'testId': isPackage ? null : 't1',
    'packageId': isPackage ? 'p1' : null,
    'clinicalReason': 'Routine checkup',
    'targetCompletionDate': null,
    'status': status,
    'createdAt': DateTime.now().toIso8601String(),
    'doctorProfile': {'slug': 'dr-x', 'title': 'Dr.', 'firstName': 'Asha', 'lastName': null},
    'test': isPackage ? null : {'name': 'Complete Blood Count'},
    'package': isPackage ? {'name': 'Full Body Checkup'} : null,
  });
}

DiagnosticTestSummary _test({String id = 't1'}) {
  return DiagnosticTestSummary(
    id: id,
    code: 'CBC',
    name: 'Complete Blood Count',
    description: null,
    sampleType: null,
    preparationInstructions: null,
    price: 500,
    turnaroundHours: 24,
    labId: 'lab1',
    labName: 'City Diagnostics',
    labServiceCities: const ['Pune'],
    labHomeCollectionSupported: true,
  );
}

DiagnosticPackageSummary _package({String id = 'p1'}) {
  return DiagnosticPackageSummary(
    id: id,
    name: 'Full Body Checkup',
    description: null,
    price: 1200,
    testNames: const ['CBC'],
    labId: 'lab1',
    labName: 'City Diagnostics',
    labServiceCities: const ['Pune'],
    labHomeCollectionSupported: true,
  );
}

class _FakeDiagnosticsApi implements DiagnosticsApi {
  List<DiagnosticRecommendation> recommendations = [];
  List<DiagnosticTestSummary> testSearchResults = [];
  List<DiagnosticPackageSummary> packageSearchResults = [];
  String? lastTestQuery;
  String? lastPackageQuery;

  @override
  Future<List<DiagnosticRecommendation>> myRecommendations() async => recommendations;

  @override
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0}) async {
    lastTestQuery = q;
    return DiagnosticTestSearchResult(total: testSearchResults.length, tests: testSearchResults);
  }

  @override
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0}) async {
    lastPackageQuery = q;
    return DiagnosticPackageSearchResult(total: packageSearchResults.length, packages: packageSearchResults);
  }

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
    String? idempotencyKey,
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
  Future<DiagnosticOrderDetail> cancel(String orderId, {String? reason}) => throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticOrderDetail> detail(String orderId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticOrderDetail>> mine() => throw UnimplementedError('not used in these tests');

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
  group('DiagnosticRecommendationsController', () {
    test('loads the /mine recommendation list once signed in', () async {
      final api = _FakeDiagnosticsApi()..recommendations = [_recommendation(id: 'r1', status: 'RECOMMENDED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final list = await container.read(diagnosticRecommendationsControllerProvider.future);

      expect(list.map((r) => r.id), ['r1']);
    });

    test('findBookableOptions searches tests by name for a test recommendation', () async {
      final api = _FakeDiagnosticsApi()
        ..recommendations = [_recommendation(id: 'r1', status: 'RECOMMENDED')]
        ..testSearchResults = [_test()];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(diagnosticRecommendationsControllerProvider.future);
      final notifier = container.read(diagnosticRecommendationsControllerProvider.notifier);

      final options = await notifier.findBookableOptions(_recommendation(id: 'r1', status: 'RECOMMENDED'));

      expect(api.lastTestQuery, 'Complete Blood Count');
      expect(options, hasLength(1));
      expect(options.single, isA<DiagnosticTestSummary>());
    });

    test('findBookableOptions searches packages by name for a package recommendation', () async {
      final api = _FakeDiagnosticsApi()..packageSearchResults = [_package()];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(diagnosticRecommendationsControllerProvider.future);
      final notifier = container.read(diagnosticRecommendationsControllerProvider.notifier);

      final options = await notifier.findBookableOptions(_recommendation(id: 'r1', status: 'RECOMMENDED', isPackage: true));

      expect(api.lastPackageQuery, 'Full Body Checkup');
      expect(options, hasLength(1));
      expect(options.single, isA<DiagnosticPackageSummary>());
    });

    test('canBookFrom gates the action for already-BOOKED/FULFILLED/CANCELLED recommendations', () {
      expect(_recommendation(id: 'r1', status: 'RECOMMENDED').canBookFrom, isTrue);
      expect(_recommendation(id: 'r1', status: 'BOOKED').canBookFrom, isFalse);
      expect(_recommendation(id: 'r1', status: 'FULFILLED').canBookFrom, isFalse);
      expect(_recommendation(id: 'r1', status: 'CANCELLED').canBookFrom, isFalse);
    });
  });
}
