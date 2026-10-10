/// `MedicineOrderStatus` (packages/domain/prisma/schema.prisma ~line 1583)
/// and the pharmacy-side state machine in
/// packages/domain/src/modules/medicines/orders.service.ts (~lines 333-375):
///
///   PENDING --accept--> ACCEPTED --packing--> PACKING --dispatch--> DISPATCHED --delivered--> DELIVERED
///   PENDING / ACCEPTED --cancel--> CANCELLED (`cancelOrder`, either party)
///
/// The pharmacy only ever sees *paid* orders (`listMineAsPharmacy` filters
/// `payment.status: 'SUCCESS'`), so PENDING here always means "paid, waiting
/// for you to accept".
enum OrderStatus {
  pending('PENDING', 'New'),
  accepted('ACCEPTED', 'To pack'),
  packing('PACKING', 'Packing'),
  dispatched('DISPATCHED', 'In transit'),
  delivered('DELIVERED', 'Delivered'),
  cancelled('CANCELLED', 'Cancelled'),
  unknown('UNKNOWN', 'Unknown');

  const OrderStatus(this.wire, this.label);

  final String wire;
  final String label;

  static OrderStatus fromWire(String? value) {
    for (final s in OrderStatus.values) {
      if (s.wire == value) return s;
    }
    return OrderStatus.unknown;
  }

  /// Paid and not yet finished — what the dashboard calls "active".
  bool get isActive => this == pending || this == accepted || this == packing || this == dispatched;

  /// `cancelOrder` only allows PENDING/ACCEPTED ("This order can no longer
  /// be cancelled" otherwise).
  bool get canCancel => this == pending || this == accepted;
}

class PharmacyOrderItem {
  const PharmacyOrderItem({
    required this.id,
    required this.medicineName,
    required this.quantity,
    required this.unitPrice,
    required this.batchNumber,
    this.variantLabel,
    this.form,
    this.strength,
  });

  final String id;
  final String medicineName;
  final String? variantLabel;
  final String? form;
  final String? strength;
  final String batchNumber;
  final int quantity;

  /// Rupees, per unit (`MedicineOrderItem.unitPrice`, an Int).
  final int unitPrice;

  int get lineTotal => unitPrice * quantity;

  String get displayName => variantLabel == null ? medicineName : '$medicineName ($variantLabel)';

  factory PharmacyOrderItem.fromJson(Map<String, dynamic> json) {
    final medicine = json['medicine'] as Map<String, dynamic>? ?? const {};
    final variant = json['variant'] as Map<String, dynamic>?;
    return PharmacyOrderItem(
      id: json['id'] as String? ?? '',
      medicineName: medicine['name'] as String? ?? 'Unnamed item',
      form: medicine['form'] as String?,
      strength: medicine['strength'] as String?,
      variantLabel: variant?['label'] as String?,
      batchNumber: json['batchNumber'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 0,
      unitPrice: (json['unitPrice'] as num?)?.toInt() ?? 0,
    );
  }
}

class Shipment {
  const Shipment({this.carrier, this.trackingRef, this.dispatchedAt, this.deliveredAt});

  final String? carrier;
  final String? trackingRef;
  final DateTime? dispatchedAt;
  final DateTime? deliveredAt;

  factory Shipment.fromJson(Map<String, dynamic> json) {
    return Shipment(
      carrier: json['carrier'] as String?,
      trackingRef: json['trackingRef'] as String?,
      dispatchedAt: _parseDate(json['dispatchedAt']),
      deliveredAt: _parseDate(json['deliveredAt']),
    );
  }
}

/// One medicine order as the pharmacy sees it. Parses both real response
/// shapes:
/// - `GET /api/v1/pharmacies/me/orders` (`listMineAsPharmacy`) — order
///   scalars + `patientUser` + `items[].medicine.name`/`variant.label`; no
///   shipment or payment.
/// - `GET /api/v1/medicine-orders/:id` (`getOrder` + `detailInclude()`) —
///   additionally `shipment`, `payment {status, amount}`, and
///   `items[].medicine.form/strength`.
class PharmacyOrder {
  const PharmacyOrder({
    required this.id,
    required this.status,
    required this.createdAt,
    required this.patientMobile,
    required this.items,
    this.patientFirstName,
    this.patientLastName,
    this.deliveryAddress,
    this.prescriptionId,
    this.cancellationReason,
    this.shipment,
    this.paymentAmount,
    this.paymentStatus,
  });

  final String id;
  final OrderStatus status;
  final DateTime createdAt;
  final String patientMobile;
  final String? patientFirstName;
  final String? patientLastName;
  final String? deliveryAddress;
  final String? prescriptionId;
  final String? cancellationReason;
  final List<PharmacyOrderItem> items;
  final Shipment? shipment;
  final int? paymentAmount;
  final String? paymentStatus;

  /// Same fallback as the web pharmacy pages: profile name, else mobile.
  String get patientName {
    final name = [patientFirstName, patientLastName].whereType<String>().where((s) => s.trim().isNotEmpty).join(' ');
    return name.isEmpty ? patientMobile : name;
  }

  int get itemsTotal => items.fold(0, (sum, i) => sum + i.lineTotal);

  /// The authoritative amount the patient paid when known (detail only),
  /// else the item sum (identical by construction in `bookOrder`).
  int get total => paymentAmount ?? itemsTotal;

  String get itemsSummary => items.map((i) => '${i.displayName} ×${i.quantity}').join(', ');

  PharmacyOrder copyWith({OrderStatus? status}) {
    return PharmacyOrder(
      id: id,
      status: status ?? this.status,
      createdAt: createdAt,
      patientMobile: patientMobile,
      patientFirstName: patientFirstName,
      patientLastName: patientLastName,
      deliveryAddress: deliveryAddress,
      prescriptionId: prescriptionId,
      cancellationReason: cancellationReason,
      items: items,
      shipment: shipment,
      paymentAmount: paymentAmount,
      paymentStatus: paymentStatus,
    );
  }

  factory PharmacyOrder.fromJson(Map<String, dynamic> json) {
    final patientUser = json['patientUser'] as Map<String, dynamic>? ?? const {};
    final profile = patientUser['patientProfile'] as Map<String, dynamic>?;
    final shipment = json['shipment'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    return PharmacyOrder(
      id: json['id'] as String,
      status: OrderStatus.fromWire(json['status'] as String?),
      createdAt: _parseDate(json['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
      patientMobile: patientUser['mobile'] as String? ?? '',
      patientFirstName: profile?['firstName'] as String?,
      patientLastName: profile?['lastName'] as String?,
      deliveryAddress: json['deliveryAddress'] as String?,
      prescriptionId: json['prescriptionId'] as String?,
      cancellationReason: json['cancellationReason'] as String?,
      items: (json['items'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PharmacyOrderItem.fromJson)
          .toList(),
      shipment: shipment == null ? null : Shipment.fromJson(shipment),
      paymentAmount: (payment?['amount'] as num?)?.toInt(),
      paymentStatus: payment?['status'] as String?,
    );
  }
}

DateTime? _parseDate(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;
