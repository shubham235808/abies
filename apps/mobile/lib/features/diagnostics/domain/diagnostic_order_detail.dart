import 'diagnostic_order_item.dart';

/// One diagnostic order, in the one shape that covers every response that
/// returns a `DiagnosticOrder` row to a patient — same "one model, several
/// differently-included server responses, all null-safe" relationship Phase
/// 4/5 established for appointments/Panchakarma bookings:
///
/// - `GET /api/v1/diagnostic-orders/mine`'s `orders[]` (`listMineAsPatient()`):
///   `lab.name` only, `items[]` (test/package name + price), a thin `report`
///   (`{releasedToPatientAt, criticalFlag}` only — no report id, no
///   `sampleCollection`, no `payment`).
/// - `GET /api/v1/diagnostic-orders/[id]` (`getOrder()`): the full joined
///   shape — note its `detailInclude()` is spread as `{ ...detailInclude(),
///   lab: true }`, so the later `lab: true` key wins and the *full*
///   `DiagnosticLab` row comes back (not just `{id,name,serviceCities}`) —
///   this model only reads the subset it displays. Also includes
///   `sampleCollection`, the full `report` row, and `payment.{status,amount}`.
/// - `POST /api/v1/diagnostic-orders/[id]/cancel`'s response (`cancelOrder()`'s
///   final `findUniqueOrThrow` has **no includes at all**): every nested
///   field below is null/empty there too. Callers that need the full joined
///   shape after a cancel should reload `/mine` rather than trust that thin
///   response — same rule Phase 4/5 used.
///
/// **The report's own id is never present here** (`report: { select:
/// { releasedToPatientAt, criticalFlag } }` on `/mine`; even `/[id]`'s full
/// `DiagnosticReport` row has a *different* id than the generic `Report` row
/// `GET /api/v1/reports/mine` returns — they're separate tables, linked only
/// by `Report.sourceEntityType == 'DiagnosticOrder'` and
/// `Report.sourceEntityId == order.id`, confirmed by reading
/// `orders.service.ts`'s `releaseReport()`, which creates both rows). Report
/// download therefore always goes through a lookup against `/api/v1/
/// reports/mine` keyed by this order's own [id], never a field read off this
/// model directly — see `DiagnosticsApi.myReports`/`reportDownloadUrl` and
/// `lib/features/diagnostics/PHASE.md`.
class DiagnosticOrderDetail {
  const DiagnosticOrderDetail({
    required this.id,
    required this.labId,
    required this.collectionMode,
    required this.scheduledAt,
    required this.address,
    required this.status,
    required this.createdAt,
    required this.cancelledAt,
    required this.cancellationReason,
    required this.labName,
    required this.items,
    required this.reportReleasedAt,
    required this.reportCriticalFlag,
    required this.paymentStatus,
    required this.paymentAmount,
  });

  final String id;
  final String labId;

  /// `DiagnosticCollectionMode`: HOME or LAB_VISIT.
  final String collectionMode;
  final DateTime? scheduledAt;
  final String? address;

  /// `DiagnosticOrderStatus`: BOOKED, SCHEDULED, SAMPLE_COLLECTED,
  /// PROCESSING, COMPLETED, CANCELLED (`packages/domain/prisma/schema.prisma`).
  final String status;
  final DateTime createdAt;
  final DateTime? cancelledAt;
  final String? cancellationReason;

  final String? labName;
  final List<DiagnosticOrderItem> items;

  /// Null until the lab releases the report (`releaseReport()`); set on
  /// `/mine` and `/[id]`, never on `/cancel`'s thin response.
  final DateTime? reportReleasedAt;
  final bool reportCriticalFlag;

  /// `Payment.status`, null wherever this response doesn't join payment
  /// (`/mine` and `/cancel`, see class doc).
  final String? paymentStatus;

  /// Rupees (whole units).
  final int? paymentAmount;

  /// Mirrors `cancelOrder()`'s own rule in `orders.service.ts` — only a
  /// BOOKED or SCHEDULED order can be cancelled. Display convenience only;
  /// the backend re-checks this on every cancel call regardless.
  bool get canCancel => status == 'BOOKED' || status == 'SCHEDULED';

  /// "Active" per the same rule Phase 3's home-dashboard
  /// `DiagnosticOrderSummary.isActive` used: not yet completed (report ready)
  /// and not cancelled.
  bool get isActive => status != 'COMPLETED' && status != 'CANCELLED';

  /// A report exists to download/view only once released.
  bool get hasReport => reportReleasedAt != null;

  factory DiagnosticOrderDetail.fromJson(Map<String, dynamic> json) {
    final lab = json['lab'] as Map<String, dynamic>?;
    final report = json['report'] as Map<String, dynamic>?;
    final payment = json['payment'] as Map<String, dynamic>?;
    final items = json['items'] as List<dynamic>? ?? const [];
    return DiagnosticOrderDetail(
      id: json['id'] as String,
      labId: json['labId'] as String? ?? lab?['id'] as String? ?? '',
      collectionMode: json['collectionMode'] as String,
      scheduledAt: json['scheduledAt'] != null ? DateTime.parse(json['scheduledAt'] as String) : null,
      address: json['address'] as String?,
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      cancelledAt: json['cancelledAt'] != null ? DateTime.parse(json['cancelledAt'] as String) : null,
      cancellationReason: json['cancellationReason'] as String?,
      labName: lab?['name'] as String?,
      items: items.map((e) => DiagnosticOrderItem.fromJson(e as Map<String, dynamic>)).toList(),
      reportReleasedAt: report?['releasedToPatientAt'] != null ? DateTime.parse(report!['releasedToPatientAt'] as String) : null,
      reportCriticalFlag: report?['criticalFlag'] as bool? ?? false,
      paymentStatus: payment?['status'] as String?,
      paymentAmount: payment?['amount'] as int?,
    );
  }
}
