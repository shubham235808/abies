import '../../../shared/format.dart';

/// One `PrescriptionItem` row. [startDate]/[endDate] are carried as the raw
/// `YYYY-MM-DD` day even though this app's editor doesn't expose them —
/// `updatePrescription` (prescriptions.service.ts) deletes and recreates
/// every item from the request, so dropping them on save would silently
/// erase dates set from the web portal.
class PrescriptionItem {
  const PrescriptionItem({
    required this.productName,
    this.dosage,
    this.frequency,
    this.durationDays,
    this.route,
    this.instructions,
    this.startDate,
    this.endDate,
  });

  final String productName;
  final String? dosage;
  final String? frequency;
  final int? durationDays;
  final String? route;
  final String? instructions;
  final String? startDate;
  final String? endDate;

  factory PrescriptionItem.fromJson(Map<String, dynamic> json) {
    String? day(Object? raw) => raw is String && raw.length >= 10 ? raw.substring(0, 10) : null;
    return PrescriptionItem(
      productName: json['productName'] as String,
      dosage: json['dosage'] as String?,
      frequency: json['frequency'] as String?,
      durationDays: json['durationDays'] as int?,
      route: json['route'] as String?,
      instructions: json['instructions'] as String?,
      startDate: day(json['startDate']),
      endDate: day(json['endDate']),
    );
  }

  /// `prescriptionItemSchema` in consultations.schemas.ts — empty optional
  /// strings are omitted rather than sent as `''`.
  Map<String, dynamic> toJson() => {
        'productName': productName.trim(),
        if (nonEmpty(dosage) != null) 'dosage': dosage!.trim(),
        if (nonEmpty(frequency) != null) 'frequency': frequency!.trim(),
        if (durationDays != null) 'durationDays': durationDays,
        if (nonEmpty(route) != null) 'route': route!.trim(),
        if (nonEmpty(instructions) != null) 'instructions': instructions!.trim(),
        if (startDate != null) 'startDate': startDate,
        if (endDate != null) 'endDate': endDate,
      };

  String get summary => [
        productName,
        if (nonEmpty(dosage) != null) dosage!,
        if (nonEmpty(frequency) != null) frequency!,
        if (durationDays != null) 'for $durationDays days',
      ].join(' · ');
}

/// `Prescription` row with `items`. Status DRAFT | FINALIZED | SUPERSEDED.
/// Finalized prescriptions are immutable — a correction
/// (`POST /prescriptions/[id]/correct`) creates a new DRAFT seeded from the
/// old one and marks the old one SUPERSEDED (prescriptions.service.ts).
class Prescription {
  const Prescription({
    required this.id,
    required this.status,
    required this.doctorNotes,
    required this.finalizedAt,
    required this.supersedesId,
    required this.items,
  });

  final String id;
  final String status;
  final String? doctorNotes;
  final DateTime? finalizedAt;
  final String? supersedesId;
  final List<PrescriptionItem> items;

  bool get isDraft => status == 'DRAFT';
  bool get isFinalized => status == 'FINALIZED';

  factory Prescription.fromJson(Map<String, dynamic> json) => Prescription(
        id: json['id'] as String,
        status: json['status'] as String,
        doctorNotes: json['doctorNotes'] as String?,
        finalizedAt: parseDate(json['finalizedAt']),
        supersedesId: json['supersedesId'] as String?,
        items: (json['items'] as List<dynamic>? ?? const []).map((e) => PrescriptionItem.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

/// `ClinicalNote` row. Read-only once [finalizedAt] is set
/// (consultations.service.ts `saveClinicalNote` rejects with 403).
class ClinicalNote {
  const ClinicalNote({
    required this.ayurvedaAssessment,
    required this.diagnosis,
    required this.treatmentPlan,
    required this.recommendations,
    required this.followUpDate,
    required this.finalizedAt,
  });

  /// Free-form `Json` keyed by the admin-configured assessment template
  /// (`AssessmentTemplateField.key`). Always sent back on save, because
  /// `saveClinicalNote` writes `dto.ayurvedaAssessment ?? {}` — omitting it
  /// would wipe whatever the web portal recorded.
  final Map<String, String> ayurvedaAssessment;
  final String? diagnosis;
  final String? treatmentPlan;
  final String? recommendations;

  /// `YYYY-MM-DD`.
  final String? followUpDate;
  final DateTime? finalizedAt;

  bool get isFinalized => finalizedAt != null;

  factory ClinicalNote.fromJson(Map<String, dynamic> json) {
    final raw = json['ayurvedaAssessment'];
    final follow = json['followUpDate'];
    return ClinicalNote(
      ayurvedaAssessment: raw is Map ? raw.map((k, v) => MapEntry(k.toString(), v?.toString() ?? '')) : const {},
      diagnosis: json['diagnosis'] as String?,
      treatmentPlan: json['treatmentPlan'] as String?,
      recommendations: json['recommendations'] as String?,
      followUpDate: follow is String && follow.length >= 10 ? follow.substring(0, 10) : null,
      finalizedAt: parseDate(json['finalizedAt']),
    );
  }
}

/// `GET /api/v1/consultations/[id]` → `{ consultation }` for the owning
/// doctor (consultations.service.ts `getConsultation` + `detailInclude()`:
/// appointment, doctorProfile, patientUser, videoSession, clinicalNote,
/// prescriptions{items} newest first).
class ConsultationDetail {
  const ConsultationDetail({
    required this.id,
    required this.status,
    required this.chiefComplaint,
    required this.historyOfPresentIllness,
    required this.notes,
    required this.scheduledAt,
    required this.durationMinutes,
    required this.mode,
    required this.reasonForVisit,
    required this.patientName,
    required this.patientMobile,
    required this.doctorJoinedAt,
    required this.patientJoinedAt,
    required this.clinicalNote,
    required this.prescriptions,
  });

  final String id;

  /// SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED.
  final String status;
  final String? chiefComplaint;
  final String? historyOfPresentIllness;
  final String? notes;
  final DateTime scheduledAt;
  final int durationMinutes;
  final String mode;
  final String? reasonForVisit;
  final String patientName;
  final String? patientMobile;
  final DateTime? doctorJoinedAt;
  final DateTime? patientJoinedAt;
  final ClinicalNote? clinicalNote;
  final List<Prescription> prescriptions;

  bool get isVideo => mode == 'VIDEO';
  bool get canStart => status == 'SCHEDULED';
  bool get canComplete => status == 'SCHEDULED' || status == 'IN_PROGRESS';

  /// `updateConsultationDetails` rejects once COMPLETED/CANCELLED.
  bool get canEditVisitDetails => status == 'SCHEDULED' || status == 'IN_PROGRESS';

  /// Clinical note / prescriptions / recommendations: the backend only
  /// checks ownership + the record's own finalized state, not the
  /// consultation's status — and the web dashboard's "tasks needing
  /// attention" (listTasksNeedingAttention) is exactly COMPLETED
  /// consultations with an unfinalized note or draft prescription. So this
  /// app keeps them writable after completion; only a CANCELLED visit is
  /// treated as closed.
  bool get canWriteClinicalRecords => status != 'CANCELLED';

  factory ConsultationDetail.fromJson(Map<String, dynamic> json) {
    final appointment = json['appointment'] as Map<String, dynamic>? ?? const {};
    final patient = json['patientUser'] as Map<String, dynamic>? ?? const {};
    final profile = patient['patientProfile'] as Map<String, dynamic>?;
    final name = [profile?['firstName'] as String?, profile?['lastName'] as String?]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .join(' ');
    final video = json['videoSession'] as Map<String, dynamic>?;
    final note = json['clinicalNote'] as Map<String, dynamic>?;
    return ConsultationDetail(
      id: json['id'] as String,
      status: json['status'] as String,
      chiefComplaint: json['chiefComplaint'] as String?,
      historyOfPresentIllness: json['historyOfPresentIllness'] as String?,
      notes: json['notes'] as String?,
      scheduledAt: parseDate(appointment['scheduledAt']) ?? DateTime.now(),
      durationMinutes: appointment['durationMinutes'] as int? ?? 0,
      mode: appointment['mode'] as String? ?? 'VIDEO',
      reasonForVisit: appointment['reasonForVisit'] as String?,
      patientName: name.isEmpty ? (patient['mobile'] as String? ?? 'Patient') : name,
      patientMobile: patient['mobile'] as String?,
      doctorJoinedAt: parseDate(video?['doctorJoinedAt']),
      patientJoinedAt: parseDate(video?['patientJoinedAt']),
      clinicalNote: note == null ? null : ClinicalNote.fromJson(note),
      prescriptions:
          (json['prescriptions'] as List<dynamic>? ?? const []).map((e) => Prescription.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}
