import 'package:abies_mobile/features/pharmacy/data/pharmacy_api.dart';
import 'package:abies_mobile/features/pharmacy/domain/cart.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_facets.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_creation.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_detail.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review_submission.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_search_result.dart';
import 'package:abies_mobile/features/pharmacy/domain/pharmacy_summary.dart';
import 'package:abies_mobile/features/pharmacy/presentation/local_cart_controller.dart';
import 'package:flutter_test/flutter_test.dart';

/// `LocalCartController` is the on-device-only cart a signed-out visitor
/// uses (brief: "Allow adding products to the cart without login" — see
/// `lib/core/router/app_router.dart`'s redirect doc comment for why there's
/// no backend guest-cart endpoint to call instead). It never touches a
/// `PharmacyApi` except in `flushToBackend`, so most of these tests
/// construct the controller directly rather than through Riverpod.
class _FakePharmacyApi implements PharmacyApi {
  final List<Map<String, Object?>> addCalls = [];
  final Set<String> rejectMedicineIds;

  _FakePharmacyApi({this.rejectMedicineIds = const {}});

  @override
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) async {
    addCalls.add({'pharmacyId': pharmacyId, 'medicineId': medicineId, 'variantId': variantId, 'quantity': quantity});
    if (rejectMedicineIds.contains(medicineId)) {
      throw Exception('no longer in stock');
    }
    return Cart.fromJson({
      'id': 'c1',
      'pharmacy': {'id': pharmacyId, 'name': 'Pharmacy'},
      'status': 'ACTIVE',
      'items': const [],
      'subtotal': 0,
    });
  }

  @override
  Future<List<Cart>> myCarts() => throw UnimplementedError('not used in these tests');
  @override
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity) => throw UnimplementedError('not used in these tests');
  @override
  Future<Cart> removeCartItem(String cartItemId) => throw UnimplementedError('not used in these tests');
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
  Future<MedicineOrderCreationResult> checkoutCart({
    required String cartId,
    required String deliveryAddress,
    String? careRecipientFamilyMemberId,
    String? idempotencyKey,
  }) =>
      throw UnimplementedError('not used in these tests');
  @override
  Future<MedicineOrderCreationResult> bookOrder({
    required String pharmacyId,
    required String deliveryAddress,
    String? prescriptionId,
    String? careRecipientFamilyMemberId,
    required List<Map<String, Object?>> items,
    String? idempotencyKey,
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

void main() {
  group('LocalCartController', () {
    test('starts empty', () {
      final controller = LocalCartController();
      expect(controller.state, isEmpty);
    });

    test('addItem adds a new line', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20, quantity: 2);

      expect(controller.state, hasLength(1));
      expect(controller.state.single.medicineId, 'm1');
      expect(controller.state.single.quantity, 2);
      expect(controller.state.single.lineTotal, 40);
    });

    test('adding the same medicine+variant+pharmacy again increments quantity instead of duplicating', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20, quantity: 2);
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20, quantity: 3);

      expect(controller.state, hasLength(1));
      expect(controller.state.single.quantity, 5);
    });

    test('a different variant of the same medicine is its own line', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', variantId: 'v1', unitPrice: 20);
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', variantId: 'v2', unitPrice: 35);

      expect(controller.state, hasLength(2));
    });

    test('updateQuantity changes the line; 0 or below removes it', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20, quantity: 2);
      final key = controller.state.single.key;

      controller.updateQuantity(key, 5);
      expect(controller.state.single.quantity, 5);

      controller.updateQuantity(key, 0);
      expect(controller.state, isEmpty);
    });

    test('removeItem drops that line only', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20);
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm2', medicineName: 'Ashwagandha', unitPrice: 50);
      final keyToRemove = controller.state.first.key;

      controller.removeItem(keyToRemove);

      expect(controller.state, hasLength(1));
      expect(controller.state.single.medicineId, 'm2');
    });

    test('clear empties the cart', () {
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20);

      controller.clear();

      expect(controller.state, isEmpty);
    });

    test('flushToBackend calls addToCart once per line and clears everything on success', () async {
      final api = _FakePharmacyApi();
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20, quantity: 2);
      controller.addItem(pharmacyId: 'ph2', medicineId: 'm2', medicineName: 'Ashwagandha', unitPrice: 50, quantity: 1);
      var invalidated = false;

      await controller.flushToBackend(api: api, invalidateCart: () => invalidated = true);

      expect(api.addCalls, hasLength(2));
      expect(controller.state, isEmpty);
      expect(invalidated, isTrue);
    });

    test('flushToBackend leaves a rejected item in the local cart rather than dropping it, and still flushes the rest', () async {
      final api = _FakePharmacyApi(rejectMedicineIds: {'m1'});
      final controller = LocalCartController();
      controller.addItem(pharmacyId: 'ph1', medicineId: 'm1', medicineName: 'Paracetamol', unitPrice: 20);
      controller.addItem(pharmacyId: 'ph2', medicineId: 'm2', medicineName: 'Ashwagandha', unitPrice: 50);

      await controller.flushToBackend(api: api, invalidateCart: () {});

      expect(controller.state, hasLength(1));
      expect(controller.state.single.medicineId, 'm1', reason: 'the rejected item stays; the one that succeeded is gone');
    });

    test('flushToBackend on an empty cart never calls the api or invalidates anything', () async {
      final api = _FakePharmacyApi();
      final controller = LocalCartController();
      var invalidated = false;

      await controller.flushToBackend(api: api, invalidateCart: () => invalidated = true);

      expect(api.addCalls, isEmpty);
      expect(invalidated, isFalse);
    });
  });
}
