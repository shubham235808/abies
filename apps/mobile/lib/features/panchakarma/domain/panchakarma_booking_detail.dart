import 'panchakarma_session.dart';

/// One booking, in the one shape that covers every response that returns a
/// `PanchakarmaBooking` row to a patient — same "one model, several
/// differently-included server responses, all null-safe" relationship Phase
/// 4 established between its preview and detail appointment models:
///
/// - `GET /api/v1/panchakarma-bookings/mine`'s `bookings[]`
///   (`listMineAsPatient()`): `centre.name`, `therapy.name`, and bare
///   `sessions[]` (no nested therapist) — `centreCity`/`centreState`/
///   `therapyDurationMinutes`/`paymentStatus`/`paymentAmount` are null here.
/// - `GET /api/v1/panchakarma-bookings/[id]` (`getBooking()`): the full
///   joined shape — note its `detailInclude()` is spread as
///   `{ ...detailInclude(), centre: true }`, so the later `centre: true` key
///   wins and the *full* `PanchakarmaCentre` row comes back (not just
///   `{id,name,city,state}`) — this model only reads the subset it displays.
/// - `POST /api/v1/panchakarma-bookings/[id]/cancel`'s response
///   (`cancelBooking()`'s final `findUniqueOrThrow` has **no includes at
///   all**): every nested field below is null there too. Callers that need
///   the full joined shape after a cancel should reload the `/mine` list
///   rather than trust that thin response — same rule
///   `AppointmentDetail`/`AppointmentsController` used in Phase 4.
class PanchakarmaBookingDetail {
  const PanchakarmaBookingDetail({
    required this.id,
    required this.centreId,
    required this.therapyId,
    required this.sessionCount,
    required this.status,
    required this.createdAt,
    required this.cancelledAt,
    required this.cancellationReason,
    required this.centreName,
    required this.centreCity,
    required this.centreState,
    required this.therapyName,
    required this.therapyDurationMinutes,
    required this.paymentStatus,
    required this.paymentAmount,
    required this.sessions,
  });

  final String id;
  final String centreId;
  final String therapyId;
  final int sessionCount;

  /// One of `PanchakarmaBookingStatus` (`packages/domain/prisma/
  /// schema.prisma`): RECOMMENDED, BOOKED, SCHEDULED, IN_PROGRESS,
  /// COMPLETED, CANCELLED. (`RECOMMENDED` itself never appears on a row this
  /// app's own `bookTherapy()` call created — it's the pre-booking state of
  /// a doctor's recommendation, out of scope for this phase.)
  final String status;
  final DateTime createdAt;
  final DateTime? cancelledAt;
  final String? cancellationReason;

  final String? centreName;
  final String? centreCity;
  final String? centreState;

  final String? therapyName;
  final int? therapyDurationMinutes;

  /// `Payment.status` (CREATED/PENDING/SUCCESS/FAILED/REFUNDED/
  /// PARTIALLY_REFUNDED), null wherever this response doesn't join payment
  /// (`/mine` and `/cancel`, see class doc).
  final String? paymentStatus;

  /// Rupees (whole units), matching `Payment.amount`'s unit.
  final int? paymentAmount;

  final List<PanchakarmaSession> sessions;

  /// Mirrors `cancelBooking()`'s own rule in `bookings.service.ts` — only a
  /// BOOKED or SCHEDULED booking can be cancelled. Display convenience only:
  /// the backend re-checks this on every cancel call regardless.
  bool get canCancel => status == 'BOOKED' || status == 'SCHEDULED';

  /// "Active" per the same rule Phase 3's home-dashboard summary used: not
  /// yet completed and not cancelled.
  bool get isActive => status != 'COMPLETED' && status != 'CANCELLED';

  factory PanchakarmaBookingDetail.fromJson(Map<String, dynamic> json) {
    final centre = json['centre'] as Map<String, dynamic>?;
    final therapy = json['therapy'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    final sessions = json['sessions'] as List<dynamic>? ?? const [];
    return PanchakarmaBookingDetail(
      id: json['id'] as String,
      centreId: json['centreId'] as String? ?? centre?['id'] as String? ?? '',
      therapyId: json['therapyId'] as String? ?? '',
      sessionCount: json['sessionCount'] as int,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      cancelledAt: json['cancelledAt'] != null ? DateTime.parse(json['cancelledAt'] as String) : null,
      cancellationReason: json['cancellationReason'] as String?,
      centreName: centre?['name'] as String?,
      centreCity: centre?['city'] as String?,
      centreState: centre?['state'] as String?,
      therapyName: therapy?['name'] as String?,
      therapyDurationMinutes: therapy?['durationMinutes'] as int?,
      paymentStatus: payment?['status'] as String?,
      paymentAmount: payment?['amount'] as int?,
      sessions: sessions.map((e) => PanchakarmaSession.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
