/// The full appointment shape, matching `listMineAsPatient()`'s include
/// clause in `packages/domain/src/modules/appointments/
/// appointments.service.ts` — `GET /api/v1/appointments/mine`'s
/// `appointments[]`. Distinct from `lib/features/home/domain/
/// appointment_summary.dart`'s `AppointmentSummary` (Phase 3's narrower
/// home-dashboard card): this one keeps every field the list/detail/cancel/
/// review screen needs (reason for visit, payment status/amount,
/// cancellation detail, the linked consultation).
///
/// Also used to parse `POST /api/v1/appointments/[id]/cancel`'s response —
/// that route returns the appointment with **no** includes (a bare
/// `findUniqueOrThrow`), so every nested field below is null there. Callers
/// that need the full joined shape after a cancel should reload
/// `AppointmentsController`'s list rather than trust that thin response.
class AppointmentDetail {
  const AppointmentDetail({
    required this.id,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.status,
    required this.mode,
    required this.reasonForVisit,
    required this.cancelledAt,
    required this.cancellationReason,
    required this.doctorSlug,
    required this.doctorName,
    required this.clinicName,
    required this.clinicCity,
    required this.familyMemberName,
    required this.paymentStatus,
    required this.paymentAmount,
    required this.consultationStatus,
  });

  final String id;
  final DateTime scheduledAt;
  final int durationMinutes;

  /// One of `AppointmentStatus` (`packages/domain/prisma/schema.prisma`):
  /// PENDING_PAYMENT, CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED, NO_SHOW.
  final String status;

  /// "VIDEO" or "CLINIC".
  final String mode;
  final String? reasonForVisit;
  final DateTime? cancelledAt;
  final String? cancellationReason;

  final String? doctorSlug;
  final String? doctorName;
  final String? clinicName;
  final String? clinicCity;
  final String? familyMemberName;

  /// `Payment.status` (CREATED/PENDING/SUCCESS/FAILED/REFUNDED/
  /// PARTIALLY_REFUNDED), null if this appointment never reached payment.
  final String? paymentStatus;

  /// Rupees (whole units), matching `Payment.amount`'s unit.
  final int? paymentAmount;

  /// `Consultation.status` (SCHEDULED/.../CANCELLED), null before
  /// confirmation (a `Consultation` row is only created once
  /// `/verify-payment` succeeds — `appointments.service.ts`'s
  /// `finalizePaymentSuccessByOrder`).
  final String? consultationStatus;

  /// Same "future and not cancelled" rule as
  /// `AppointmentSummary.isUpcoming` (Phase 3).
  bool get isUpcoming => status != 'CANCELLED' && scheduledAt.isAfter(DateTime.now());

  /// Mirrors `cancelAppointment()`'s own rule in `appointments.service.ts` —
  /// only PENDING_PAYMENT or CONFIRMED appointments can be cancelled. This is
  /// a display convenience only: the backend re-checks this on every cancel
  /// call regardless of what this client believes.
  bool get canCancel => status == 'PENDING_PAYMENT' || status == 'CONFIRMED';

  /// Mirrors `reviewDoctor()`'s own rule — only a COMPLETED appointment is
  /// reviewable. Doesn't know whether a review already exists for it (that
  /// isn't part of this response); the backend's own `ConflictError` on a
  /// repeat attempt is the actual source of truth, surfaced to the user as a
  /// normal error message, not pre-empted here.
  bool get canReview => status == 'COMPLETED';

  factory AppointmentDetail.fromJson(Map<String, dynamic> json) {
    final doctor = json['doctorProfile'] as Map<String, dynamic>?;
    final clinic = json['clinic'] as Map<String, dynamic>?;
    final familyMember = json['careRecipientFamilyMember'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    final consultation = json['consultation'] as Map<String, dynamic>?;
    final doctorName = doctor == null
        ? null
        : [doctor['title'] as String? ?? 'Dr.', doctor['firstName'] as String?, doctor['lastName'] as String?]
            .where((p) => p != null && p.isNotEmpty)
            .join(' ');
    return AppointmentDetail(
      id: json['id'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      durationMinutes: json['durationMinutes'] as int? ?? 0,
      status: json['status'] as String,
      mode: json['mode'] as String,
      reasonForVisit: json['reasonForVisit'] as String?,
      cancelledAt: json['cancelledAt'] != null ? DateTime.parse(json['cancelledAt'] as String) : null,
      cancellationReason: json['cancellationReason'] as String?,
      doctorSlug: doctor?['slug'] as String?,
      doctorName: doctorName,
      clinicName: clinic?['name'] as String?,
      clinicCity: clinic?['city'] as String?,
      familyMemberName: familyMember?['name'] as String?,
      paymentStatus: payment?['status'] as String?,
      paymentAmount: payment?['amount'] as int?,
      consultationStatus: consultation?['status'] as String?,
    );
  }
}
