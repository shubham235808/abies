import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/appointments_api.dart';
import '../domain/appointment_detail.dart';

final appointmentsApiProvider = Provider<AppointmentsApi>((ref) => AppointmentsApiImpl(ref.watch(apiClientProvider)));

/// "My appointments" list — cancel and review both reload the full list
/// afterwards rather than trying to patch one entry in place, same pattern
/// as `ProfileController.addFamilyMember`/`deleteFamilyMember`: simpler, and
/// correct even for `cancel()`'s thin (un-included) response (see
/// `AppointmentDetail`'s doc comment).
///
/// Only meaningful once signed in — depends on [authControllerProvider],
/// same rule as `HomeController`/`ProfileController`.
class AppointmentsController extends AsyncNotifier<List<AppointmentDetail>> {
  @override
  Future<List<AppointmentDetail>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('AppointmentsController read before sign-in');
    }
    return ref.read(appointmentsApiProvider).mine();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(appointmentsApiProvider).mine());
  }

  /// Returns null on success. On failure returns the user-facing message
  /// (e.g. "This appointment can no longer be cancelled") without touching
  /// `state` — the caller shows it inline (a dialog/snackbar) rather than
  /// this controller surfacing it as a whole-list error.
  Future<String?> cancel(String appointmentId, {String? reason}) async {
    try {
      await ref.read(appointmentsApiProvider).cancel(appointmentId, reason: reason);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Same return convention as [cancel].
  Future<String?> review(String appointmentId, {required int rating, String? comment}) async {
    try {
      await ref.read(appointmentsApiProvider).review(appointmentId, rating: rating, comment: comment);
      await refresh();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final appointmentsControllerProvider = AsyncNotifierProvider<AppointmentsController, List<AppointmentDetail>>(AppointmentsController.new);
