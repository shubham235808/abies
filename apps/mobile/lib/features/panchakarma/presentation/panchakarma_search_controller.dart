import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../profile/presentation/profile_controller.dart';
import '../data/panchakarma_api.dart';
import '../domain/panchakarma_centre.dart';
import '../domain/panchakarma_facets.dart';
import '../domain/panchakarma_search_result.dart';

final panchakarmaApiProvider = Provider<PanchakarmaApi>((ref) => PanchakarmaApiImpl(ref.watch(apiClientProvider)));

/// One-shot, cached for the provider's lifetime — same rationale as
/// `doctorFacetsProvider` (Phase 4): the city list changes rarely enough
/// that refetching on every filter change would be wasteful.
final panchakarmaFacetsProvider = FutureProvider<PanchakarmaFacets>((ref) => ref.watch(panchakarmaApiProvider).facets());

/// The full filter set `publicTherapySearchSchema` accepts
/// (`packages/domain/src/modules/panchakarma/catalogue.schemas.ts`) —
/// just `q` and `city`, deliberately smaller than `DoctorSearchFilters`.
class PanchakarmaSearchFilters {
  const PanchakarmaSearchFilters({this.q, this.city});

  final String? q;
  final String? city;

  PanchakarmaSearchFilters copyWith({String? Function()? q, String? Function()? city}) {
    return PanchakarmaSearchFilters(q: q != null ? q() : this.q, city: city != null ? city() : this.city);
  }
}

/// A search results page plus the filters that produced it — same shape
/// decision as `DoctorSearchController` (Phase 4): changing a filter
/// re-fetches rather than paginates, so `filters` stays outside the
/// `AsyncValue` so it can be read while the next page loads.
///
/// **Pagination note**: `searchPublic()`'s response has no `offset`/`limit`
/// field to read back (see `PanchakarmaSearchResult`'s doc comment), so
/// this controller tracks the offset it itself last requested
/// (`_lastOffset`/`_lastCount`) to compute `hasMore`/`loadMore`, rather than
/// trusting a response field that doesn't exist.
class PanchakarmaSearchController extends AsyncNotifier<PanchakarmaSearchResult> {
  PanchakarmaSearchFilters _filters = const PanchakarmaSearchFilters();
  PanchakarmaSearchFilters get filters => _filters;

  static const int pageSize = 20;

  int _lastOffset = 0;
  int _lastCount = 0;

  bool get hasMore => _lastOffset + _lastCount < (state.value?.total ?? 0);

  @override
  Future<PanchakarmaSearchResult> build() async {
    // Same deliberate location default as Phase 4's `DoctorSearchController`
    // — the signed-in patient's own profile city, clearable in the filter
    // sheet, never a device-location request.
    final profile = await ref.watch(profileControllerProvider.future);
    _filters = PanchakarmaSearchFilters(city: profile.profile.city);
    return _search();
  }

  Future<PanchakarmaSearchResult> _search({int offset = 0}) async {
    final api = ref.read(panchakarmaApiProvider);
    final result = await api.search(q: _filters.q, city: _filters.city, limit: pageSize, offset: offset);
    _lastOffset = offset;
    _lastCount = result.therapies.length;
    return result;
  }

  Future<void> applyFilters(PanchakarmaSearchFilters filters) async {
    _filters = filters;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> retry() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  /// Appends the next page to the already-loaded results — same
  /// "keep what's already rendered on a transient failure" rule as
  /// `DoctorSearchController.loadMore`.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !hasMore) return;
    final nextOffset = _lastOffset + _lastCount;
    final next = await AsyncValue.guard(() => _search(offset: nextOffset));
    next.whenData((page) {
      state = AsyncValue.data(PanchakarmaSearchResult(total: page.total, therapies: [...current.therapies, ...page.therapies]));
    });
  }
}

final panchakarmaSearchControllerProvider =
    AsyncNotifierProvider<PanchakarmaSearchController, PanchakarmaSearchResult>(PanchakarmaSearchController.new);

/// Browse-only centre list (`GET /api/v1/public/panchakarma-centres`) — a
/// plain `FutureProvider.family` keyed by an optional city filter, since
/// nothing on this screen writes anything and there's no detail route to
/// navigate into (see `PanchakarmaCentre`'s doc comment for that gap).
final panchakarmaCentresProvider = FutureProvider.family<List<PanchakarmaCentre>, String?>((ref, city) {
  return ref.watch(panchakarmaApiProvider).centres(city: city);
});
