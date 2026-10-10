import '../../../core/api/api_client.dart';
import '../domain/lab_profile.dart';

/// apps/platform-api/src/app/api/v1/labs/me/route.ts (GET, PATCH with
/// `updateLabProfileSchema`) and labs/me/submit/route.ts (POST with
/// `submitLabApplicationSchema`). All three respond `{ lab }`.
abstract class LabProfileApi {
  Future<LabProfile> getMyLab();

  Future<LabProfile> updateMyLab({
    String? name,
    List<String>? licenseNumbers,
    List<String>? serviceCities,
    bool? homeCollectionSupported,
  });

  Future<LabProfile> submit({required bool declarationAccepted});
}

LabProfile _decodeLab(dynamic json) => LabProfile.fromJson((json as Map<String, dynamic>)['lab'] as Map<String, dynamic>);

class LabProfileApiImpl implements LabProfileApi {
  LabProfileApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<LabProfile> getMyLab() => _client.get<LabProfile>('/api/v1/labs/me', decode: _decodeLab);

  @override
  Future<LabProfile> updateMyLab({
    String? name,
    List<String>? licenseNumbers,
    List<String>? serviceCities,
    bool? homeCollectionSupported,
  }) {
    return _client.patch<LabProfile>(
      '/api/v1/labs/me',
      body: {
        // `name: z.string().min(1)` — an empty name is omitted, not sent.
        if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
        if (licenseNumbers != null) 'licenseNumbers': licenseNumbers,
        if (serviceCities != null) 'serviceCities': serviceCities,
        if (homeCollectionSupported != null) 'homeCollectionSupported': homeCollectionSupported,
      },
      decode: _decodeLab,
    );
  }

  @override
  Future<LabProfile> submit({required bool declarationAccepted}) {
    return _client.post<LabProfile>(
      '/api/v1/labs/me/submit',
      body: {'declarationAccepted': declarationAccepted},
      decode: _decodeLab,
    );
  }
}
