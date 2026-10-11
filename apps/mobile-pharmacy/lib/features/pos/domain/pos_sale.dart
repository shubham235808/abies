/// `PhysicalSale` (packages/domain/prisma/schema.prisma ~line 1524) as
/// returned by pos.service.ts: `listMySales` includes `items.medicine.name`
/// + `invoice`; `getSale`/`recordSale` additionally include
/// `pharmacy.taxSettings`. All money is whole rupees (Int), computed
/// server-side — this app never computes tax itself.
class PosSaleItem {
  const PosSaleItem({
    required this.medicineId,
    required this.medicineName,
    required this.batchNumber,
    required this.quantity,
    required this.unitPrice,
    required this.taxRate,
  });

  final String medicineId;
  final String medicineName;
  final String batchNumber;
  final int quantity;
  final int unitPrice;

  /// GST percent the server resolved from this medicine's HSN code
  /// (`GstRateConfig.ratePercent`).
  final int taxRate;

  int get lineAmount => unitPrice * quantity;

  factory PosSaleItem.fromJson(Map<String, dynamic> json) {
    final medicine = json['medicine'] as Map<String, dynamic>? ?? const {};
    return PosSaleItem(
      medicineId: json['medicineId'] as String? ?? '',
      medicineName: medicine['name'] as String? ?? 'Item',
      batchNumber: json['batchNumber'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 0,
      unitPrice: (json['unitPrice'] as num?)?.toInt() ?? 0,
      taxRate: (json['taxRate'] as num?)?.toInt() ?? 0,
    );
  }
}

/// `Invoice` — a POS sale is always intra-state, so CGST+SGST, IGST 0.
class PosInvoice {
  const PosInvoice({required this.invoiceNumber, required this.cgst, required this.sgst, required this.igst, required this.totalTax});

  final String invoiceNumber;
  final int cgst;
  final int sgst;
  final int igst;
  final int totalTax;

  factory PosInvoice.fromJson(Map<String, dynamic> json) => PosInvoice(
        invoiceNumber: json['invoiceNumber'] as String? ?? '',
        cgst: (json['cgst'] as num?)?.toInt() ?? 0,
        sgst: (json['sgst'] as num?)?.toInt() ?? 0,
        igst: (json['igst'] as num?)?.toInt() ?? 0,
        totalTax: (json['totalTax'] as num?)?.toInt() ?? 0,
      );
}

class PosSale {
  const PosSale({
    required this.id,
    required this.paymentMethod,
    required this.subtotal,
    required this.discountAmount,
    required this.taxAmount,
    required this.totalAmount,
    required this.createdAt,
    required this.items,
    this.customerName,
    this.customerPhone,
    this.upiReference,
    this.invoice,
    this.sellerLegalName,
    this.sellerGstin,
    this.sellerState,
  });

  final String id;
  final String paymentMethod;
  final int subtotal;
  final int discountAmount;
  final int taxAmount;
  final int totalAmount;
  final DateTime createdAt;
  final List<PosSaleItem> items;
  final String? customerName;
  final String? customerPhone;
  final String? upiReference;
  final PosInvoice? invoice;

  /// From `pharmacy.taxSettings` (getSale/recordSale only).
  final String? sellerLegalName;
  final String? sellerGstin;
  final String? sellerState;

  int get itemCount => items.fold(0, (sum, i) => sum + i.quantity);

  factory PosSale.fromJson(Map<String, dynamic> json) {
    final invoice = json['invoice'];
    final pharmacy = json['pharmacy'] as Map<String, dynamic>?;
    final tax = pharmacy?['taxSettings'] as Map<String, dynamic>?;
    return PosSale(
      id: json['id'] as String,
      paymentMethod: json['paymentMethod'] as String? ?? 'OTHER',
      subtotal: (json['subtotal'] as num?)?.toInt() ?? 0,
      discountAmount: (json['discountAmount'] as num?)?.toInt() ?? 0,
      taxAmount: (json['taxAmount'] as num?)?.toInt() ?? 0,
      totalAmount: (json['totalAmount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.fromMillisecondsSinceEpoch(0),
      items: (json['items'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().map(PosSaleItem.fromJson).toList(),
      customerName: json['customerName'] as String?,
      customerPhone: json['customerPhone'] as String?,
      upiReference: json['upiReference'] as String?,
      invoice: invoice is Map<String, dynamic> ? PosInvoice.fromJson(invoice) : null,
      sellerLegalName: tax?['legalBusinessName'] as String? ?? pharmacy?['name'] as String?,
      sellerGstin: tax?['gstin'] as String?,
      sellerState: tax?['registeredState'] as String?,
    );
  }
}

/// `posSaleSchema.paymentMethod` minus RAZORPAY — the same four the web POS
/// terminal offers (pos-terminal.tsx `PAYMENT_METHODS`); RAZORPAY is the
/// online-payment path, not a counter tender.
const posPaymentMethods = ['CASH', 'UPI', 'CARD', 'OTHER'];

/// One line of the `POST /pos/sales` body (`posSaleItemSchema`).
class PosSaleLineRequest {
  const PosSaleLineRequest({required this.medicineId, required this.batchNumber, required this.quantity});

  final String medicineId;
  final String batchNumber;
  final int quantity;

  Map<String, dynamic> toJson() => {'medicineId': medicineId, 'batchNumber': batchNumber, 'quantity': quantity};
}

/// The `posSaleSchema` body.
class PosSaleRequest {
  const PosSaleRequest({
    required this.paymentMethod,
    required this.items,
    this.discountAmount = 0,
    this.customerName,
    this.customerPhone,
    this.upiReference,
  });

  final String paymentMethod;
  final List<PosSaleLineRequest> items;
  final int discountAmount;
  final String? customerName;
  final String? customerPhone;
  final String? upiReference;

  Map<String, dynamic> toJson() => {
        if (customerName != null) 'customerName': customerName,
        if (customerPhone != null) 'customerPhone': customerPhone,
        'paymentMethod': paymentMethod,
        if (upiReference != null) 'upiReference': upiReference,
        'discountAmount': discountAmount,
        'items': [for (final i in items) i.toJson()],
      };
}
