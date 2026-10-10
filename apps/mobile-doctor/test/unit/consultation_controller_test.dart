import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/consultations/domain/consultation_detail.dart';
import 'package:abies_doctor/features/consultations/domain/recommendation.dart';
import 'package:abies_doctor/features/consultations/presentation/consultation_controller.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeConsultationsApi api;
  late ProviderContainer container;

  Future<void> boot(Map<String, dynamic> row) async {
    api = FakeConsultationsApi(row);
    container = ProviderContainer(overrides: [consultationsApiProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    container.listen(consultationControllerProvider('cons1'), (_, __) {});
    await container.read(consultationControllerProvider('cons1').future);
  }

  ConsultationController notifier() => container.read(consultationControllerProvider('cons1').notifier);
  ConsultationWorkspace ws() => container.read(consultationControllerProvider('cons1')).requireValue;

  const item = PrescriptionItem(productName: 'Triphala churna', dosage: '5 g', frequency: 'At bedtime', durationDays: 30);

  test('loads the consultation, records a VIDEO join, and keeps only this consultation\'s recommendations', () async {
    api = FakeConsultationsApi(consultationJson());
    api.diagnostics = const [
      Recommendation(id: 'a', consultationId: 'cons1', status: 'RECOMMENDED', clinicalReason: 'x', itemName: 'CBC'),
      Recommendation(id: 'b', consultationId: 'other', status: 'RECOMMENDED', clinicalReason: 'y', itemName: 'LFT'),
    ];
    container = ProviderContainer(overrides: [consultationsApiProvider.overrideWithValue(api)]);
    addTearDown(container.dispose);
    final w = await container.read(consultationControllerProvider('cons1').future);
    expect(w.consultation.patientName, 'Ravi K');
    expect(w.joinInfo?.available, isFalse);
    expect(api.calls, contains('join'));
    expect(w.diagnosticRecommendations.map((r) => r.id), ['a']);
  });

  test('a CLINIC consultation never calls join', () async {
    await boot(consultationJson(mode: 'CLINIC'));
    expect(api.calls, isNot(contains('join')));
    expect(ws().joinInfo, isNull);
  });

  test('start then complete transitions through the real status flow and reloads each time', () async {
    await boot(consultationJson());
    expect(ws().consultation.canStart, isTrue);
    expect(await notifier().start(), isTrue);
    expect(ws().consultation.status, 'IN_PROGRESS');
    expect(await notifier().complete(), isTrue);
    expect(ws().consultation.status, 'COMPLETED');
    expect(ws().consultation.canEditVisitDetails, isFalse);
    expect(ws().consultation.canWriteClinicalRecords, isTrue);
    expect(api.calls.where((c) => c == 'get').length, 3);
  });

  test("a backend rejection is surfaced as the backend's own message, state preserved", () async {
    await boot(consultationJson());
    api.throwNext = const ApiException(message: 'This consultation has already started or ended', statusCode: 400);
    expect(await notifier().start(), isFalse);
    expect(ws().error, 'This consultation has already started or ended');
    expect(ws().busy, isFalse);
    expect(ws().consultation.status, 'SCHEDULED');
  });

  test('visit details cannot be saved once the consultation is completed', () async {
    await boot(consultationJson(status: 'COMPLETED'));
    expect(await notifier().saveDetails(chiefComplaint: 'x', historyOfPresentIllness: '', notes: ''), isFalse);
    expect(api.calls, isNot(contains('updateDetails')));
  });

  test('clinical note: must be saved before finalizing; saving round-trips the existing assessment', () async {
    await boot(consultationJson(status: 'IN_PROGRESS'));
    expect(await notifier().finalizeClinicalNote(), isFalse);
    expect(ws().error, 'Save the clinical note before finalizing it');

    expect(
      await notifier().saveClinicalNote(
        ayurvedaAssessment: const {'prakriti': 'Pitta'},
        diagnosis: 'Amlapitta',
        treatmentPlan: 'Diet + herbs',
        recommendations: '',
        followUpDate: '2026-10-24',
      ),
      isTrue,
    );
    expect(api.lastAssessment, {'prakriti': 'Pitta'});
    expect(ws().consultation.clinicalNote?.diagnosis, 'Amlapitta');
    expect(ws().consultation.clinicalNote?.followUpDate, '2026-10-24');

    expect(await notifier().finalizeClinicalNote(), isTrue);
    expect(ws().consultation.clinicalNote?.isFinalized, isTrue);
  });

  test('a finalized clinical note is never re-saved', () async {
    await boot(consultationJson(clinicalNote: {
      'ayurvedaAssessment': {'prakriti': 'Vata'},
      'diagnosis': 'x',
      'finalizedAt': '2026-10-10T06:00:00.000Z',
    }));
    expect(
      await notifier().saveClinicalNote(ayurvedaAssessment: const {}, diagnosis: 'y', treatmentPlan: '', recommendations: ''),
      isFalse,
    );
    expect(api.calls, isNot(contains('saveClinicalNote')));
  });

  test('prescription: validated client-side, created as DRAFT, edited, finalized', () async {
    await boot(consultationJson(status: 'IN_PROGRESS'));
    expect(await notifier().savePrescription(items: const []), isFalse);
    expect(await notifier().savePrescription(items: const [PrescriptionItem(productName: '  ')]), isFalse);
    expect(api.calls, isNot(contains('createPrescription')));

    expect(await notifier().savePrescription(doctorNotes: 'After food', items: const [item]), isTrue);
    final draft = ws().consultation.prescriptions.single;
    expect(draft.isDraft, isTrue);
    expect(draft.items.single.productName, 'Triphala churna');

    expect(await notifier().savePrescription(prescriptionId: draft.id, items: const [item, PrescriptionItem(productName: 'Avipattikar')]), isTrue);
    expect(ws().consultation.prescriptions.single.items, hasLength(2));

    expect(await notifier().finalizePrescription(draft.id), isTrue);
    expect(ws().consultation.prescriptions.single.isFinalized, isTrue);
  });

  test('a finalized prescription is immutable: editing is refused, a correction supersedes it with a new draft', () async {
    await boot(consultationJson(status: 'COMPLETED', prescriptions: [
      {
        'id': 'rx-final',
        'status': 'FINALIZED',
        'doctorNotes': null,
        'finalizedAt': '2026-10-10T06:00:00.000Z',
        'supersedesId': null,
        'items': [item.toJson()],
      }
    ]));

    expect(await notifier().savePrescription(prescriptionId: 'rx-final', items: const [item]), isFalse);
    expect(ws().error, contains('create a correction instead'));
    expect(api.calls.where((c) => c.startsWith('updatePrescription')), isEmpty);

    final newId = await notifier().correctPrescription('rx-final');
    expect(newId, isNotNull);
    final rx = ws().consultation.prescriptions;
    expect(rx.firstWhere((p) => p.id == newId).isDraft, isTrue);
    expect(rx.firstWhere((p) => p.id == newId).supersedesId, 'rx-final');
    expect(rx.firstWhere((p) => p.id == 'rx-final').status, 'SUPERSEDED');
  });

  test('recommendations: reason required, test and package mutually exclusive, list reloaded after create', () async {
    await boot(consultationJson(status: 'IN_PROGRESS'));
    expect(await notifier().recommendDiagnostic(clinicalReason: '  '), isFalse);
    expect(await notifier().recommendDiagnostic(clinicalReason: 'r', testId: 't', packageId: 'p'), isFalse);
    expect(await notifier().recommendPanchakarma(clinicalReason: 'r', sessionCountRecommended: 0), isFalse);
    expect(api.calls.where((c) => c.startsWith('recommend')), isEmpty);

    expect(await notifier().recommendDiagnostic(clinicalReason: 'Rule out anaemia', testId: 't1'), isTrue);
    expect(api.calls, contains('recommendDiagnostic:t1:null'));
    expect(ws().diagnosticRecommendations.single.clinicalReason, 'Rule out anaemia');

    expect(await notifier().recommendPanchakarma(clinicalReason: 'Vata imbalance', therapyId: 'th1', sessionCountRecommended: 7), isTrue);
    expect(ws().panchakarmaRecommendations.single.sessionCountRecommended, 7);
  });
}
