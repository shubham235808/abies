/// One variant option on a [MedicineSummary] — `PublicMedicineVariantOption`
/// in `packages/domain/src/modules/medicines/catalogue.service.ts`. A
/// `variantId` of `null` means "this pharmacy's plain, non-variant batch(es)
/// of this medicine", not "no variants exist" — a medicine can have a mix of
/// variant and non-variant rows in principle, though in practice a
/// medicine either has variants (EXPANSION-1) or doesn't.
class MedicineVariantOption {
  const MedicineVariantOption({
    required this.variantId,
    required this.label,
    required this.price,
    required this.quantityAvailable,
  });

  final String? variantId;
  final String? label;

  /// Rupees (whole units).
  final int price;
  final int quantityAvailable;

  factory MedicineVariantOption.fromJson(Map<String, dynamic> json) {
    return MedicineVariantOption(
      variantId: json['variantId'] as String?,
      label: json['label'] as String?,
      price: json['price'] as int,
      quantityAvailable: json['quantityAvailable'] as int,
    );
  }
}

/// One entry of `GET /api/v1/public/medicines`'s `medicines[]`
/// (`searchPublic()`'s `PublicMedicineListing` in `packages/domain/src/
/// modules/medicines/catalogue.service.ts`) — **OTC-only**
/// (`requiresPrescription: false`), one row per (pharmacy, medicine) pair,
/// confirmed by reading that function directly rather than assumed. A
/// prescription-required medicine never appears here; it's only reachable
/// through a finalized prescription's own match flow (`PrescriptionMatchItem`
/// in `lib/features/prescriptions/domain/`).
///
/// **No single-medicine detail route** (`GET /public/medicines/[id]` doesn't
/// exist — confirmed by reading every route under `.../api/v1/public/
/// medicines*`; same already-known gap as Panchakarma/Diagnostics). Detail
/// screens take this exact object via `GoRouter` `extra`, never re-fetch by
/// id — see `lib/features/pharmacy/PHASE.md`.
class MedicineSummary {
  const MedicineSummary({
    required this.medicineId,
    required this.name,
    required this.genericName,
    required this.form,
    required this.strength,
    required this.brandName,
    required this.imageUrl,
    required this.pharmacyId,
    required this.pharmacyName,
    required this.pharmacyServiceAreas,
    required this.quantityAvailable,
    required this.price,
    required this.rating,
    required this.reviewCount,
    required this.isFmcg,
    required this.variants,
  });

  final String medicineId;
  final String name;
  final String? genericName;
  final String? form;
  final String? strength;
  final String? brandName;
  final String? imageUrl;

  final String pharmacyId;
  final String? pharmacyName;
  final List<String> pharmacyServiceAreas;

  /// Summed across this pharmacy's in-stock batches of this medicine (every
  /// variant combined) — a "from ₹X, Y in stock" summary; [variants] carries
  /// the per-pack-size breakdown for a pack-size selector.
  final int quantityAvailable;

  /// Rupees (whole units) — the cheapest in-stock batch's price.
  final int price;

  /// 0 until at least 3 published reviews exist (`reviews.service.ts`'s
  /// `MIN_SAMPLE_SIZE`) — display as "New" below that, not a 0-star rating.
  final double rating;
  final int reviewCount;
  final bool isFmcg;
  final List<MedicineVariantOption> variants;

  /// A medicine with no variants has exactly one row here, `variantId: null`
  /// — "add to cart" should pass `null` for `variantId` in that case.
  bool get hasVariants => variants.any((v) => v.variantId != null);

  factory MedicineSummary.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    final variants = json['variants'] as List<dynamic>? ?? const [];
    return MedicineSummary(
      medicineId: json['medicineId'] as String,
      name: json['name'] as String,
      genericName: json['genericName'] as String?,
      form: json['form'] as String?,
      strength: json['strength'] as String?,
      brandName: json['brandName'] as String?,
      imageUrl: json['imageUrl'] as String?,
      pharmacyId: pharmacy?['id'] as String? ?? '',
      pharmacyName: pharmacy?['name'] as String?,
      pharmacyServiceAreas: ((pharmacy?['serviceAreas'] as List<dynamic>?) ?? const []).map((e) => e.toString()).toList(),
      quantityAvailable: json['quantityAvailable'] as int,
      price: json['price'] as int,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: json['reviewCount'] as int? ?? 0,
      isFmcg: json['isFmcg'] as bool? ?? false,
      variants: variants.map((e) => MedicineVariantOption.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
