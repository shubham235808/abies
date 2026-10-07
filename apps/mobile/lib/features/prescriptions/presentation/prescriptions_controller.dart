import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/prescriptions_api.dart';
import '../domain/prescription_summary.dart';

final prescriptionsApiProvider = Provider<PrescriptionsApi>((ref) => PrescriptionsApiImpl(ref.watch(apiClientProvider)));

/// "My prescriptions" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7) — already
/// finalized-only (`listFinalizedPrescriptionsForPatient()`'s own filter).
/// No cancel/edit action here — a prescription is the doctor's record, this
/// app only ever reads it and, from it, starts a purchase.
///
/// Only meaningful once signed in, same rule as every other controller in
/// this app.
class PrescriptionsController extends AsyncNotifier<List<PrescriptionSummary>> {
  @override
  Future<List<PrescriptionSummary>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('PrescriptionsController read before sign-in');
    }
    return ref.read(prescriptionsApiProvider).myPrescriptions();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(prescriptionsApiProvider).myPrescriptions());
  }
}

final prescriptionsControllerProvider =
    AsyncNotifierProvider<PrescriptionsController, List<PrescriptionSummary>>(PrescriptionsController.new);
