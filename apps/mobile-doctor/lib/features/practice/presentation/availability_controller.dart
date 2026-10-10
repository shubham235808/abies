import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/doctor_profile.dart';
import 'dashboard_controller.dart';
import 'practice_providers.dart';

/// Weekly availability management — the mobile port of the web
/// AvailabilityManager. Source of truth is `GET /doctors/me`'s
/// `profile.availability` (there is no separate list route); writes go to
/// `/doctors/me/availability*`, then re-fetch.
class AvailabilityState {
  const AvailabilityState({required this.profile, this.busy = false, this.error});

  final DoctorProfile profile;
  final bool busy;
  final String? error;

  List<AvailabilityWindow> get windows => profile.availability;
  List<DoctorClinic> get activeClinics => profile.clinics.where((c) => c.active).toList();

  /// Only modes enabled on the profile can be added — the backend rejects
  /// others ("Enable X consultation mode on your profile first").
  List<String> get enabledModes => profile.consultationModes;
}

/// `HH:MM` 24-hour, as createAvailabilitySchema's regex requires.
final _hhmm = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');

/// Client-side mirror of the backend checks, so the doctor gets an instant
/// message instead of a round trip. Returns null when valid.
String? validateAvailabilityInput({
  required String startTime,
  required String endTime,
  required int slotMinutes,
  required String mode,
  String? clinicId,
}) {
  if (!_hhmm.hasMatch(startTime) || !_hhmm.hasMatch(endTime)) return 'Times must be HH:MM (24-hour)';
  if (startTime.compareTo(endTime) >= 0) return 'End time must be after start time';
  if (slotMinutes < 5 || slotMinutes > 240) return 'Slot length must be between 5 and 240 minutes';
  if (mode == 'CLINIC' && (clinicId == null || clinicId.isEmpty)) return 'Select a clinic for a clinic-mode availability window';
  return null;
}

class AvailabilityController extends AutoDisposeAsyncNotifier<AvailabilityState> {
  @override
  Future<AvailabilityState> build() async {
    final profile = await ref.watch(doctorApiProvider).me();
    return AvailabilityState(profile: profile);
  }

  Future<bool> _mutate(Future<void> Function() action) async {
    final current = state.valueOrNull;
    if (current == null) return false;
    state = AsyncValue.data(AvailabilityState(profile: current.profile, busy: true));
    try {
      await action();
      final profile = await ref.read(doctorApiProvider).me();
      state = AsyncValue.data(AvailabilityState(profile: profile));
      ref.invalidate(dashboardControllerProvider);
      return true;
    } on ApiException catch (e) {
      state = AsyncValue.data(AvailabilityState(profile: current.profile, error: e.message));
      return false;
    }
  }

  Future<bool> add({
    required int dayOfWeek,
    required String startTime,
    required String endTime,
    required int slotMinutes,
    required String mode,
    String? clinicId,
  }) async {
    final invalid = validateAvailabilityInput(startTime: startTime, endTime: endTime, slotMinutes: slotMinutes, mode: mode, clinicId: clinicId);
    if (invalid != null) {
      final current = state.valueOrNull;
      if (current != null) state = AsyncValue.data(AvailabilityState(profile: current.profile, error: invalid));
      return false;
    }
    return _mutate(() => ref.read(doctorApiProvider).addAvailability(
          dayOfWeek: dayOfWeek,
          startTime: startTime,
          endTime: endTime,
          slotMinutes: slotMinutes,
          mode: mode,
          clinicId: clinicId,
        ));
  }

  Future<bool> setActive(String id, bool active) => _mutate(() => ref.read(doctorApiProvider).setAvailabilityActive(id, active));

  Future<bool> remove(String id) => _mutate(() => ref.read(doctorApiProvider).removeAvailability(id));
}

final availabilityControllerProvider =
    AutoDisposeAsyncNotifierProvider<AvailabilityController, AvailabilityState>(AvailabilityController.new);
