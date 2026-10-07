/// One row of `GET /api/v1/diagnostic-recommendations/mine`'s
/// `recommendations[]` (`listMineAsPatient()` in `packages/domain/src/
/// modules/diagnostics/recommendations.service.ts`) — a doctor-initiated
/// recommendation to get a specific test or package done, distinct from an
/// order: "a recommendation is clinical intent, not a specific booking"
/// (that function's own comment) — it carries no `labId`, since the same
/// test/package name can be offered by several labs; booking from one means
/// searching the real catalogue for that name and picking a lab, exactly
/// like any other booking, with this recommendation's [id] then threaded
/// through as `bookOrderSchema`'s optional `recommendationId`.
///
/// **Only ever one of [testName]/[packageName] is set** — mirrors
/// `createRecommendationSchema`'s own `testId` XOR `packageId` refine
/// (`recommendations.schemas.ts`).
///
/// **Real gap found and reported, not worked around**: `POST /api/v1/
/// diagnostic-recommendations/[id]/cancel` is **doctor-only**
/// (`requireRole(ctx, 'DOCTOR')` in the real route, and
/// `cancelRecommendation()` itself checks `recommendation.doctorProfile.
/// userId !== doctorUserId` — there is no patient-role branch at all). A
/// patient cannot cancel/decline their own recommendation from this app —
/// confirmed by reading the real route and service function, not assumed
/// from the task brief's description of it as something "the patient can
/// act on". This app therefore only ever offers *booking from* a
/// recommendation, never cancelling one — see
/// `lib/features/diagnostics/PHASE.md` and
/// `docs/mobile/IMPLEMENTATION-PLAN.md`'s Phase 6 entry.
class DiagnosticRecommendation {
  const DiagnosticRecommendation({
    required this.id,
    required this.testId,
    required this.packageId,
    required this.testName,
    required this.packageName,
    required this.clinicalReason,
    required this.targetCompletionDate,
    required this.status,
    required this.createdAt,
    required this.doctorName,
  });

  final String id;
  final String? testId;
  final String? packageId;
  final String? testName;
  final String? packageName;
  final String? clinicalReason;
  final DateTime? targetCompletionDate;

  /// `DiagnosticRecommendationStatus`: RECOMMENDED, BOOKED, FULFILLED,
  /// CANCELLED (`listMineAsPatient()`'s own `where` already excludes
  /// CANCELLED, so that value is never actually seen here in practice, but
  /// this model stays null-safe/exhaustive regardless).
  final String status;
  final DateTime createdAt;
  final String? doctorName;

  String get itemName => testName ?? packageName ?? 'Recommended test';

  /// Mirrors `bookOrder()`'s own check: only a `RECOMMENDED` recommendation
  /// can be booked from (`recommendation.status !== 'RECOMMENDED'` throws a
  /// `ConflictError` there). Display convenience only — the backend
  /// re-checks this on every booking attempt regardless.
  bool get canBookFrom => status == 'RECOMMENDED';

  factory DiagnosticRecommendation.fromJson(Map<String, dynamic> json) {
    final doctor = json['doctorProfile'] as Map<String, dynamic>?;
    final test = json['test'] as Map<String, dynamic>?;
    final package = json['package'] as Map<String, dynamic>?;
    final titleParts = [doctor?['title'] as String?, doctor?['firstName'] as String?, doctor?['lastName'] as String?]
        .whereType<String>()
        .where((s) => s.isNotEmpty);
    return DiagnosticRecommendation(
      id: json['id'] as String,
      testId: json['testId'] as String?,
      packageId: json['packageId'] as String?,
      testName: test?['name'] as String?,
      packageName: package?['name'] as String?,
      clinicalReason: json['clinicalReason'] as String?,
      targetCompletionDate: json['targetCompletionDate'] != null ? DateTime.parse(json['targetCompletionDate'] as String) : null,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      doctorName: titleParts.isEmpty ? null : titleParts.join(' '),
    );
  }
}
