/// One row of `GET /api/v1/reports/mine`'s `reports[]` — the generic
/// patient document library (`Report` model, `packages/domain/prisma/
/// schema.prisma`), a **separate table** from `DiagnosticReport`
/// (confirmed by reading `orders.service.ts`'s `releaseReport()`, which
/// creates one row in each: `DiagnosticReport` for the lab-side workflow,
/// `Report` — `kind: 'DIAGNOSTIC_REPORT'`, `sourceEntityType:
/// 'DiagnosticOrder'`, `sourceEntityId: orderId` — for the patient-facing
/// document library). A diagnostic order's own report info
/// (`DiagnosticOrderDetail.reportReleasedAt`/`reportCriticalFlag`) has no id
/// usable against `/api/v1/reports/[id]/download` — the matching [id] here
/// is found by filtering this list for `sourceEntityType == 'DiagnosticOrder'
/// && sourceEntityId == <order id>`. See
/// `lib/features/diagnostics/PHASE.md` for why this app reads the report via
/// this route rather than `GET /api/v1/diagnostic-orders/[id]/
/// report-download` (that route is doctor-only — confirmed by reading it).
class DiagnosticReportRef {
  const DiagnosticReportRef({
    required this.id,
    required this.kind,
    required this.sourceEntityType,
    required this.sourceEntityId,
    required this.createdAt,
  });

  final String id;
  final String kind;
  final String? sourceEntityType;
  final String? sourceEntityId;
  final DateTime createdAt;

  factory DiagnosticReportRef.fromJson(Map<String, dynamic> json) {
    return DiagnosticReportRef(
      id: json['id'] as String,
      kind: json['kind'] as String,
      sourceEntityType: json['sourceEntityType'] as String?,
      sourceEntityId: json['sourceEntityId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
