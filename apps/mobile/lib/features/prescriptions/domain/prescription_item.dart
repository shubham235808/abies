/// One entry of a `Prescription`'s `items[]` — `PrescriptionItem` in
/// `packages/domain/prisma/schema.prisma`, read via
/// `listFinalizedPrescriptionsForPatient()`'s plain `items: true` include
/// (`packages/domain/src/modules/medicines/orders.service.ts`) — the full
/// row, every field below always present on a FINALIZED prescription.
///
/// [medicineId] is resolved automatically at finalize time
/// (`resolveMedicineByName()`) — `productName` is what the doctor actually
/// typed and what always renders; a free-text/compounded item the catalogue
/// never resolved has `medicineId: null` and can never be matched at a
/// pharmacy (`matchPrescriptionAtPharmacy()`'s own rule — see
/// `PrescriptionMatchItem`'s doc comment).
class PrescriptionItem {
  const PrescriptionItem({
    required this.id,
    required this.medicineId,
    required this.productName,
    required this.dosage,
    required this.frequency,
    required this.durationDays,
    required this.route,
    required this.instructions,
    required this.startDate,
    required this.endDate,
  });

  final String id;
  final String? medicineId;
  final String productName;
  final String? dosage;
  final String? frequency;
  final int? durationDays;
  final String? route;
  final String? instructions;
  final DateTime? startDate;
  final DateTime? endDate;

  factory PrescriptionItem.fromJson(Map<String, dynamic> json) {
    return PrescriptionItem(
      id: json['id'] as String,
      medicineId: json['medicineId'] as String?,
      productName: json['productName'] as String,
      dosage: json['dosage'] as String?,
      frequency: json['frequency'] as String?,
      durationDays: json['durationDays'] as int?,
      route: json['route'] as String?,
      instructions: json['instructions'] as String?,
      startDate: json['startDate'] != null ? DateTime.parse(json['startDate'] as String) : null,
      endDate: json['endDate'] != null ? DateTime.parse(json['endDate'] as String) : null,
    );
  }
}
