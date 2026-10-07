/// Matches one entry of `GET /api/v1/panchakarma-bookings/mine`'s
/// `bookings[]` (`listMineAsPatient()` in
/// `packages/domain/src/modules/panchakarma/bookings.service.ts`). Only the
/// fields the home screen's "Active orders" card shows.
class PanchakarmaBookingSummary {
  const PanchakarmaBookingSummary({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.centreName,
    required this.therapyName,
    required this.sessionCount,
  });

  final String id;

  /// One of `PanchakarmaBookingStatus`: RECOMMENDED, BOOKED, SCHEDULED,
  /// IN_PROGRESS, COMPLETED, CANCELLED.
  final String status;
  final DateTime createdAt;
  final String? centreName;
  final String? therapyName;
  final int sessionCount;

  /// "Active" per docs/mobile/IMPLEMENTATION-PLAN.md Phase 3: not yet
  /// completed and not cancelled.
  bool get isActive => status != 'COMPLETED' && status != 'CANCELLED';

  factory PanchakarmaBookingSummary.fromJson(Map<String, dynamic> json) {
    final centre = json['centre'] as Map<String, dynamic>?;
    final therapy = json['therapy'] as Map<String, dynamic>?;
    return PanchakarmaBookingSummary(
      id: json['id'] as String,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      centreName: centre?['name'] as String?,
      therapyName: therapy?['name'] as String?,
      sessionCount: json['sessionCount'] as int,
    );
  }
}
