import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/pharmacy_api.dart';
import '../domain/local_cart_item.dart';

/// The on-device cart for a signed-out visitor (brief: "Allow adding
/// products to the cart without login"; see `lib/core/router/
/// app_router.dart`'s redirect doc comment for the full "why" — every
/// `/api/v1/patients/me/cart*` endpoint is `requireSession` +
/// `requireRole('PATIENT')`, confirmed by reading `cart/route.ts` and its
/// `items/[id]`/`[id]/checkout` siblings directly, and per the "don't
/// invent/duplicate backend endpoints" rule this app doesn't add a
/// guest-cart API to match).
///
/// Lives purely in memory via plain Riverpod state — nothing here persists
/// across an app restart. A fresh launch just re-decides whether to show a
/// real signed-in cart or an empty guest one; it never forces a login along
/// the way, which is the exact bug this whole change fixes.
class LocalCartController extends StateNotifier<List<LocalCartItem>> {
  LocalCartController() : super(const []);

  /// Adds [quantity] of this exact medicine+variant from this pharmacy, or
  /// increments the existing line if one's already here — same
  /// find-or-create-then-increment identity as the backend's own
  /// `addToCart()`.
  void addItem({
    required String pharmacyId,
    String? pharmacyName,
    required String medicineId,
    required String medicineName,
    String? imageUrl,
    String? variantId,
    String? variantLabel,
    required int unitPrice,
    int quantity = 1,
  }) {
    final key = '$pharmacyId::$medicineId::${variantId ?? ''}';
    final existingIndex = state.indexWhere((i) => i.key == key);
    if (existingIndex >= 0) {
      final updated = [...state];
      updated[existingIndex] = updated[existingIndex].copyWith(quantity: updated[existingIndex].quantity + quantity);
      state = updated;
      return;
    }
    state = [
      ...state,
      LocalCartItem(
        pharmacyId: pharmacyId,
        pharmacyName: pharmacyName,
        medicineId: medicineId,
        medicineName: medicineName,
        imageUrl: imageUrl,
        variantId: variantId,
        variantLabel: variantLabel,
        unitPrice: unitPrice,
        quantity: quantity,
      ),
    ];
  }

  /// `0` or below removes the line, matching the real `CartController`'s
  /// own `updateQuantity`/`removeItem` pairing.
  void updateQuantity(String key, int quantity) {
    if (quantity <= 0) {
      removeItem(key);
      return;
    }
    state = [for (final item in state) if (item.key == key) item.copyWith(quantity: quantity) else item];
  }

  void removeItem(String key) {
    state = state.where((i) => i.key != key).toList();
  }

  void clear() => state = const [];

  /// Called right after a successful sign-in (`OtpScreen`, immediately
  /// after `AuthController.onVerified`) — pushes every local item into the
  /// real backend cart via the existing `POST /api/v1/patients/me/cart`
  /// (`PharmacyApi.addToCart`, the same call `CartController.addItem` makes
  /// once signed in), one request per item, then drops whatever succeeded.
  ///
  /// An item the backend rejects (e.g. gone out of stock, or a
  /// prescription-required medicine that slipped in some other way while
  /// browsing signed out) is left in the local list rather than silently
  /// discarded — but one item failing never blocks the rest of the flush,
  /// and the flush itself never blocks sign-in: this is best-effort,
  /// exactly like a dropped network request on any other "sync my local
  /// state" action.
  ///
  /// Takes the API and an invalidation callback directly, rather than a
  /// `Ref`, so this one method works from both `Ref` (the router/most
  /// controllers) and `WidgetRef` (`OtpScreen`, a `ConsumerStatefulWidget`)
  /// call sites — the two don't share a common `read`/`invalidate`
  /// interface in this riverpod version.
  Future<void> flushToBackend({required PharmacyApi api, required void Function() invalidateCart}) async {
    if (state.isEmpty) return;
    final remaining = <LocalCartItem>[];
    for (final item in state) {
      try {
        await api.addToCart(
          pharmacyId: item.pharmacyId,
          medicineId: item.medicineId,
          variantId: item.variantId,
          quantity: item.quantity,
        );
      } catch (_) {
        remaining.add(item);
      }
    }
    state = remaining;
    // The signed-in cart screen (`CartController`) should show what just
    // landed on the backend, not whatever it last saw — or, for a brand
    // new sign-in, not wait to be told to fetch at all.
    invalidateCart();
  }
}

final localCartControllerProvider = StateNotifierProvider<LocalCartController, List<LocalCartItem>>(
  (ref) => LocalCartController(),
);
