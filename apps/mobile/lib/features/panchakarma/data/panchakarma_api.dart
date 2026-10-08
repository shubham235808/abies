import '../../../core/api/api_client.dart';
import '../domain/panchakarma_booking_creation.dart';
import '../domain/panchakarma_booking_detail.dart';
import '../domain/panchakarma_centre.dart';
import '../domain/panchakarma_facets.dart';
import '../domain/panchakarma_search_result.dart';

/// Talks to the existing `/api/v1/public/panchakarma*` and
/// `/api/v1/panchakarma-bookings*` routes only — nothing here invents an
/// endpoint (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5 — "no new backend
/// work"). Behind one interface, mirroring `DoctorsApi`/`AppointmentsApi`'s
/// shape, so the presentation layer is unit-testable with a fake.
abstract class PanchakarmaApi {
  /// `GET /api/v1/public/panchakarma` — the full filter set
  /// `publicTherapySearchSchema` accepts (`packages/domain/src/modules/
  /// panchakarma/catalogue.schemas.ts`): free-text `q`, `city`, plus
  /// `limit`/`offset` for pagination. Deliberately smaller than doctors'
  /// filter set — read directly from the real schema, not assumed.
  Future<PanchakarmaSearchResult> search({String? q, String? city, int limit = 20, int offset = 0});

  /// `GET /api/v1/public/panchakarma/facets`.
  Future<PanchakarmaFacets> facets();

  /// `GET /api/v1/public/panchakarma-centres?city=` — a *different* path
  /// than `/public/panchakarma` (confirmed by reading both routes): this one
  /// is centre-centric (`listApprovedCentres()`), the other therapy-centric
  /// (`searchPublic()`). There is no public single-centre detail route.
  Future<List<PanchakarmaCentre>> centres({String? city});

  /// `POST /api/v1/panchakarma-bookings`. Throws [ApiException] with
  /// `statusCode == 503` when online payments aren't configured in this
  /// environment (`bookTherapy()`'s `ServiceUnavailableError` — checked
  /// *before* the centre/therapy are even looked up —
  /// `packages/domain/src/modules/panchakarma/bookings.service.ts`) — the
  /// expected outcome in dev today, not a bug; callers must treat it as a
  /// normal, displayable state (see `PanchakarmaBookingFlowController`).
  /// Throws `statusCode == 404` if the centre/therapy pair no longer
  /// resolves (e.g. deactivated since it was last listed).
  /// [idempotencyKey]: one per booking attempt (docs/mobile/
  /// IMPLEMENTATION-PLAN.md Phase 8), reused across that attempt's retries.
  Future<PanchakarmaBookingCreationResult> book({
    required String centreId,
    required String therapyId,
    required int sessionCount,
    String? idempotencyKey,
  });

  /// `POST /api/v1/panchakarma-bookings/verify-payment`. Not reachable from
  /// this phase's UI (no booking ever succeeds without real Razorpay keys —
  /// see `PanchakarmaBookingCreationResult`'s doc comment) but implemented
  /// against the real contract so the plumbing is correct ahead of Phase 8.
  Future<PanchakarmaBookingDetail> verifyPayment({
    required String bookingId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  });

  /// `POST /api/v1/panchakarma-bookings/[id]/cancel`. Returns the bare,
  /// un-included booking row (see `PanchakarmaBookingDetail`'s doc comment)
  /// — callers that need the full joined shape should reload `mine()`.
  Future<PanchakarmaBookingDetail> cancel(String bookingId, {String? reason});

  /// `GET /api/v1/panchakarma-bookings/[id]` — the full joined detail shape
  /// (centre, therapy, sessions with therapist name, payment).
  Future<PanchakarmaBookingDetail> detail(String bookingId);

  /// `GET /api/v1/panchakarma-bookings/mine`.
  Future<List<PanchakarmaBookingDetail>> mine();
}

class PanchakarmaApiImpl implements PanchakarmaApi {
  PanchakarmaApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<PanchakarmaSearchResult> search({String? q, String? city, int limit = 20, int offset = 0}) {
    return _client.get<PanchakarmaSearchResult>(
      '/api/v1/public/panchakarma',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (city != null && city.isNotEmpty) 'city': city,
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
      decode: (json) => PanchakarmaSearchResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<PanchakarmaFacets> facets() {
    return _client.get<PanchakarmaFacets>(
      '/api/v1/public/panchakarma/facets',
      decode: (json) => PanchakarmaFacets.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<List<PanchakarmaCentre>> centres({String? city}) {
    return _client.get<List<PanchakarmaCentre>>(
      '/api/v1/public/panchakarma-centres',
      query: {if (city != null && city.isNotEmpty) 'city': city},
      decode: (json) => ((json as Map<String, dynamic>)['centres'] as List<dynamic>)
          .map((e) => PanchakarmaCentre.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<PanchakarmaBookingCreationResult> book({
    required String centreId,
    required String therapyId,
    required int sessionCount,
    String? idempotencyKey,
  }) {
    return _client.post<PanchakarmaBookingCreationResult>(
      '/api/v1/panchakarma-bookings',
      idempotencyKey: idempotencyKey,
      body: {'centreId': centreId, 'therapyId': therapyId, 'sessionCount': sessionCount},
      decode: (json) => PanchakarmaBookingCreationResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<PanchakarmaBookingDetail> verifyPayment({
    required String bookingId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) {
    return _client.post<PanchakarmaBookingDetail>(
      '/api/v1/panchakarma-bookings/verify-payment',
      body: {
        'bookingId': bookingId,
        'razorpayOrderId': razorpayOrderId,
        'razorpayPaymentId': razorpayPaymentId,
        'razorpaySignature': razorpaySignature,
      },
      decode: (json) => PanchakarmaBookingDetail.fromJson((json as Map<String, dynamic>)['booking'] as Map<String, dynamic>),
    );
  }

  @override
  Future<PanchakarmaBookingDetail> cancel(String bookingId, {String? reason}) {
    return _client.post<PanchakarmaBookingDetail>(
      '/api/v1/panchakarma-bookings/$bookingId/cancel',
      body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      decode: (json) => PanchakarmaBookingDetail.fromJson((json as Map<String, dynamic>)['booking'] as Map<String, dynamic>),
    );
  }

  @override
  Future<PanchakarmaBookingDetail> detail(String bookingId) {
    return _client.get<PanchakarmaBookingDetail>(
      '/api/v1/panchakarma-bookings/$bookingId',
      decode: (json) => PanchakarmaBookingDetail.fromJson((json as Map<String, dynamic>)['booking'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<PanchakarmaBookingDetail>> mine() {
    return _client.get<List<PanchakarmaBookingDetail>>(
      '/api/v1/panchakarma-bookings/mine',
      decode: (json) => ((json as Map<String, dynamic>)['bookings'] as List<dynamic>)
          .map((e) => PanchakarmaBookingDetail.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
