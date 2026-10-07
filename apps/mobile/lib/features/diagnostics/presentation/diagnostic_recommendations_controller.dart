import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../domain/diagnostic_recommendation.dart';
import 'diagnostics_search_controller.dart';

/// "My diagnostic recommendations" (docs/mobile/IMPLEMENTATION-PLAN.md
/// Phase 6) — a doctor-initiated recommendation the patient can view and
/// book from. **No cancel action here** — `POST /api/v1/diagnostic-
/// recommendations/[id]/cancel` is doctor-only (see
/// `DiagnosticRecommendation`'s doc comment for the real route/service code
/// confirming this); this controller only ever reads the list and resolves
/// bookable options, never calls a cancel endpoint that would just 403 for a
/// patient.
///
/// Only meaningful once signed in, same rule as every other controller here.
class DiagnosticRecommendationsController extends AsyncNotifier<List<DiagnosticRecommendation>> {
  @override
  Future<List<DiagnosticRecommendation>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('DiagnosticRecommendationsController read before sign-in');
    }
    return ref.read(diagnosticsApiProvider).myRecommendations();
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(diagnosticsApiProvider).myRecommendations());
  }

  /// A recommendation carries no `labId` (it's clinical intent, not a
  /// booking — see `DiagnosticRecommendation`'s doc comment), so "book from
  /// this recommendation" means searching the real, current catalogue for
  /// the recommended test/package by name and letting the patient pick a
  /// lab — exactly the booking flow's own re-fetch discipline, just used
  /// here to *find* the bookable options in the first place rather than to
  /// re-verify an already-known one.
  ///
  /// Returns a list of [DiagnosticTestSummary] when the recommendation is
  /// for an individual test, or [DiagnosticPackageSummary] when it's for a
  /// package — exactly one of the two, mirroring the recommendation's own
  /// testId-XOR-packageId shape.
  Future<List<Object>> findBookableOptions(DiagnosticRecommendation recommendation) async {
    final api = ref.read(diagnosticsApiProvider);
    if (recommendation.packageId != null) {
      final result = await api.searchPackages(q: recommendation.packageName ?? '', limit: 20);
      return result.packages;
    }
    final result = await api.searchTests(q: recommendation.testName ?? '', limit: 20);
    return result.tests;
  }
}

final diagnosticRecommendationsControllerProvider =
    AsyncNotifierProvider<DiagnosticRecommendationsController, List<DiagnosticRecommendation>>(DiagnosticRecommendationsController.new);
