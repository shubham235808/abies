import '../../../core/api/api_client.dart';
import '../domain/diagnostic_booking_creation.dart';
import '../domain/diagnostic_facets.dart';
import '../domain/diagnostic_order_detail.dart';
import '../domain/diagnostic_package_search_result.dart';
import '../domain/diagnostic_recommendation.dart';
import '../domain/diagnostic_report_ref.dart';
import '../domain/diagnostic_test_search_result.dart';

/// Talks to the existing `/api/v1/public/diagnostics*`,
/// `/api/v1/diagnostic-orders*`, `/api/v1/diagnostic-recommendations*` and
/// `/api/v1/reports*` routes only — nothing here invents an endpoint
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6 — "no new backend work").
/// Behind one interface, mirroring `PanchakarmaApi`'s shape, so the
/// presentation layer is unit-testable with a fake.
abstract class DiagnosticsApi {
  /// `GET /api/v1/public/diagnostics` — the full filter set
  /// `publicTestSearchSchema` accepts (`packages/domain/src/modules/
  /// diagnostics/catalogue.schemas.ts`): free-text `q`, `city`, plus
  /// `limit`/`offset` pagination. Same shape as Phase 5's `publicTherapySearchSchema`
  /// — confirmed by reading the real schema, not assumed.
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0});

  /// `GET /api/v1/public/diagnostics/packages` — a *different* path than
  /// `/public/diagnostics` (confirmed by reading both routes), same query
  /// schema (`publicTestSearchSchema` is reused for both).
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0});

  /// `GET /api/v1/public/diagnostics/facets`.
  Future<DiagnosticFacets> facets();

  /// `POST /api/v1/diagnostic-orders`. Enforces `bookOrderSchema`'s
  /// `testIds` XOR `packageId` rule client-side too, by construction, via
  /// [DiagnosticBookingTarget] rather than exposing raw nullable params here
  /// — callers pass exactly one of `testIds`/`packageId`.
  ///
  /// Throws [ApiException] with `statusCode == 503` when online payments
  /// aren't configured in this environment (`bookOrder()`'s
  /// `ServiceUnavailableError`, checked *before* the lab/test/package are
  /// even looked up — `packages/domain/src/modules/diagnostics/
  /// orders.service.ts`) — the expected outcome in dev today, not a bug.
  /// Throws `statusCode == 400/404` if the lab/test/package no longer
  /// resolves, or `409` if a recommendation no longer accepts a new order.
  Future<DiagnosticBookingCreationResult> book({
    required String labId,
    List<String>? testIds,
    String? packageId,
    String? recommendationId,
    required String collectionMode,
    required String scheduledAt,
    String? address,
  });

  /// `POST /api/v1/diagnostic-orders/verify-payment`. Not reachable from
  /// this phase's UI (no booking ever succeeds without real Razorpay keys)
  /// but implemented against the real contract ahead of Phase 8.
  Future<DiagnosticOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  });

  /// `POST /api/v1/diagnostic-orders/[id]/cancel`. Returns the bare,
  /// un-included order row — callers that need the full joined shape should
  /// reload `mine()`.
  Future<DiagnosticOrderDetail> cancel(String orderId, {String? reason});

  /// `GET /api/v1/diagnostic-orders/[id]` — the full joined detail shape.
  Future<DiagnosticOrderDetail> detail(String orderId);

  /// `GET /api/v1/diagnostic-orders/mine`.
  Future<List<DiagnosticOrderDetail>> mine();

  /// `GET /api/v1/diagnostic-recommendations/mine`.
  Future<List<DiagnosticRecommendation>> myRecommendations();

  /// `GET /api/v1/reports/mine` — the generic patient document library, used
  /// here only to resolve a diagnostic order's report id (see
  /// `DiagnosticReportRef`'s doc comment for why `/api/v1/diagnostic-orders/
  /// [id]/report-download` is not used — it's doctor-only).
  Future<List<DiagnosticReportRef>> myReports();

  /// `GET /api/v1/reports/[id]/download` — returns a short-lived (5-minute)
  /// signed URL to the stored document, confirmed by reading
  /// `reports.service.ts`'s `downloadUrl()` and the route's own comment
  /// ("Returns a short-lived signed URL rather than proxying the file").
  /// Not a redirect — the route returns `{ url }` as JSON, same shape as
  /// Phase 6's own `book()`/`cancel()` responses, *not* the 302-redirect
  /// pattern Phase 4's doctor photo route used (confirmed, not assumed).
  Future<String> reportDownloadUrl(String reportId);
}

class DiagnosticsApiImpl implements DiagnosticsApi {
  DiagnosticsApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<DiagnosticTestSearchResult> searchTests({String? q, String? city, int limit = 20, int offset = 0}) {
    return _client.get<DiagnosticTestSearchResult>(
      '/api/v1/public/diagnostics',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (city != null && city.isNotEmpty) 'city': city,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
      decode: (json) => DiagnosticTestSearchResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<DiagnosticPackageSearchResult> searchPackages({String? q, String? city, int limit = 20, int offset = 0}) {
    return _client.get<DiagnosticPackageSearchResult>(
      '/api/v1/public/diagnostics/packages',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (city != null && city.isNotEmpty) 'city': city,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
      decode: (json) => DiagnosticPackageSearchResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<DiagnosticFacets> facets() {
    return _client.get<DiagnosticFacets>(
      '/api/v1/public/diagnostics/facets',
      decode: (json) => DiagnosticFacets.fromJson(json as Map<String, dynamic>),
    );
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
  }) {
    assert((testIds != null && testIds.isNotEmpty) != (packageId != null), 'Provide either testIds or packageId, not both');
    return _client.post<DiagnosticBookingCreationResult>(
      '/api/v1/diagnostic-orders',
      body: {
        'labId': labId,
        if (testIds != null) 'testIds': testIds,
        if (packageId != null) 'packageId': packageId,
        if (recommendationId != null) 'recommendationId': recommendationId,
        'collectionMode': collectionMode,
        'scheduledAt': scheduledAt,
        if (address != null) 'address': address,
      },
      decode: (json) => DiagnosticBookingCreationResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<DiagnosticOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) {
    return _client.post<DiagnosticOrderDetail>(
      '/api/v1/diagnostic-orders/verify-payment',
      body: {
        'orderId': orderId,
        'razorpayOrderId': razorpayOrderId,
        'razorpayPaymentId': razorpayPaymentId,
        'razorpaySignature': razorpaySignature,
      },
      decode: (json) => DiagnosticOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<DiagnosticOrderDetail> cancel(String orderId, {String? reason}) {
    return _client.post<DiagnosticOrderDetail>(
      '/api/v1/diagnostic-orders/$orderId/cancel',
      body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      decode: (json) => DiagnosticOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<DiagnosticOrderDetail> detail(String orderId) {
    return _client.get<DiagnosticOrderDetail>(
      '/api/v1/diagnostic-orders/$orderId',
      decode: (json) => DiagnosticOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<DiagnosticOrderDetail>> mine() {
    return _client.get<List<DiagnosticOrderDetail>>(
      '/api/v1/diagnostic-orders/mine',
      decode: (json) =>
          ((json as Map<String, dynamic>)['orders'] as List<dynamic>).map((e) => DiagnosticOrderDetail.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<List<DiagnosticRecommendation>> myRecommendations() {
    return _client.get<List<DiagnosticRecommendation>>(
      '/api/v1/diagnostic-recommendations/mine',
      decode: (json) => ((json as Map<String, dynamic>)['recommendations'] as List<dynamic>)
          .map((e) => DiagnosticRecommendation.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<List<DiagnosticReportRef>> myReports() {
    return _client.get<List<DiagnosticReportRef>>(
      '/api/v1/reports/mine',
      decode: (json) =>
          ((json as Map<String, dynamic>)['reports'] as List<dynamic>).map((e) => DiagnosticReportRef.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<String> reportDownloadUrl(String reportId) {
    return _client.get<String>(
      '/api/v1/reports/$reportId/download',
      decode: (json) => (json as Map<String, dynamic>)['url'] as String,
    );
  }
}
