/// `GET /api/v1/public/panchakarma/facets`'s response (`facets()` in
/// `packages/domain/src/modules/panchakarma/catalogue.service.ts`) —
/// `{ cities }` only. Unlike `DoctorFacets` (Phase 4) there is no
/// specialty/language-shaped facet here — read directly from the real
/// `facets()` function, not assumed from the doctors analog.
class PanchakarmaFacets {
  const PanchakarmaFacets({required this.cities});

  final List<String> cities;

  static const empty = PanchakarmaFacets(cities: []);

  factory PanchakarmaFacets.fromJson(Map<String, dynamic> json) {
    return PanchakarmaFacets(
      cities: (json['cities'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
