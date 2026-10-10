import '../../../shared/format.dart';

/// One row of `GET /api/v1/doctors/me/appointments` → `{ appointments }`
/// (appointments.service.ts `listMineAsDoctor`, ordered scheduledAt desc,
/// including patientUser{mobile, patientProfile{firstName,lastName}},
/// careRecipientFamilyMember{name}, clinic{name,city}, consultation{id,status}).
class DoctorAppointment {
  const DoctorAppointment({
    required this.id,
    required this.mode,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.status,
    required this.reasonForVisit,
    required this.patientName,
    required this.careRecipientName,
    required this.clinicName,
    required this.consultationId,
    required this.consultationStatus,
  });

  final String id;
  final String mode;
  final DateTime scheduledAt;
  final int durationMinutes;

  /// PENDING_PAYMENT | CONFIRMED | CANCELLED | RESCHEDULED | COMPLETED | NO_SHOW.
  final String status;
  final String? reasonForVisit;
  final String patientName;
  final String? careRecipientName;
  final String? clinicName;

  /// Created on payment confirmation (appointments.service.ts), so a
  /// PENDING_PAYMENT appointment has none yet.
  final String? consultationId;
  final String? consultationStatus;

  bool get isVideo => mode == 'VIDEO';

  /// Same "upcoming" definition the web dashboard counts.
  bool get isUpcomingStatus => status == 'CONFIRMED' || status == 'PENDING_PAYMENT';

  factory DoctorAppointment.fromJson(Map<String, dynamic> json) {
    final patient = json['patientUser'] as Map<String, dynamic>? ?? const {};
    final profile = patient['patientProfile'] as Map<String, dynamic>?;
    final name = [profile?['firstName'] as String?, profile?['lastName'] as String?]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .join(' ');
    final consultation = json['consultation'] as Map<String, dynamic>?;
    return DoctorAppointment(
      id: json['id'] as String,
      mode: json['mode'] as String,
      scheduledAt: parseDate(json['scheduledAt'])!,
      durationMinutes: json['durationMinutes'] as int? ?? 0,
      status: json['status'] as String,
      reasonForVisit: json['reasonForVisit'] as String?,
      patientName: name.isEmpty ? (patient['mobile'] as String? ?? 'Patient') : name,
      careRecipientName: (json['careRecipientFamilyMember'] as Map<String, dynamic>?)?['name'] as String?,
      clinicName: (json['clinic'] as Map<String, dynamic>?)?['name'] as String?,
      consultationId: consultation?['id'] as String?,
      consultationStatus: consultation?['status'] as String?,
    );
  }
}
