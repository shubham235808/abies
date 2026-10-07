/// A preview card's worth of a doctor, matching the `publicDoctor()` shape
/// returned by `GET /api/v1/public/doctors`
/// (`packages/domain/src/modules/doctors/doctors.service.ts`). Only the
/// fields the home screen's horizontal preview card actually shows — the
/// full detail view (specialties, availability, reviews, …) is Phase 4.
class DoctorPreview {
  const DoctorPreview({
    required this.id,
    required this.slug,
    required this.name,
    required this.specialties,
    required this.rating,
    required this.startingFee,
    required this.photoUrl,
    required this.city,
  });

  final String id;
  final String slug;
  final String name;
  final List<String> specialties;
  final double? rating;
  final num? startingFee;
  final String? photoUrl;

  /// From the first active clinic, if any — the public search response's own
  /// `clinics` array, not a geolocation lookup (this phase never asks the
  /// device for location; see HomeController).
  final String? city;

  factory DoctorPreview.fromJson(Map<String, dynamic> json) {
    final clinics = json['clinics'] as List<dynamic>? ?? const [];
    final firstClinic = clinics.isNotEmpty ? clinics.first as Map<String, dynamic> : null;
    return DoctorPreview(
      id: json['id'] as String,
      slug: json['slug'] as String,
      name: json['name'] as String,
      specialties: (json['specialties'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      rating: (json['rating'] as num?)?.toDouble(),
      startingFee: json['startingFee'] as num?,
      photoUrl: json['photoUrl'] as String?,
      city: firstClinic?['city'] as String?,
    );
  }
}
