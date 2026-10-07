import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/medicine_order_detail.dart';
import 'medicine_search_controller.dart';

/// "My medicine orders" — full list + cancel + review (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 7), structurally identical to Phase 6's
/// `DiagnosticOrdersController`: cancel/review both reload the full
/// `/mine` list afterwards rather than patching one entry in place, correct
/// even for `cancel()`'s thin (un-included) response (see
/// `MedicineOrderDetail`'s doc comment).
///
/// Only meaningful once signed in, same rule as every other controller in
/// this app.
class MedicineOrdersController extends AsyncNotifier<List<MedicineOrderDetail>> {
  @override
  Future<List<MedicineOrderDetail>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('MedicineOrdersController read before sign-in');
    }
    return ref.read(pharmacyApiProvider).myOrders();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(pharmacyApiProvider).myOrders());
  }

  /// Returns null on success. On failure returns the user-facing message
  /// without touching `state` — the caller shows it inline, same convention
  /// as `AppointmentsController.cancel`/`DiagnosticOrdersController.cancel`.
  Future<String?> cancel(String orderId, {String? reason}) async {
    try {
      await ref.read(pharmacyApiProvider).cancelOrder(orderId, reason: reason);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Same return convention as [cancel]. `medicineId` must be one of
  /// [orderId]'s own items — the backend re-checks this (and
  /// "already reviewed") regardless of anything this app enforces
  /// client-side.
  Future<String?> review(String orderId, {required String medicineId, required int rating, String? comment}) async {
    try {
      await ref.read(pharmacyApiProvider).reviewOrderItem(orderId, medicineId: medicineId, rating: rating, comment: comment);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final medicineOrdersControllerProvider = AsyncNotifierProvider<MedicineOrdersController, List<MedicineOrderDetail>>(MedicineOrdersController.new);

/// A single order's full detail (`GET /api/v1/medicine-orders/[id]`) —
/// same plain `FutureProvider.family` shape as Phase 6's
/// `diagnosticOrderDetailProvider`. `ref.invalidate(medicineOrderDetailProvider(id))`
/// is this screen's retry.
final medicineOrderDetailProvider = FutureProvider.family<MedicineOrderDetail, String>((ref, id) {
  return ref.watch(pharmacyApiProvider).orderDetail(id);
});
