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
import 'package:abies_mobile/features/pharmacy/presentation/medicine_search_controller.dart';
import 'package:abies_mobile/features/prescriptions/data/prescriptions_api.dart';
import 'package:abies_mobile/features/prescriptions/domain/prescription_match_item.dart';
import 'package:abies_mobile/features/prescriptions/domain/prescription_summary.dart';
import 'package:abies_mobile/features/prescriptions/presentation/prescription_purchase_controller.dart';
import 'package:abies_mobile/features/prescriptions/presentation/prescriptions_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

PrescriptionMatchItem _matchItem({String id = 'pi1', bool available = true, int qty = 10, int? price = 20}) {
  return PrescriptionMatchItem(prescriptionItemId: id, productName: 'Paracetamol', medicineId: 'm1', available: available, quantityAvailable: qty, price: price);
}

class _FakePrescriptionsApi implements PrescriptionsApi {
  List<PrescriptionMatchItem> matchResult = [_matchItem()];
  int matchCallCount = 0;
  String? lastMatchPharmacyId;

  @override
  Future<List<PrescriptionMatchItem>> matchAtPharmacy({required String prescriptionId, required String pharmacyId}) async {
    matchCallCount += 1;
    lastMatchPharmacyId = pharmacyId;
    return matchResult;
  }

  @override
  Future<List<PrescriptionSummary>> myPrescriptions() => throw UnimplementedError('not used in these tests');
}

class _FakePharmacyApi implements PharmacyApi {
  Object? bookError;
  MedicineOrderCreationResult? bookResultValue;
  int bookCallCount = 0;
  Map<String, dynamic>? lastBookArgs;

  @override
  Future<MedicineOrderCreationResult> bookOrder({
    required String pharmacyId,
    required String deliveryAddress,
    String? prescriptionId,
    String? careRecipientFamilyMemberId,
    required List<Map<String, Object?>> items,
    String? idempotencyKey,
  }) async {
    bookCallCount += 1;
    lastBookArgs = {'pharmacyId': pharmacyId, 'deliveryAddress': deliveryAddress, 'prescriptionId': prescriptionId, 'items': items};
    if (bookError != null) throw bookError!;
    return bookResultValue!;
  }

  @override
  Future<List<PharmacySummary>> listPharmacies({String? area}) => throw UnimplementedError('not used in these tests');

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
  Future<MedicineOrderCreationResult> checkoutCart({
    required String cartId,
    required String deliveryAddress,
    String? careRecipientFamilyMemberId,
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

  @override
  Future<MedicineFacets> medicineFacets() => throw UnimplementedError('not used in these tests');

  @override
  Future<List<MedicineReview>> medicineReviews(String medicineId) => throw UnimplementedError('not used in these tests');

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

ProviderContainer _buildContainer(_FakePrescriptionsApi prescriptionsApi, _FakePharmacyApi pharmacyApi) {
  return ProviderContainer(overrides: [
    prescriptionsApiProvider.overrideWithValue(prescriptionsApi),
    pharmacyApiProvider.overrideWithValue(pharmacyApi),
  ]);
}

void main() {
  group('PrescriptionPurchaseController', () {
    test('selectPharmacy loads the match for that pharmacy', () async {
      final prescriptionsApi = _FakePrescriptionsApi()..matchResult = [_matchItem()];
      final container = _buildContainer(prescriptionsApi, _FakePharmacyApi());
      addTearDown(container.dispose);
      final notifier = container.read(prescriptionPurchaseControllerProvider('p1').notifier);

      await notifier.selectPharmacy('ph1');

      expect(prescriptionsApi.lastMatchPharmacyId, 'ph1');
      final state = container.read(prescriptionPurchaseControllerProvider('p1'));
      expect(state.matchItems!.value!.single.prescriptionItemId, 'pi1');
    });

    test('confirmPurchase fails validation with no pharmacy picked', () async {
      final container = _buildContainer(_FakePrescriptionsApi(), _FakePharmacyApi());
      addTearDown(container.dispose);
      final notifier = container.read(prescriptionPurchaseControllerProvider('p1').notifier);

      await notifier.confirmPurchase();

      final state = container.read(prescriptionPurchaseControllerProvider('p1'));
      expect(state.outcome.kind, PurchaseOutcomeKind.validationError);
    });

    test('confirmPurchase re-verifies the match before booking, and books the selected items directly (not via the cart)', () async {
      final prescriptionsApi = _FakePrescriptionsApi()..matchResult = [_matchItem()];
      final pharmacyApi = _FakePharmacyApi()
        ..bookResultValue = const MedicineOrderCreationResult(
          orderId: 'o1',
          orderStatus: 'PENDING',
          amount: 40,
          currency: 'INR',
          razorpayOrderId: 'order_1',
          razorpayKeyId: 'rzp_test',
        );
      final container = _buildContainer(prescriptionsApi, pharmacyApi);
      addTearDown(container.dispose);
      final notifier = container.read(prescriptionPurchaseControllerProvider('p1').notifier);
      await notifier.selectPharmacy('ph1');
      notifier.setQuantity('pi1', 2);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmPurchase();

      expect(prescriptionsApi.matchCallCount, 2, reason: 'once on selectPharmacy, once more as the re-verify right before booking');
      expect(pharmacyApi.bookCallCount, 1);
      expect(pharmacyApi.lastBookArgs!['pharmacyId'], 'ph1');
      expect(pharmacyApi.lastBookArgs!['prescriptionId'], 'p1');
      expect(pharmacyApi.lastBookArgs!['items'], [
        {'medicineId': 'm1', 'quantity': 2},
      ]);
      final state = container.read(prescriptionPurchaseControllerProvider('p1'));
      expect(state.outcome.kind, PurchaseOutcomeKind.success);
      expect(state.outcome.result!.orderId, 'o1');
    });

    test('confirmPurchase refuses to book when the fresh re-match no longer has enough stock', () async {
      final prescriptionsApi = _FakePrescriptionsApi()..matchResult = [_matchItem(qty: 10)];
      final pharmacyApi = _FakePharmacyApi();
      final container = _buildContainer(prescriptionsApi, pharmacyApi);
      addTearDown(container.dispose);
      final notifier = container.read(prescriptionPurchaseControllerProvider('p1').notifier);
      await notifier.selectPharmacy('ph1');
      notifier.setQuantity('pi1', 2);
      notifier.setDeliveryAddress('221B Baker Street');
      // Stock drops between selecting and confirming.
      prescriptionsApi.matchResult = [_matchItem(available: false, qty: 0)];

      await notifier.confirmPurchase();

      expect(pharmacyApi.bookCallCount, 0, reason: 'never books an item the fresh re-match no longer reports available');
      final state = container.read(prescriptionPurchaseControllerProvider('p1'));
      expect(state.outcome.kind, PurchaseOutcomeKind.conflict);
    });

    test('confirmPurchase surfaces a 503 from bookOrder as serviceUnavailable, not a generic error', () async {
      final prescriptionsApi = _FakePrescriptionsApi()..matchResult = [_matchItem()];
      final pharmacyApi = _FakePharmacyApi()
        ..bookError = const ApiException(
          message: 'Online payments are not configured in this environment yet — ordering is unavailable.',
          statusCode: 503,
        );
      final container = _buildContainer(prescriptionsApi, pharmacyApi);
      addTearDown(container.dispose);
      final notifier = container.read(prescriptionPurchaseControllerProvider('p1').notifier);
      await notifier.selectPharmacy('ph1');
      notifier.setQuantity('pi1', 1);
      notifier.setDeliveryAddress('221B Baker Street');

      await notifier.confirmPurchase();

      final state = container.read(prescriptionPurchaseControllerProvider('p1'));
      expect(state.outcome.kind, PurchaseOutcomeKind.serviceUnavailable);
    });
  });
}
