import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../profile/presentation/profile_controller.dart';
import '../data/diagnostics_api.dart';
import '../domain/diagnostic_facets.dart';
import '../domain/diagnostic_package_search_result.dart';
import '../domain/diagnostic_test_search_result.dart';

final diagnosticsApiProvider = Provider<DiagnosticsApi>((ref) => DiagnosticsApiImpl(ref.watch(apiClientProvider)));

/// One-shot, cached for the provider's lifetime — same rationale as Phase
/// 4/5's facets providers.
final diagnosticFacetsProvider = FutureProvider<DiagnosticFacets>((ref) => ref.watch(diagnosticsApiProvider).facets());

/// The full filter set `publicTestSearchSchema` accepts
/// (`packages/domain/src/modules/diagnostics/catalogue.schemas.ts`) — `q`
/// and `city`, shared by both the tests and packages searches (the same
/// schema backs both routes).
class DiagnosticSearchFilters {
  const DiagnosticSearchFilters({this.q, this.city});

  final String? q;
  final String? city;

  DiagnosticSearchFilters copyWith({String? Function()? q, String? Function()? city}) {
    return DiagnosticSearchFilters(q: q != null ? q() : this.q, city: city != null ? city() : this.city);
  }
}

/// Individual-test search (`GET /api/v1/public/diagnostics`) — structurally
/// identical to Phase 5's `PanchakarmaSearchController`: changing a filter
/// re-fetches rather than paginates, and `/public/diagnostics`'s response has
/// no `offset`/`limit` to read back (see `DiagnosticTestSearchResult`'s doc
/// comment), so this controller tracks the offset it itself last requested.
class DiagnosticTestSearchController extends AsyncNotifier<DiagnosticTestSearchResult> {
  DiagnosticSearchFilters _filters = const DiagnosticSearchFilters();
  DiagnosticSearchFilters get filters => _filters;

  static const int pageSize = 20;

  int _lastOffset = 0;
  int _lastCount = 0;

  bool get hasMore => _lastOffset + _lastCount < (state.value?.total ?? 0);

  @override
  Future<DiagnosticTestSearchResult> build() async {
    // Same deliberate location default as every prior phase's search screen
    // — the signed-in patient's own profile city, clearable in the filter
    // sheet, never a device-location request.
    final profile = await ref.watch(profileControllerProvider.future);
    _filters = DiagnosticSearchFilters(city: profile.profile.city);
    return _search();
  }

  Future<DiagnosticTestSearchResult> _search({int offset = 0}) async {
    final api = ref.read(diagnosticsApiProvider);
    final result = await api.searchTests(q: _filters.q, city: _filters.city, limit: pageSize, offset: offset);
    _lastOffset = offset;
    _lastCount = result.tests.length;
    return result;
  }

  Future<void> applyFilters(DiagnosticSearchFilters filters) async {
    _filters = filters;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> retry() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !hasMore) return;
    final nextOffset = _lastOffset + _lastCount;
    final next = await AsyncValue.guard(() => _search(offset: nextOffset));
    next.whenData((page) {
      state = AsyncValue.data(DiagnosticTestSearchResult(total: page.total, tests: [...current.tests, ...page.tests]));
    });
  }
}

final diagnosticTestSearchControllerProvider =
    AsyncNotifierProvider<DiagnosticTestSearchController, DiagnosticTestSearchResult>(DiagnosticTestSearchController.new);

/// Package search (`GET /api/v1/public/diagnostics/packages`) — a separate
/// controller/provider rather than a tab-reuse of the tests one, since the
/// two searches are genuinely different endpoints/result shapes (see
/// `DiagnosticPackageSearchResult`'s doc comment) even though they share the
/// same query schema.
class DiagnosticPackageSearchController extends AsyncNotifier<DiagnosticPackageSearchResult> {
  DiagnosticSearchFilters _filters = const DiagnosticSearchFilters();
  DiagnosticSearchFilters get filters => _filters;

  static const int pageSize = 20;

  int _lastOffset = 0;
  int _lastCount = 0;

  bool get hasMore => _lastOffset + _lastCount < (state.value?.total ?? 0);

  @override
  Future<DiagnosticPackageSearchResult> build() async {
    final profile = await ref.watch(profileControllerProvider.future);
    _filters = DiagnosticSearchFilters(city: profile.profile.city);
    return _search();
  }

  Future<DiagnosticPackageSearchResult> _search({int offset = 0}) async {
    final api = ref.read(diagnosticsApiProvider);
    final result = await api.searchPackages(q: _filters.q, city: _filters.city, limit: pageSize, offset: offset);
    _lastOffset = offset;
    _lastCount = result.packages.length;
    return result;
  }

  Future<void> applyFilters(DiagnosticSearchFilters filters) async {
    _filters = filters;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> retry() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !hasMore) return;
    final nextOffset = _lastOffset + _lastCount;
    final next = await AsyncValue.guard(() => _search(offset: nextOffset));
    next.whenData((page) {
      state = AsyncValue.data(DiagnosticPackageSearchResult(total: page.total, packages: [...current.packages, ...page.packages]));
    });
  }
}

final diagnosticPackageSearchControllerProvider =
    AsyncNotifierProvider<DiagnosticPackageSearchController, DiagnosticPackageSearchResult>(DiagnosticPackageSearchController.new);
