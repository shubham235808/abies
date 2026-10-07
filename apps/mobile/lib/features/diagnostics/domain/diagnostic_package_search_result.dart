import 'diagnostic_package_summary.dart';

/// `GET /api/v1/public/diagnostics/packages`'s full response — `{ total,
/// packages }` (`searchPackagesPublic()`'s return statement). Same
/// no-offset/limit-echoed note as `DiagnosticTestSearchResult`.
class DiagnosticPackageSearchResult {
  const DiagnosticPackageSearchResult({required this.total, required this.packages});

  final int total;
  final List<DiagnosticPackageSummary> packages;

  factory DiagnosticPackageSearchResult.fromJson(Map<String, dynamic> json) {
    return DiagnosticPackageSearchResult(
      total: json['total'] as int? ?? 0,
      packages:
          (json['packages'] as List<dynamic>? ?? const []).map((e) => DiagnosticPackageSummary.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
