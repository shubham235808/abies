/// `POST /api/v1/medicine-orders`'s and `POST /api/v1/patients/me/cart/[id]/
/// checkout`'s shared success response — both ultimately call the same
/// `bookOrder()` (`packages/domain/src/modules/medicines/orders.service.ts`;
/// `checkoutCart()` in `cart.service.ts` delegates to it directly) and
/// return its `{ order, payment, razorpayOrder, razorpayKeyId }` **raw**
/// (both routes do `NextResponse.json(result, { status: 201 })`, not
/// wrapped in `{ order: ... }`) — same unwrapped shape Phase 5/6's own
/// booking-creation results read, confirmed by reading both route files.
///
/// Only reached when Razorpay is actually configured (`isConfigured()`,
/// checked *first* in `bookOrder()`, before the pharmacy/medicines are even
/// looked up); in this dev environment `RAZORPAY_KEY_ID`/
/// `RAZORPAY_KEY_SECRET` are blank, so every real booking/checkout attempt
/// here throws a 503 `ServiceUnavailableError` before this shape is ever
/// produced — the actually reachable path today, exactly mirroring Phase
/// 4/5/6. This model exists so the plumbing is correct and tested for the
/// day Razorpay is configured (Phase 8).
class MedicineOrderCreationResult {
  const MedicineOrderCreationResult({
    required this.orderId,
    required this.orderStatus,
    required this.amount,
    required this.currency,
    required this.razorpayOrderId,
    required this.razorpayKeyId,
  });

  final String orderId;

  /// Always "PENDING" at this point (`MedicineOrderStatus`'s default) — this
  /// phase never reaches a backend-confirmed "paid" state (Phase 8).
  final String orderStatus;

  /// Rupees (whole units) — the server-computed total across every item's
  /// FEFO-selected batch price. Never recomputed/trusted client-side as
  /// authoritative.
  final int amount;
  final String currency;

  /// What the Razorpay Flutter SDK's checkout call would need (`order_id`)
  /// — not used in this phase (no real SDK integration, same deferral as
  /// every prior phase's booking flow).
  final String razorpayOrderId;
  final String? razorpayKeyId;

  factory MedicineOrderCreationResult.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>;
    final payment = json['payment'] as Map<String, dynamic>;
    final razorpayOrder = json['razorpayOrder'] as Map<String, dynamic>;
    return MedicineOrderCreationResult(
      orderId: order['id'] as String,
      orderStatus: order['status'] as String,
      amount: payment['amount'] as int,
      currency: payment['currency'] as String? ?? 'INR',
      razorpayOrderId: razorpayOrder['id'] as String,
      razorpayKeyId: json['razorpayKeyId'] as String?,
    );
  }
}
