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
import 'package:abies_mobile/features/pharmacy/presentation/cart_controller.dart';
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

Cart _cart({String id = 'c1', bool unavailable = false}) {
  return Cart.fromJson({
    'id': id,
    'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy'},
    'status': 'ACTIVE',
    'items': [
      {
        'id': 'ci1',
        'medicineId': 'm1',
        'medicineName': 'Paracetamol',
        'imageUrl': null,
        'variantId': null,
        'variantLabel': null,
        'quantity': 2,
        'unitPrice': unavailable ? null : 20,
        'available': !unavailable,
      },
    ],
    'subtotal': unavailable ? 0 : 40,
  });
}

class _FakePharmacyApi implements PharmacyApi {
  List<Cart> cartsList = [];
  int myCartsCallCount = 0;

  Object? addError;
  String? lastAddPharmacyId;
  String? lastAddMedicineId;
  String? lastAddVariantId;
  int? lastAddQuantity;

  Object? updateError;
  String? lastUpdatedItemId;
  int? lastUpdatedQuantity;

  Object? removeError;
  String? lastRemovedItemId;

  @override
  Future<List<Cart>> myCarts() async {
    myCartsCallCount += 1;
    return cartsList;
  }

  @override
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) async {
    lastAddPharmacyId = pharmacyId;
    lastAddMedicineId = medicineId;
    lastAddVariantId = variantId;
    lastAddQuantity = quantity;
    if (addError != null) throw addError!;
    return _cart();
  }

  @override
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity) async {
    lastUpdatedItemId = cartItemId;
    lastUpdatedQuantity = quantity;
    if (updateError != null) throw updateError!;
    return _cart();
  }

  @override
  Future<Cart> removeCartItem(String cartItemId) async {
    lastRemovedItemId = cartItemId;
    if (removeError != null) throw removeError!;
    return _cart();
  }

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

  @override
  Future<MedicineFacets> medicineFacets() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<MedicineReview>> medicineReviews(String medicineId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<PharmacySummary>> listPharmacies({String? area}) => throw UnimplementedError('not used in these tests');

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
  Future<MedicineOrderDetail> cancelOrder(String orderId, {String? reason}) => throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineReviewSubmission> reviewOrderItem(String orderId, {required String medicineId, required int rating, String? comment}) =>
      throw UnimplementedError('not used in these tests');

  @override
  Future<MedicineOrderDetail> orderDetail(String orderId) => throw UnimplementedError('not used in these tests');

  @override
  Future<List<MedicineOrderDetail>> myOrders() => throw UnimplementedError('not used in these tests');
}

ProviderContainer _buildContainer(_FakePharmacyApi api) {
  return ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    pharmacyApiProvider.overrideWithValue(api),
  ]);
}

void main() {
  group('CartController', () {
    test('loads every active cart once signed in', () async {
      final api = _FakePharmacyApi()..cartsList = [_cart()];
      final container = _buildContainer(api);
      addTearDown(container.dispose);

      final carts = await container.read(cartControllerProvider.future);

      expect(carts.map((c) => c.id), ['c1']);
    });

    test('addItem calls addToCart then reloads the list', () async {
      final api = _FakePharmacyApi()..cartsList = [];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(cartControllerProvider.future);
      api.cartsList = [_cart()];

      final error = await container
          .read(cartControllerProvider.notifier)
          .addItem(pharmacyId: 'ph1', medicineId: 'm1', variantId: 'v1', quantity: 3);

      expect(error, isNull);
      expect(api.lastAddPharmacyId, 'ph1');
      expect(api.lastAddMedicineId, 'm1');
      expect(api.lastAddVariantId, 'v1');
      expect(api.lastAddQuantity, 3);
      expect(api.myCartsCallCount, 2, reason: 'initial build + reload after add');
      final carts = container.read(cartControllerProvider).value!;
      expect(carts.single.id, 'c1');
    });

    test('addItem returns the backend error (e.g. a prescription-required medicine) without touching state', () async {
      final api = _FakePharmacyApi()
        ..cartsList = []
        ..addError = const ApiException(
          message: 'This item requires a prescription — order it from a finalized prescription instead of the cart.',
          statusCode: 400,
        );
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(cartControllerProvider.future);

      final error = await container.read(cartControllerProvider.notifier).addItem(pharmacyId: 'ph1', medicineId: 'm1');

      expect(error, contains('requires a prescription'));
      expect(api.myCartsCallCount, 1, reason: 'no reload happened because the add call itself failed');
    });

    test('updateQuantity calls the backend then reloads the list', () async {
      final api = _FakePharmacyApi()..cartsList = [_cart()];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(cartControllerProvider.future);

      final error = await container.read(cartControllerProvider.notifier).updateQuantity('ci1', 5);

      expect(error, isNull);
      expect(api.lastUpdatedItemId, 'ci1');
      expect(api.lastUpdatedQuantity, 5);
      expect(api.myCartsCallCount, 2);
    });

    test('removeItem calls DELETE then reloads the list', () async {
      final api = _FakePharmacyApi()..cartsList = [_cart()];
      final container = _buildContainer(api);
      addTearDown(container.dispose);
      await container.read(cartControllerProvider.future);

      final error = await container.read(cartControllerProvider.notifier).removeItem('ci1');

      expect(error, isNull);
      expect(api.lastRemovedItemId, 'ci1');
      expect(api.myCartsCallCount, 2);
    });
  });
}
