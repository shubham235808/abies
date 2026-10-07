/// `POST /api/v1/appointments/hold`'s success response — read directly from
/// `holdSlot()`'s return value in `packages/domain/src/modules/appointments/
/// appointments.service.ts`:
/// `{ appointment, payment, razorpayOrder, razorpayKeyId }`. Only reached
/// when Razorpay is actually configured (`isConfigured()`); in this dev
/// environment `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank
/// (`apps/platform-api/.env`), so `holdSlot()` throws a 503
/// `ServiceUnavailableError` before this shape is ever produced — see
/// `BookingController`'s handling of that case, which is the actually-
/// reachable path today, not this one. This model exists so the plumbing
/// is correct and tested for the day Razorpay is configured (Phase 8).
class AppointmentHold {
  const AppointmentHold({
    required this.appointmentId,
    required this.appointmentStatus,
    required this.amount,
    required this.currency,
    required this.razorpayOrderId,
    required this.razorpayKeyId,
  });

  final String appointmentId;

  /// Always "PENDING_PAYMENT" at this point — the appointment only becomes
  /// "CONFIRMED" once `/verify-payment` succeeds.
  final String appointmentStatus;

  /// Rupees (whole units) — `Payment.amount`'s unit, matching
  /// `DoctorProfile.videoFee`/`clinicFee`. Never multiply/divide by 100
  /// client-side; the paise conversion is the backend's
  /// `lib/payments/razorpay.ts`'s job alone.
  final int amount;
  final String currency;

  /// What the Razorpay Flutter SDK's checkout call would need
  /// (`order_id`) — not used in this phase (no real SDK integration; see
  /// `BookingController`'s doc comment).
  final String razorpayOrderId;
  final String? razorpayKeyId;

  factory AppointmentHold.fromJson(Map<String, dynamic> json) {
    final appointment = json['appointment'] as Map<String, dynamic>;
    final payment = json['payment'] as Map<String, dynamic>;
    final razorpayOrder = json['razorpayOrder'] as Map<String, dynamic>;
    return AppointmentHold(
      appointmentId: appointment['id'] as String,
      appointmentStatus: appointment['status'] as String,
      amount: payment['amount'] as int,
      currency: payment['currency'] as String? ?? 'INR',
      razorpayOrderId: razorpayOrder['id'] as String,
      razorpayKeyId: json['razorpayKeyId'] as String?,
    );
  }
}
