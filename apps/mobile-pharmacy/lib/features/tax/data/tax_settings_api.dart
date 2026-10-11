import '../../../core/api/api_client.dart';
import '../domain/tax_settings.dart';

/// apps/platform-api/src/app/api/v1/pharmacies/me/tax-settings/route.ts:
/// - `GET /pharmacies/me/tax-settings` -> `{settings: TaxSettings | null}`
///   (`getMyTaxSettings` — works for any verification status).
/// - `PUT /pharmacies/me/tax-settings` -> `{settings}` (`upsertMyTaxSettings`),
///   body `taxSettingsSchema`. Requires an APPROVED pharmacy
///   (`requireApprovedPharmacy` -> 404 "Pharmacy profile not found or not
///   approved" otherwise).
abstract class TaxSettingsApi {
  Future<TaxSettings?> get();

  Future<TaxSettings> save(TaxSettings settings);
}

class TaxSettingsApiImpl implements TaxSettingsApi {
  TaxSettingsApiImpl(this._client);

  final ApiClient _client;

  static const _path = '/api/v1/pharmacies/me/tax-settings';

  @override
  Future<TaxSettings?> get() {
    return _client.get<TaxSettings?>(_path, decode: (json) {
      final s = (json as Map<String, dynamic>)['settings'];
      return s is Map<String, dynamic> ? TaxSettings.fromJson(s) : null;
    });
  }

  @override
  Future<TaxSettings> save(TaxSettings settings) {
    return _client.put<TaxSettings>(
      _path,
      body: settings.toJson(),
      decode: (json) => TaxSettings.fromJson((json as Map<String, dynamic>)['settings'] as Map<String, dynamic>),
    );
  }
}
