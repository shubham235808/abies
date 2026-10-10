import '../../../shared/format.dart';

/// `DoctorClinic` row (packages/domain/prisma/schema.prisma), as included in
/// `GET /api/v1/doctors/me`'s `profile.clinics`.
class DoctorClinic {
  const DoctorClinic({required this.id, required this.name, required this.city, required this.state, required this.addressLine1, required this.active});

  final String id;
  final String name;
  final String city;
  final String state;
  final String addressLine1;
  final bool active;

  factory DoctorClinic.fromJson(Map<String, dynamic> json) => DoctorClinic(
        id: json['id'] as String,
        name: json['name'] as String,
        city: json['city'] as String? ?? '',
        state: json['state'] as String? ?? '',
        addressLine1: json['addressLine1'] as String? ?? '',
        active: json['active'] as bool? ?? true,
      );
}

/// `DoctorAvailability` row — a weekly recurring window. `startTime`/`endTime`
/// are `HH:MM` 24-hour strings (createAvailabilitySchema in doctors.schemas.ts).
class AvailabilityWindow {
  const AvailabilityWindow({
    required this.id,
    required this.dayOfWeek,
    required this.startTime,
    required this.endTime,
    required this.slotMinutes,
    required this.mode,
    required this.clinicId,
    required this.active,
  });

  final String id;

  /// 0 = Sunday … 6 = Saturday.
  final int dayOfWeek;
  final String startTime;
  final String endTime;
  final int slotMinutes;

  /// `VIDEO` or `CLINIC`.
  final String mode;
  final String? clinicId;
  final bool active;

  factory AvailabilityWindow.fromJson(Map<String, dynamic> json) => AvailabilityWindow(
        id: json['id'] as String,
        dayOfWeek: json['dayOfWeek'] as int,
        startTime: json['startTime'] as String,
        endTime: json['endTime'] as String,
        slotMinutes: json['slotMinutes'] as int? ?? 30,
        mode: json['mode'] as String,
        clinicId: json['clinicId'] as String?,
        active: json['active'] as bool? ?? true,
      );
}

/// `GET /api/v1/doctors/me` → `{ profile, completion }` (doctors.service.ts
/// `getMe`, profile includes documents/clinics/availability/
/// verificationActions via `privateInclude()`). Only the fields this app
/// shows are parsed.
class DoctorProfile {
  const DoctorProfile({
    required this.id,
    required this.title,
    required this.firstName,
    required this.lastName,
    required this.verificationStatus,
    required this.rejectionReason,
    required this.specialties,
    required this.languages,
    required this.consultationModes,
    required this.videoFee,
    required this.clinicFee,
    required this.yearsExperience,
    required this.primaryQualification,
    required this.registrationCouncil,
    required this.registrationNumber,
    required this.bio,
    required this.isAcceptingNewPatients,
    required this.documentCount,
    required this.clinics,
    required this.availability,
    required this.completion,
  });

  final String id;
  final String title;
  final String? firstName;
  final String? lastName;

  /// DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | SUSPENDED.
  final String verificationStatus;
  final String? rejectionReason;
  final List<String> specialties;
  final List<String> languages;
  final List<String> consultationModes;
  final int? videoFee;
  final int? clinicFee;
  final int? yearsExperience;
  final String? primaryQualification;
  final String? registrationCouncil;
  final String? registrationNumber;
  final String? bio;
  final bool isAcceptingNewPatients;
  final int documentCount;
  final List<DoctorClinic> clinics;
  final List<AvailabilityWindow> availability;

  /// 0-100, the application-completeness percentage the web dashboard shows.
  final int completion;

  bool get isApproved => verificationStatus == 'APPROVED';
  bool get isEditableApplication => verificationStatus == 'DRAFT' || verificationStatus == 'REJECTED';

  String get displayName {
    final name = [firstName, lastName].whereType<String>().where((s) => s.trim().isNotEmpty).join(' ');
    return name.isEmpty ? 'Your application' : '$title $name';
  }

  factory DoctorProfile.fromMeJson(Map<String, dynamic> json) {
    final p = json['profile'] as Map<String, dynamic>;
    List<String> strings(Object? raw) => (raw as List<dynamic>? ?? const []).map((e) => e.toString()).toList();
    return DoctorProfile(
      id: p['id'] as String,
      title: p['title'] as String? ?? 'Dr.',
      firstName: nonEmpty(p['firstName'] as String?),
      lastName: nonEmpty(p['lastName'] as String?),
      verificationStatus: p['verificationStatus'] as String,
      rejectionReason: p['rejectionReason'] as String?,
      specialties: strings(p['specialties']),
      languages: strings(p['languages']),
      consultationModes: strings(p['consultationModes']),
      videoFee: p['videoFee'] as int?,
      clinicFee: p['clinicFee'] as int?,
      yearsExperience: p['yearsExperience'] as int?,
      primaryQualification: p['primaryQualification'] as String?,
      registrationCouncil: p['registrationCouncil'] as String?,
      registrationNumber: p['registrationNumber'] as String?,
      bio: p['bio'] as String?,
      isAcceptingNewPatients: p['isAcceptingNewPatients'] as bool? ?? true,
      documentCount: (p['documents'] as List<dynamic>? ?? const []).length,
      clinics: (p['clinics'] as List<dynamic>? ?? const []).map((e) => DoctorClinic.fromJson(e as Map<String, dynamic>)).toList(),
      availability:
          (p['availability'] as List<dynamic>? ?? const []).map((e) => AvailabilityWindow.fromJson(e as Map<String, dynamic>)).toList(),
      completion: (json['completion'] as num? ?? 0).round(),
    );
  }
}
