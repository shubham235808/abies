/// One entry of a `MedicineOrder`'s `items[]` — present on `/mine`'s and
/// `/[id]`'s responses (both include `items`), **absent (empty) on
/// `/cancel`'s and `/verify-payment`'s bare responses** (`orders.service.ts`'s
/// `cancelOrder()`/`finalizeMedicineOrderPaymentByOrder()` both end in a
/// plain `findUniqueOrThrow` with no includes at all — read directly from
/// that file, same thin-response shape Phase 6's `DiagnosticOrderItem` found
/// for diagnostic orders).
class MedicineOrderItem {
  const MedicineOrderItem({
    required this.medicineId,
    required this.medicineName,
    required this.medicineForm,
    required this.medicineStrength,
    required this.variantId,
    required this.variantLabel,
    required this.batchNumber,
    required this.quantity,
    required this.unitPrice,
    required this.prescriptionItemId,
  });

  final String medicineId;
  final String? medicineName;
  final String? medicineForm;
  final String? medicineStrength;
  final String? variantId;
  final String? variantLabel;
  final String batchNumber;
  final int quantity;

  /// Rupees (whole units) — the FEFO batch's price at the moment this item
  /// was ordered, never recomputed.
  final int unitPrice;

  /// Set only for an item fulfilled against a finalized prescription
  /// (`bookOrder()`'s own prescription-validation path) — null for a plain
  /// OTC item.
  final String? prescriptionItemId;

  int get lineTotal => unitPrice * quantity;

  factory MedicineOrderItem.fromJson(Map<String, dynamic> json) {
    final medicine = json['medicine'] as Map<String, dynamic>?;
    final variant = json['variant'] as Map<String, dynamic>?;
    return MedicineOrderItem(
      medicineId: json['medicineId'] as String,
      medicineName: medicine?['name'] as String?,
      medicineForm: medicine?['form'] as String?,
      medicineStrength: medicine?['strength'] as String?,
      variantId: json['variantId'] as String?,
      variantLabel: variant?['label'] as String?,
      batchNumber: json['batchNumber'] as String? ?? '',
      quantity: json['quantity'] as int,
      unitPrice: json['unitPrice'] as int,
      prescriptionItemId: json['prescriptionItemId'] as String?,
    );
  }
}
