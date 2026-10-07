import 'family_member.dart';

/// Matches `PatientProfile` in `packages/domain/prisma/schema.prisma`, as
/// returned by `GET /api/v1/patients/me` (which includes `familyMembers`).
/// Deliberately not collecting unnecessary medical information at sign-up
/// (brief §2) — `allergies`/`medicalHistory` are edited here, in the
/// profile, never asked for during registration.
class PatientProfile {
  const PatientProfile({
    required this.firstName,
    required this.lastName,
    required this.dateOfBirth,
    required this.gender,
    required this.phone,
    required this.address,
    required this.city,
    required this.state,
    required this.pin,
    required this.preferredLanguage,
    required this.emergencyContact,
    required this.allergies,
    required this.medicalHistory,
    required this.familyMembers,
  });

  final String? firstName;
  final String? lastName;
  final String? dateOfBirth;
  final String? gender;
  final String? phone;
  final String? address;
  final String? city;
  final String? state;
  final String? pin;
  final String preferredLanguage;
  final String? emergencyContact;
  final List<String> allergies;
  final String? medicalHistory;
  final List<FamilyMember> familyMembers;

  String get displayName {
    final full = [firstName, lastName].where((p) => p != null && p!.isNotEmpty).join(' ');
    return full.isEmpty ? 'Your profile' : full;
  }

  factory PatientProfile.fromJson(Map<String, dynamic> json) {
    return PatientProfile(
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      dateOfBirth: json['dateOfBirth'] as String?,
      gender: json['gender'] as String?,
      phone: json['phone'] as String?,
      address: json['address'] as String?,
      city: json['city'] as String?,
      state: json['state'] as String?,
      pin: json['pin'] as String?,
      preferredLanguage: json['preferredLanguage'] as String? ?? 'English',
      emergencyContact: json['emergencyContact'] as String?,
      allergies: (json['allergies'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      medicalHistory: json['medicalHistory'] as String?,
      familyMembers: (json['familyMembers'] as List<dynamic>? ?? const [])
          .map((e) => FamilyMember.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// Matches `getMyProfile()`'s return shape (`{ profile, email, mobile }`) in
/// `packages/domain/src/modules/patients/patients.service.ts` — `email` and
/// `mobile` live on `User`, not `PatientProfile`, so they're siblings here,
/// not fields of [PatientProfile].
class MyProfile {
  const MyProfile({required this.profile, required this.email, required this.mobile});

  final PatientProfile profile;
  final String? email;
  final String mobile;

  factory MyProfile.fromJson(Map<String, dynamic> json) {
    return MyProfile(
      profile: PatientProfile.fromJson(json['profile'] as Map<String, dynamic>),
      email: json['email'] as String?,
      mobile: json['mobile'] as String,
    );
  }
}
