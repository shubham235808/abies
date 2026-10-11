import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/presentation/auth_controller.dart';
import 'package:abies_doctor/features/practice/domain/profile_inputs.dart';
import 'package:abies_doctor/features/practice/presentation/documents_controller.dart';
import 'package:abies_doctor/features/practice/presentation/practice_providers.dart';
import 'package:abies_doctor/features/practice/presentation/profile_controller.dart';
import 'package:abies_doctor/features/practice/presentation/profile_management.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  late FakeDoctorApi doctor;
  late ProviderContainer container;

  Future<void> start(String status, {List<Map<String, dynamic>>? documents}) async {
    doctor = FakeDoctorApi(profile: profileJson(status: status, documents: documents));
    container = ProviderContainer(overrides: [
      doctorApiProvider.overrideWithValue(doctor),
      authApiProvider.overrideWithValue(FakeAuthApi()..meResult = doctorUser),
    ]);
    addTearDown(container.dispose);
    container.listen(documentsControllerProvider, (_, __) {});
    await container.read(documentsControllerProvider.future);
  }

  DocumentsController notifier() => container.read(documentsControllerProvider.notifier);
  ProfileWorkState state() => container.read(documentsControllerProvider).requireValue;
  const pdf = DocumentUpload(path: '/tmp/degree.pdf', filename: 'degree.pdf', mimeType: 'application/pdf', sizeBytes: 4096);

  test('lists documents with their real review status and note', () async {
    await start('DRAFT', documents: [
      documentJson(id: 'a', type: 'REGISTRATION_CERTIFICATE', status: 'VERIFIED'),
      documentJson(id: 'b', type: 'DEGREE_CERTIFICATE', status: 'REJECTED', reviewNote: 'Expired'),
    ]);
    expect(state().profile.documents.map((d) => d.status), ['VERIFIED', 'REJECTED']);
    expect(state().profile.documents.last.reviewNote, 'Expired');
  });

  test('DRAFT: uploads any type, then re-fetches', () async {
    await start('DRAFT');
    expect(notifier().uploadableTypes(), ['REGISTRATION_CERTIFICATE', 'DEGREE_CERTIFICATE', 'ID_PROOF', 'PROFILE_PHOTO', 'OTHER']);
    final meBefore = doctor.meCalls;
    expect(await notifier().upload(type: 'DEGREE_CERTIFICATE', file: pdf), isTrue);
    expect(doctor.calls, ['upload:DEGREE_CERTIFICATE:degree.pdf']);
    expect(doctor.meCalls, meBefore + 1);
    expect(state().profile.documents.first.type, 'DEGREE_CERTIFICATE');
    expect(state().profile.documents.first.status, 'PENDING');
  });

  test('APPROVED: only the profile photo can be uploaded or removed', () async {
    await start('APPROVED', documents: [
      documentJson(id: 'reg', type: 'REGISTRATION_CERTIFICATE', status: 'VERIFIED'),
      documentJson(id: 'photo', type: 'PROFILE_PHOTO', status: 'VERIFIED'),
    ]);
    expect(notifier().uploadableTypes(), ['PROFILE_PHOTO']);
    expect(await notifier().upload(type: 'DEGREE_CERTIFICATE', file: pdf), isFalse);
    expect(state().error, DocumentsController.lockedMessage);
    expect(doctor.calls, isEmpty, reason: 'refused locally, never sent');

    final reg = state().profile.documents.firstWhere((d) => d.id == 'reg');
    final photo = state().profile.documents.firstWhere((d) => d.id == 'photo');
    expect(notifier().canRemove(reg), isFalse);
    expect(await notifier().remove(reg), isFalse);
    expect(doctor.calls, isEmpty);

    const png = DocumentUpload(path: '/tmp/me.png', filename: 'me.png', mimeType: 'image/png', sizeBytes: 1000);
    expect(await notifier().upload(type: 'PROFILE_PHOTO', file: png), isTrue);
    expect(await notifier().remove(photo), isTrue);
    expect(doctor.calls, ['upload:PROFILE_PHOTO:me.png', 'removeDocument:photo']);
  });

  test('UNDER_REVIEW with a document flagged RESUBMISSION_REQUIRED unlocks credential uploads', () async {
    await start('UNDER_REVIEW', documents: [
      documentJson(id: 'deg', type: 'DEGREE_CERTIFICATE', status: 'RESUBMISSION_REQUIRED', reviewNote: 'Illegible'),
    ]);
    expect(notifier().uploadableTypes(), contains('DEGREE_CERTIFICATE'));
    expect(await notifier().upload(type: 'DEGREE_CERTIFICATE', file: pdf), isTrue);
    // Corrected copy first, then the flagged original can still be removed.
    final flagged = state().profile.documents.firstWhere((d) => d.id == 'deg');
    expect(await notifier().remove(flagged), isTrue);
    expect(state().profile.documents.map((d) => d.id), isNot(contains('deg')));
  });

  test('an invalid file is rejected before upload', () async {
    await start('DRAFT');
    const webp = DocumentUpload(path: '/tmp/a.webp', filename: 'a.webp', mimeType: '', sizeBytes: 100);
    expect(await notifier().upload(type: 'OTHER', file: webp), isFalse);
    const huge = DocumentUpload(path: '/tmp/a.pdf', filename: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 11 * 1024 * 1024);
    expect(await notifier().upload(type: 'OTHER', file: huge), isFalse);
    expect(doctor.calls, isEmpty);
  });

  test('a backend error is surfaced and the list kept', () async {
    await start('DRAFT');
    doctor.throwOnWrite = const ApiException(message: 'Something went wrong', statusCode: 500);
    expect(await notifier().upload(type: 'OTHER', file: pdf), isFalse);
    expect(state().error, 'Something went wrong');
    expect(state().profile.documents.single.id, 'doc1');
    expect(state().busy, isFalse);
  });

  test('downloadUrl returns the signed URL', () async {
    await start('APPROVED');
    expect(await notifier().downloadUrl('doc1'), startsWith('https://storage.example.test/doc1'));
  });

  test('an upload refreshes a live Profile screen but never self-reloads', () async {
    await start('DRAFT');
    container.listen(profileControllerProvider, (_, __) {});
    await container.read(profileControllerProvider.future);
    expect(container.read(profileControllerProvider).requireValue.profile.documentCount, 1);

    expect(await notifier().upload(type: 'OTHER', file: pdf), isTrue);
    expect(state().message, 'Document uploaded.', reason: 'own state kept, not rebuilt');
    await container.read(profileControllerProvider.future);
    expect(container.read(profileControllerProvider).requireValue.profile.documentCount, 2);
  });
}
