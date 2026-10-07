/// `POST /api/v1/diagnostic-orders`'s success response — read directly from
/// `bookOrder()`'s return value in `packages/domain/src/modules/diagnostics/
/// orders.service.ts`: `{ order, payment, razorpayOrder, razorpayKeyId }`,
/// returned **raw** (the route does `NextResponse.json(result, { status:
/// 201 })`, not wrapped in `{ order: ... }` the way `/verify-payment` and
/// `/cancel` are) — same unwrapped shape Phase 5's
/// `PanchakarmaBookingCreationResult` reads from `bookTherapy()`.
///
/// Only reached when Razorpay is actually configured (`isConfigured()`,
/// checked *first* in `bookOrder()`, before the lab/test/package are even
/// looked up); in this dev environment `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
/// are blank, so every real booking attempt here throws a 503
/// `ServiceUnavailableError` before this shape is ever produced — see
/// `DiagnosticBookingFlowController`'s handling of that case, the actually
/// reachable path today, exactly mirroring Phase 4/5. This model exists so
/// the plumbing is correct and tested for the day Razorpay is configured
/// (Phase 8).
class DiagnosticBookingCreationResult {
  const DiagnosticBookingCreationResult({
    required this.orderId,
    required this.orderStatus,
    required this.amount,
    required this.currency,
    required this.razorpayOrderId,
    required this.razorpayKeyId,
  });

  final String orderId;

  /// Always "BOOKED" at this point (`DiagnosticOrderStatus`'s default) —
  /// this phase never reaches a backend-confirmed "paid" state (Phase 8).
  final String orderStatus;

  /// Rupees (whole units) — equal to the sum of the selected tests' prices,
  /// or the package's own price, as computed server-side. Never recomputed/
  /// trusted client-side as authoritative.
  final int amount;
  final String currency;

  /// What the Razorpay Flutter SDK's checkout call would need (`order_id`)
  /// — not used in this phase (no real SDK integration, same deferral as
  /// every prior phase's booking flow).
  final String razorpayOrderId;
  final String? razorpayKeyId;

  factory DiagnosticBookingCreationResult.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>;
    final payment = json['payment'] as Map<String, dynamic>;
    final razorpayOrder = json['razorpayOrder'] as Map<String, dynamic>;
    return DiagnosticBookingCreationResult(
      orderId: order['id'] as String,
      orderStatus: order['status'] as String,
      amount: payment['amount'] as int,
      currency: payment['currency'] as String? ?? 'INR',
      razorpayOrderId: razorpayOrder['id'] as String,
      razorpayKeyId: json['razorpayKeyId'] as String?,
    );
  }
}
