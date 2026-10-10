/// One `PharmacyInventory` batch (packages/domain/prisma/schema.prisma
/// ~line 1414) with its `medicine` and `variant` included — the exact
/// shape `listMyInventory`/`updateInventory` return
/// (packages/domain/src/modules/medicines/catalogue.service.ts ~lines 74,
/// 147: `include: { medicine: true, variant: true }`).
///
/// Pharmacy self-service only: admin has no view into this data at all
/// (docs/admin-portal-status-report.md §A), so this app is the pharmacist's
/// only mobile way to keep stock and selling price correct.
class InventoryItem {
  const InventoryItem({
    required this.id,
    required this.medicineId,
    required this.medicineName,
    required this.batchNumber,
    required this.expiryDate,
    required this.quantityAvailable,
    required this.price,
    this.form,
    this.strength,
    this.variantLabel,
    this.hsnCode,
    this.mrp,
    this.requiresPrescription = true,
    this.isFmcg = false,
  });

  /// Same thresholds as the web pharmacy overview
  /// (apps/partner-web/src/app/partner/pharmacy/page.tsx).
  static const lowStockThreshold = 10;
  static const expiringWithinDays = 30;

  final String id;
  final String medicineId;
  final String medicineName;
  final String? form;
  final String? strength;
  final String? variantLabel;
  final String? hsnCode;

  /// Admin-set master price (`Medicine.mrp`, nullable). The pharmacy's own
  /// selling price is [price].
  final int? mrp;
  final bool requiresPrescription;
  final bool isFmcg;
  final String batchNumber;
  final DateTime expiryDate;
  final int quantityAvailable;

  /// Selling price in whole rupees (`PharmacyInventory.price`, Int).
  final int price;

  String get displayName => variantLabel == null ? medicineName : '$medicineName ($variantLabel)';

  bool get isLowStock => quantityAvailable < lowStockThreshold;

  bool isExpiringSoonAt(DateTime now) {
    final daysLeft = expiryDate.difference(now).inHours / 24;
    return daysLeft >= 0 && daysLeft <= expiringWithinDays;
  }

  bool get isExpiringSoon => isExpiringSoonAt(DateTime.now());

  bool get isExpired => expiryDate.isBefore(DateTime.now());

  factory InventoryItem.fromJson(Map<String, dynamic> json) {
    final medicine = json['medicine'] as Map<String, dynamic>? ?? const {};
    final variant = json['variant'] as Map<String, dynamic>?;
    return InventoryItem(
      id: json['id'] as String,
      medicineId: json['medicineId'] as String? ?? medicine['id'] as String? ?? '',
      medicineName: medicine['name'] as String? ?? 'Unnamed item',
      form: medicine['form'] as String?,
      strength: medicine['strength'] as String?,
      hsnCode: medicine['hsnCode'] as String?,
      mrp: (medicine['mrp'] as num?)?.toInt(),
      requiresPrescription: medicine['requiresPrescription'] as bool? ?? true,
      isFmcg: medicine['isFmcg'] as bool? ?? false,
      variantLabel: variant?['label'] as String?,
      batchNumber: json['batchNumber'] as String? ?? '',
      expiryDate: DateTime.tryParse(json['expiryDate'] as String? ?? '')?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0),
      quantityAvailable: (json['quantityAvailable'] as num?)?.toInt() ?? 0,
      price: (json['price'] as num?)?.toInt() ?? 0,
    );
  }
}
