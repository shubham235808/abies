import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/doctor_profile.dart';
import 'availability_controller.dart';
import 'clinics_controller.dart';
import 'dashboard_controller.dart';
import 'documents_controller.dart';
import 'practice_providers.dart';
import 'profile_controller.dart';

/// Shared state for the three screens that write to the doctor's own
/// application — profile, documents, clinics. All three read from
/// `GET /doctors/me` (which already includes documents and clinics via
/// doctors.service.ts `privateInclude()`), write, then re-fetch, same as
/// [AvailabilityController].
class ProfileWorkState {
  const ProfileWorkState({required this.profile, this.busy = false, this.error, this.fieldErrors = const {}, this.message});

  final DoctorProfile profile;
  final bool busy;

  /// Whole-form / backend error to show once (snackbar or banner).
  final String? error;

  /// Field key → message, from client-side validation or the backend's zod
  /// `issues[]` (first path segment).
  final Map<String, String> fieldErrors;

  /// One-shot success message ("Profile saved.").
  final String? message;

  ProfileWorkState copyWith({DoctorProfile? profile, bool busy = false, String? error, Map<String, String> fieldErrors = const {}, String? message}) =>
      ProfileWorkState(profile: profile ?? this.profile, busy: busy, error: error, fieldErrors: fieldErrors, message: message);
}

Map<String, String> fieldErrorsFrom(ApiException e) => {
      for (final issue in e.issues)
        if (issue.path.isNotEmpty) issue.path.first: issue.message,
    };

/// Base for the profile/documents/clinics controllers: load the profile,
/// and run writes with busy/error bookkeeping and a re-fetch afterwards.
abstract class ProfileWorkController extends AutoDisposeAsyncNotifier<ProfileWorkState> {
  /// This controller's own provider, so [mutate] refreshes its live siblings
  /// (Profile ↔ Documents ↔ Clinics share one `GET /doctors/me`) but not
  /// itself — re-building itself would drop the fresh state/message.
  ProviderBase<AsyncValue<ProfileWorkState>> get selfProvider;

  @override
  Future<ProfileWorkState> build() async => ProfileWorkState(profile: await ref.watch(doctorApiProvider).me());

  /// Sets a client-side validation failure without touching the backend.
  bool reject({String? error, Map<String, String> fieldErrors = const {}}) {
    final current = state.valueOrNull;
    if (current != null) state = AsyncValue.data(current.copyWith(error: error, fieldErrors: fieldErrors));
    return false;
  }

  /// Runs [action]; on success re-fetches `GET /doctors/me` (unless [action]
  /// already returned the fresh profile) and refreshes the other screens
  /// built on it.
  Future<bool> mutate(Future<DoctorProfile?> Function() action, {String? successMessage}) async {
    final current = state.valueOrNull;
    if (current == null || current.busy) return false;
    state = AsyncValue.data(current.copyWith(busy: true));
    try {
      final returned = await action();
      final profile = returned ?? await ref.read(doctorApiProvider).me();
      state = AsyncValue.data(ProfileWorkState(profile: profile, message: successMessage));
      // Only refresh screens that are actually alive: invalidating a provider
      // that was never read mounts it, i.e. a wasted extra GET /doctors/me.
      final dependents = <ProviderBase<Object?>>[
        dashboardControllerProvider,
        availabilityControllerProvider,
        profileControllerProvider,
        documentsControllerProvider,
        clinicsControllerProvider,
      ];
      for (final p in dependents) {
        if (!identical(p, selfProvider) && ref.exists(p)) ref.invalidate(p);
      }
      return true;
    } on ApiException catch (e) {
      state = AsyncValue.data(current.copyWith(error: e.message, fieldErrors: fieldErrorsFrom(e)));
      return false;
    }
  }
}
