import '../../../core/api/api_client.dart';
import '../domain/pharmacy_profile.dart';

/// apps/platform-api/src/app/api/v1/pharmacies/me/:
/// - `GET   /pharmacies/me`        -> `{pharmacy}` (route.ts, `getMyPharmacy`)
/// - `PATCH /pharmacies/me`        -> `{pharmacy}` (route.ts, `updateMyPharmacy`),
///   body `updatePharmacyProfileSchema` (pharmacies.schemas.ts): `name`
///   1..200, `licenseNumbers` <=20 x 1..100, `serviceAreas` <=50 x 1..100,
///   all optional. 403 unless the profile is DRAFT/REJECTED.
/// - `POST  /pharmacies/me/submit` -> `{pharmacy}` (submit/route.ts,
///   `submitPharmacy`), body `{declarationAccepted: bool}`.
abstract class PharmacyProfileApi {
  Future<PharmacyProfile> me();

  Future<PharmacyProfile> update({String? name, required List<String> licenseNumbers, required List<String> serviceAreas});

  Future<PharmacyProfile> submit({required bool declarationAccepted});
}

class PharmacyProfileApiImpl implements PharmacyProfileApi {
  PharmacyProfileApiImpl(this._client);

  final ApiClient _client;

  static PharmacyProfile _decode(dynamic json) =>
      PharmacyProfile.fromJson((json as Map<String, dynamic>)['pharmacy'] as Map<String, dynamic>);

  @override
  Future<PharmacyProfile> me() => _client.get<PharmacyProfile>('/api/v1/pharmacies/me', decode: _decode);

  @override
  Future<PharmacyProfile> update({String? name, required List<String> licenseNumbers, required List<String> serviceAreas}) {
    return _client.patch<PharmacyProfile>(
      '/api/v1/pharmacies/me',
      body: {
        if (name != null) 'name': name,
        'licenseNumbers': licenseNumbers,
        'serviceAreas': serviceAreas,
      },
      decode: _decode,
    );
  }

  @override
  Future<PharmacyProfile> submit({required bool declarationAccepted}) {
    return _client.post<PharmacyProfile>(
      '/api/v1/pharmacies/me/submit',
      body: {'declarationAccepted': declarationAccepted},
      decode: _decode,
    );
  }
}
