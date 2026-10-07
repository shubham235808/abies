import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../profile/presentation/profile_controller.dart';
import '../data/pharmacy_api.dart';
import '../domain/medicine_facets.dart';
import '../domain/medicine_search_result.dart';

final pharmacyApiProvider = Provider<PharmacyApi>((ref) => PharmacyApiImpl(ref.watch(apiClientProvider)));

/// One-shot, cached for the provider's lifetime — same rationale as Phase
/// 4/5/6's facets providers.
final medicineFacetsProvider = FutureProvider<MedicineFacets>((ref) => ref.watch(pharmacyApiProvider).medicineFacets());

/// The filter set `publicMedicineSearchSchema` accepts (`packages/domain/
/// src/modules/medicines/catalogue.schemas.ts`) — `q`, `area` (not `city`,
/// same confirmed-by-reading-the-schema quirk Phase 3's home preview found),
/// `category`, `brand`, `isFmcg`, `priceMin`/`priceMax`.
class MedicineSearchFilters {
  const MedicineSearchFilters({this.q, this.area, this.category, this.brand, this.isFmcg, this.priceMin, this.priceMax});

  final String? q;
  final String? area;
  final String? category;
  final String? brand;
  final bool? isFmcg;
  final int? priceMin;
  final int? priceMax;

  MedicineSearchFilters copyWith({
    String? Function()? q,
    String? Function()? area,
    String? Function()? category,
    String? Function()? brand,
    bool? Function()? isFmcg,
    int? Function()? priceMin,
    int? Function()? priceMax,
  }) {
    return MedicineSearchFilters(
      q: q != null ? q() : this.q,
      area: area != null ? area() : this.area,
      category: category != null ? category() : this.category,
      brand: brand != null ? brand() : this.brand,
      isFmcg: isFmcg != null ? isFmcg() : this.isFmcg,
      priceMin: priceMin != null ? priceMin() : this.priceMin,
      priceMax: priceMax != null ? priceMax() : this.priceMax,
    );
  }
}

/// Medicine catalogue search (`GET /api/v1/public/medicines`) — structurally
/// identical to Phase 6's `DiagnosticTestSearchController`: changing a
/// filter re-fetches rather than paginates, and the response has no
/// `offset`/`limit` to read back, so this controller tracks the offset it
/// itself last requested.
class MedicineSearchController extends AsyncNotifier<MedicineSearchResult> {
  MedicineSearchFilters _filters = const MedicineSearchFilters();
  MedicineSearchFilters get filters => _filters;

  static const int pageSize = 24;

  int _lastOffset = 0;
  int _lastCount = 0;

  bool get hasMore => _lastOffset + _lastCount < (state.value?.total ?? 0);

  @override
  Future<MedicineSearchResult> build() async {
    // Same deliberate location default as every prior phase's search
    // screen — the signed-in patient's own profile city, used here as
    // `area` (clearable in the filter sheet, never a device-location
    // request).
    final profile = await ref.watch(profileControllerProvider.future);
    _filters = MedicineSearchFilters(area: profile.profile.city);
    return _search();
  }

  Future<MedicineSearchResult> _search({int offset = 0}) async {
    final api = ref.read(pharmacyApiProvider);
    final result = await api.searchMedicines(
      q: _filters.q,
      area: _filters.area,
      category: _filters.category,
      brand: _filters.brand,
      isFmcg: _filters.isFmcg,
      priceMin: _filters.priceMin,
      priceMax: _filters.priceMax,
      limit: pageSize,
      offset: offset,
    );
    _lastOffset = offset;
    _lastCount = result.medicines.length;
    return result;
  }

  Future<void> applyFilters(MedicineSearchFilters filters) async {
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
      state = AsyncValue.data(MedicineSearchResult(total: page.total, medicines: [...current.medicines, ...page.medicines]));
    });
  }
}

final medicineSearchControllerProvider = AsyncNotifierProvider<MedicineSearchController, MedicineSearchResult>(MedicineSearchController.new);

/// A single medicine's reviews (`GET /api/v1/public/medicines/[id]/reviews`)
/// — fetchable by id even though there's no single-medicine detail route;
/// plain `FutureProvider.family`, same shape as every other reviews/facets
/// provider in this app.
final medicineReviewsProvider = FutureProvider.family((ref, String medicineId) {
  return ref.watch(pharmacyApiProvider).medicineReviews(medicineId);
});
