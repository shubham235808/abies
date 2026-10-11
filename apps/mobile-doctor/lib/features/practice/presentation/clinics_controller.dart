import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/profile_inputs.dart';
import 'practice_providers.dart';
import 'profile_management.dart';

/// Clinic locations — the mobile port of the web ClinicsManager
/// (apps/partner-web/.../doctor/clinics/clinics-manager.tsx), plus edit and
/// active/inactive, which `PATCH /doctors/me/clinics/[id]` supports but the
/// web UI doesn't expose. Unlike profile details, clinics are not
/// verification-locked in doctors.service.ts (`addClinic`/`updateClinic`/
/// `removeClinic` have no status check), so this works in every status.
class ClinicsController extends ProfileWorkController {
  @override
  ProviderBase<AsyncValue<ProfileWorkState>> get selfProvider => clinicsControllerProvider;

  Future<bool> add(ClinicInput input) async {
    final errors = input.validate();
    if (errors.isNotEmpty) return reject(error: 'Check the highlighted fields.', fieldErrors: errors);
    return mutate(
      () async {
        await ref.read(doctorApiProvider).addClinic(input);
        return null;
      },
      successMessage: 'Clinic added.',
    );
  }

  Future<bool> edit(String id, ClinicInput input) async {
    final errors = input.validate();
    if (errors.isNotEmpty) return reject(error: 'Check the highlighted fields.', fieldErrors: errors);
    return mutate(
      () async {
        await ref.read(doctorApiProvider).updateClinic(id, input.toJson());
        return null;
      },
      successMessage: 'Clinic updated.',
    );
  }

  /// Partial PATCH of just `active` — an inactive clinic is hidden from new
  /// clinic-mode availability windows (AvailabilityState.activeClinics).
  Future<bool> setActive(String id, bool active) => mutate(
        () async {
          await ref.read(doctorApiProvider).updateClinic(id, {'active': active});
          return null;
        },
        successMessage: active ? 'Clinic reactivated.' : 'Clinic marked inactive.',
      );

  Future<bool> remove(String id) => mutate(
        () async {
          await ref.read(doctorApiProvider).removeClinic(id);
          return null;
        },
        successMessage: 'Clinic removed.',
      );
}

final clinicsControllerProvider = AutoDisposeAsyncNotifierProvider<ClinicsController, ProfileWorkState>(ClinicsController.new);
