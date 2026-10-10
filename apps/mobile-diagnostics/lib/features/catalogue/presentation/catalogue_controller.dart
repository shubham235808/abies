import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/catalogue_api.dart';
import '../domain/catalogue.dart';

final catalogueApiProvider = Provider<CatalogueApi>((ref) => CatalogueApiImpl(ref.watch(apiClientProvider)));

/// The lab's own tests + packages. Every mutation re-reads both lists from
/// the server afterwards (a test delete cascades out of packages via
/// `DiagnosticPackageTest onDelete: Cascade`, so packages can change too).
/// Mutations return null on success or a user-facing error message.
class CatalogueController extends AsyncNotifier<LabCatalogue> {
  @override
  Future<LabCatalogue> build() {
    ref.watch(sessionUserIdProvider);
    return _load(ref.watch(catalogueApiProvider));
  }

  Future<LabCatalogue> _load(CatalogueApi api) async {
    final results = await Future.wait([api.listTests(), api.listPackages()]);
    return LabCatalogue(tests: results[0] as List<LabTest>, packages: results[1] as List<LabPackage>);
  }

  Future<String?> saveTest(TestInput input, {String? existingId}) => _mutate((api) {
        return existingId == null ? api.createTest(input) : api.updateTest(existingId, input.toJson(forUpdate: true));
      });

  Future<String?> setTestActive(String id, bool active) => _mutate((api) => api.updateTest(id, {'active': active}));

  Future<String?> deleteTest(String id) => _mutate((api) => api.deleteTest(id));

  Future<String?> savePackage(PackageInput input, {String? existingId}) {
    if (input.testIds.isEmpty) return Future.value('Pick at least one test for this package');
    return _mutate((api) {
      return existingId == null ? api.createPackage(input) : api.updatePackage(existingId, input.toJson(forUpdate: true));
    });
  }

  Future<String?> setPackageActive(String id, bool active) => _mutate((api) => api.updatePackage(id, {'active': active}));

  Future<String?> deletePackage(String id) => _mutate((api) => api.deletePackage(id));

  Future<String?> _mutate(Future<void> Function(CatalogueApi api) action) async {
    final api = ref.read(catalogueApiProvider);
    try {
      await action(api);
    } on ApiException catch (e) {
      return e.message;
    }
    state = await AsyncValue.guard(() => _load(api));
    return null;
  }
}

final catalogueControllerProvider = AsyncNotifierProvider<CatalogueController, LabCatalogue>(CatalogueController.new);
