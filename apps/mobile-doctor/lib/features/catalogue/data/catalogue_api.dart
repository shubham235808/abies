import '../../../core/api/api_client.dart';

enum CatalogueKind { test, package, therapy }

/// One selectable test/package/therapy for a recommendation. The web
/// workspace loads its pickers via server-only `listActiveForRecommendation`
/// calls that have no HTTP route, so this app uses the public search
/// endpoints instead (same active catalogue, searchable):
/// - `GET /api/v1/public/diagnostics` → `{ total, tests }` (lab under `lab`)
/// - `GET /api/v1/public/diagnostics/packages` → `{ total, packages }`
/// - `GET /api/v1/public/panchakarma` → `{ total, therapies }` (centre under `centre`)
/// Query: `q`, `limit` (≤50) — publicTestSearchSchema / publicTherapySearchSchema.
class CatalogueOption {
  const CatalogueOption({required this.id, required this.name, required this.providerName, required this.kind});

  final String id;
  final String name;
  final String? providerName;
  final CatalogueKind kind;

  factory CatalogueOption.fromJson(Map<String, dynamic> json, CatalogueKind kind, String providerKey) => CatalogueOption(
        id: json['id'] as String,
        name: json['name'] as String,
        providerName: (json[providerKey] as Map<String, dynamic>?)?['name'] as String?,
        kind: kind,
      );
}

abstract class CatalogueApi {
  Future<List<CatalogueOption>> searchTests(String q);
  Future<List<CatalogueOption>> searchPackages(String q);
  Future<List<CatalogueOption>> searchTherapies(String q);
}

class CatalogueApiImpl implements CatalogueApi {
  CatalogueApiImpl(this._client);

  final ApiClient _client;

  Future<List<CatalogueOption>> _search(String path, String q, String listKey, CatalogueKind kind, String providerKey) {
    return _client.get<List<CatalogueOption>>(
      path,
      query: {if (q.trim().isNotEmpty) 'q': q.trim(), 'limit': '30'},
      decode: (json) => ((json as Map<String, dynamic>)[listKey] as List<dynamic>? ?? const [])
          .map((e) => CatalogueOption.fromJson(e as Map<String, dynamic>, kind, providerKey))
          .toList(),
    );
  }

  @override
  Future<List<CatalogueOption>> searchTests(String q) => _search('/api/v1/public/diagnostics', q, 'tests', CatalogueKind.test, 'lab');

  @override
  Future<List<CatalogueOption>> searchPackages(String q) =>
      _search('/api/v1/public/diagnostics/packages', q, 'packages', CatalogueKind.package, 'lab');

  @override
  Future<List<CatalogueOption>> searchTherapies(String q) =>
      _search('/api/v1/public/panchakarma', q, 'therapies', CatalogueKind.therapy, 'centre');
}
