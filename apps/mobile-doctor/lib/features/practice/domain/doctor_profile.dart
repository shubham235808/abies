import '../../../shared/format.dart';

/// `DoctorClinic` row (packages/domain/prisma/schema.prisma), as included in
/// `GET /api/v1/doctors/me`'s `profile.clinics` and returned by
/// `POST/PATCH /api/v1/doctors/me/clinics*` as `{ clinic }`.
class DoctorClinic {
  const DoctorClinic({
    required this.id,
    required this.name,
    required this.city,
    required this.state,
    required this.addressLine1,
    required this.active,
    this.addressLine2,
    this.postalCode = '',
    this.phone,
  });

  final String id;
  final String name;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String state;
  final String postalCode;
  final String? phone;
  final bool active;

  String get addressSummary =>
      [addressLine1, addressLine2, city, '$state $postalCode'.trim()].whereType<String>().where((s) => s.trim().isNotEmpty).join(', ');

  factory DoctorClinic.fromJson(Map<String, dynamic> json) => DoctorClinic(
        id: json['id'] as String,
        name: json['name'] as String,
        addressLine1: json['addressLine1'] as String? ?? '',
        addressLine2: nonEmpty(json['addressLine2'] as String?),
        city: json['city'] as String? ?? '',
        state: json['state'] as String? ?? '',
        postalCode: json['postalCode'] as String? ?? '',
        phone: nonEmpty(json['phone'] as String?),
        active: json['active'] as bool? ?? true,
      );
}

/// `DoctorDocumentType` enum (schema.prisma / `doctorDocumentTypeSchema` in
/// doctors.schemas.ts), with the same labels the web DocumentsManager uses.
const doctorDocumentTypes = <String, String>{
  'REGISTRATION_CERTIFICATE': 'Registration certificate',
  'DEGREE_CERTIFICATE': 'Degree certificate',
  'ID_PROOF': 'ID proof',
  'PROFILE_PHOTO': 'Profile photo',
  'OTHER': 'Other',
};

String documentTypeLabel(String type) => doctorDocumentTypes[type] ?? humanizeEnum(type);

/// `DoctorDocument` row. [status] is the admin review outcome —
/// `DoctorDocumentStatus` in schema.prisma: PENDING | VERIFIED | REJECTED |
/// RESUBMISSION_REQUIRED (set by admin-doctors.service.ts `reviewDocument`).
class DoctorDocument {
  const DoctorDocument({
    required this.id,
    required this.type,
    required this.status,
    required this.originalName,
    required this.mimeType,
    required this.sizeBytes,
    required this.reviewNote,
    required this.createdAt,
  });

  final String id;
  final String type;
  final String status;
  final String originalName;
  final String mimeType;
  final int sizeBytes;
  final String? reviewNote;
  final DateTime? createdAt;

  bool get isProfilePhoto => type == 'PROFILE_PHOTO';
  bool get needsResubmission => status == 'RESUBMISSION_REQUIRED';

  factory DoctorDocument.fromJson(Map<String, dynamic> json) => DoctorDocument(
        id: json['id'] as String,
        type: json['type'] as String? ?? 'OTHER',
        status: json['status'] as String? ?? 'PENDING',
        originalName: json['originalName'] as String? ?? '',
        mimeType: json['mimeType'] as String? ?? '',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        reviewNote: nonEmpty(json['reviewNote'] as String?),
        createdAt: parseDate(json['createdAt']),
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
/// verificationActions via `privateInclude()`). `PATCH /api/v1/doctors/me`
/// (`updateMe`) returns the same shape. Only the fields this app shows or
/// edits are parsed.
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
    required this.documents,
    required this.clinics,
    required this.availability,
    required this.completion,
    this.gender,
    this.registrationYear,
    this.highestQualification,
    this.graduationInstitution,
    this.graduationYear,
  });

  final String id;
  final String title;
  final String? firstName;
  final String? lastName;
  final String? gender;

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
  final String? highestQualification;
  final String? graduationInstitution;
  final int? graduationYear;
  final String? registrationCouncil;
  final String? registrationNumber;
  final int? registrationYear;
  final String? bio;
  final bool isAcceptingNewPatients;
  final List<DoctorDocument> documents;
  final List<DoctorClinic> clinics;
  final List<AvailabilityWindow> availability;

  /// 0-100, the application-completeness percentage the web dashboard shows.
  final int completion;

  int get documentCount => documents.length;

  bool get isApproved => verificationStatus == 'APPROVED';

  /// doctors.service.ts `editableStatus` — `PATCH /doctors/me` and
  /// `POST /doctors/me/submit` are only accepted in DRAFT or REJECTED.
  bool get isEditableApplication => verificationStatus == 'DRAFT' || verificationStatus == 'REJECTED';

  /// doctors.service.ts `documentsEditable` — credential documents can also be
  /// added/removed while SUBMITTED/UNDER_REVIEW/APPROVED once an admin has
  /// flagged any document RESUBMISSION_REQUIRED. (PROFILE_PHOTO is never
  /// locked — see [canChangeDocumentOfType].)
  bool get credentialDocumentsEditable => isEditableApplication || documents.any((d) => d.needsResubmission);

  /// Same rule as `addDocument`/`removeDocument`: PROFILE_PHOTO is display
  /// content, not a credential, so it can be changed in any status.
  bool canChangeDocumentOfType(String type) => type == 'PROFILE_PHOTO' || credentialDocumentsEditable;

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
      gender: nonEmpty(p['gender'] as String?),
      verificationStatus: p['verificationStatus'] as String,
      rejectionReason: p['rejectionReason'] as String?,
      specialties: strings(p['specialties']),
      languages: strings(p['languages']),
      consultationModes: strings(p['consultationModes']),
      videoFee: p['videoFee'] as int?,
      clinicFee: p['clinicFee'] as int?,
      yearsExperience: p['yearsExperience'] as int?,
      primaryQualification: nonEmpty(p['primaryQualification'] as String?),
      highestQualification: nonEmpty(p['highestQualification'] as String?),
      graduationInstitution: nonEmpty(p['graduationInstitution'] as String?),
      graduationYear: p['graduationYear'] as int?,
      registrationCouncil: nonEmpty(p['registrationCouncil'] as String?),
      registrationNumber: nonEmpty(p['registrationNumber'] as String?),
      registrationYear: p['registrationYear'] as int?,
      bio: nonEmpty(p['bio'] as String?),
      isAcceptingNewPatients: p['isAcceptingNewPatients'] as bool? ?? true,
      documents: (p['documents'] as List<dynamic>? ?? const []).map((e) => DoctorDocument.fromJson(e as Map<String, dynamic>)).toList(),
      clinics: (p['clinics'] as List<dynamic>? ?? const []).map((e) => DoctorClinic.fromJson(e as Map<String, dynamic>)).toList(),
      availability:
          (p['availability'] as List<dynamic>? ?? const []).map((e) => AvailabilityWindow.fromJson(e as Map<String, dynamic>)).toList(),
      completion: (json['completion'] as num? ?? 0).round(),
    );
  }
}
