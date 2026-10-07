import 'dart:async';

import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/pharmacy/data/pharmacy_api.dart';
import 'package:abies_mobile/features/pharmacy/domain/cart.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_facets.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_creation.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_detail.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review_submission.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_search_result.dart';
import 'package:abies_mobile/features/pharmacy/domain/pharmacy_summary.dart';
import 'package:abies_mobile/features/pharmacy/presentation/medicine_orders_controller.dart';
import 'package:abies_mobile/features/pharmacy/presentation/medicine_search_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _testUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT');

class _FakeAuthApi implements AuthApi {
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;
  @override
  Future<SessionUser?> me() async => _testUser;
  @override
  Future<void> logout() async {}
  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) => throw UnimplementedError();
  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) =>
      throw UnimplementedError();
}

MedicineOrderDetail _order({required String id, required String status}) {
  return MedicineOrderDetail.fromJson({
    'id': id,
    'status': status,
    'pharmacyId': 'ph1',
    'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy'},
    'prescriptionId': null,
    'deliveryAddress': '221B Baker Street',
    'createdAt': DateTime.now().toIso8601String(),
    'cancelledAt': null,
    'cancellationReason': null,
    'items': [
      {
        'medicineId': 'm1',
        'medicine': {'name': 'Paracetamol'},
        'variantId': null,
        'variant': null,
        'batchNumber': 'B1',
        'quantity': 2,
        'unitPrice': 20,
        'prescriptionItemId': null,
      },
    ],
  });
}

class _FakePharmacyApi implements PharmacyApi {
  List<MedicineOrderDetail> mineList = [];
  int mineCallCount = 0;
  Object? cancelError;
  String? lastCancelledId;
  Object? reviewError;
  String? lastReviewOrderId;
  String? lastReviewMedicineId;
  int? lastReviewRating;

  @override
  Future<List<MedicineOrderDetail>> myOrders() async {
    mineCallCount += 1;
    return mineList;
  }

  @override
  Future<MedicineOrderDetail> cancelOrder(String orderId, {String? reason}) async {
    lastCancelledId = orderId;
    if (cancelError != null) throw cancelError!;
    return _order(id: orderId, status: 'CANCELLED');
  }

  @override
  Future<MedicineReviewSubmission> reviewOrderItem(String orderId, {required String medicineId, required int rating, String? comment}) async {
    lastReviewOrderId = orderId;
    lastReviewMedicineId = medicineId;
    lastReviewRating = rating;
    if (reviewError != null) throw reviewError!;
    return MedicineReviewSubmission(id: 'rev1', rating: rating, comment: comment);
  }

  @override
  Future<MedicineOrderDetail> orderDetail(String orderId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<Cart>> myCarts() => throw UnimplementedError('not used in these tests');

  @override
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity) => throw UnimplementedError('not used in these tests');

  @override
  Future<Cart> removeCartItem(String cartItemId) => throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineOrderCreationResult> checkoutCart({required String cartId, required String deliveryAddress, String? careRecipientFamilyMemberId}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineOrderCreationResult> bookOrder({
    required String pharmacyId,
    required String deliveryAddress,
    String? prescriptionId,
    String? careRecipientFamilyMemberId,
    required List<Map<String, Object?>> items,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineFacets> medicineFacets() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<MedicineReview>> medicineReviews(String medicineId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<PharmacySummary>> listPharmacies({String? area}) => throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineSearchResult> searchMedicines({
    String? q,
    String? area,
    String? category,
    String? brand,
    bool? isFmcg,
    int? priceMin,
    int? priceMax,
    int limit = 24,
    int offset = 0,
  }) =>
      throw UnimplementedError('not used in these tests');
}

ProviderContainer _buildContainer(_FakePharmacyApi api) {
  return ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    pharmacyApiProvider.overrideWithValue(api),
  ]);
}

void main() {
  group('MedicineOrdersController', () {
    test('loads the full /mine list once signed in', () async {
      final api = _FakePharmacyApi()..mineList = [_order(id: 'o1', status: 'DISPATCHED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final list = await container.read(medicineOrdersControllerProvider.future);

      expect(list.map((o) => o.id), ['o1']);
    });

    test('cancel calls the backend then reloads the list', () async {
      final api = _FakePharmacyApi()..mineList = [_order(id: 'o1', status: 'PENDING')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(medicineOrdersControllerProvider.future);
      api.mineList = [_order(id: 'o1', status: 'CANCELLED')];

      final error = await container.read(medicineOrdersControllerProvider.notifier).cancel('o1', reason: 'Change of plan');

      expect(error, isNull);
      expect(api.lastCancelledId, 'o1');
      expect(api.mineCallCount, 2, reason: 'initial build + reload after cancel');
      final list = container.read(medicineOrdersControllerProvider).value!;
      expect(list.single.status, 'CANCELLED');
    });

    test('cancel returns the backend error message without touching the list on failure', () async {
      final api = _FakePharmacyApi()
        ..mineList = [_order(id: 'o1', status: 'DISPATCHED')]
        ..cancelError = const ApiException(message: 'This order can no longer be cancelled', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(medicineOrdersControllerProvider.future);

      final error = await container.read(medicineOrdersControllerProvider.notifier).cancel('o1');

      expect(error, 'This order can no longer be cancelled');
      expect(api.mineCallCount, 1, reason: 'no reload happened because the cancel call itself failed');
    });

    test('review calls the backend with orderId + medicineId then reloads the list', () async {
      final api = _FakePharmacyApi()..mineList = [_order(id: 'o1', status: 'DELIVERED')];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(medicineOrdersControllerProvider.future);

      final error = await container.read(medicineOrdersControllerProvider.notifier).review('o1', medicineId: 'm1', rating: 5, comment: 'Great');

      expect(error, isNull);
      expect(api.lastReviewOrderId, 'o1');
      expect(api.lastReviewMedicineId, 'm1');
      expect(api.lastReviewRating, 5);
      expect(api.mineCallCount, 2, reason: 'initial build + reload after review');
    });

    test('review returns the backend error (e.g. already reviewed) without touching the list', () async {
      final api = _FakePharmacyApi()
        ..mineList = [_order(id: 'o1', status: 'DELIVERED')]
        ..reviewError = const ApiException(message: 'You already reviewed this item from this order', statusCode: 409);
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(medicineOrdersControllerProvider.future);

      final error = await container.read(medicineOrdersControllerProvider.notifier).review('o1', medicineId: 'm1', rating: 4);

      expect(error, contains('already reviewed'));
      expect(api.mineCallCount, 1);
    });
  });
}
