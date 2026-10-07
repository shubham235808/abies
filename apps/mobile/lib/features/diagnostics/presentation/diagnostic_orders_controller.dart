import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/diagnostic_order_detail.dart';
import 'diagnostics_search_controller.dart';

/// "My diagnostic orders" — full list + cancel (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 6), structurally identical to Phase 4/5's
/// orders/bookings controllers: cancel reloads the full `/mine` list
/// afterwards rather than patching one entry in place, correct even for
/// `cancel()`'s thin (un-included) response (see
/// `DiagnosticOrderDetail`'s doc comment).
///
/// Only meaningful once signed in — depends on [authControllerProvider],
/// same rule as every other feature controller in this app.
class DiagnosticOrdersController extends AsyncNotifier<List<DiagnosticOrderDetail>> {
  @override
  Future<List<DiagnosticOrderDetail>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('DiagnosticOrdersController read before sign-in');
    }
    return ref.read(diagnosticsApiProvider).mine();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(diagnosticsApiProvider).mine());
  }

  /// Returns null on success. On failure returns the user-facing message
  /// without touching `state` — the caller shows it inline, same convention
  /// as `AppointmentsController.cancel`/`PanchakarmaBookingsController.cancel`.
  Future<String?> cancel(String orderId, {String? reason}) async {
    try {
      await ref.read(diagnosticsApiProvider).cancel(orderId, reason: reason);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final diagnosticOrdersControllerProvider =
    AsyncNotifierProvider<DiagnosticOrdersController, List<DiagnosticOrderDetail>>(DiagnosticOrdersController.new);

/// A single order's full detail (`GET /api/v1/diagnostic-orders/[id]`) —
/// same "plain `FutureProvider.family`, nothing on this screen writes
/// directly" shape as Phase 4/5's detail providers.
/// `ref.invalidate(diagnosticOrderDetailProvider(id))` is this screen's
/// retry.
final diagnosticOrderDetailProvider = FutureProvider.family<DiagnosticOrderDetail, String>((ref, id) {
  return ref.watch(diagnosticsApiProvider).detail(id);
});
