import 'diagnostic_test_summary.dart';

/// `GET /api/v1/public/diagnostics`'s full response — `{ total, tests }`
/// (`searchPublic()`'s return statement in `packages/domain/src/modules/
/// diagnostics/catalogue.service.ts`).
///
/// Like Phase 5's `PanchakarmaSearchResult`, this response does **not** echo
/// back `offset`/`limit` — confirmed directly from `searchPublic()`'s
/// `return { total, tests };`. `DiagnosticTestSearchController` tracks the
/// offset/limit it itself requested rather than reading a field that
/// doesn't exist.
class DiagnosticTestSearchResult {
  const DiagnosticTestSearchResult({required this.total, required this.tests});

  final int total;
  final List<DiagnosticTestSummary> tests;

  factory DiagnosticTestSearchResult.fromJson(Map<String, dynamic> json) {
    return DiagnosticTestSearchResult(
      total: json['total'] as int? ?? 0,
      tests: (json['tests'] as List<dynamic>? ?? const []).map((e) => DiagnosticTestSummary.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
