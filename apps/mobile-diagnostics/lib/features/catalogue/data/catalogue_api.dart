import '../../../core/api/api_client.dart';
import '../domain/catalogue.dart';

/// apps/platform-api/src/app/api/v1/labs/me/tests/route.ts (GET, POST),
/// tests/[id]/route.ts (PATCH, DELETE), packages/route.ts (GET, POST),
/// packages/[id]/route.ts (PATCH, DELETE). All `requireRole(ctx, 'LAB')`;
/// test POST additionally `requirePermission('diagnostics.catalogue.manage')`,
/// which LAB holds (packages/domain/src/server/permissions.ts).
abstract class CatalogueApi {
  Future<List<LabTest>> listTests();
  Future<List<LabPackage>> listPackages();
  Future<void> createTest(TestInput input);
  Future<void> updateTest(String id, Map<String, dynamic> patch);
  Future<void> deleteTest(String id);
  Future<void> createPackage(PackageInput input);
  Future<void> updatePackage(String id, Map<String, dynamic> patch);
  Future<void> deletePackage(String id);
}

class CatalogueApiImpl implements CatalogueApi {
  CatalogueApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<LabTest>> listTests() => _client.get<List<LabTest>>(
        '/api/v1/labs/me/tests',
        decode: (json) =>
            ((json as Map<String, dynamic>)['tests'] as List<dynamic>).whereType<Map<String, dynamic>>().map(LabTest.fromJson).toList(),
      );

  @override
  Future<List<LabPackage>> listPackages() => _client.get<List<LabPackage>>(
        '/api/v1/labs/me/packages',
        decode: (json) => ((json as Map<String, dynamic>)['packages'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(LabPackage.fromJson)
            .toList(),
      );

  @override
  Future<void> createTest(TestInput input) => _client.post<void>('/api/v1/labs/me/tests', body: input.toJson(), decode: (_) {});

  @override
  Future<void> updateTest(String id, Map<String, dynamic> patch) =>
      _client.patch<void>('/api/v1/labs/me/tests/$id', body: patch, decode: (_) {});

  @override
  Future<void> deleteTest(String id) => _client.delete<void>('/api/v1/labs/me/tests/$id', decode: (_) {});

  @override
  Future<void> createPackage(PackageInput input) =>
      _client.post<void>('/api/v1/labs/me/packages', body: input.toJson(), decode: (_) {});

  @override
  Future<void> updatePackage(String id, Map<String, dynamic> patch) =>
      _client.patch<void>('/api/v1/labs/me/packages/$id', body: patch, decode: (_) {});

  @override
  Future<void> deletePackage(String id) => _client.delete<void>('/api/v1/labs/me/packages/$id', decode: (_) {});
}
