import '../../../core/api/api_client.dart';
import '../domain/cart.dart';
import '../domain/medicine_facets.dart';
import '../domain/medicine_order_creation.dart';
import '../domain/medicine_order_detail.dart';
import '../domain/medicine_review.dart';
import '../domain/medicine_review_submission.dart';
import '../domain/medicine_search_result.dart';
import '../domain/pharmacy_summary.dart';

/// Talks to the existing `/api/v1/public/medicines*`, `/api/v1/public/
/// pharmacies`, `/api/v1/patients/me/cart*` and `/api/v1/medicine-orders*`
/// routes only — nothing here invents an endpoint (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 7 — "no new backend work"). Behind one
/// interface covering the whole pharmacy-commerce domain (catalogue, cart,
/// orders), mirroring `DiagnosticsApi`'s shape, so the presentation layer is
/// unit-testable with a fake. Prescription routes live in their own
/// `PrescriptionsApi` (`lib/features/prescriptions/data/`) — a
/// genuinely separate resource group with its own detail-shape gap.
abstract class PharmacyApi {
  /// `GET /api/v1/public/medicines` — the full filter set
  /// `publicMedicineSearchSchema` accepts (`packages/domain/src/modules/
  /// medicines/catalogue.schemas.ts`): free-text `q`, `area` (**not**
  /// `city` — confirmed by reading that schema directly, same already-known
  /// naming quirk Phase 3's home preview found), `category`, `brand`,
  /// `isFmcg`, `priceMin`/`priceMax`, plus `limit`/`offset` pagination.
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
  });

  /// `GET /api/v1/public/medicines/facets`.
  Future<MedicineFacets> medicineFacets();

  /// `GET /api/v1/public/medicines/[id]/reviews`. Fetchable by id even
  /// though there is no single-medicine detail route — this is its own
  /// real, id-keyed endpoint.
  Future<List<MedicineReview>> medicineReviews(String medicineId);

  /// `GET /api/v1/public/pharmacies?area=`. Powers the pharmacy-picker in
  /// the "purchase from a finalized prescription" flow
  /// (`lib/features/prescriptions/`), same as the real backend's own
  /// `listApprovedPharmacies()` doc comment says it's for.
  Future<List<PharmacySummary>> listPharmacies({String? area});

  /// `GET /api/v1/patients/me/cart` — `{ carts }`, plural (`listMyCarts()`),
  /// one per pharmacy the patient has an active cart with.
  Future<List<Cart>> myCarts();

  /// `POST /api/v1/patients/me/cart`. Rejected by the backend with a 400 for
  /// any `requiresPrescription` medicine ("order it from a finalized
  /// prescription instead of the cart" — `addToCart()`'s own message) —
  /// this app never attempts to add one, but doesn't duplicate that check
  /// client-side as the actual gate either; see `PharmacyApi.bookOrder`.
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1});

  /// `PATCH /api/v1/patients/me/cart/items/[id]` — `{ quantity }`. `0` is a
  /// valid quantity here and removes the item server-side
  /// (`updateCartItem()`'s own branch), but [removeCartItem] (the real
  /// `DELETE`) is preferred for an explicit "remove" action in the UI —
  /// both exist as separate routes, confirmed by reading
  /// `cart/items/[id]/route.ts` directly.
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity);

  /// `DELETE /api/v1/patients/me/cart/items/[id]`.
  Future<Cart> removeCartItem(String cartItemId);

  /// `POST /api/v1/patients/me/cart/[id]/checkout`. Delegates server-side to
  /// the same `bookOrder()` as [bookOrder] below (`checkoutCart()` in
  /// `cart.service.ts`), so this throws [ApiException] with
  /// `statusCode == 503` exactly when payments aren't configured in this
  /// environment, the expected outcome in dev today.
  /// [idempotencyKey]: one per checkout attempt (docs/mobile/
  /// IMPLEMENTATION-PLAN.md Phase 8), reused across that attempt's retries.
  Future<MedicineOrderCreationResult> checkoutCart({
    required String cartId,
    required String deliveryAddress,
    String? careRecipientFamilyMemberId,
    String? idempotencyKey,
  });

  /// `POST /api/v1/medicine-orders` — `bookOrderSchema`'s direct order path,
  /// confirmed patient-reachable (`requireRole(ctx, 'PATIENT')` on that
  /// route) and genuinely separate from cart checkout. **This is the only
  /// path for a prescription-gated item** — `addToCart()` refuses to put one
  /// in a cart at all — so this app calls it for the
  /// "purchase from a finalized prescription" flow
  /// (`prescriptionId` + the matched items' `medicineId`/`quantity`), never
  /// for a plain OTC purchase (the cart is the OTC path). `items` is
  /// `bookOrderSchema`'s own array (1-20 entries of
  /// `{medicineId, variantId?, quantity}`).
  /// [idempotencyKey]: one per booking attempt (docs/mobile/
  /// IMPLEMENTATION-PLAN.md Phase 8), reused across that attempt's retries.
  Future<MedicineOrderCreationResult> bookOrder({
    required String pharmacyId,
    required String deliveryAddress,
    String? prescriptionId,
    String? careRecipientFamilyMemberId,
    required List<Map<String, Object?>> items,
    String? idempotencyKey,
  });

  /// `POST /api/v1/medicine-orders/verify-payment`. Not reachable from this
  /// phase's UI (no order ever succeeds without real Razorpay keys) but
  /// implemented against the real contract ahead of Phase 8.
  Future<MedicineOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  });

  /// `POST /api/v1/medicine-orders/[id]/cancel`. Returns the bare,
  /// un-included order row — callers that need the full joined shape should
  /// reload `mine()`/`detail()`.
  Future<MedicineOrderDetail> cancelOrder(String orderId, {String? reason});

  /// `POST /api/v1/medicine-orders/[id]/review` — `id` is the **order id**,
  /// `medicineId` (one of that order's items) goes in the body alongside
  /// `rating`/`comment` (`createMedicineReviewSchema`). Only valid once the
  /// order is DELIVERED (`reviewMedicine()`'s own rule); throws
  /// [ApiException] with `statusCode == 409` if this item from this order
  /// was already reviewed.
  Future<MedicineReviewSubmission> reviewOrderItem(String orderId, {required String medicineId, required int rating, String? comment});

  /// `GET /api/v1/medicine-orders/[id]` — the full joined detail shape.
  Future<MedicineOrderDetail> orderDetail(String orderId);

  /// `GET /api/v1/medicine-orders/mine`.
  Future<List<MedicineOrderDetail>> myOrders();
}

class PharmacyApiImpl implements PharmacyApi {
  PharmacyApiImpl(this._client);

  final ApiClient _client;

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
  }) {
    return _client.get<MedicineSearchResult>(
      '/api/v1/public/medicines',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (area != null && area.isNotEmpty) 'area': area,
        if (category != null && category.isNotEmpty) 'category': category,
        if (brand != null && brand.isNotEmpty) 'brand': brand,
        if (isFmcg != null) 'isFmcg': isFmcg.toString(),
        if (priceMin != null) 'priceMin': priceMin.toString(),
        if (priceMax != null) 'priceMax': priceMax.toString(),
        'limit': limit.toString(),
        'offset': offset.toString(),
      },
      decode: (json) => MedicineSearchResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineFacets> medicineFacets() {
    return _client.get<MedicineFacets>(
      '/api/v1/public/medicines/facets',
      decode: (json) => MedicineFacets.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<List<MedicineReview>> medicineReviews(String medicineId) {
    return _client.get<List<MedicineReview>>(
      '/api/v1/public/medicines/$medicineId/reviews',
      decode: (json) =>
          ((json as Map<String, dynamic>)['reviews'] as List<dynamic>).map((e) => MedicineReview.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<List<PharmacySummary>> listPharmacies({String? area}) {
    return _client.get<List<PharmacySummary>>(
      '/api/v1/public/pharmacies',
      query: {if (area != null && area.isNotEmpty) 'area': area},
      decode: (json) =>
          ((json as Map<String, dynamic>)['pharmacies'] as List<dynamic>).map((e) => PharmacySummary.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<List<Cart>> myCarts() {
    return _client.get<List<Cart>>(
      '/api/v1/patients/me/cart',
      decode: (json) => ((json as Map<String, dynamic>)['carts'] as List<dynamic>).map((e) => Cart.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<Cart> addToCart({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) {
    return _client.post<Cart>(
      '/api/v1/patients/me/cart',
      body: {
        'pharmacyId': pharmacyId,
        'medicineId': medicineId,
        if (variantId != null) 'variantId': variantId,
        'quantity': quantity,
      },
      decode: (json) => Cart.fromJson((json as Map<String, dynamic>)['cart'] as Map<String, dynamic>),
    );
  }

  @override
  Future<Cart> updateCartItemQuantity(String cartItemId, int quantity) {
    return _client.patch<Cart>(
      '/api/v1/patients/me/cart/items/$cartItemId',
      body: {'quantity': quantity},
      decode: (json) => Cart.fromJson((json as Map<String, dynamic>)['cart'] as Map<String, dynamic>),
    );
  }

  @override
  Future<Cart> removeCartItem(String cartItemId) {
    return _client.delete<Cart>(
      '/api/v1/patients/me/cart/items/$cartItemId',
      decode: (json) => Cart.fromJson((json as Map<String, dynamic>)['cart'] as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineOrderCreationResult> checkoutCart({
    required String cartId,
    required String deliveryAddress,
    String? careRecipientFamilyMemberId,
    String? idempotencyKey,
  }) {
    return _client.post<MedicineOrderCreationResult>(
      '/api/v1/patients/me/cart/$cartId/checkout',
      idempotencyKey: idempotencyKey,
      body: {
        'deliveryAddress': deliveryAddress,
        if (careRecipientFamilyMemberId != null) 'careRecipientFamilyMemberId': careRecipientFamilyMemberId,
      },
      decode: (json) => MedicineOrderCreationResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineOrderCreationResult> bookOrder({
    required String pharmacyId,
    required String deliveryAddress,
    String? prescriptionId,
    String? careRecipientFamilyMemberId,
    required List<Map<String, Object?>> items,
    String? idempotencyKey,
  }) {
    return _client.post<MedicineOrderCreationResult>(
      '/api/v1/medicine-orders',
      idempotencyKey: idempotencyKey,
      body: {
        'pharmacyId': pharmacyId,
        'deliveryAddress': deliveryAddress,
        if (prescriptionId != null) 'prescriptionId': prescriptionId,
        if (careRecipientFamilyMemberId != null) 'careRecipientFamilyMemberId': careRecipientFamilyMemberId,
        'items': items,
      },
      decode: (json) => MedicineOrderCreationResult.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineOrderDetail> verifyPayment({
    required String orderId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) {
    return _client.post<MedicineOrderDetail>(
      '/api/v1/medicine-orders/verify-payment',
      body: {
        'orderId': orderId,
        'razorpayOrderId': razorpayOrderId,
        'razorpayPaymentId': razorpayPaymentId,
        'razorpaySignature': razorpaySignature,
      },
      decode: (json) => MedicineOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineOrderDetail> cancelOrder(String orderId, {String? reason}) {
    return _client.post<MedicineOrderDetail>(
      '/api/v1/medicine-orders/$orderId/cancel',
      body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      decode: (json) => MedicineOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineReviewSubmission> reviewOrderItem(String orderId, {required String medicineId, required int rating, String? comment}) {
    return _client.post<MedicineReviewSubmission>(
      '/api/v1/medicine-orders/$orderId/review',
      body: {
        'medicineId': medicineId,
        'rating': rating,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      },
      decode: (json) => MedicineReviewSubmission.fromJson((json as Map<String, dynamic>)['review'] as Map<String, dynamic>),
    );
  }

  @override
  Future<MedicineOrderDetail> orderDetail(String orderId) {
    return _client.get<MedicineOrderDetail>(
      '/api/v1/medicine-orders/$orderId',
      decode: (json) => MedicineOrderDetail.fromJson((json as Map<String, dynamic>)['order'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<MedicineOrderDetail>> myOrders() {
    return _client.get<List<MedicineOrderDetail>>(
      '/api/v1/medicine-orders/mine',
      decode: (json) =>
          ((json as Map<String, dynamic>)['orders'] as List<dynamic>).map((e) => MedicineOrderDetail.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
