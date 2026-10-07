/// One row of `GET /api/v1/public/diagnostics/packages`'s `packages[]`
/// (`searchPackagesPublic()`'s `PublicPackage` shape in `packages/domain/src/
/// modules/diagnostics/catalogue.service.ts`) — a *different* path and shape
/// than `/public/diagnostics` (confirmed by reading both routes): this one is
/// package-centric and carries `testNames[]` (the bundled tests' names only,
/// not full test objects) instead of `code`/`sampleType`/`turnaroundHours`.
///
/// Same "no single-item detail route" gap as `DiagnosticTestSummary` — there
/// is no `/public/diagnostics/packages/[id]` either. See
/// `lib/features/diagnostics/PHASE.md`.
class DiagnosticPackageSummary {
  const DiagnosticPackageSummary({
    required this.id,
    required this.name,
    required this.description,
    required this.price,
    required this.testNames,
    required this.labId,
    required this.labName,
    required this.labServiceCities,
    required this.labHomeCollectionSupported,
  });

  final String id;
  final String name;
  final String? description;

  /// Rupees (whole units) for the whole bundle — not the sum of its tests'
  /// own prices, which is typically a discount off that sum (`createPackage()`
  /// takes this as its own explicit field, never derived).
  final int price;
  final List<String> testNames;

  final String labId;
  final String? labName;
  final List<String> labServiceCities;
  final bool labHomeCollectionSupported;

  factory DiagnosticPackageSummary.fromJson(Map<String, dynamic> json) {
    final lab = json['lab'] as Map<String, dynamic>?;
    return DiagnosticPackageSummary(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      price: json['price'] as int,
      testNames: (json['testNames'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      labId: lab?['id'] as String? ?? '',
      labName: lab?['name'] as String?,
      labServiceCities: (lab?['serviceCities'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      labHomeCollectionSupported: lab?['homeCollectionSupported'] as bool? ?? false,
    );
  }

  @override
  bool operator ==(Object other) => other is DiagnosticPackageSummary && other.id == id && other.labId == labId;

  @override
  int get hashCode => Object.hash(id, labId);
}
