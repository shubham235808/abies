import 'doctor_summary.dart';

/// `GET /api/v1/public/doctors`'s full response — `{ total, offset, limit,
/// doctors }` (`searchPublic()` in `packages/domain/src/modules/doctors/
/// doctors.service.ts`). Keeping `total`/`offset`/`limit` (not just the
/// `doctors` list, like Phase 3's home preview did) is what lets the search
/// screen know whether "load more" makes sense.
class DoctorSearchResult {
  const DoctorSearchResult({required this.total, required this.offset, required this.limit, required this.doctors});

  final int total;
  final int offset;
  final int limit;
  final List<DoctorSummary> doctors;

  bool get hasMore => offset + doctors.length < total;

  factory DoctorSearchResult.fromJson(Map<String, dynamic> json) {
    return DoctorSearchResult(
      total: json['total'] as int? ?? 0,
      offset: json['offset'] as int? ?? 0,
      limit: json['limit'] as int? ?? 0,
      doctors: (json['doctors'] as List<dynamic>? ?? const [])
          .map((e) => DoctorSummary.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
