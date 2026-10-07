import 'package:abies_mobile/core/api/api_exception.dart';
import 'package:abies_mobile/features/pharmacy/data/pharmacy_api.dart';
import 'package:abies_mobile/features/pharmacy/domain/cart.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_facets.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_creation.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_order_detail.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_review_submission.dart';
import 'package:abies_mobile/features/pharmacy/domain/medicine_search_result.dart';
import 'package:abies_mobile/features/pharmacy/domain/pharmacy_summary.dart';
import 'package:abies_mobile/features/pharmacy/presentation/checkout_flow_controller.dart';
import 'package:abies_mobile/features/pharmacy/presentation/medicine_search_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Cart _cart({String id = 'c1', bool unavailable = false, bool empty = false}) {
  return Cart.fromJson({
    'id': id,
    'pharmacy': {'id': 'ph1', 'name': 'City Pharmacy'},
    'status': 'ACTIVE',
    'items': empty
        ? []
        : [
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
    'subtotal': unavailable || empty ? 0 : 40,
  });
}

class _FakePharmacyApi implements PharmacyApi {
  List<Cart> myCartsResult = [_cart()];
  int myCartsCallCount = 0;

  Object? checkoutError;
  MedicineOrderCreationResult? checkoutResultValue;
  int checkoutCallCount = 0;
  String? lastCheckoutCartId;
  String? lastDeliveryAddress;

  @override
  Future<List<Cart>> myCarts() async {
    myCartsCallCount += 1;
    return myCartsResult;
  }

  @override
  Future<MedicineOrderCreationResult> checkoutCart({required String cartId, required String deliveryAddress, String? careRecipientFamilyMemberId}) async {
    checkoutCallCount += 1;
    lastCheckoutCartId = cartId;
    lastDeliveryAddress = deliveryAddress;
    if (checkoutError != null) throw checkoutError!;
    return checkoutResultValue!;
  }

  @override
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) =>
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

  @override
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity) => throw UnimplementedError('not used in these tests');

  @override
  Future<Cart> removeCartItem(String cartItemId) => throw UnimplementedError('not used in these tests');

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

void main() {
  group('CheckoutFlowController', () {
    test('confirmCheckout fails validation with an empty address, and never re-fetches or calls checkout', () async {
      final api = _FakePharmacyApi();
      final container = ProviderContainer(overrides: [pharmacyApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(checkoutFlowControllerProvider('c1').notifier);

      await notifier.confirmCheckout();

      expect(api.myCartsCallCount, 0);
      expect(api.checkoutCallCount, 0);
      expect(container.read(checkoutFlowControllerProvider('c1')).outcome.kind, CheckoutOutcomeKind.validationError);
    });

    test('confirmCheckout re-fetches every cart before checkout, and checks out when still current', () async {
      final api = _FakePharmacyApi()
        ..myCartsResult = [_cart()]
        ..checkoutResultValue = const MedicineOrderCreationResult(
          orderId: 'o1',
          orderStatus: 'PENDING',
          amount: 40,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = ProviderContainer(overrides: [pharmacyApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(checkoutFlowControllerProvider('c1').notifier);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmCheckout();

      expect(api.myCartsCallCount, 1, reason: 'one real re-fetch of every cart right before checkout');
      expect(api.checkoutCallCount, 1);
      expect(api.lastCheckoutCartId, 'c1');
      expect(api.lastDeliveryAddress, '221B Baker Street');
      final state = container.read(checkoutFlowControllerProvider('c1'));
      expect(state.outcome.kind, CheckoutOutcomeKind.success);
      expect(state.outcome.result!.orderId, 'o1');
    });

    test('confirmCheckout refuses to check out a cart the fresh re-fetch no longer lists', () async {
      final api = _FakePharmacyApi()..myCartsResult = []; // cart gone
      final container = ProviderContainer(overrides: [pharmacyApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(checkoutFlowControllerProvider('c1').notifier);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmCheckout();

      expect(api.checkoutCallCount, 0, reason: 'never calls checkout for a cart the fresh re-fetch no longer lists');
      expect(container.read(checkoutFlowControllerProvider('c1')).outcome.kind, CheckoutOutcomeKind.conflict);
    });

    test('confirmCheckout refuses to check out when the fresh re-fetch shows an item now unavailable', () async {
      final api = _FakePharmacyApi()..myCartsResult = [_cart(unavailable: true)];
      final container = ProviderContainer(overrides: [pharmacyApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(checkoutFlowControllerProvider('c1').notifier);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmCheckout();

      expect(api.checkoutCallCount, 0);
      expect(container.read(checkoutFlowControllerProvider('c1')).outcome.kind, CheckoutOutcomeKind.conflict);
    });

    test('confirmCheckout surfaces a 503 from checkout as serviceUnavailable, not a generic error', () async {
      final api = _FakePharmacyApi()
        ..myCartsResult = [_cart()]
        ..checkoutError = const ApiException(
          message: 'Online payments are not configured in this environment yet — ordering is unavailable.',
          statusCode: 503,
        );
      final container = ProviderContainer(overrides: [pharmacyApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);
      final notifier = container.read(checkoutFlowControllerProvider('c1').notifier);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmCheckout();

      expect(container.read(checkoutFlowControllerProvider('c1')).outcome.kind, CheckoutOutcomeKind.serviceUnavailable);
    });
  });
}
