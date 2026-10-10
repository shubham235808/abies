import 'dart:async';

import 'package:abies_mobile/features/auth/data/auth_api.dart';
import 'package:abies_mobile/features/auth/domain/auth_result.dart';
import 'package:abies_mobile/features/auth/domain/session_user.dart';
import 'package:abies_mobile/features/auth/presentation/auth_controller.dart';
import 'package:abies_mobile/features/doctors/data/doctors_api.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_detail.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_facets.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_review.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_search_result.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_summary.dart';
import 'package:abies_mobile/features/doctors/presentation/doctors_controller.dart';
import 'package:abies_mobile/features/profile/data/consent_api.dart';
import 'package:abies_mobile/features/profile/data/profile_api.dart';
import 'package:abies_mobile/features/profile/domain/consent.dart';
import 'package:abies_mobile/features/profile/domain/family_member.dart';
import 'package:abies_mobile/features/profile/domain/patient_profile.dart';
import 'package:abies_mobile/features/profile/presentation/profile_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _testUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'asha@example.test', role: 'PATIENT');

class _FakeAuthApi implements AuthApi {
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;
  @override
  Future<SessionUser?> me() async => _testUser;
  @override
  Future<void> logout() async {}
  @override
  Future<LoginResult> login({String? mobile, String? email, required String password}) => throw UnimplementedError();
  @override
  Future<RegisterResult> register({required String name, required String mobile, required String email, required String password}) =>
      throw UnimplementedError();
  @override
  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email}) => throw UnimplementedError();
  @override
  Future<SetPasswordResult> completePasswordSetup({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
  @override
  Future<SetPasswordResult> resetPassword({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
}

class _FakeProfileApi implements ProfileApi {
  _FakeProfileApi({this.city});
  final String? city;

  @override
  Future<MyProfile> getMyProfile() async {
    return MyProfile(
      profile: PatientProfile(
        firstName: 'Asha',
        lastName: 'Rao',
        dateOfBirth: null,
        gender: null,
        phone: null,
        address: null,
        city: city,
        state: null,
        pin: null,
        preferredLanguage: 'English',
        emergencyContact: null,
        allergies: const [],
        medicalHistory: null,
        familyMembers: const [],
      ),
      email: 'asha@example.test',
      mobile: '+919876543210',
    );
  }

  @override
  Future<PatientProfile> updateMyProfile(Map<String, dynamic> patch) => throw UnimplementedError();
  @override
  Future<FamilyMember> addFamilyMember(Map<String, dynamic> dto) => throw UnimplementedError();
  @override
  Future<FamilyMember> updateFamilyMember(String id, Map<String, dynamic> dto) => throw UnimplementedError();
  @override
  Future<void> deleteFamilyMember(String id) => throw UnimplementedError();
}

class _FakeConsentApi implements ConsentApi {
  @override
  Future<List<ConsentArtifact>> listCurrentArtifacts() async => const [];
  @override
  Future<List<ConsentRecord>> listMyConsents() async => const [];
  @override
  Future<ConsentRecord> accept(String artifactId) => throw UnimplementedError();
  @override
  Future<ConsentRecord> withdraw(String artifactId) => throw UnimplementedError();
}

DoctorSummary _doctor(String id) {
  return DoctorSummary(
    id: id,
    slug: 'dr-$id',
    name: 'Dr. $id',
    primaryQualification: 'BAMS',
    yearsExperience: 5,
    specialties: const ['Panchakarma'],
    languages: const ['English'],
    consultationModes: const ['VIDEO'],
    videoFee: 400,
    clinicFee: null,
    startingFee: 400,
    rating: 4.0,
    reviewCount: 5,
    photoUrl: null,
    clinics: [],
    acceptingNewPatients: true,
    languageMatch: null,
  );
}

class _FakeDoctorsApi implements DoctorsApi {
  List<DoctorSummary> page1 = [_doctor('a'), _doctor('b')];
  List<DoctorSummary> page2 = [_doctor('c')];
  int total = 3;
  String? lastCity = 'unset';
  String? lastSpecialty = 'unset';
  final List<int> searchOffsets = [];

  @override
  Future<DoctorSearchResult> search({
    String? q,
    String? city,
    String? specialty,
    String? language,
    String? mode,
    bool? accepting,
    int limit = 20,
    int offset = 0,
  }) async {
    lastCity = city;
    lastSpecialty = specialty;
    searchOffsets.add(offset);
    final doctors = offset == 0 ? page1 : page2;
    return DoctorSearchResult(total: total, offset: offset, limit: limit, doctors: doctors);
  }

  @override
  Future<DoctorFacets> facets() async => DoctorFacets.empty;

  @override
  Future<DoctorDetail> detail(String slug) => throw UnimplementedError();

  @override
  Future<List<DoctorReview>> reviews(String slug) => throw UnimplementedError();

  @override
  String? absolutePhotoUrl(String? relativePath) => relativePath;
}

ProviderContainer _buildContainer({required _FakeDoctorsApi doctors, String? city}) {
  final container = ProviderContainer(overrides: [
    authApiProvider.overrideWithValue(_FakeAuthApi()),
    profileApiProvider.overrideWithValue(_FakeProfileApi(city: city)),
    consentApiProvider.overrideWithValue(_FakeConsentApi()),
    doctorsApiProvider.overrideWithValue(doctors),
  ]);
  return container;
}

void main() {
  group('DoctorSearchController', () {
    test('prefills the city filter from the signed-in patient profile', () async {
      final doctors = _FakeDoctorsApi();
      final container = _buildContainer(doctors: doctors, city: 'Pune');
      addTearDown(container.dispose);

      await container.read(doctorSearchControllerProvider.future);

      expect(doctors.lastCity, 'Pune');
    });

    test('has no city filter when the profile has none set', () async {
      final doctors = _FakeDoctorsApi();
      final container = _buildContainer(doctors: doctors, city: null);
      addTearDown(container.dispose);

      await container.read(doctorSearchControllerProvider.future);

      expect(doctors.lastCity, isNull);
    });

    test('applyFilters re-searches with the new filters, replacing the previous page', () async {
      final doctors = _FakeDoctorsApi();
      final container = _buildContainer(doctors: doctors, city: 'Pune');
      addTearDown(container.dispose);
      await container.read(doctorSearchControllerProvider.future);

      await container.read(doctorSearchControllerProvider.notifier).applyFilters(
            const DoctorSearchFilters(specialty: 'Panchakarma'),
          );

      expect(doctors.lastSpecialty, 'Panchakarma');
      final result = container.read(doctorSearchControllerProvider).value!;
      expect(result.doctors.map((d) => d.id), ['a', 'b']);
    });

    test('loadMore appends the next page instead of replacing the list', () async {
      final doctors = _FakeDoctorsApi();
      final container = _buildContainer(doctors: doctors, city: 'Pune');
      addTearDown(container.dispose);
      await container.read(doctorSearchControllerProvider.future);

      await container.read(doctorSearchControllerProvider.notifier).loadMore();

      final result = container.read(doctorSearchControllerProvider).value!;
      expect(result.doctors.map((d) => d.id), ['a', 'b', 'c']);
      expect(doctors.searchOffsets, contains(2));
    });

    test('hasMore is false once total results are loaded, and loadMore then does nothing further', () async {
      final doctors = _FakeDoctorsApi()..total = 2;
      final container = _buildContainer(doctors: doctors, city: 'Pune');
      addTearDown(container.dispose);
      await container.read(doctorSearchControllerProvider.future);

      expect(container.read(doctorSearchControllerProvider).value!.hasMore, isFalse);

      final offsetsBefore = List<int>.from(doctors.searchOffsets);
      await container.read(doctorSearchControllerProvider.notifier).loadMore();
      expect(doctors.searchOffsets, offsetsBefore);
    });
  });
}
