import 'medicine_order_item.dart';

/// One medicine order, in the one shape that covers every response that
/// returns a `MedicineOrder` row to a patient — same "one model, several
/// differently-included server responses, all null-safe" relationship
/// Phase 4/5/6 established for appointments/Panchakarma/diagnostic orders
/// (`packages/domain/src/modules/medicines/orders.service.ts`):
///
/// - `GET /api/v1/medicine-orders/mine`'s `orders[]` (`listMineAsPatient()`):
///   `pharmacy.name` only (**no `pharmacy.id` nested** — this model reads
///   [pharmacyId] from the order's own scalar field, always present
///   regardless of include), `items[]` (medicine/variant name + batch/
///   price), `shipment`. **No `payment` at all.**
/// - `GET /api/v1/medicine-orders/[id]` (`getOrder()`): the full joined
///   shape — its own `detailInclude()` is spread as `{ ...detailInclude(),
///   pharmacy: true }`, so the later `pharmacy: true` key wins and the
///   *full* `Pharmacy` row comes back (not just `{id,name,serviceAreas}`) —
///   this model only reads the subset it displays. Also includes the full
///   `payment.{status,amount}` and `shipment`.
/// - `POST /api/v1/medicine-orders/[id]/cancel`'s response and
///   `POST /api/v1/medicine-orders/verify-payment`'s response
///   (`cancelOrder()`'s and `finalizeMedicineOrderPaymentByOrder()`'s final
///   `findUniqueOrThrow` calls have **no includes at all**): every nested
///   field below is null/empty there too, only the order's own scalar
///   fields (id, status, pharmacyId, deliveryAddress, ...) are real.
///   Callers that need the full joined shape after either call should
///   reload `/mine` or `/[id]` rather than trust that thin response — same
///   rule Phase 4/5/6 used.
/// - `POST /api/v1/medicine-orders` and the cart's own
///   `POST /api/v1/patients/me/cart/[id]/checkout` both create an order via
///   the same `bookOrder()` and return it just as thinly, wrapped in
///   [MedicineOrderCreationResult] rather than this model — see that class's
///   doc comment.
class MedicineOrderDetail {
  const MedicineOrderDetail({
    required this.id,
    required this.status,
    required this.pharmacyId,
    required this.pharmacyName,
    required this.prescriptionId,
    required this.deliveryAddress,
    required this.createdAt,
    required this.cancelledAt,
    required this.cancellationReason,
    required this.items,
    required this.carrier,
    required this.trackingRef,
    required this.dispatchedAt,
    required this.deliveredAt,
    required this.paymentStatus,
    required this.paymentAmount,
  });

  final String id;

  /// `MedicineOrderStatus`: PENDING, ACCEPTED, PACKING, DISPATCHED,
  /// DELIVERED, CANCELLED (`packages/domain/prisma/schema.prisma`).
  final String status;

  final String pharmacyId;
  final String? pharmacyName;

  /// Set only when this order was placed from a finalized prescription.
  final String? prescriptionId;
  final String? deliveryAddress;
  final DateTime createdAt;
  final DateTime? cancelledAt;
  final String? cancellationReason;
  final List<MedicineOrderItem> items;

  final String? carrier;
  final String? trackingRef;
  final DateTime? dispatchedAt;
  final DateTime? deliveredAt;

  /// `Payment.status`, null wherever this response doesn't join payment
  /// (`/mine`, `/cancel`, `/verify-payment` — see class doc).
  final String? paymentStatus;

  /// Rupees (whole units).
  final int? paymentAmount;

  /// Mirrors `cancelOrder()`'s own rule in `orders.service.ts` — only a
  /// PENDING or ACCEPTED order can be cancelled by its patient. Display
  /// convenience only; the backend re-checks this on every cancel call
  /// regardless.
  bool get canCancel => status == 'PENDING' || status == 'ACCEPTED';

  /// A delivered order's items become reviewable (`reviewMedicine()`'s own
  /// rule) — display convenience only, the backend re-checks this (and
  /// "already reviewed this item from this order") on every review call.
  bool get canReview => status == 'DELIVERED';

  /// "Active" per the same rule Phase 3's home-dashboard
  /// `MedicineOrderSummary.isActive` used: not yet delivered and not
  /// cancelled.
  bool get isActive => status != 'DELIVERED' && status != 'CANCELLED';

  int get itemTotal => items.fold<int>(0, (sum, i) => sum + i.lineTotal);

  factory MedicineOrderDetail.fromJson(Map<String, dynamic> json) {
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    final items = json['items'] as List<dynamic>? ?? const [];
    final shipment = json['shipment'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    return MedicineOrderDetail(
      id: json['id'] as String,
      status: json['status'] as String,
      pharmacyId: json['pharmacyId'] as String? ?? pharmacy?['id'] as String? ?? '',
      pharmacyName: pharmacy?['name'] as String?,
      prescriptionId: json['prescriptionId'] as String?,
      deliveryAddress: json['deliveryAddress'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      cancelledAt: json['cancelledAt'] != null ? DateTime.parse(json['cancelledAt'] as String) : null,
      cancellationReason: json['cancellationReason'] as String?,
      items: items.map((e) => MedicineOrderItem.fromJson(e as Map<String, dynamic>)).toList(),
      carrier: shipment?['carrier'] as String?,
      trackingRef: shipment?['trackingRef'] as String?,
      dispatchedAt: shipment?['dispatchedAt'] != null ? DateTime.parse(shipment!['dispatchedAt'] as String) : null,
      deliveredAt: shipment?['deliveredAt'] != null ? DateTime.parse(shipment!['deliveredAt'] as String) : null,
      paymentStatus: payment?['status'] as String?,
      paymentAmount: payment?['amount'] as int?,
    );
  }
}
