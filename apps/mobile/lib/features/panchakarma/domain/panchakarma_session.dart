/// One entry of a booking's `sessions[]` — patient-facing as **read-only**
/// data nested inside `GET /api/v1/panchakarma-bookings/[id]` and
/// `/panchakarma-bookings/mine` (confirmed by reading `getBooking()`'s and
/// `listMineAsPatient()`'s include clauses in `packages/domain/src/modules/
/// panchakarma/bookings.service.ts`); nothing in this phase writes a
/// session — that's the centre/therapist side's own
/// `panchakarma-centres/me/bookings/[id]/schedule-session` and
/// `.../sessions/[id]/attended` routes, out of scope for the patient app.
///
/// `therapistName` is only ever present from the `/[id]` detail route
/// (`getBooking()`'s `sessions.therapist.select.name`) — `/mine`'s own
/// include has no `therapist` join at all, so it's null there; this model
/// stays null-safe across both shapes rather than needing two classes.
class PanchakarmaSession {
  const PanchakarmaSession({
    required this.id,
    required this.sessionNumber,
    required this.scheduledAt,
    required this.attendedAt,
    required this.notes,
    required this.exceptionFlag,
    required this.therapistName,
  });

  final String id;
  final int sessionNumber;
  final DateTime scheduledAt;
  final DateTime? attendedAt;
  final String? notes;
  final String? exceptionFlag;
  final String? therapistName;

  bool get isAttended => attendedAt != null;

  factory PanchakarmaSession.fromJson(Map<String, dynamic> json) {
    final therapist = json['therapist'] as Map<String, dynamic>?;
    return PanchakarmaSession(
      id: json['id'] as String,
      sessionNumber: json['sessionNumber'] as int,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      attendedAt: json['attendedAt'] != null ? DateTime.parse(json['attendedAt'] as String) : null,
      notes: json['notes'] as String?,
      exceptionFlag: json['exceptionFlag'] as String?,
      therapistName: therapist?['name'] as String?,
    );
  }
}
