import 'clinic.dart';

/// One row of `GET /api/v1/public/doctors`'s `doctors[]` — the real search
/// results list (Phase 4), distinct from `lib/features/home/domain/
/// doctor_preview.dart`'s `DoctorPreview` (Phase 3's narrower home-dashboard
/// card). Both parse the same `publicDoctor()` shape
/// (`packages/domain/src/modules/doctors/doctors.service.ts`) but this one
/// keeps every field the search screen's card and filters actually need.
class DoctorSummary {
  const DoctorSummary({
    required this.id,
    required this.slug,
    required this.name,
    required this.primaryQualification,
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
    required this.acceptingNewPatients,
    required this.languageMatch,
  });

  final String id;
  final String slug;
  final String name;
  final String? primaryQualification;
  final int? yearsExperience;
  final List<String> specialties;
  final List<String> languages;

  /// Each is "VIDEO" or "CLINIC".
  final List<String> consultationModes;
  final num? videoFee;
  final num? clinicFee;
  final num? startingFee;
  final double rating;
  final int reviewCount;

  /// Already a backend-relative path (`/api/v1/public/doctors/<slug>/photo`),
  /// not an absolute URL — resolve against the current `AppEnv.baseUrl`
  /// before use (`DoctorsApi.absolutePhotoUrl`).
  final String? photoUrl;
  final List<Clinic> clinics;
  final bool acceptingNewPatients;

  /// Set only when the search request carried the signed-in patient's own
  /// languages as a soft ranking signal — never hides a non-matching doctor,
  /// only lets the card show "Speaks your language"
  /// (docs/ENTERPRISE-GAP-ANALYSIS.md §4, `doctors.service.ts`'s
  /// `publicDoctor()`).
  final bool? languageMatch;

  /// First active clinic's city, for a one-line location on the card — same
  /// convention as `DoctorPreview.city`.
  String? get city => clinics.isNotEmpty ? clinics.first.city : null;

  factory DoctorSummary.fromJson(Map<String, dynamic> json) {
    return DoctorSummary(
      id: json['id'] as String,
      slug: json['slug'] as String,
      name: json['name'] as String,
      primaryQualification: json['primaryQualification'] as String?,
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
      acceptingNewPatients: json['acceptingNewPatients'] as bool? ?? true,
      languageMatch: json['languageMatch'] as bool?,
    );
  }
}
