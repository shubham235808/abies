import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/panchakarma_booking_detail.dart';
import 'panchakarma_search_controller.dart';

/// "My Panchakarma bookings" — full list + cancel
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5), structurally identical to
/// Phase 4's `AppointmentsController`: cancel reloads the full `/mine` list
/// afterwards rather than patching one entry in place, correct even for
/// `cancel()`'s thin (un-included) response (see
/// `PanchakarmaBookingDetail`'s doc comment).
///
/// Only meaningful once signed in — depends on [authControllerProvider],
/// same rule as every other feature controller in this app.
class PanchakarmaBookingsController extends AsyncNotifier<List<PanchakarmaBookingDetail>> {
  @override
  Future<List<PanchakarmaBookingDetail>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('PanchakarmaBookingsController read before sign-in');
    }
    return ref.read(panchakarmaApiProvider).mine();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(panchakarmaApiProvider).mine());
  }

  /// Returns null on success. On failure returns the user-facing message
  /// without touching `state` — the caller shows it inline (a dialog/
  /// snackbar), same convention as `AppointmentsController.cancel`.
  Future<String?> cancel(String bookingId, {String? reason}) async {
    try {
      await ref.read(panchakarmaApiProvider).cancel(bookingId, reason: reason);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final panchakarmaBookingsControllerProvider =
    AsyncNotifierProvider<PanchakarmaBookingsController, List<PanchakarmaBookingDetail>>(PanchakarmaBookingsController.new);

/// A single booking's full detail (`GET /api/v1/panchakarma-bookings/[id]`)
/// — same "plain `FutureProvider.family`, nothing on this screen writes
/// directly" shape as Phase 4's `doctorDetailProvider`.
/// `ref.invalidate(panchakarmaBookingDetailProvider(id))` is this screen's
/// retry.
final panchakarmaBookingDetailProvider = FutureProvider.family<PanchakarmaBookingDetail, String>((ref, id) {
  return ref.watch(panchakarmaApiProvider).detail(id);
});
