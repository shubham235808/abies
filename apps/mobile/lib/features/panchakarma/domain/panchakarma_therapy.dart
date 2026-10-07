/// One row of `GET /api/v1/public/panchakarma`'s `therapies[]`
/// (`searchPublic()`'s `PublicTherapy` shape in `packages/domain/src/modules/
/// panchakarma/catalogue.service.ts`) — the real search/browse result
/// (Phase 5), distinct from `lib/features/home/domain/panchakarma_preview.dart`'s
/// `PanchakarmaPreview` (Phase 3's narrower home-dashboard card, which drops
/// `description`/`prerequisites`/`contraindications`/`requiredSupervision`
/// and the centre's own id).
///
/// **No single-therapy detail route exists** (confirmed by reading every
/// route under `apps/platform-api/src/app/api/v1/public/panchakarma*` —
/// there is no `/public/panchakarma/[id]`), unlike doctors' `/[slug]`. This
/// object, exactly as returned by the search endpoint, *is* the detail data
/// — the detail screen is handed this same instance via `GoRouter`'s
/// `extra`, never re-fetched by id (there is nothing to re-fetch from). See
/// `lib/features/panchakarma/PHASE.md` for this gap, reported rather than
/// worked around.
class PanchakarmaTherapy {
  const PanchakarmaTherapy({
    required this.id,
    required this.name,
    required this.description,
    required this.durationMinutes,
    required this.prerequisites,
    required this.contraindications,
    required this.price,
    required this.requiredSupervision,
    required this.centreId,
    required this.centreName,
    required this.centreCity,
    required this.centreState,
  });

  final String id;
  final String name;
  final String? description;
  final int? durationMinutes;
  final String? prerequisites;
  final String? contraindications;

  /// Rupees (whole units) for one session — `Therapy.price`'s unit, same
  /// convention as `Payment.amount` elsewhere in this app. The booking
  /// screen's own displayed total (`price * sessionCount`) is only ever an
  /// estimate; the backend computes the authoritative amount.
  final int price;
  final bool requiredSupervision;

  final String centreId;
  final String? centreName;
  final String? centreCity;
  final String? centreState;

  factory PanchakarmaTherapy.fromJson(Map<String, dynamic> json) {
    final centre = json['centre'] as Map<String, dynamic>?;
    return PanchakarmaTherapy(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String?,
      durationMinutes: json['durationMinutes'] as int?,
      prerequisites: json['prerequisites'] as String?,
      contraindications: json['contraindications'] as String?,
      price: json['price'] as int,
      requiredSupervision: json['requiredSupervision'] as bool? ?? false,
      centreId: centre?['id'] as String? ?? '',
      centreName: centre?['name'] as String?,
      centreCity: centre?['city'] as String?,
      centreState: centre?['state'] as String?,
    );
  }

  /// Value equality by id+centre — not identity — so
  /// `panchakarmaBookingFlowControllerProvider.family`'s cache keys
  /// correctly even if a screen reconstructs an equal-but-distinct instance
  /// across rebuilds, same rationale as Phase 4's `BookingParams`.
  @override
  bool operator ==(Object other) => other is PanchakarmaTherapy && other.id == id && other.centreId == centreId;

  @override
  int get hashCode => Object.hash(id, centreId);
}
