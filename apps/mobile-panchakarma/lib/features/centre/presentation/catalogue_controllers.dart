import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/centre_models.dart';
import 'dashboard_controller.dart';

/// Therapy catalogue (apps/partner-web/.../therapies/therapies-manager.tsx):
/// list, add, edit, activate/deactivate, remove. Every mutation returns
/// null on success or the backend's message, leaving the list untouched on
/// failure; on success the list is patched from the response.
class TherapiesController extends AsyncNotifier<List<Therapy>> {
  @override
  Future<List<Therapy>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('TherapiesController read before sign-in');
    return ref.read(centreApiProvider).therapies();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(centreApiProvider).therapies());
  }

  Future<String?> create(TherapyInput input) async {
    try {
      final created = await ref.read(centreApiProvider).createTherapy(input);
      state = AsyncValue.data([created, ...?state.valueOrNull]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> edit(String id, TherapyInput input) => _patch(id, input.toJson());

  Future<String?> setActive(Therapy therapy, bool active) => _patch(therapy.id, {'active': active});

  Future<String?> remove(String id) async {
    try {
      await ref.read(centreApiProvider).deleteTherapy(id);
      state = AsyncValue.data([...?state.valueOrNull?.where((t) => t.id != id)]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> _patch(String id, Map<String, dynamic> patch) async {
    try {
      final updated = await ref.read(centreApiProvider).updateTherapy(id, patch);
      state = AsyncValue.data([for (final t in state.valueOrNull ?? const <Therapy>[]) t.id == id ? updated : t]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final therapiesControllerProvider = AsyncNotifierProvider<TherapiesController, List<Therapy>>(TherapiesController.new);

/// Therapist roster (apps/partner-web/.../therapists/therapists-manager.tsx).
/// The backend refuses removing a therapist who still has an unattended
/// session ("Reassign this therapist’s upcoming sessions before removing
/// them") — surfaced verbatim.
class TherapistsController extends AsyncNotifier<List<Therapist>> {
  @override
  Future<List<Therapist>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('TherapistsController read before sign-in');
    return ref.read(centreApiProvider).therapists();
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(centreApiProvider).therapists());
  }

  Future<String?> create(TherapistInput input) async {
    try {
      final created = await ref.read(centreApiProvider).createTherapist(input);
      state = AsyncValue.data([created, ...?state.valueOrNull]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> edit(String id, TherapistInput input) => _patch(id, input.toJson());

  Future<String?> setActive(Therapist therapist, bool active) => _patch(therapist.id, {'active': active});

  Future<String?> remove(String id) async {
    try {
      await ref.read(centreApiProvider).deleteTherapist(id);
      state = AsyncValue.data([...?state.valueOrNull?.where((t) => t.id != id)]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> _patch(String id, Map<String, dynamic> patch) async {
    try {
      final updated = await ref.read(centreApiProvider).updateTherapist(id, patch);
      state = AsyncValue.data([for (final t in state.valueOrNull ?? const <Therapist>[]) t.id == id ? updated : t]);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final therapistsControllerProvider = AsyncNotifierProvider<TherapistsController, List<Therapist>>(TherapistsController.new);
