/// `GET /api/v1/public/doctors/facets`'s response (`facets()` in
/// `packages/domain/src/modules/doctors/doctors.service.ts`) — the real
/// filter option values (every one already observed on at least one
/// discoverable, approved doctor), not a hardcoded client-side list that
/// could drift from what the catalogue actually contains.
class DoctorFacets {
  const DoctorFacets({required this.specialties, required this.languages, required this.cities});

  final List<String> specialties;
  final List<String> languages;
  final List<String> cities;

  static const empty = DoctorFacets(specialties: [], languages: [], cities: []);

  factory DoctorFacets.fromJson(Map<String, dynamic> json) {
    return DoctorFacets(
      specialties: (json['specialties'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      languages: (json['languages'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      cities: (json['cities'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
