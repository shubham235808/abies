import 'dart:async';

import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/data/auth_api.dart';
import 'package:abies_pharmacy/features/auth/domain/auth_result.dart';
import 'package:abies_pharmacy/features/auth/domain/session_user.dart';
import 'package:abies_pharmacy/features/inventory/data/inventory_api.dart';
import 'package:abies_pharmacy/features/home/data/pharmacy_profile_api.dart';
import 'package:abies_pharmacy/features/home/domain/pharmacy_profile.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/inventory/domain/new_batch.dart';
import 'package:abies_pharmacy/features/orders/data/pharmacy_orders_api.dart';
import 'package:abies_pharmacy/features/orders/domain/pharmacy_order.dart';
import 'package:abies_pharmacy/features/pos/data/pos_api.dart';
import 'package:abies_pharmacy/features/pos/domain/pos_sale.dart';
import 'package:abies_pharmacy/features/tax/data/tax_settings_api.dart';
import 'package:abies_pharmacy/features/tax/domain/tax_settings.dart';

const pharmacyUser = SessionUser(id: 'u-ph', mobile: '+919000000003', email: 'pharmacy@example.test', role: 'PHARMACY');
const patientUser = SessionUser(id: 'u-pt', mobile: '+919000000001', email: null, role: 'PATIENT');

/// Same fake-API-double pattern as apps/mobile/test/unit/auth_controller_test.dart.
class FakeAuthApi implements AuthApi {
  SessionUser? meResult;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  int logoutCalls = 0;

  RequestOtpResult? requestOtpResult;
  Object? requestOtpError;
  Map<String, Object?>? lastRequestOtp;

  VerifyOtpResult? verifyOtpResult;
  Object? verifyOtpError;
  Map<String, Object?>? lastVerifyOtp;

  void triggerUnauthorized() => _unauthorized.add(null);

  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;

  @override
  Future<SessionUser?> me() async => meResult;

  @override
  Future<void> logout() async {
    logoutCalls += 1;
    meResult = null;
  }

  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, required String role}) async {
    lastRequestOtp = {'mobile': mobile, 'email': email, 'role': role};
    if (requestOtpError != null) throw requestOtpError!;
    return requestOtpResult!;
  }

  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) async {
    lastVerifyOtp = {'requestId': requestId, 'otp': otp, 'acceptedTerms': acceptedTerms, 'name': name};
    if (verifyOtpError != null) throw verifyOtpError!;
    return verifyOtpResult!;
  }

  @override
  Future<LoginResult> login({String? mobile, String? email, required String password}) => throw UnimplementedError();
  @override
  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email}) => throw UnimplementedError();
  @override
  Future<SetPasswordResult> completePasswordSetup({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
  @override
  Future<SetPasswordResult> resetPassword({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
}

Map<String, dynamic> orderJson({
  required String id,
  required String status,
  bool detail = false,
  String createdAt = '2026-10-09T10:00:00.000Z',
}) {
  return {
    'id': id,
    'status': status,
    'pharmacyId': 'ph1',
    'patientUserId': 'u-pt',
    'prescriptionId': null,
    'deliveryAddress': '12 MG Road, Bengaluru',
    'cancelledAt': null,
    'cancellationReason': null,
    'createdAt': createdAt,
    'patientUser': {
      'mobile': '+919000000001',
      'patientProfile': {'firstName': 'Asha', 'lastName': 'Rao'},
    },
    'items': [
      {
        'id': 'it1',
        'medicineId': 'm1',
        'variantId': null,
        'batchNumber': 'B-01',
        'quantity': 2,
        'unitPrice': 40,
        'medicine': detail ? {'name': 'Ashwagandha Churna', 'form': 'Powder', 'strength': '100g'} : {'name': 'Ashwagandha Churna'},
        'variant': null,
      },
    ],
    if (detail) 'shipment': null,
    if (detail) 'payment': {'status': 'SUCCESS', 'amount': 80},
  };
}

class FakeOrdersApi implements PharmacyOrdersApi {
  List<PharmacyOrder> orders = [];
  Map<String, PharmacyOrder> details = {};
  int listCalls = 0;
  int detailCalls = 0;
  Object? actionError;
  Object? detailErrorAfterFirst;
  final List<String> calls = [];
  Map<String, String?>? lastDispatch;
  String? lastCancelReason;

  @override
  Future<List<PharmacyOrder>> listOrders() async {
    listCalls += 1;
    return orders;
  }

  @override
  Future<PharmacyOrder> orderDetail(String orderId) async {
    detailCalls += 1;
    if (detailCalls > 1 && detailErrorAfterFirst != null) throw detailErrorAfterFirst!;
    return details[orderId]!;
  }

  Future<OrderStatus> _act(String name, String orderId, OrderStatus next) async {
    calls.add('$name:$orderId');
    if (actionError != null) throw actionError!;
    final current = details[orderId];
    if (current != null) details[orderId] = current.copyWith(status: next);
    return next;
  }

  @override
  Future<OrderStatus> accept(String orderId) => _act('accept', orderId, OrderStatus.accepted);

  @override
  Future<OrderStatus> startPacking(String orderId) => _act('packing', orderId, OrderStatus.packing);

  @override
  Future<OrderStatus> dispatch(String orderId, {String? carrier, String? trackingRef}) {
    lastDispatch = {'carrier': carrier, 'trackingRef': trackingRef};
    return _act('dispatch', orderId, OrderStatus.dispatched);
  }

  @override
  Future<OrderStatus> markDelivered(String orderId) => _act('delivered', orderId, OrderStatus.delivered);

  @override
  Future<OrderStatus> cancel(String orderId, {String? reason}) {
    lastCancelReason = reason;
    return _act('cancel', orderId, OrderStatus.cancelled);
  }
}

Map<String, dynamic> inventoryJson({
  required String id,
  String name = 'Triphala Tablets',
  int qty = 25,
  int price = 120,
  String expiry = '2027-12-31T00:00:00.000Z',
  String? hsn = '3004',
}) {
  return {
    'id': id,
    'pharmacyId': 'ph1',
    'medicineId': 'm-$id',
    'variantId': null,
    'batchNumber': 'BATCH-$id',
    'expiryDate': expiry,
    'quantityAvailable': qty,
    'price': price,
    'medicine': {
      'id': 'm-$id',
      'name': name,
      'form': 'Tablet',
      'strength': '500mg',
      'requiresPrescription': false,
      'hsnCode': hsn,
      'isFmcg': false,
      'mrp': 150,
    },
    'variant': null,
  };
}

class FakeInventoryApi implements InventoryApi {
  List<InventoryItem> items = [];
  int listCalls = 0;
  Object? updateError;
  Map<String, Object?>? lastUpdate;
  Object? addError;
  Map<String, dynamic>? lastAddBody;

  /// Mirrors addInventory: echoes the batch back as a created row.
  @override
  Future<InventoryItem> add(NewBatch batch) async {
    lastAddBody = batch.toJson();
    if (addError != null) throw addError!;
    final body = lastAddBody!;
    final created = InventoryItem.fromJson({
      ...inventoryJson(
        id: 'new-${items.length + 1}',
        name: (body['name'] as String?) ?? 'Existing medicine',
        qty: body['quantityAvailable'] as int,
        price: body['price'] as int,
        expiry: body['expiryDate'] as String,
        hsn: body['hsnCode'] as String?,
      ),
      'batchNumber': body['batchNumber'],
    });
    items = [...items, created];
    return created;
  }

  @override
  Future<List<InventoryItem>> list() async {
    listCalls += 1;
    return items;
  }

  @override
  Future<InventoryItem> update(String id, {int? quantityAvailable, int? price, DateTime? expiryDate}) async {
    lastUpdate = {'id': id, 'quantityAvailable': quantityAvailable, 'price': price};
    if (updateError != null) throw updateError!;
    final existing = items.firstWhere((i) => i.id == id);
    return InventoryItem.fromJson(inventoryJson(
      id: id,
      name: existing.medicineName,
      qty: quantityAvailable ?? existing.quantityAvailable,
      price: price ?? existing.price,
    ));
  }
}

const conflict = ApiException(message: 'This order has not been paid for yet', statusCode: 409);

Map<String, dynamic> pharmacyJson({
  String status = 'DRAFT',
  String? name,
  List<String> licenses = const [],
  List<String> areas = const [],
  String? rejectionReason,
}) =>
    {
      'id': 'ph1',
      'userId': 'u-ph',
      'name': name,
      'licenseNumbers': licenses,
      'serviceAreas': areas,
      'active': true,
      'verificationStatus': status,
      'rejectionReason': rejectionReason,
    };

class FakePharmacyProfileApi implements PharmacyProfileApi {
  FakePharmacyProfileApi(this.profile);

  PharmacyProfile profile;
  Object? updateError;
  Object? submitError;
  Map<String, Object?>? lastUpdate;
  int submitCalls = 0;

  @override
  Future<PharmacyProfile> me() async => profile;

  @override
  Future<PharmacyProfile> update({String? name, required List<String> licenseNumbers, required List<String> serviceAreas}) async {
    lastUpdate = {'name': name, 'licenseNumbers': licenseNumbers, 'serviceAreas': serviceAreas};
    if (updateError != null) throw updateError!;
    profile = PharmacyProfile.fromJson(pharmacyJson(
      status: profile.verificationStatus,
      name: name ?? profile.name,
      licenses: licenseNumbers,
      areas: serviceAreas,
    ));
    return profile;
  }

  @override
  Future<PharmacyProfile> submit({required bool declarationAccepted}) async {
    submitCalls += 1;
    if (submitError != null) throw submitError!;
    profile = PharmacyProfile.fromJson(pharmacyJson(
      status: 'SUBMITTED',
      name: profile.name,
      licenses: profile.licenseNumbers,
      areas: profile.serviceAreas,
    ));
    return profile;
  }
}

class FakeTaxSettingsApi implements TaxSettingsApi {
  TaxSettings? settings;
  Object? saveError;
  Map<String, dynamic>? lastSaveBody;

  @override
  Future<TaxSettings?> get() async => settings;

  @override
  Future<TaxSettings> save(TaxSettings input) async {
    lastSaveBody = input.toJson();
    if (saveError != null) throw saveError!;
    settings = TaxSettings.fromJson({...input.toJson(), 'id': 'ts1', 'active': true});
    return settings!;
  }
}

/// Computes the sale the way pos.service.ts `recordSale` does (batch price
/// x qty, per-line round(subtotal x rate / 100), CGST = floor(tax / 2),
/// SGST = remainder) and decrements the shared [FakeInventoryApi] — so a
/// test can check the app shows the server's numbers and re-reads stock.
class FakePosApi implements PosApi {
  FakePosApi({required this.inventory, this.ratePercent = 12});

  final FakeInventoryApi inventory;
  final int ratePercent;
  Object? saleError;
  Map<String, dynamic>? lastSaleBody;
  int saleCalls = 0;
  List<PosSale> sales = [];

  @override
  Future<PosSale> recordSale(PosSaleRequest request) async {
    saleCalls += 1;
    lastSaleBody = request.toJson();
    if (saleError != null) throw saleError!;
    var subtotal = 0;
    var tax = 0;
    final items = <Map<String, dynamic>>[];
    for (final line in request.items) {
      final batch = inventory.items.firstWhere((i) => i.medicineId == line.medicineId && i.batchNumber == line.batchNumber);
      final lineSubtotal = batch.price * line.quantity;
      subtotal += lineSubtotal;
      tax += (lineSubtotal * ratePercent / 100).round();
      items.add({
        'medicineId': line.medicineId,
        'batchNumber': line.batchNumber,
        'quantity': line.quantity,
        'unitPrice': batch.price,
        'taxRate': ratePercent,
        'medicine': {'name': batch.medicineName},
      });
      inventory.items = [
        for (final i in inventory.items)
          i.id == batch.id
              ? InventoryItem.fromJson({
                  ...inventoryJson(id: i.id, name: i.medicineName, qty: i.quantityAvailable - line.quantity, price: i.price, hsn: i.hsnCode),
                  'medicineId': i.medicineId,
                  'batchNumber': i.batchNumber,
                })
              : i,
      ];
    }
    final total = subtotal - request.discountAmount + tax;
    final cgst = tax ~/ 2;
    final sale = PosSale.fromJson({
      'id': 'sale-$saleCalls',
      'paymentMethod': request.paymentMethod,
      'customerName': request.customerName,
      'customerPhone': request.customerPhone,
      'upiReference': request.upiReference,
      'subtotal': subtotal,
      'discountAmount': request.discountAmount,
      'taxAmount': tax,
      'totalAmount': total,
      'createdAt': '2026-10-10T09:30:00.000Z',
      'items': items,
      'invoice': {'invoiceNumber': 'INV-${'$saleCalls'.padLeft(6, '0')}', 'cgst': cgst, 'sgst': tax - cgst, 'igst': 0, 'totalTax': tax, 'totalAmount': total},
      'pharmacy': {
        'name': 'Test Pharmacy',
        'taxSettings': {'legalBusinessName': 'Test Pharmacy LLP', 'gstin': '27AAAAA0000A1Z5', 'registeredState': 'Maharashtra'},
      },
    });
    sales = [sale, ...sales];
    return sale;
  }

  @override
  Future<List<PosSale>> listSales() async => sales;

  @override
  Future<PosSale> getSale(String id) async => sales.firstWhere((s) => s.id == id);
}
