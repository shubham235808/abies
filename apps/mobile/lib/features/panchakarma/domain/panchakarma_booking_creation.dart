/// `POST /api/v1/panchakarma-bookings`'s success response — read directly
/// from `bookTherapy()`'s return value in `packages/domain/src/modules/
/// panchakarma/bookings.service.ts`:
/// `{ booking, payment, razorpayOrder, razorpayKeyId }`. Only reached when
/// Razorpay is actually configured (`isConfigured()`, checked *first* in
/// `bookTherapy()`, before the centre/therapy even get looked up); in this
/// dev environment `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank
/// (`apps/platform-api/.env`), so every real booking attempt here throws a
/// 503 `ServiceUnavailableError` before this shape is ever produced — see
/// `PanchakarmaBookingFlowController`'s handling of that case, the actually
/// reachable path today, exactly mirroring `AppointmentHold`/
/// `BookingController` from Phase 4. This model exists so the plumbing is
/// correct and tested for the day Razorpay is configured (Phase 8).
class PanchakarmaBookingCreationResult {
  const PanchakarmaBookingCreationResult({
    required this.bookingId,
    required this.bookingStatus,
    required this.amount,
    required this.currency,
    required this.razorpayOrderId,
    required this.razorpayKeyId,
  });

  final String bookingId;

  /// Always "BOOKED" at this point (`PanchakarmaBookingStatus`'s default) —
  /// this phase never reaches a backend-confirmed "paid" state (Phase 8).
  final String bookingStatus;

  /// Rupees (whole units) — `Payment.amount`'s unit, equal to
  /// `therapy.price * sessionCount` as computed server-side. Never
  /// recomputed/trusted client-side as authoritative.
  final int amount;
  final String currency;

  /// What the Razorpay Flutter SDK's checkout call would need
  /// (`order_id`) — not used in this phase (no real SDK integration, same
  /// deferral as Phase 4's `AppointmentHold`).
  final String razorpayOrderId;
  final String? razorpayKeyId;

  factory PanchakarmaBookingCreationResult.fromJson(Map<String, dynamic> json) {
    final booking = json['booking'] as Map<String, dynamic>;
    final payment = json['payment'] as Map<String, dynamic>;
    final razorpayOrder = json['razorpayOrder'] as Map<String, dynamic>;
    return PanchakarmaBookingCreationResult(
      bookingId: booking['id'] as String,
      bookingStatus: booking['status'] as String,
      amount: payment['amount'] as int,
      currency: payment['currency'] as String? ?? 'INR',
      razorpayOrderId: razorpayOrder['id'] as String,
      razorpayKeyId: json['razorpayKeyId'] as String?,
    );
  }
}
