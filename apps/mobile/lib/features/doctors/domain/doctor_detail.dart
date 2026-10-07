import 'availability_window.dart';
import 'clinic.dart';

/// `GET /api/v1/public/doctors/[slug]`'s `doctor` object — the full
/// `publicDoctor()` shape (`packages/domain/src/modules/doctors/
/// doctors.service.ts`), a superset of `DoctorSummary`'s fields (bio,
/// registration/qualification detail, and the recurring `availability[]`
/// windows that the search list never needs).
class DoctorDetail {
  const DoctorDetail({
    required this.id,
    required this.slug,
    required this.name,
    required this.bio,
    required this.registrationCouncil,
    required this.registrationNumber,
    required this.primaryQualification,
    required this.highestQualification,
    required this.yearsExperience,
    required this.specialties,
    required this.languages,
    required this.consultationModes,
    required this.videoFee,
    required this.clinicFee,
    required this.startingFee,
    required this.rating,
    required this.reviewCount,
    required this.photoUrl,
    required this.clinics,
    required this.availability,
    required this.acceptingNewPatients,
  });

  final String id;
  final String slug;
  final String name;
  final String? bio;
  final String? registrationCouncil;
  final String? registrationNumber;
  final String? primaryQualification;
  final String? highestQualification;
  final int? yearsExperience;
  final List<String> specialties;
  final List<String> languages;

  /// Each is "VIDEO" or "CLINIC" — what `GET /api/v1/appointments/slots`'s
  /// `mode` query param and `POST /api/v1/appointments/hold`'s `mode` body
  /// field both expect verbatim.
  final List<String> consultationModes;
  final num? videoFee;
  final num? clinicFee;
  final num? startingFee;
  final double rating;
  final int reviewCount;

  /// Backend-relative path — resolve with `DoctorsApi.absolutePhotoUrl`.
  final String? photoUrl;
  final List<Clinic> clinics;
  final List<AvailabilityWindow> availability;
  final bool acceptingNewPatients;

  /// The fee for a given consultation mode, or null if the doctor doesn't
  /// offer it / hasn't set a fee yet (`holdSlot()` in
  /// `appointments.service.ts` rejects a hold with no fee set for the chosen
  /// mode — this mirrors that rule for the booking screen's own display).
  num? feeFor(String mode) => mode == 'VIDEO' ? videoFee : (mode == 'CLINIC' ? clinicFee : null);

  factory DoctorDetail.fromJson(Map<String, dynamic> json) {
    return DoctorDetail(
      id: json['id'] as String,
      slug: json['slug'] as String,
      name: json['name'] as String,
      bio: json['bio'] as String?,
      registrationCouncil: json['registrationCouncil'] as String?,
      registrationNumber: json['registrationNumber'] as String?,
      primaryQualification: json['primaryQualification'] as String?,
      highestQualification: json['highestQualification'] as String?,
      yearsExperience: json['yearsExperience'] as int?,
      specialties: (json['specialties'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      languages: (json['languages'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      consultationModes: (json['consultationModes'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      videoFee: json['videoFee'] as num?,
      clinicFee: json['clinicFee'] as num?,
      startingFee: json['startingFee'] as num?,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      reviewCount: json['reviewCount'] as int? ?? 0,
      photoUrl: json['photoUrl'] as String?,
      clinics: (json['clinics'] as List<dynamic>? ?? const [])
          .map((e) => Clinic.fromJson(e as Map<String, dynamic>))
          .toList(),
      availability: (json['availability'] as List<dynamic>? ?? const [])
          .map((e) => AvailabilityWindow.fromJson(e as Map<String, dynamic>))
          .toList(),
      acceptingNewPatients: json['acceptingNewPatients'] as bool? ?? true,
    );
  }
}
