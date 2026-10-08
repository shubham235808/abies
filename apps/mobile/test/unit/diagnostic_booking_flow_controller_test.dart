import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/diagnostics/data/diagnostics_api.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_args.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_creation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_target.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_facets.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_order_detail.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_summary.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_recommendation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_report_ref.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_summary.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostic_booking_flow_controller.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostics_search_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeDiagnosticsApi implements DiagnosticsApi {
  /// What the re-fetch-before-booking search calls return. Null means
  /// "the same test(s)/package the controller was constructed with".
  List<DiagnosticTestSummary>? refetchTests;
  List<DiagnosticPackageSummary>? refetchPackages;
  int searchTestsCallCount = 0;
  int searchPackagesCallCount = 0;

  Object? bookError;
  DiagnosticBookingCreationResult? bookResultValue;
  int bookCallCount = 0;
  Map<String, dynamic>? lastBookArgs;

  @override
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0}) async {
    searchTestsCallCount += 1;
    final tests = refetchTests ?? const <DiagnosticTestSummary>[];
    return DiagnosticTestSearchResult(total: tests.length, tests: tests);
  }

  @override
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0}) async {
    searchPackagesCallCount += 1;
    final packages = refetchPackages ?? const <DiagnosticPackageSummary>[];
    return DiagnosticPackageSearchResult(total: packages.length, packages: packages);
  }

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
  }) async {
    bookCallCount += 1;
    lastBookArgs = {
      'labId': labId,
      'testIds': testIds,
      'packageId': packageId,
      'recommendationId': recommendationId,
      'collectionMode': collectionMode,
      'address': address,
    };
    if (bookError != null) throw bookError!;
    return bookResultValue!;
  }

  @override
  Future<DiagnosticFacets> facets() => throw UnimplementedError('not used in these tests');

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
  Future<List<DiagnosticRecommendation>> myRecommendations() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticReportRef>> myReports() => throw UnimplementedError('not used in these tests');

  @override
  Future<String> reportDownloadUrl(String reportId) => throw UnimplementedError('not used in these tests');
}

DiagnosticTestSummary _test({String id = 't1', String labId = 'lab1', int price = 500, bool home = true}) {
  return DiagnosticTestSummary(
    id: id,
    code: 'CBC',
    name: 'Test $id',
    description: null,
    sampleType: null,
    preparationInstructions: null,
    price: price,
    turnaroundHours: 24,
    labId: labId,
    labName: 'Lab $labId',
    labServiceCities: const ['Pune'],
    labHomeCollectionSupported: home,
  );
}

DiagnosticPackageSummary _package({String id = 'p1', String labId = 'lab1', int price = 1200}) {
  return DiagnosticPackageSummary(
    id: id,
    name: 'Package $id',
    description: null,
    price: price,
    testNames: const ['CBC'],
    labId: labId,
    labName: 'Lab $labId',
    labServiceCities: const ['Pune'],
    labHomeCollectionSupported: true,
  );
}

void main() {
  group('DiagnosticBookingFlowController — single test', () {
    final args = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([_test()]));

    test('confirmBooking fails validation without a scheduled time, and never calls the API', () async {
      final api = _FakeDiagnosticsApi();
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);

      await notifier.confirmBooking();

      expect(api.searchTestsCallCount, 0);
      expect(api.bookCallCount, 0);
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.validationError);
    });

    test('confirmBooking re-verifies via search before booking, and books when still offered', () async {
      final api = _FakeDiagnosticsApi()
        ..refetchTests = [_test()]
        ..bookResultValue = const DiagnosticBookingCreationResult(
          orderId: 'o1',
          orderStatus: 'BOOKED',
          amount: 500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.searchTestsCallCount, 1, reason: 'one real re-fetch right before booking');
      expect(api.bookCallCount, 1);
      expect(api.lastBookArgs!['testIds'], ['t1']);
      expect(api.lastBookArgs!['packageId'], isNull, reason: 'testIds XOR packageId');
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.success);
      expect(state.outcome.result!.orderId, 'o1');
    });

    test('confirmBooking refuses to book a test missing from the fresh re-fetch', () async {
      final api = _FakeDiagnosticsApi()..refetchTests = []; // no longer offered
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.bookCallCount, 0, reason: 'never calls book() for a test the fresh re-fetch no longer lists');
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.conflict);
    });

    test('confirmBooking surfaces a 503 from book() as serviceUnavailable, not a generic error', () async {
      final api = _FakeDiagnosticsApi()
        ..refetchTests = [_test()]
        ..bookError = const ApiException(
          message: 'Online payments are not configured in this environment yet — booking is unavailable.',
          statusCode: 503,
        );
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.serviceUnavailable);
    });

    test('HOME collection mode requires a non-empty address before calling the API', () async {
      final api = _FakeDiagnosticsApi()..refetchTests = [_test()];
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));
      notifier.setCollectionMode('HOME');

      await notifier.confirmBooking();

      expect(api.bookCallCount, 0);
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.validationError);
    });

    test('setCollectionMode(HOME) is a no-op when the lab does not support home collection', () async {
      final noHomeArgs = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([_test(home: false)]));
      final api = _FakeDiagnosticsApi();
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(noHomeArgs).notifier);

      notifier.setCollectionMode('HOME');

      expect(container.read(diagnosticBookingFlowControllerProvider(noHomeArgs)).collectionMode, 'LAB_VISIT');
    });
  });

  group('DiagnosticBookingFlowController — multi-test (same lab)', () {
    test('books with all testIds and re-verifies every test by name', () async {
      final t1 = _test(id: 't1');
      final t2 = _test(id: 't2');
      final args = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([t1, t2]));
      final api = _FakeDiagnosticsApi()
        ..refetchTests = [t1, t2]
        ..bookResultValue = const DiagnosticBookingCreationResult(
          orderId: 'o1',
          orderStatus: 'BOOKED',
          amount: 1000,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.searchTestsCallCount, 2, reason: 'one re-fetch per distinct test');
      expect(api.lastBookArgs!['testIds'], ['t1', 't2']);
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.success);
    });

    test('refuses to book when only one of the tests is missing from the fresh re-fetch', () async {
      final t1 = _test(id: 't1');
      final t2 = _test(id: 't2');
      final args = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([t1, t2]));
      final api = _FakeDiagnosticsApi()..refetchTests = [t1]; // t2 missing
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.bookCallCount, 0);
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.conflict);
    });
  });

  group('DiagnosticBookingFlowController — package', () {
    test('books with packageId and never sets testIds', () async {
      final package = _package();
      final args = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forPackage(package));
      final api = _FakeDiagnosticsApi()
        ..refetchPackages = [package]
        ..bookResultValue = const DiagnosticBookingCreationResult(
          orderId: 'o1',
          orderStatus: 'BOOKED',
          amount: 1200,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.searchPackagesCallCount, 1);
      expect(api.searchTestsCallCount, 0);
      expect(api.lastBookArgs!['packageId'], 'p1');
      expect(api.lastBookArgs!['testIds'], isNull);
      final state = container.read(diagnosticBookingFlowControllerProvider(args));
      expect(state.outcome.kind, DiagnosticBookOutcomeKind.success);
    });
  });

  group('DiagnosticBookingFlowController — recommendation-to-booking', () {
    test('threads recommendationId through to book()', () async {
      final test = _test();
      final args = DiagnosticBookingArgs(target: DiagnosticBookingTarget.forTests([test]), recommendationId: 'rec1');
      final api = _FakeDiagnosticsApi()
        ..refetchTests = [test]
        ..bookResultValue = const DiagnosticBookingCreationResult(
          orderId: 'o1',
          orderStatus: 'BOOKED',
          amount: 500,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [diagnosticsApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(diagnosticBookingFlowControllerProvider(args).notifier);
      notifier.setScheduledAt(DateTime.now().add(const Duration(days: 1)));

      await notifier.confirmBooking();

      expect(api.lastBookArgs!['recommendationId'], 'rec1');
    });
  });
}
