/// One row of `GET /api/v1/public/diagnostics`'s `tests[]` (`searchPublic()`'s
/// `PublicTest` shape in `packages/domain/src/modules/diagnostics/
/// catalogue.service.ts`) — the real search result (Phase 6), distinct from
/// `lib/features/home/domain/diagnostic_preview.dart`'s `DiagnosticPreview`
/// (Phase 3's narrower home-dashboard card, which drops `code`/`description`/
/// `sampleType`/`preparationInstructions` and the lab's own id/serviceCities/
/// homeCollectionSupported).
///
/// **No single-test detail route exists** (confirmed by reading every route
/// under `apps/platform-api/src/app/api/v1/public/diagnostics*` — there is no
/// `/public/diagnostics/[id]`), the exact same gap Phase 5 found for
/// Panchakarma. This object, exactly as returned by the search endpoint, *is*
/// the detail data — the detail screen is handed this same instance via
/// `GoRouter`'s `extra`, never re-fetched by id. See
/// `lib/features/diagnostics/PHASE.md`.
class DiagnosticTestSummary {
  const DiagnosticTestSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.description,
    required this.sampleType,
    required this.preparationInstructions,
    required this.price,
    required this.turnaroundHours,
    required this.labId,
    required this.labName,
    required this.labServiceCities,
    required this.labHomeCollectionSupported,
  });

  final String id;
  final String code;
  final String name;
  final String? description;
  final String? sampleType;
  final String? preparationInstructions;

  /// Rupees (whole units) — `DiagnosticTest.price`'s unit, same convention as
  /// `Payment.amount` elsewhere in this app.
  final int price;
  final int? turnaroundHours;

  final String labId;
  final String? labName;
  final List<String> labServiceCities;
  final bool labHomeCollectionSupported;

  factory DiagnosticTestSummary.fromJson(Map<String, dynamic> json) {
    final lab = json['lab'] as Map<String, dynamic>?;
    return DiagnosticTestSummary(
      id: json['id'] as String,
      code: json['code'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      sampleType: json['sampleType'] as String?,
      preparationInstructions: json['preparationInstructions'] as String?,
      price: json['price'] as int,
      turnaroundHours: json['turnaroundHours'] as int?,
      labId: lab?['id'] as String? ?? '',
      labName: lab?['name'] as String?,
      labServiceCities: (lab?['serviceCities'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      labHomeCollectionSupported: lab?['homeCollectionSupported'] as bool? ?? false,
    );
  }

  /// Value equality by id+labId — same rationale as `PanchakarmaTherapy`'s
  /// (Phase 5): booking-flow provider family keys need this to match across
  /// rebuilds even when a screen reconstructs an equal-but-distinct instance.
  @override
  bool operator ==(Object other) => other is DiagnosticTestSummary && other.id == id && other.labId == labId;

  @override
  int get hashCode => Object.hash(id, labId);
}
