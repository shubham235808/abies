import '../../../shared/util/formatting.dart';

/// `DiagnosticOrderStatus` (packages/domain/prisma/schema.prisma). The lab
/// fulfilment state machine (orders.service.ts) is strictly linear:
/// SCHEDULED -> SAMPLE_COLLECTED (`markSampleCollected`) -> PROCESSING
/// (`markProcessing`) -> COMPLETED (`releaseReport`). BOOKED (unpaid) never
/// reaches a lab — `listMineAsLab` filters it out.
enum LabOrderStatus {
  booked('BOOKED', 'Awaiting payment'),
  scheduled('SCHEDULED', 'Scheduled'),
  sampleCollected('SAMPLE_COLLECTED', 'Sample collected'),
  processing('PROCESSING', 'Processing'),
  completed('COMPLETED', 'Completed'),
  cancelled('CANCELLED', 'Cancelled'),
  unknown('UNKNOWN', 'Unknown');

  const LabOrderStatus(this.wire, this.label);

  final String wire;
  final String label;

  static LabOrderStatus parse(String? raw) {
    for (final s in values) {
      if (s.wire == raw) return s;
    }
    return LabOrderStatus.unknown;
  }

  /// Still needs work from the lab — what the dashboard shows by default.
  bool get isActive => this == scheduled || this == sampleCollected || this == processing;

  /// The one transition the lab can perform next from this status, or null.
  LabOrderAction? get nextAction {
    switch (this) {
      case LabOrderStatus.scheduled:
        return LabOrderAction.collectSample;
      case LabOrderStatus.sampleCollected:
        return LabOrderAction.startProcessing;
      case LabOrderStatus.processing:
        return LabOrderAction.releaseReport;
      default:
        return null;
    }
  }
}

/// Each maps to exactly one real route under
/// apps/platform-api/src/app/api/v1/labs/me/orders/[id]/.
enum LabOrderAction {
  collectSample('Mark sample collected'),
  startProcessing('Start processing'),
  releaseReport('Release report to patient');

  const LabOrderAction(this.label);

  final String label;
}

String _patientName(Map<String, dynamic>? patientUser) {
  if (patientUser == null) return 'Patient';
  final profile = patientUser['patientProfile'] as Map<String, dynamic>?;
  final parts = [profile?['firstName'], profile?['lastName']].whereType<String>().where((p) => p.trim().isNotEmpty);
  final name = parts.join(' ');
  // Same fallback as the web lab portal: the patient's mobile.
  return name.isNotEmpty ? name : (patientUser['mobile'] as String? ?? 'Patient');
}

String _itemName(Map<String, dynamic> item) {
  final test = item['test'] as Map<String, dynamic>?;
  final pkg = item['package'] as Map<String, dynamic>?;
  return (test?['name'] as String?) ?? (pkg?['name'] as String?) ?? 'Removed item';
}

/// One row of `GET /api/v1/labs/me/orders` → `{ orders: [...] }` — shape
/// from `listMineAsLab` (orders.service.ts): the order's own scalar fields
/// plus `patientUser {mobile, patientProfile {firstName,lastName}}`,
/// `items [{test {name}?, package {name}?, price}]`, and
/// `report {criticalFlag, doctorAcknowledgedAt}?`. Sorted by scheduledAt asc.
class LabOrderSummary {
  const LabOrderSummary({
    required this.id,
    required this.status,
    required this.collectionMode,
    required this.patientName,
    required this.itemNames,
    this.scheduledAt,
    this.address,
    this.updatedAt,
    this.criticalFlag = false,
    this.doctorAcknowledgedAt,
  });

  final String id;
  final LabOrderStatus status;

  /// `HOME` or `LAB_VISIT`.
  final String collectionMode;
  final String patientName;
  final List<String> itemNames;
  final DateTime? scheduledAt;
  final String? address;
  final DateTime? updatedAt;
  final bool criticalFlag;
  final DateTime? doctorAcknowledgedAt;

  bool get isHomeCollection => collectionMode == 'HOME';
  String get collectionLabel => isHomeCollection ? 'Home collection' : 'Lab visit';

  /// Critical result the recommending doctor hasn't acknowledged yet — the
  /// web overview's "critical results awaiting doctor acknowledgement" card.
  bool get isUnacknowledgedCritical => criticalFlag && doctorAcknowledgedAt == null;

  factory LabOrderSummary.fromJson(Map<String, dynamic> json) {
    final report = json['report'] as Map<String, dynamic>?;
    return LabOrderSummary(
      id: json['id'] as String,
      status: LabOrderStatus.parse(json['status'] as String?),
      collectionMode: json['collectionMode'] as String? ?? 'LAB_VISIT',
      patientName: _patientName(json['patientUser'] as Map<String, dynamic>?),
      itemNames: (json['items'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().map(_itemName).toList(),
      scheduledAt: parseDateOrNull(json['scheduledAt']),
      address: json['address'] as String?,
      updatedAt: parseDateOrNull(json['updatedAt']),
      criticalFlag: report?['criticalFlag'] as bool? ?? false,
      doctorAcknowledgedAt: parseDateOrNull(report?['doctorAcknowledgedAt']),
    );
  }
}

class LabOrderItem {
  const LabOrderItem({required this.name, required this.price, this.code, this.isPackage = false});

  final String name;
  final String? code;
  final int price;
  final bool isPackage;

  factory LabOrderItem.fromJson(Map<String, dynamic> json) {
    final test = json['test'] as Map<String, dynamic>?;
    return LabOrderItem(
      name: _itemName(json),
      code: test?['code'] as String?,
      price: (json['price'] as num?)?.toInt() ?? 0,
      isPackage: json['package'] != null,
    );
  }
}

/// `SampleCollection` model — set by `POST .../sample-collected`.
class SampleCollectionInfo {
  const SampleCollectionInfo({this.collectorName, this.collectedAt, this.sampleBarcode, this.qualityException});

  final String? collectorName;
  final DateTime? collectedAt;
  final String? sampleBarcode;
  final String? qualityException;

  factory SampleCollectionInfo.fromJson(Map<String, dynamic> json) {
    return SampleCollectionInfo(
      collectorName: json['collectorName'] as String?,
      collectedAt: parseDateOrNull(json['collectedAt']),
      sampleBarcode: json['sampleBarcode'] as String?,
      qualityException: json['qualityException'] as String?,
    );
  }
}

/// `DiagnosticReport` model — created by `POST .../report`.
class LabReportInfo {
  const LabReportInfo({this.releasedToPatientAt, this.criticalFlag = false, this.doctorAcknowledgedAt, this.hasDocument = false});

  final DateTime? releasedToPatientAt;
  final bool criticalFlag;
  final DateTime? doctorAcknowledgedAt;
  final bool hasDocument;

  factory LabReportInfo.fromJson(Map<String, dynamic> json) {
    return LabReportInfo(
      releasedToPatientAt: parseDateOrNull(json['releasedToPatientAt']),
      criticalFlag: json['criticalFlag'] as bool? ?? false,
      doctorAcknowledgedAt: parseDateOrNull(json['doctorAcknowledgedAt']),
      hasDocument: json['documentStorageKey'] is String && (json['documentStorageKey'] as String).isNotEmpty,
    );
  }
}

/// `GET /api/v1/diagnostic-orders/:id` → `{ order }` — `getOrder` in
/// orders.service.ts, which admits the owning LAB as well as the patient
/// (`requireRole(ctx, 'PATIENT', 'LAB')`). Includes `sampleCollection`,
/// `report`, `payment {status, amount}` and items with `test {name, code}`.
class LabOrderDetail {
  const LabOrderDetail({
    required this.id,
    required this.status,
    required this.collectionMode,
    required this.patientName,
    required this.items,
    this.scheduledAt,
    this.address,
    this.sampleCollection,
    this.report,
    this.paymentStatus,
    this.paymentAmount,
    this.cancellationReason,
  });

  final String id;
  final LabOrderStatus status;
  final String collectionMode;
  final String patientName;
  final List<LabOrderItem> items;
  final DateTime? scheduledAt;
  final String? address;
  final SampleCollectionInfo? sampleCollection;
  final LabReportInfo? report;
  final String? paymentStatus;
  final int? paymentAmount;
  final String? cancellationReason;

  bool get isHomeCollection => collectionMode == 'HOME';
  String get collectionLabel => isHomeCollection ? 'Home collection' : 'Lab visit';
  int get itemsTotal => items.fold(0, (sum, i) => sum + i.price);

  factory LabOrderDetail.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] as Map<String, dynamic>?;
    final sample = json['sampleCollection'] as Map<String, dynamic>?;
    final report = json['report'] as Map<String, dynamic>?;
    return LabOrderDetail(
      id: json['id'] as String,
      status: LabOrderStatus.parse(json['status'] as String?),
      collectionMode: json['collectionMode'] as String? ?? 'LAB_VISIT',
      patientName: _patientName(json['patientUser'] as Map<String, dynamic>?),
      items: (json['items'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>().map(LabOrderItem.fromJson).toList(),
      scheduledAt: parseDateOrNull(json['scheduledAt']),
      address: json['address'] as String?,
      sampleCollection: sample == null ? null : SampleCollectionInfo.fromJson(sample),
      report: report == null ? null : LabReportInfo.fromJson(report),
      paymentStatus: payment?['status'] as String?,
      paymentAmount: (payment?['amount'] as num?)?.toInt(),
      cancellationReason: json['cancellationReason'] as String?,
    );
  }
}

/// A report file picked on-device for `POST .../report`'s multipart `file`
/// field. The server's `assertUploadAllowed` (packages/domain/src/lib/
/// storage.ts) accepts only application/pdf, image/jpeg, image/png — and
/// checks magic bytes against the *declared* part content type, so
/// [mimeType] must be set explicitly (Dio's default
/// `application/octet-stream` would be rejected).
class ReportUpload {
  const ReportUpload({required this.path, required this.filename, required this.mimeType});

  final String path;
  final String filename;
  final String mimeType;

  static const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];

  /// Null when the extension isn't one the server accepts.
  static String? mimeTypeFor(String filename) {
    final dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    switch (filename.substring(dot + 1).toLowerCase()) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      default:
        return null;
    }
  }
}
