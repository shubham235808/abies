import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/lab_profile_api.dart';
import '../domain/lab_profile.dart';

final labProfileApiProvider = Provider<LabProfileApi>((ref) => LabProfileApiImpl(ref.watch(apiClientProvider)));

/// One entry per line → trimmed, non-empty list; same parsing as the web
/// profile form's textareas.
List<String> splitLines(String text) => text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();

/// The signed-in lab's own `DiagnosticLab` row. Drives the dashboard's
/// verification banner (only an APPROVED lab sees orders, same as the web
/// overview) plus the profile/submit screen.
class LabProfileController extends AsyncNotifier<LabProfile> {
  @override
  Future<LabProfile> build() {
    ref.watch(sessionUserIdProvider);
    return ref.watch(labProfileApiProvider).getMyLab();
  }

  /// Returns null on success, else a user-facing error message.
  Future<String?> save({
    required String name,
    required String licenseNumbersText,
    required String serviceCitiesText,
    required bool homeCollectionSupported,
  }) async {
    try {
      final updated = await ref.read(labProfileApiProvider).updateMyLab(
            name: name,
            licenseNumbers: splitLines(licenseNumbersText),
            serviceCities: splitLines(serviceCitiesText),
            homeCollectionSupported: homeCollectionSupported,
          );
      state = AsyncValue.data(updated);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  Future<String?> submit({required bool declarationAccepted}) async {
    if (!declarationAccepted) return 'The partner declaration must be accepted';
    try {
      final updated = await ref.read(labProfileApiProvider).submit(declarationAccepted: true);
      state = AsyncValue.data(updated);
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final labProfileControllerProvider = AsyncNotifierProvider<LabProfileController, LabProfile>(LabProfileController.new);
