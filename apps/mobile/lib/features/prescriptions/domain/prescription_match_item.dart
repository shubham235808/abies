/// One entry of `GET /api/v1/prescriptions/[id]/match?pharmacyId=`'s
/// `items[]` (`matchPrescriptionAtPharmacy()`'s `PrescriptionItemMatch` in
/// `packages/domain/src/modules/medicines/orders.service.ts`) — shows which
/// of a finalized prescription's items *this specific pharmacy* can
/// actually fulfil, before the patient commits to anything.
///
/// **This is the real "purchase from a finalized prescription" flow** — not
/// through the cart (`addToCart()` explicitly rejects any
/// `requiresPrescription` medicine with "order it from a finalized
/// prescription instead of the cart", confirmed by reading that function).
/// A matched, [available] item is bought by calling
/// `POST /api/v1/medicine-orders` directly with this [medicineId] and
/// `prescriptionId` set — a genuinely different, already patient-reachable
/// route (`requireRole(ctx, 'PATIENT')`, confirmed by reading that route
/// file) from the cart-checkout path. See `PharmacyApi.bookOrder`'s doc
/// comment and `lib/features/prescriptions/PHASE.md`.
class PrescriptionMatchItem {
  const PrescriptionMatchItem({
    required this.prescriptionItemId,
    required this.productName,
    required this.medicineId,
    required this.available,
    required this.quantityAvailable,
    required this.price,
  });

  final String prescriptionItemId;
  final String productName;

  /// Null for a free-text/compounded item the catalogue never resolved —
  /// [available] is always false in that case (there's nothing to match
  /// against any pharmacy's inventory).
  final String? medicineId;

  /// This pharmacy currently stocks enough of this exact medicine.
  final bool available;
  final int quantityAvailable;

  /// Rupees (whole units) — the cheapest in-stock batch's price, null when
  /// not [available].
  final int? price;

  factory PrescriptionMatchItem.fromJson(Map<String, dynamic> json) {
    return PrescriptionMatchItem(
      prescriptionItemId: json['prescriptionItemId'] as String,
      productName: json['productName'] as String,
      medicineId: json['medicineId'] as String?,
      available: json['available'] as bool? ?? false,
      quantityAvailable: json['quantityAvailable'] as int? ?? 0,
      price: json['price'] as int?,
    );
  }
}
