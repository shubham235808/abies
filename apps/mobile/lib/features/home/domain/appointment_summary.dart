/// Matches one entry of `GET /api/v1/appointments/mine`'s `appointments[]`
/// (`listMineAsPatient()` in
/// `packages/domain/src/modules/appointments/appointments.service.ts`). Only
/// the fields the home screen's "Upcoming appointments" card shows.
class AppointmentSummary {
  const AppointmentSummary({
    required this.id,
    required this.scheduledAt,
    required this.status,
    required this.mode,
    required this.doctorName,
    required this.clinicName,
    required this.familyMemberName,
  });

  final String id;
  final DateTime scheduledAt;

  /// One of `AppointmentStatus` (`packages/domain/prisma/schema.prisma`):
  /// PENDING_PAYMENT, CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED, NO_SHOW.
  final String status;

  /// One of `ConsultationMode`: VIDEO, CLINIC.
  final String mode;
  final String? doctorName;
  final String? clinicName;

  /// Set when this appointment was booked for a family member rather than
  /// the signed-in patient themselves.
  final String? familyMemberName;

  /// "Upcoming" per docs/mobile/IMPLEMENTATION-PLAN.md Phase 3: in the
  /// future and not cancelled. Deliberately not also excluding COMPLETED/
  /// NO_SHOW — a future-dated appointment in either of those states would be
  /// a backend data anomaly, not something this client should mask.
  bool get isUpcoming => status != 'CANCELLED' && scheduledAt.isAfter(DateTime.now());

  factory AppointmentSummary.fromJson(Map<String, dynamic> json) {
    final doctor = json['doctorProfile'] as Map<String, dynamic>?;
    final clinic = json['clinic'] as Map<String, dynamic>?;
    final familyMember = json['careRecipientFamilyMember'] as Map<String, dynamic>?;
    final doctorName = doctor == null
        ? null
        : [doctor['title'] as String? ?? 'Dr.', doctor['firstName'] as String?, doctor['lastName'] as String?]
            .where((p) => p != null && p.isNotEmpty)
            .join(' ');
    return AppointmentSummary(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      status: json['status'] as String,
      mode: json['mode'] as String,
      doctorName: doctorName,
      clinicName: clinic?['name'] as String?,
      familyMemberName: familyMember?['name'] as String?,
    );
  }
}
