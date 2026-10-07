import 'dart:io';

import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/diagnostics/data/diagnostics_api.dart';
import 'package:abies_mobile/features/diagnostics/data/report_file_downloader.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_creation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_facets.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_order_detail.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_recommendation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_report_ref.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_search_result.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostic_report_controller.dart';
import 'package:abies_mobile/features/diagnostics/presentation/diagnostics_search_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Overrides the real file I/O so these tests never touch `path_provider`'s
/// platform channel (unavailable under plain `flutter test`).
class _FakeReportFileDownloader extends ReportFileDownloader {
  const _FakeReportFileDownloader();

  @override
  Future<File> download({required String signedUrl, required String orderId, String suggestedName = 'diagnostic-report'}) async {
    return File('/tmp/fake-$orderId-$suggestedName');
  }
}

class _FakeDiagnosticsApi implements DiagnosticsApi {
  List<DiagnosticReportRef> reports = [];
  String signedUrl = 'https://storage.example.test/signed-url';
  Object? downloadUrlError;
  String? lastRequestedReportId;

  @override
  Future<List<DiagnosticReportRef>> myReports() async => reports;

  @override
  Future<String> reportDownloadUrl(String reportId) async {
    lastRequestedReportId = reportId;
    if (downloadUrlError != null) throw downloadUrlError!;
    return signedUrl;
  }

  @override
  Future<DiagnosticFacets> facets() => throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0}) =>
      throw UnimplementedError('not used in these tests');

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
  Future<DiagnosticOrderDetail> cancel(String orderId, {String? reason}) => throw UnimplementedError('not used in these tests');

  @override
  Future<DiagnosticOrderDetail> detail(String orderId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticOrderDetail>> mine() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<DiagnosticRecommendation>> myRecommendations() => throw UnimplementedError('not used in these tests');
}

DiagnosticReportRef _ref({required String id, required String orderId}) {
  return DiagnosticReportRef(
    id: id,
    kind: 'DIAGNOSTIC_REPORT',
    sourceEntityType: 'DiagnosticOrder',
    sourceEntityId: orderId,
    createdAt: DateTime.now(),
  );
}

/// Builds a container with [diagnosticsApiProvider] faked and the specific
/// `diagnosticReportControllerProvider(orderId)` family instance overridden
/// to inject a fake downloader and a captured `launch` function — the real
/// `url_launcher`/`path_provider` plugins have no platform channel under
/// plain `flutter test`.
ProviderContainer _buildContainer({
  required _FakeDiagnosticsApi api,
  required String orderId,
  required Future<bool> Function(Uri uri) launch,
}) {
  return ProviderContainer(overrides: [
    diagnosticsApiProvider.overrideWithValue(api),
    diagnosticReportControllerProvider(orderId).overrideWith(
      (ref) => DiagnosticReportController(ref, orderId, downloader: const _FakeReportFileDownloader(), launch: launch),
    ),
  ]);
}

void main() {
  group('DiagnosticReportController.view', () {
    test('resolves the report via /reports/mine by sourceEntityId, then launches the signed url', () async {
      final api = _FakeDiagnosticsApi()..reports = [_ref(id: 'rep1', orderId: 'o1'), _ref(id: 'rep2', orderId: 'o2')];
      Uri? launched;
      final container = _buildContainer(
        api: api,
        orderId: 'o2',
        launch: (uri) async {
          launched = uri;
          return true;
        },
      );
      addTearDown(container.dispose);

      await container.read(diagnosticReportControllerProvider('o2').notifier).view();

      expect(api.lastRequestedReportId, 'rep2', reason: 'must match by sourceEntityId, not just take the first report');
      expect(launched, Uri.parse(api.signedUrl));
      expect(container.read(diagnosticReportControllerProvider('o2')).status, DiagnosticReportActionStatus.success);
    });

    test('reports an error when no report matches this order id', () async {
      final api = _FakeDiagnosticsApi()..reports = [_ref(id: 'rep1', orderId: 'other-order')];
      var launchCalled = false;
      final container = _buildContainer(
        api: api,
        orderId: 'o2',
        launch: (uri) async {
          launchCalled = true;
          return true;
        },
      );
      addTearDown(container.dispose);

      await container.read(diagnosticReportControllerProvider('o2').notifier).view();

      expect(launchCalled, isFalse);
      expect(container.read(diagnosticReportControllerProvider('o2')).status, DiagnosticReportActionStatus.error);
    });

    test('surfaces an ApiException from reportDownloadUrl (e.g. a non-owning account) as an error state', () async {
      final api = _FakeDiagnosticsApi()
        ..reports = [_ref(id: 'rep1', orderId: 'o1')]
        ..downloadUrlError = const ApiException(message: 'Report not found', statusCode: 404);
      final container = _buildContainer(api: api, orderId: 'o1', launch: (uri) async => true);
      addTearDown(container.dispose);

      await container.read(diagnosticReportControllerProvider('o1').notifier).view();

      final state = container.read(diagnosticReportControllerProvider('o1'));
      expect(state.status, DiagnosticReportActionStatus.error);
      expect(state.message, 'Report not found');
    });
  });

  group('DiagnosticReportController.download', () {
    test('resolves the report then saves it via the injected downloader, never touching real device storage in tests', () async {
      final api = _FakeDiagnosticsApi()..reports = [_ref(id: 'rep1', orderId: 'o1')];
      final container = _buildContainer(api: api, orderId: 'o1', launch: (uri) async => true);
      addTearDown(container.dispose);

      await container.read(diagnosticReportControllerProvider('o1').notifier).download();

      final state = container.read(diagnosticReportControllerProvider('o1'));
      expect(state.status, DiagnosticReportActionStatus.success);
      expect(state.message, contains('fake-o1'));
    });
  });
}
