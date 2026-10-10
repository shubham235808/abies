import 'dart:async';

import 'package:abies_pharmacy/core/api/api_exception.dart';
import 'package:abies_pharmacy/features/auth/data/auth_api.dart';
import 'package:abies_pharmacy/features/auth/domain/auth_result.dart';
import 'package:abies_pharmacy/features/auth/domain/session_user.dart';
import 'package:abies_pharmacy/features/inventory/data/inventory_api.dart';
import 'package:abies_pharmacy/features/inventory/domain/inventory_item.dart';
import 'package:abies_pharmacy/features/orders/data/pharmacy_orders_api.dart';
import 'package:abies_pharmacy/features/orders/domain/pharmacy_order.dart';

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
