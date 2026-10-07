import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../profile/presentation/profile_controller.dart';
import '../data/doctors_api.dart';
import '../domain/doctor_facets.dart';
import '../domain/doctor_search_result.dart';

final doctorsApiProvider = Provider<DoctorsApi>((ref) => DoctorsApiImpl(ref.watch(apiClientProvider)));

/// One-shot, cached for the lifetime of the provider — the facets list
/// changes rarely enough (it's "every specialty/language/city any
/// discoverable doctor currently has") that refetching on every filter
/// change would be wasteful; `ref.invalidate(doctorFacetsProvider)` refreshes
/// it if a screen ever needs to.
final doctorFacetsProvider = FutureProvider<DoctorFacets>((ref) => ref.watch(doctorsApiProvider).facets());

/// The full filter set `publicDoctorSearchSchema` accepts
/// (`packages/domain/src/modules/doctors/doctors.schemas.ts`) — immutable,
/// `copyWith`-based, matching `HomeData`'s style elsewhere in this app.
class DoctorSearchFilters {
  const DoctorSearchFilters({this.q, this.city, this.specialty, this.language, this.mode, this.accepting});

  final String? q;
  final String? city;
  final String? specialty;
  final String? language;

  /// "VIDEO" or "CLINIC".
  final String? mode;
  final bool? accepting;

  bool get isEmpty => q == null && city == null && specialty == null && language == null && mode == null && accepting == null;

  DoctorSearchFilters copyWith({
    String? Function()? q,
    String? Function()? city,
    String? Function()? specialty,
    String? Function()? language,
    String? Function()? mode,
    bool? Function()? accepting,
  }) {
    return DoctorSearchFilters(
      q: q != null ? q() : this.q,
      city: city != null ? city() : this.city,
      specialty: specialty != null ? specialty() : this.specialty,
      language: language != null ? language() : this.language,
      mode: mode != null ? mode() : this.mode,
      accepting: accepting != null ? accepting() : this.accepting,
    );
  }
}

/// A search results page plus the filters that produced it and whether a
/// fetch is currently in flight — `AsyncNotifier`'s own `state` already
/// carries loading/error for the *current* page, but changing a filter
/// re-triggers a fresh fetch rather than paginating, so this stays a plain
/// `AsyncNotifier<DoctorSearchResult>` with the active [filters] alongside
/// it (not inside the `AsyncValue`, so a filter can be read even while the
/// next page is loading).
class DoctorSearchController extends AsyncNotifier<DoctorSearchResult> {
  DoctorSearchFilters _filters = const DoctorSearchFilters();
  DoctorSearchFilters get filters => _filters;

  static const int pageSize = 20;

  @override
  Future<DoctorSearchResult> build() async {
    // The signed-in patient's own profile city prefills the location filter
    // the same way Phase 3's home preview rows did — a sensible default, not
    // a requirement; the patient can always clear or change it. Falls back
    // to no city filter if the profile has none set, same graceful-fallback
    // rule as Phase 3 (never asks the device for location either).
    final profile = await ref.watch(profileControllerProvider.future);
    _filters = DoctorSearchFilters(city: profile.profile.city);
    return _search();
  }

  Future<DoctorSearchResult> _search({int offset = 0}) {
    final api = ref.read(doctorsApiProvider);
    return api.search(
      q: _filters.q,
      city: _filters.city,
      specialty: _filters.specialty,
      language: _filters.language,
      mode: _filters.mode,
      accepting: _filters.accepting,
      limit: pageSize,
      offset: offset,
    );
  }

  Future<void> applyFilters(DoctorSearchFilters filters) async {
    _filters = filters;
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  Future<void> retry() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _search());
  }

  /// Appends the next page to the already-loaded results, rather than
  /// replacing them — the search screen's "load more" action.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore) return;
    final next = await AsyncValue.guard(() => _search(offset: current.offset + current.doctors.length));
    next.whenData((page) {
      state = AsyncValue.data(DoctorSearchResult(
        total: page.total,
        offset: current.offset,
        limit: page.limit,
        doctors: [...current.doctors, ...page.doctors],
      ));
    });
    if (next.hasError) {
      // Keep the already-loaded page visible — "couldn't load more" is a
      // transient failure, not a reason to blank out what already rendered.
      return;
    }
  }
}

final doctorSearchControllerProvider = AsyncNotifierProvider<DoctorSearchController, DoctorSearchResult>(DoctorSearchController.new);
