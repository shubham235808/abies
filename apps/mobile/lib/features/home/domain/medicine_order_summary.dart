/// Matches one entry of `GET /api/v1/medicine-orders/mine`'s `orders[]`
/// (`listMineAsPatient()` in
/// `packages/domain/src/modules/medicines/orders.service.ts`). Only the
/// fields the home screen's "Active orders" card shows.
class MedicineOrderSummary {
  const MedicineOrderSummary({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.pharmacyName,
    required this.itemCount,
  });

  final String id;

  /// One of `MedicineOrderStatus`: PENDING, ACCEPTED, PACKING, DISPATCHED,
  /// DELIVERED, CANCELLED.
  final String status;
  final DateTime createdAt;
  final String? pharmacyName;
  final int itemCount;

  /// "Active" per docs/mobile/IMPLEMENTATION-PLAN.md Phase 3: not yet
  /// delivered and not cancelled.
  bool get isActive => status != 'DELIVERED' && status != 'CANCELLED';

  factory MedicineOrderSummary.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    final items = json['items'] as List<dynamic>? ?? const [];
    return MedicineOrderSummary(
      id: json['id'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      pharmacyName: pharmacy?['name'] as String?,
      itemCount: items.length,
    );
  }
}
