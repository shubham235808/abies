import '../../../core/api/api_client.dart';
import '../domain/doctor_detail.dart';
import '../domain/doctor_facets.dart';
import '../domain/doctor_review.dart';
import '../domain/doctor_search_result.dart';

/// Talks to the existing `/api/v1/public/doctors*` routes only — nothing
/// here invents an endpoint (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4 —
/// "no new backend work"). Behind one interface, mirroring `HomeApi`'s
/// shape, so the presentation layer is unit-testable with a fake.
abstract class DoctorsApi {
  /// `GET /api/v1/public/doctors` — the full filter set from
  /// `publicDoctorSearchSchema` (`packages/domain/src/modules/doctors/
  /// doctors.schemas.ts`): free-text `q`, `city`, `specialty`, `language`,
  /// consultation `mode`, `accepting`, plus `limit`/`offset` for pagination.
  Future<DoctorSearchResult> search({
    String? q,
    String? city,
    String? specialty,
    String? language,
    String? mode,
    bool? accepting,
    int limit = 20,
    int offset = 0,
  });

  /// `GET /api/v1/public/doctors/facets`.
  Future<DoctorFacets> facets();

  /// `GET /api/v1/public/doctors/[slug]`. Throws [ApiException] with
  /// `statusCode == 404` for a slug that doesn't resolve to a real,
  /// discoverable doctor — callers must treat that as a normal "not found"
  /// outcome, never a crash (docs/mobile/API-GAP-ANALYSIS.md §7's
  /// resolve-before-navigate rule).
  Future<DoctorDetail> detail(String slug);

  /// `GET /api/v1/public/doctors/[slug]/reviews`.
  Future<List<DoctorReview>> reviews(String slug);

  /// Resolves a backend-relative path (e.g. a `DoctorDetail.photoUrl`) to an
  /// absolute URL against the current environment's base URL, for
  /// `Image.network`. The photo route itself
  /// (`GET /api/v1/public/doctors/[slug]/photo`) is a public 302 redirect to
  /// a signed object-storage URL — confirmed by reading that route, it needs
  /// no session cookie, so a plain `Image.network` on the resolved URL works
  /// without going through [ApiClient]/Dio at all.
  String? absolutePhotoUrl(String? relativePath);
}

class DoctorsApiImpl implements DoctorsApi {
  DoctorsApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<DoctorSearchResult> search({
    String? q,
    String? city,
    String? specialty,
    String? language,
    String? mode,
    bool? accepting,
    int limit = 20,
    int offset = 0,
  }) {
    return _client.get<DoctorSearchResult>(
      '/api/v1/public/doctors',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (city != null && city.isNotEmpty) 'city': city,
        if (specialty != null && specialty.isNotEmpty) 'specialty': specialty,
        if (language != null && language.isNotEmpty) 'language': language,
        if (mode != null && mode.isNotEmpty) 'mode': mode,
        if (accepting != null) 'accepting': accepting.toString(),
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
      decode: (json) => DoctorSearchResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<DoctorFacets> facets() {
    return _client.get<DoctorFacets>(
      '/api/v1/public/doctors/facets',
      decode: (json) => DoctorFacets.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<DoctorDetail> detail(String slug) {
    return _client.get<DoctorDetail>(
      '/api/v1/public/doctors/$slug',
      decode: (json) => DoctorDetail.fromJson((json as Map<String, dynamic>)['doctor'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<DoctorReview>> reviews(String slug) {
    return _client.get<List<DoctorReview>>(
      '/api/v1/public/doctors/$slug/reviews',
      decode: (json) => ((json as Map<String, dynamic>)['reviews'] as List<dynamic>)
          .map((e) => DoctorReview.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  String? absolutePhotoUrl(String? relativePath) {
    if (relativePath == null || relativePath.isEmpty) return null;
    return '${_client.env.baseUrl}$relativePath';
  }
}
