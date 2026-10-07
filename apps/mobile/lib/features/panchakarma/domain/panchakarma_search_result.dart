import 'panchakarma_therapy.dart';

/// `GET /api/v1/public/panchakarma`'s full response — `{ total, therapies }`
/// (`searchPublic()` in `packages/domain/src/modules/panchakarma/
/// catalogue.service.ts`).
///
/// Unlike `DoctorSearchResult` (Phase 4), this response does **not** echo
/// back `offset`/`limit` — read directly from `searchPublic()`'s return
/// statement (`return { total, therapies };`), confirmed against the real
/// code, not assumed. `total` is still enough to know whether more pages
/// exist; the controller tracks the `offset`/`limit` *it itself requested*
/// (`PanchakarmaSearchController`) rather than reading them back from a
/// response field that doesn't exist.
class PanchakarmaSearchResult {
  const PanchakarmaSearchResult({required this.total, required this.therapies});

  final int total;
  final List<PanchakarmaTherapy> therapies;

  factory PanchakarmaSearchResult.fromJson(Map<String, dynamic> json) {
    return PanchakarmaSearchResult(
      total: json['total'] as int? ?? 0,
      therapies: (json['therapies'] as List<dynamic>? ?? const [])
          .map((e) => PanchakarmaTherapy.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
