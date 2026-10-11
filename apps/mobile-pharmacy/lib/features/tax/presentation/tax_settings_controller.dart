import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/tax_settings_api.dart';
import '../domain/tax_settings.dart';

final taxSettingsApiProvider = Provider<TaxSettingsApi>((ref) => TaxSettingsApiImpl(ref.watch(apiClientProvider)));

/// The pharmacy's GST registration (null until first saved). The POS screen
/// watches this too: no active settings, no sale.
class TaxSettingsController extends AsyncNotifier<TaxSettings?> {
  @override
  Future<TaxSettings?> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) throw StateError('TaxSettingsController read before sign-in');
    return ref.watch(taxSettingsApiProvider).get();
  }

  /// Normalises (trim; upper-case GSTIN and invoice prefix, as the web form
  /// does), validates against `taxSettingsSchema`'s rules, then upserts.
  /// Returns null on success or a user-facing error.
  Future<String?> save({
    required String legalBusinessName,
    required String gstin,
    required String registeredState,
    required String stateCode,
    required String invoicePrefix,
  }) async {
    final input = TaxSettings(
      legalBusinessName: legalBusinessName.trim(),
      gstin: gstin.trim().toUpperCase(),
      registeredState: registeredState.trim(),
      stateCode: stateCode.trim(),
      invoicePrefix: invoicePrefix.trim().toUpperCase(),
    );
    final invalid = validateTaxSettings(input);
    if (invalid != null) return invalid;
    try {
      state = AsyncValue.data(await ref.read(taxSettingsApiProvider).save(input));
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }
}

final taxSettingsControllerProvider = AsyncNotifierProvider<TaxSettingsController, TaxSettings?>(TaxSettingsController.new);
