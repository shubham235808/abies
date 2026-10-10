import '../../../core/api/api_client.dart';
import '../domain/pharmacy_profile.dart';

/// `GET /api/v1/pharmacies/me` (apps/platform-api/src/app/api/v1/pharmacies/me/route.ts).
abstract class PharmacyProfileApi {
  Future<PharmacyProfile> me();
}

class PharmacyProfileApiImpl implements PharmacyProfileApi {
  PharmacyProfileApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<PharmacyProfile> me() {
    return _client.get<PharmacyProfile>(
      '/api/v1/pharmacies/me',
      decode: (json) => PharmacyProfile.fromJson((json as Map<String, dynamic>)['pharmacy'] as Map<String, dynamic>),
    );
  }
}
