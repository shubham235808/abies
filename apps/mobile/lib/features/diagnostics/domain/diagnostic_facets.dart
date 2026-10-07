/// `GET /api/v1/public/diagnostics/facets`'s response (`facets()` in
/// `packages/domain/src/modules/diagnostics/catalogue.service.ts`) — `{
/// cities }` only, same shape as Phase 5's `PanchakarmaFacets`. Read directly
/// from the real `facets()` function, not assumed.
class DiagnosticFacets {
  const DiagnosticFacets({required this.cities});

  final List<String> cities;

  static const empty = DiagnosticFacets(cities: []);

  factory DiagnosticFacets.fromJson(Map<String, dynamic> json) {
    return DiagnosticFacets(cities: (json['cities'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList());
  }
}
