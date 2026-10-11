import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/pharmacy_profile_api.dart';
import '../domain/pharmacy_profile.dart';

final pharmacyProfileApiProvider = Provider<PharmacyProfileApi>((ref) => PharmacyProfileApiImpl(ref.watch(apiClientProvider)));

/// Mirrors `updatePharmacyProfileSchema`'s bounds (pharmacies.schemas.ts).
const profileNameMax = 200;
const profileEntryMax = 100;
const profileLicenseMaxCount = 20;
const profileServiceAreaMaxCount = 50;

/// One entry per non-blank line, trimmed — the same parsing the web
/// profile form applies to its textareas (profile-form.tsx).
List<String> splitLines(String text) => text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();

/// The signed-in pharmacy's own profile — drives the dashboard
/// verification banner and the in-app profile/submit screen.
class PharmacyProfileController extends AsyncNotifier<PharmacyProfile> {
  @override
  Future<PharmacyProfile> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('pharmacyProfileProvider read before sign-in');
    return ref.watch(pharmacyProfileApiProvider).me();
  }

  PharmacyProfileApi get _api => ref.read(pharmacyProfileApiProvider);

  /// Returns null on success (state replaced with the server's row) or a
  /// user-facing error. Validated locally first so an over-long entry
  /// doesn't need a round trip; the server re-validates authoritatively.
  Future<String?> save({required String name, required List<String> licenseNumbers, required List<String> serviceAreas}) async {
    final current = state.valueOrNull;
    if (current != null && !current.isEditable) {
      return 'Pharmacy details are locked while verification is in progress or approved. Contact support for regulated changes.';
    }
    final trimmedName = name.trim();
    if (trimmedName.length > profileNameMax) return 'Pharmacy name must be at most $profileNameMax characters';
    if (licenseNumbers.length > profileLicenseMaxCount) return 'Add at most $profileLicenseMaxCount license numbers';
    if (serviceAreas.length > profileServiceAreaMaxCount) return 'Add at most $profileServiceAreaMaxCount service areas';
    for (final entry in [...licenseNumbers, ...serviceAreas]) {
      if (entry.length > profileEntryMax) return '"$entry" is too long (max $profileEntryMax characters)';
    }
    try {
      // Blank name is omitted rather than sent as "" — same as the web
      // form's `name || undefined` (the schema requires min(1)).
      final updated = await _api.update(
        name: trimmedName.isEmpty ? null : trimmedName,
        licenseNumbers: licenseNumbers,
        serviceAreas: serviceAreas,
      );
      state = AsyncValue.data(updated);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// `POST /pharmacies/me/submit`. Pre-checks the same conditions
  /// `submitPharmacy` enforces, with the same wording, so the user sees what
  /// is missing without a round trip.
  Future<String?> submit({required bool declarationAccepted}) async {
    if (!declarationAccepted) return 'The partner declaration must be accepted';
    final current = state.valueOrNull;
    if (current != null) {
      if (!current.isEditable) return 'Application is not in a submittable state';
      final missing = current.missingForSubmission;
      if (missing.isNotEmpty) return 'Complete the following before submitting: ${missing.join(', ')}';
    }
    try {
      state = AsyncValue.data(await _api.submit(declarationAccepted: true));
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final pharmacyProfileProvider = AsyncNotifierProvider<PharmacyProfileController, PharmacyProfile>(PharmacyProfileController.new);
