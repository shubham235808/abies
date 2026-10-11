import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/profile_inputs.dart';
import 'practice_providers.dart';
import 'profile_management.dart';

/// Profile view/edit + submit-for-verification — the mobile port of the web
/// ProfileForm (apps/partner-web/.../doctor/profile/profile-form.tsx) and
/// SubmitButton (.../doctor/submit-button.tsx).
///
/// Edits are only offered in DRAFT/REJECTED, the same rule the backend
/// enforces (doctors.service.ts `updateMe` throws 403 otherwise); this
/// controller refuses locally first so a locked profile never round-trips.
class ProfileController extends ProfileWorkController {
  @override
  ProviderBase<AsyncValue<ProfileWorkState>> get selfProvider => profileControllerProvider;

  static const lockedMessage =
      'Your profile is locked while verification is in progress or approved. Contact ABIES support for regulated changes.';

  Future<bool> save(ProfileFormInput input) async {
    final current = state.valueOrNull;
    if (current == null) return false;
    if (!current.profile.isEditableApplication) return reject(error: lockedMessage);
    final errors = input.validate();
    if (errors.isNotEmpty) return reject(error: 'Check the highlighted fields.', fieldErrors: errors);
    return mutate(() => ref.read(doctorApiProvider).updateProfile(input.toPatchBody()), successMessage: 'Profile saved.');
  }

  /// `POST /doctors/me/submit`. The backend checks completeness itself and
  /// returns the list of missing items as a 400 message, shown as-is.
  Future<bool> submit({required bool declarationAccepted}) async {
    final current = state.valueOrNull;
    if (current == null) return false;
    if (!current.profile.isEditableApplication) return reject(error: 'Application is not in a submittable state');
    if (!declarationAccepted) return reject(error: 'The practitioner declaration must be accepted');
    return mutate(
      () async {
        await ref.read(doctorApiProvider).submitApplication(declarationAccepted: true);
        return null;
      },
      successMessage: 'Application submitted for ABIES verification.',
    );
  }
}

final profileControllerProvider = AutoDisposeAsyncNotifierProvider<ProfileController, ProfileWorkState>(ProfileController.new);
