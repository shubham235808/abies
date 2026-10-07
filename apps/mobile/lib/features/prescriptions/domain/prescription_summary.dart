import 'prescription_item.dart';

/// One entry of `GET /api/v1/patients/me/prescriptions`'s `prescriptions[]`
/// (`listFinalizedPrescriptionsForPatient()` in `packages/domain/src/
/// modules/medicines/orders.service.ts`) — already filtered server-side to
/// `status: 'FINALIZED'` only, with `items: true` and
/// `doctorProfile: { select: { title, firstName, lastName } }`.
///
/// **This is also this app's only source of single-prescription detail** —
/// a real, reported gap: `GET /api/v1/prescriptions/[id]/route.ts` exports
/// only a `PATCH` handler (`requireRole(ctx, 'DOCTOR')`, for
/// `updatePrescription()`), **no `GET` at all**, confirmed by reading that
/// file directly. There is no doctor-only route being worked around here
/// either (unlike Phase 6's two doctor-only diagnostic-recommendation
/// routes) — there is simply no single-prescription read endpoint for
/// anyone. Since this list endpoint's own per-row shape already carries
/// every item field (dosage, frequency, instructions, ...), the detail
/// screen reads this exact object via `GoRouter` `extra`, never attempts a
/// network call that doesn't exist — see `lib/features/prescriptions/
/// PHASE.md`.
///
/// **No prescription document/file either** — `Prescription` in
/// `packages/domain/prisma/schema.prisma` has no storage-key/document field
/// of any kind (unlike `DiagnosticReport`, which has a real `Report` row
/// behind it). There is nothing to "view"/"download" here; this app shows
/// the prescription's own structured fields only, never a fabricated
/// document viewer.
class PrescriptionSummary {
  const PrescriptionSummary({
    required this.id,
    required this.status,
    required this.finalizedAt,
    required this.doctorNotes,
    required this.doctorName,
    required this.items,
  });

  final String id;

  /// Always "FINALIZED" here — `listFinalizedPrescriptionsForPatient()`'s
  /// own filter; kept as a string anyway for forward-compatibility, same
  /// convention as every other status field in this app.
  final String status;
  final DateTime? finalizedAt;
  final String? doctorNotes;
  final String? doctorName;
  final List<PrescriptionItem> items;

  /// For display: "Dr. Firstname Lastname" style, built from
  /// `doctorProfile.{title,firstName,lastName}`.
  static String? buildDoctorName(Map<String, dynamic>? doctorProfile) {
    if (doctorProfile == null) return null;
    final parts = [doctorProfile['title'] as String?, doctorProfile['firstName'] as String?, doctorProfile['lastName'] as String?]
        .where((p) => p != null && p.isNotEmpty)
        .join(' ');
    return parts.isEmpty ? null : parts;
  }

  factory PrescriptionSummary.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? const [];
    return PrescriptionSummary(
      id: json['id'] as String,
      status: json['status'] as String,
      finalizedAt: json['finalizedAt'] != null ? DateTime.parse(json['finalizedAt'] as String) : null,
      doctorNotes: json['doctorNotes'] as String?,
      doctorName: buildDoctorName(json['doctorProfile'] as Map<String, dynamic>?),
      items: items.map((e) => PrescriptionItem.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
