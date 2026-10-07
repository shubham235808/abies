import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/cart.dart';
import 'medicine_search_controller.dart';

/// Every active cart (`GET /api/v1/patients/me/cart`'s `{ carts }`, plural
/// — docs/mobile/IMPLEMENTATION-PLAN.md Phase 7). One per pharmacy
/// (EXPANSION-1b); add/update/remove all reload the full list afterwards
/// rather than patching one cart in place — same "simpler, and correct even
/// for a response shape that could differ" rule Phase 4's
/// `AppointmentsController.cancel`/`review` established.
///
/// Only meaningful once signed in, same rule as every other controller in
/// this app.
class CartController extends AsyncNotifier<List<Cart>> {
  @override
  Future<List<Cart>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('CartController read before sign-in');
    }
    return ref.read(pharmacyApiProvider).myCarts();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(pharmacyApiProvider).myCarts());
  }

  /// Returns null on success (e.g. a 400 if this medicine requires a
  /// prescription, or this pharmacy doesn't stock it). The caller shows the
  /// message inline, same convention as every other controller's
  /// cancel/update action.
  Future<String?> addItem({required String pharmacyId, required String medicineId, String? variantId, int quantity = 1}) async {
    try {
      await ref.read(pharmacyApiProvider).addToCart(pharmacyId: pharmacyId, medicineId: medicineId, variantId: variantId, quantity: quantity);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> updateQuantity(String cartItemId, int quantity) async {
    try {
      await ref.read(pharmacyApiProvider).updateCartItemQuantity(cartItemId, quantity);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> removeItem(String cartItemId) async {
    try {
      await ref.read(pharmacyApiProvider).removeCartItem(cartItemId);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final cartControllerProvider = AsyncNotifierProvider<CartController, List<Cart>>(CartController.new);
