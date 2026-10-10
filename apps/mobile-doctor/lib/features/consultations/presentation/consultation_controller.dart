import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../practice/presentation/dashboard_controller.dart';
import '../../practice/presentation/practice_providers.dart';
import '../domain/consultation_detail.dart';
import '../domain/recommendation.dart';
import '../domain/video_join_info.dart';

class ConsultationWorkspace {
  const ConsultationWorkspace({
    required this.consultation,
    required this.diagnosticRecommendations,
    required this.panchakarmaRecommendations,
    this.joinInfo,
    this.busy = false,
    this.error,
  });

  final ConsultationDetail consultation;
  final List<Recommendation> diagnosticRecommendations;
  final List<Recommendation> panchakarmaRecommendations;

  /// Only for VIDEO consultations — the message from `POST .../join`.
  final VideoJoinInfo? joinInfo;
  final bool busy;
  final String? error;

  ConsultationWorkspace copyWith({
    ConsultationDetail? consultation,
    List<Recommendation>? diagnosticRecommendations,
    List<Recommendation>? panchakarmaRecommendations,
    bool? busy,
    String? error,
    bool clearError = false,
  }) {
    return ConsultationWorkspace(
      consultation: consultation ?? this.consultation,
      diagnosticRecommendations: diagnosticRecommendations ?? this.diagnosticRecommendations,
      panchakarmaRecommendations: panchakarmaRecommendations ?? this.panchakarmaRecommendations,
      joinInfo: joinInfo,
      busy: busy ?? this.busy,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// One consultation's workspace — the mobile port of the web
/// ConsultationWorkspace (apps/partner-web/src/app/partner/doctor/
/// consultations/[id]/workspace.tsx). Every write goes to the real backend
/// and is followed by a re-fetch of `GET /consultations/[id]` (several
/// write routes return bare, un-included rows), so what's on screen is
/// always the server's state, never a local guess.
class ConsultationController extends AutoDisposeFamilyAsyncNotifier<ConsultationWorkspace, String> {
  @override
  Future<ConsultationWorkspace> build(String consultationId) async {
    final api = ref.watch(consultationsApiProvider);
    final consultation = await api.get(consultationId);
    VideoJoinInfo? joinInfo;
    if (consultation.isVideo) {
      // Same as the web page load: records the doctor's join time
      // (idempotent server-side). Best-effort — never blocks the workspace.
      try {
        joinInfo = await api.join(consultationId);
      } on ApiException {
        joinInfo = null;
      }
    }
    final recs = await _loadRecommendations(consultationId);
    return ConsultationWorkspace(
      consultation: consultation,
      diagnosticRecommendations: recs.$1,
      panchakarmaRecommendations: recs.$2,
      joinInfo: joinInfo,
    );
  }

  Future<(List<Recommendation>, List<Recommendation>)> _loadRecommendations(String consultationId) async {
    final api = ref.read(consultationsApiProvider);
    final results = await Future.wait([api.myDiagnosticRecommendations(), api.myPanchakarmaRecommendations()]);
    List<Recommendation> mine(List<Recommendation> all) => all.where((r) => r.consultationId == consultationId).toList();
    return (mine(results[0]), mine(results[1]));
  }

  /// Runs [action], then reloads. Returns false and surfaces the backend's
  /// own message on failure (e.g. "Finalized prescriptions are read-only").
  Future<bool> _run(Future<void> Function() action, {bool reloadRecommendations = false, bool affectsDashboard = false}) async {
    final current = state.valueOrNull;
    if (current == null || current.busy) return false;
    state = AsyncValue.data(current.copyWith(busy: true, clearError: true));
    try {
      await action();
      final api = ref.read(consultationsApiProvider);
      final consultation = await api.get(arg);
      var next = current.copyWith(consultation: consultation, busy: false, clearError: true);
      if (reloadRecommendations) {
        final recs = await _loadRecommendations(arg);
        next = next.copyWith(diagnosticRecommendations: recs.$1, panchakarmaRecommendations: recs.$2);
      }
      state = AsyncValue.data(next);
      if (affectsDashboard) ref.invalidate(dashboardControllerProvider);
      return true;
    } on ApiException catch (e) {
      state = AsyncValue.data(current.copyWith(busy: false, error: e.message));
      return false;
    }
  }

  ConsultationDetail? get _consultation => state.valueOrNull?.consultation;

  Future<bool> start() => _run(() => ref.read(consultationsApiProvider).start(arg), affectsDashboard: true);

  Future<bool> complete() => _run(() => ref.read(consultationsApiProvider).complete(arg), affectsDashboard: true);

  Future<bool> saveDetails({required String chiefComplaint, required String historyOfPresentIllness, required String notes}) {
    if (_consultation?.canEditVisitDetails != true) return _fail('This consultation has ended and can no longer be edited');
    return _run(() => ref.read(consultationsApiProvider).updateDetails(
          arg,
          chiefComplaint: chiefComplaint,
          historyOfPresentIllness: historyOfPresentIllness,
          notes: notes,
        ));
  }

  Future<bool> saveClinicalNote({
    required Map<String, String> ayurvedaAssessment,
    required String diagnosis,
    required String treatmentPlan,
    required String recommendations,
    String? followUpDate,
  }) {
    if (_consultation?.clinicalNote?.isFinalized == true) {
      return _fail('This clinical note has been finalized and can no longer be edited');
    }
    return _run(() => ref.read(consultationsApiProvider).saveClinicalNote(
          arg,
          ayurvedaAssessment: ayurvedaAssessment,
          diagnosis: diagnosis,
          treatmentPlan: treatmentPlan,
          recommendations: recommendations,
          followUpDate: followUpDate,
        ));
  }

  Future<bool> finalizeClinicalNote() {
    final note = _consultation?.clinicalNote;
    if (note == null) return _fail('Save the clinical note before finalizing it');
    if (note.isFinalized) return _fail('This clinical note has already been finalized');
    return _run(() => ref.read(consultationsApiProvider).finalizeClinicalNote(arg));
  }

  /// Creates a new DRAFT ([prescriptionId] null) or replaces a DRAFT's
  /// items. Never called for a FINALIZED prescription — use [correctPrescription].
  Future<bool> savePrescription({String? prescriptionId, String? doctorNotes, required List<PrescriptionItem> items}) {
    if (items.isEmpty) return _fail('Add at least one item');
    if (items.length > 30) return _fail('A prescription can have at most 30 items');
    if (items.any((i) => i.productName.trim().isEmpty)) return _fail('Every item needs a medicine name');
    if (prescriptionId != null) {
      final existing = _consultation?.prescriptions.where((p) => p.id == prescriptionId).firstOrNull;
      if (existing != null && !existing.isDraft) {
        return _fail('Finalized prescriptions are read-only — create a correction instead');
      }
    }
    final api = ref.read(consultationsApiProvider);
    return _run(() async {
      if (prescriptionId == null) {
        await api.createPrescription(arg, doctorNotes: doctorNotes, items: items);
      } else {
        await api.updatePrescription(prescriptionId, doctorNotes: doctorNotes, items: items);
      }
    });
  }

  Future<bool> finalizePrescription(String prescriptionId) =>
      _run(() => ref.read(consultationsApiProvider).finalizePrescription(prescriptionId));

  /// Supersedes a FINALIZED prescription with a new DRAFT seeded from it.
  /// Returns the new draft's id (to open in the editor), or null on failure.
  Future<String?> correctPrescription(String prescriptionId) async {
    String? newId;
    final ok = await _run(() async {
      newId = (await ref.read(consultationsApiProvider).correctPrescription(prescriptionId)).id;
    });
    return ok ? newId : null;
  }

  Future<bool> recommendDiagnostic({required String clinicalReason, String? testId, String? packageId}) {
    if (clinicalReason.trim().isEmpty) return _fail('Enter a clinical reason');
    if (testId != null && packageId != null) return _fail('Provide either a test or a package, not both');
    return _run(
      () => ref.read(consultationsApiProvider).recommendDiagnostic(arg, clinicalReason: clinicalReason.trim(), testId: testId, packageId: packageId),
      reloadRecommendations: true,
    );
  }

  Future<bool> recommendPanchakarma({required String clinicalReason, String? therapyId, int? sessionCountRecommended}) {
    if (clinicalReason.trim().isEmpty) return _fail('Enter a clinical reason');
    if (sessionCountRecommended != null && (sessionCountRecommended < 1 || sessionCountRecommended > 60)) {
      return _fail('Sessions must be between 1 and 60');
    }
    return _run(
      () => ref.read(consultationsApiProvider).recommendPanchakarma(
            arg,
            clinicalReason: clinicalReason.trim(),
            therapyId: therapyId,
            sessionCountRecommended: sessionCountRecommended,
          ),
      reloadRecommendations: true,
    );
  }

  void clearError() {
    final current = state.valueOrNull;
    if (current != null) state = AsyncValue.data(current.copyWith(clearError: true));
  }

  Future<bool> _fail(String message) async {
    final current = state.valueOrNull;
    if (current != null) state = AsyncValue.data(current.copyWith(error: message));
    return false;
  }
}

final consultationControllerProvider =
    AsyncNotifierProvider.autoDispose.family<ConsultationController, ConsultationWorkspace, String>(ConsultationController.new);
