/// One entry of `GET /api/v1/appointments/slots`'s `slots[]`
/// (`listAvailableSlots()` in `packages/domain/src/modules/appointments/
/// appointments.service.ts`) — a real, currently-open bookable slot,
/// generated on demand from the doctor's recurring availability and already
/// filtered server-side against existing holds/bookings. Never cached as
/// authoritative past the moment it's fetched (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 4 — "availability is never computed or
/// cached client-side as authoritative"); `BookingController.confirmBooking`
/// re-fetches this same list immediately before calling `/hold`.
class AppointmentSlot {
  const AppointmentSlot({required this.startsAt, required this.endsAt, required this.mode, this.clinicId});

  final DateTime startsAt;
  final DateTime endsAt;

  /// "VIDEO" or "CLINIC".
  final String mode;
  final String? clinicId;

  factory AppointmentSlot.fromJson(Map<String, dynamic> json) {
    return AppointmentSlot(
      startsAt: DateTime.parse(json['startsAt'] as String),
      endsAt: DateTime.parse(json['endsAt'] as String),
      mode: json['mode'] as String,
      clinicId: json['clinicId'] as String?,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is AppointmentSlot && other.startsAt == startsAt && other.mode == mode;

  @override
  int get hashCode => Object.hash(startsAt, mode);
}
