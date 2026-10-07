/// Matches one entry of `GET /api/v1/diagnostic-orders/mine`'s `orders[]`
/// (`listMineAsPatient()` in
/// `packages/domain/src/modules/diagnostics/orders.service.ts`). Only the
/// fields the home screen's "Active orders" card shows.
class DiagnosticOrderSummary {
  const DiagnosticOrderSummary({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.labName,
    required this.itemCount,
  });

  final String id;

  /// One of `DiagnosticOrderStatus`: BOOKED, SCHEDULED, SAMPLE_COLLECTED,
  /// PROCESSING, COMPLETED, CANCELLED.
  final String status;
  final DateTime createdAt;
  final String? labName;
  final int itemCount;

  /// "Active" per docs/mobile/IMPLEMENTATION-PLAN.md Phase 3: not yet
  /// completed (the diagnostics equivalent of "delivered" — the report is
  /// ready) and not cancelled.
  bool get isActive => status != 'COMPLETED' && status != 'CANCELLED';

  factory DiagnosticOrderSummary.fromJson(Map<String, dynamic> json) {
    final lab = json['lab'] as Map<String, dynamic>?;
    final items = json['items'] as List<dynamic>? ?? const [];
    return DiagnosticOrderSummary(
      id: json['id'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      labName: lab?['name'] as String?,
      itemCount: items.length,
    );
  }
}
