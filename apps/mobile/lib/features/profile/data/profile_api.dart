import '../../../core/api/api_client.dart';
import '../domain/family_member.dart';
import '../domain/patient_profile.dart';

abstract class ProfileApi {
  Future<MyProfile> getMyProfile();
  Future<PatientProfile> updateMyProfile(Map<String, dynamic> patch);
  Future<FamilyMember> addFamilyMember(Map<String, dynamic> dto);
  Future<FamilyMember> updateFamilyMember(String id, Map<String, dynamic> dto);
  Future<void> deleteFamilyMember(String id);
}

class ProfileApiImpl implements ProfileApi {
  ProfileApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<MyProfile> getMyProfile() {
    return _client.get<MyProfile>('/api/v1/patients/me', decode: (json) => MyProfile.fromJson(json as Map<String, dynamic>));
  }

  @override
  Future<PatientProfile> updateMyProfile(Map<String, dynamic> patch) {
    return _client.patch<PatientProfile>(
      '/api/v1/patients/me',
      body: patch,
      decode: (json) => PatientProfile.fromJson((json as Map<String, dynamic>)['profile'] as Map<String, dynamic>),
    );
  }

  @override
  Future<FamilyMember> addFamilyMember(Map<String, dynamic> dto) {
    return _client.post<FamilyMember>(
      '/api/v1/patients/me/family',
      body: dto,
      decode: (json) => FamilyMember.fromJson((json as Map<String, dynamic>)['member'] as Map<String, dynamic>),
    );
  }

  @override
  Future<FamilyMember> updateFamilyMember(String id, Map<String, dynamic> dto) {
    return _client.patch<FamilyMember>(
      '/api/v1/patients/me/family/$id',
      body: dto,
      decode: (json) => FamilyMember.fromJson((json as Map<String, dynamic>)['member'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> deleteFamilyMember(String id) {
    return _client.delete<void>('/api/v1/patients/me/family/$id', decode: (_) {});
  }
}
