/// Matches `DoctorAvailability` (`packages/domain/prisma/schema.prisma`), as
/// embedded in the public doctor detail response's `availability[]`
/// (`publicDoctor()` — only active windows are ever included). This is a
/// recurring weekly window, not an actual bookable slot — real bookable
/// slots come only from `GET /api/v1/appointments/slots`
/// (`lib/features/appointments/domain/appointment_slot.dart`); this phase
/// never derives "is this slot free" from this model, only "which days/times
/// does this doctor generally see patients" for display.
class AvailabilityWindow {
  const AvailabilityWindow({
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.slotMinutes,
    required this.mode,
    this.clinicId,
  });

  /// 0 (Sunday) - 6 (Saturday), matching `DateTime.weekday % 7` conventions
  /// used by `_dayLabel` in the detail screen (Dart's `DateTime.weekday` is
  /// 1-7 Mon-Sun, so callers must convert, not assume they match directly).
  final int dayOfWeek;

  /// "HH:MM", 24-hour.
  final String startTime;
  final String endTime;
  final int slotMinutes;

  /// VIDEO or CLINIC.
  final String mode;
  final String? clinicId;

  factory AvailabilityWindow.fromJson(Map<String, dynamic> json) {
    return AvailabilityWindow(
      dayOfWeek: json['dayOfWeek'] as int,
      startTime: json['startTime'] as String,
      endTime: json['endTime'] as String,
      slotMinutes: json['slotMinutes'] as int? ?? 30,
      mode: json['mode'] as String,
      clinicId: json['clinicId'] as String?,
    );
  }
}
