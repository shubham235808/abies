/// `GET /api/v1/public/medicines/facets`'s response (`facets()` in
/// `packages/domain/src/modules/medicines/catalogue.service.ts`) — `{ areas,
/// categories, brands }`, read directly from that function rather than
/// assumed. Scoped server-side to the same `isFmcg: false` catalogue the
/// main grid searches (that function's own comment), so these options never
/// suggest a filter combination that would yield an empty grid.
class MedicineFacets {
  const MedicineFacets({required this.areas, required this.categories, required this.brands});

  final List<String> areas;
  final List<String> categories;
  final List<String> brands;

  static const empty = MedicineFacets(areas: [], categories: [], brands: []);

  factory MedicineFacets.fromJson(Map<String, dynamic> json) {
    return MedicineFacets(
      areas: (json['areas'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      categories: (json['categories'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      brands: (json['brands'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
    );
  }
}
