import '../../../core/api/api_client.dart';
import '../domain/consultation_detail.dart';
import '../domain/recommendation.dart';
import '../domain/video_join_info.dart';

/// Every clinical-workflow call a doctor makes, against the real routes in
/// apps/platform-api/src/app/api/v1/{consultations,prescriptions,doctors/me}.
/// Mutations that return a bare (un-included) row are followed by a fresh
/// [get] in [ConsultationController] rather than patched locally.
abstract class ConsultationsApi {
  Future<ConsultationDetail> get(String id);

  /// `POST /consultations/[id]/join` — VIDEO only; records the doctor's join time.
  Future<VideoJoinInfo> join(String id);

  Future<void> start(String id);
  Future<void> complete(String id);

  /// `PATCH /consultations/[id]` (updateConsultationDetailsSchema).
  Future<void> updateDetails(String id, {String? chiefComplaint, String? historyOfPresentIllness, String? notes});

  /// `PUT /consultations/[id]/clinical-note` (saveClinicalNoteSchema).
  Future<void> saveClinicalNote(
    String id, {
    required Map<String, String> ayurvedaAssessment,
    String? diagnosis,
    String? treatmentPlan,
    String? recommendations,
    String? followUpDate,
  });

  Future<void> finalizeClinicalNote(String id);

  /// `POST /consultations/[id]/prescriptions` (savePrescriptionSchema).
  Future<Prescription> createPrescription(String consultationId, {String? doctorNotes, required List<PrescriptionItem> items});

  /// `PATCH /prescriptions/[id]` — DRAFT only.
  Future<Prescription> updatePrescription(String prescriptionId, {String? doctorNotes, required List<PrescriptionItem> items});

  /// `POST /prescriptions/[id]/finalize` — DRAFT only.
  Future<Prescription> finalizePrescription(String prescriptionId);

  /// `POST /prescriptions/[id]/correct` — FINALIZED only; returns the new DRAFT.
  Future<Prescription> correctPrescription(String prescriptionId);

  Future<List<Recommendation>> myDiagnosticRecommendations();
  Future<List<Recommendation>> myPanchakarmaRecommendations();

  /// `POST /consultations/[id]/diagnostic-recommendations` — at most one of
  /// [testId]/[packageId] (createRecommendationSchema's refine).
  Future<void> recommendDiagnostic(String consultationId, {required String clinicalReason, String? testId, String? packageId});

  /// `POST /consultations/[id]/panchakarma-recommendations`.
  Future<void> recommendPanchakarma(String consultationId, {required String clinicalReason, String? therapyId, int? sessionCountRecommended});
}

class ConsultationsApiImpl implements ConsultationsApi {
  ConsultationsApiImpl(this._client);

  final ApiClient _client;

  static Prescription _prescription(dynamic json) =>
      Prescription.fromJson((json as Map<String, dynamic>)['prescription'] as Map<String, dynamic>);

  static Map<String, dynamic> _prescriptionBody(String? doctorNotes, List<PrescriptionItem> items) => {
        if (doctorNotes != null && doctorNotes.trim().isNotEmpty) 'doctorNotes': doctorNotes.trim(),
        'items': items.map((i) => i.toJson()).toList(),
      };

  @override
  Future<ConsultationDetail> get(String id) => _client.get<ConsultationDetail>(
        '/api/v1/consultations/$id',
        decode: (json) => ConsultationDetail.fromJson((json as Map<String, dynamic>)['consultation'] as Map<String, dynamic>),
      );

  @override
  Future<VideoJoinInfo> join(String id) => _client.post<VideoJoinInfo>(
        '/api/v1/consultations/$id/join',
        decode: (json) => VideoJoinInfo.fromJson(json as Map<String, dynamic>),
      );

  @override
  Future<void> start(String id) => _client.post<void>('/api/v1/consultations/$id/start', decode: (_) {});

  @override
  Future<void> complete(String id) => _client.post<void>('/api/v1/consultations/$id/complete', body: const <String, dynamic>{}, decode: (_) {});

  @override
  Future<void> updateDetails(String id, {String? chiefComplaint, String? historyOfPresentIllness, String? notes}) =>
      _client.patch<void>(
        '/api/v1/consultations/$id',
        body: {
          if (chiefComplaint != null) 'chiefComplaint': chiefComplaint,
          if (historyOfPresentIllness != null) 'historyOfPresentIllness': historyOfPresentIllness,
          if (notes != null) 'notes': notes,
        },
        decode: (_) {},
      );

  @override
  Future<void> saveClinicalNote(
    String id, {
    required Map<String, String> ayurvedaAssessment,
    String? diagnosis,
    String? treatmentPlan,
    String? recommendations,
    String? followUpDate,
  }) =>
      _client.put<void>(
        '/api/v1/consultations/$id/clinical-note',
        body: {
          'ayurvedaAssessment': ayurvedaAssessment,
          if (diagnosis != null) 'diagnosis': diagnosis,
          if (treatmentPlan != null) 'treatmentPlan': treatmentPlan,
          if (recommendations != null) 'recommendations': recommendations,
          if (followUpDate != null && followUpDate.isNotEmpty) 'followUpDate': followUpDate,
        },
        decode: (_) {},
      );

  @override
  Future<void> finalizeClinicalNote(String id) =>
      _client.post<void>('/api/v1/consultations/$id/clinical-note/finalize', decode: (_) {});

  @override
  Future<Prescription> createPrescription(String consultationId, {String? doctorNotes, required List<PrescriptionItem> items}) =>
      _client.post<Prescription>(
        '/api/v1/consultations/$consultationId/prescriptions',
        body: _prescriptionBody(doctorNotes, items),
        decode: _prescription,
      );

  @override
  Future<Prescription> updatePrescription(String prescriptionId, {String? doctorNotes, required List<PrescriptionItem> items}) =>
      _client.patch<Prescription>('/api/v1/prescriptions/$prescriptionId', body: _prescriptionBody(doctorNotes, items), decode: _prescription);

  @override
  Future<Prescription> finalizePrescription(String prescriptionId) =>
      _client.post<Prescription>('/api/v1/prescriptions/$prescriptionId/finalize', decode: _prescription);

  @override
  Future<Prescription> correctPrescription(String prescriptionId) =>
      _client.post<Prescription>('/api/v1/prescriptions/$prescriptionId/correct', decode: _prescription);

  @override
  Future<List<Recommendation>> myDiagnosticRecommendations() => _client.get<List<Recommendation>>(
        '/api/v1/doctors/me/diagnostic-recommendations',
        decode: (json) => ((json as Map<String, dynamic>)['recommendations'] as List<dynamic>)
            .map((e) => Recommendation.diagnosticFromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  Future<List<Recommendation>> myPanchakarmaRecommendations() => _client.get<List<Recommendation>>(
        '/api/v1/doctors/me/panchakarma-recommendations',
        decode: (json) => ((json as Map<String, dynamic>)['recommendations'] as List<dynamic>)
            .map((e) => Recommendation.panchakarmaFromJson(e as Map<String, dynamic>))
            .toList(),
      );

  @override
  Future<void> recommendDiagnostic(String consultationId, {required String clinicalReason, String? testId, String? packageId}) {
    assert(testId == null || packageId == null, 'at most one of testId / packageId');
    return _client.post<void>(
      '/api/v1/consultations/$consultationId/diagnostic-recommendations',
      body: {
        'clinicalReason': clinicalReason,
        if (testId != null) 'testId': testId,
        if (packageId != null) 'packageId': packageId,
      },
      decode: (_) {},
    );
  }

  @override
  Future<void> recommendPanchakarma(String consultationId, {required String clinicalReason, String? therapyId, int? sessionCountRecommended}) =>
      _client.post<void>(
        '/api/v1/consultations/$consultationId/panchakarma-recommendations',
        body: {
          'clinicalReason': clinicalReason,
          if (therapyId != null) 'therapyId': therapyId,
          if (sessionCountRecommended != null) 'sessionCountRecommended': sessionCountRecommended,
        },
        decode: (_) {},
      );
}
