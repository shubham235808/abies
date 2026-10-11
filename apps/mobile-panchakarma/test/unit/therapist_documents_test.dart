import 'package:abies_panchakarma/core/api/api_exception.dart';
import 'package:abies_panchakarma/features/auth/presentation/auth_controller.dart';
import 'package:abies_panchakarma/features/centre/domain/therapist_document.dart';
import 'package:abies_panchakarma/features/centre/presentation/dashboard_controller.dart';
import 'package:abies_panchakarma/features/centre/presentation/therapist_documents_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

const _upload = TherapistDocumentUpload(path: '/tmp/cert.pdf', filename: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: 4096);

class _Harness {
  _Harness(this.api, {FakeAuthApi? auth, this.launchResult = true}) {
    container = ProviderContainer(overrides: [
      authApiProvider.overrideWithValue(auth ?? FakeAuthApi()),
      centreApiProvider.overrideWithValue(api),
      externalUrlLauncherProvider.overrideWithValue((uri) async {
        launched.add(uri);
        return launchResult;
      }),
    ]);
    addTearDown(container.dispose);
  }

  final FakeCentreApi api;
  final bool launchResult;
  final launched = <Uri>[];
  late final ProviderContainer container;

  /// The provider is autoDispose — keep it alive for the whole test.
  Future<List<TherapistDocument>> load(String therapistId) {
    container.listen(therapistDocumentsControllerProvider(therapistId), (_, __) {});
    return container.read(therapistDocumentsControllerProvider(therapistId).future);
  }

  TherapistDocumentsController controller(String therapistId) => container.read(therapistDocumentsControllerProvider(therapistId).notifier);
  List<TherapistDocument> docs(String therapistId) => container.read(therapistDocumentsControllerProvider(therapistId)).requireValue;
}

void main() {
  group('TherapistDocument model', () {
    test('parses the real Prisma TherapistDocument shape and every review status', () {
      final statuses = {
        'PENDING': TherapistDocumentStatus.pending,
        'VERIFIED': TherapistDocumentStatus.verified,
        'REJECTED': TherapistDocumentStatus.rejected,
        'RESUBMISSION_REQUIRED': TherapistDocumentStatus.resubmissionRequired,
        'SOMETHING_NEW': TherapistDocumentStatus.unknown,
      };
      for (final entry in statuses.entries) {
        final doc = TherapistDocument.fromJson(therapistDocumentJson(id: 'd', status: entry.key, type: 'QUALIFICATION_CERTIFICATE'));
        expect(doc.status, entry.value);
        expect(doc.typeLabel, 'Qualification certificate');
        expect(doc.sizeBytes, 2048);
      }
      expect(TherapistDocument.fromJson(therapistDocumentJson(id: 'd', status: 'REJECTED')).needsAction, isTrue);
      expect(TherapistDocument.fromJson(therapistDocumentJson(id: 'd', status: 'RESUBMISSION_REQUIRED')).needsAction, isTrue);
      expect(TherapistDocument.fromJson(therapistDocumentJson(id: 'd', status: 'VERIFIED')).needsAction, isFalse);
    });

    test('falls back to the raw type string for an unknown type', () {
      final doc = TherapistDocument.fromJson(therapistDocumentJson(id: 'd', type: 'LEGACY'));
      expect(doc.type, isNull);
      expect(doc.typeLabel, 'LEGACY');
    });

    test('document types match therapistDocumentTypeSchema', () {
      expect(TherapistDocumentType.values.map((t) => t.wire), ['ID_PROOF', 'QUALIFICATION_CERTIFICATE', 'PROFILE_PHOTO', 'OTHER']);
    });
  });

  group('TherapistDocumentUpload.fromPicked (mirrors storage.ts assertUploadAllowed)', () {
    test('accepts PDF/JPG/JPEG/PNG with the right MIME type', () {
      for (final (name, mime) in [('a.pdf', 'application/pdf'), ('b.JPG', 'image/jpeg'), ('c.jpeg', 'image/jpeg'), ('d.png', 'image/png')]) {
        final (upload, error) = TherapistDocumentUpload.fromPicked(path: '/x/$name', name: name, size: 100);
        expect(error, isNull, reason: name);
        expect(upload!.mimeType, mime);
      }
    });

    test('rejects other types, empty and oversize files, and unreadable picks', () {
      expect(TherapistDocumentUpload.fromPicked(path: '/x/a.docx', name: 'a.docx', size: 100).$2, contains('PDF, JPG or PNG'));
      expect(TherapistDocumentUpload.fromPicked(path: '/x/noext', name: 'noext', size: 100).$2, isNotNull);
      expect(TherapistDocumentUpload.fromPicked(path: '/x/a.pdf', name: 'a.pdf', size: 0).$2, contains('empty'));
      expect(TherapistDocumentUpload.fromPicked(path: '/x/a.pdf', name: 'a.pdf', size: TherapistDocumentUpload.maxBytes + 1).$2, contains('10 MB'));
      expect(TherapistDocumentUpload.fromPicked(path: '/x/a.pdf', name: 'a.pdf', size: TherapistDocumentUpload.maxBytes).$2, isNull);
      expect(TherapistDocumentUpload.fromPicked(path: null, name: 'a.pdf', size: 100).$2, isNotNull);
    });
  });

  group('TherapistDocumentsController', () {
    test('loads the therapist’s documents with their review status', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [
            therapistDocumentJson(id: 'd2', status: 'RESUBMISSION_REQUIRED', reviewNote: 'Blurry scan'),
            therapistDocumentJson(id: 'd1', status: 'VERIFIED'),
          ],
        };
      final docs = await _Harness(api).load('th1');
      expect(docs.map((d) => d.id), ['d2', 'd1']);
      expect(docs.first.status, TherapistDocumentStatus.resubmissionRequired);
      expect(docs.first.reviewNote, 'Blurry scan');
    });

    test('keeps each therapist’s documents separate', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a')],
          'th2': [therapistDocumentJson(id: 'b', therapistId: 'th2'), therapistDocumentJson(id: 'c', therapistId: 'th2')],
        };
      final h = _Harness(api);
      expect(await h.load('th1'), hasLength(1));
      expect(await h.load('th2'), hasLength(2));
    });

    test('surfaces the backend’s 404 for a therapist that isn’t this centre’s', () async {
      final h = _Harness(FakeCentreApi());
      await expectLater(h.load('someone-else'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 404)));
    });

    test('refuses to build signed out', () async {
      final h = _Harness(FakeCentreApi(), auth: FakeAuthApi()..meResult = null);
      await expectLater(h.load('th1'), throwsA(isA<StateError>()));
    });

    test('upload sends the type + file and prepends the created document', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'old')]
        };
      final h = _Harness(api);
      await h.load('th1');

      final error = await h.controller('th1').upload(TherapistDocumentType.qualificationCertificate, _upload);

      expect(error, isNull);
      expect(api.lastUpload, {'therapistId': 'th1', 'type': 'QUALIFICATION_CERTIFICATE', 'filename': 'cert.pdf', 'mimeType': 'application/pdf'});
      final docs = h.docs('th1');
      expect(docs.map((d) => d.id), ['doc1', 'old']);
      expect(docs.first.status, TherapistDocumentStatus.pending);
    });

    test('upload failure returns the backend message and leaves the list untouched', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'old')]
        };
      final h = _Harness(api);
      await h.load('th1');
      api.nextError = const ApiException(message: 'Something went wrong', statusCode: 500);

      final error = await h.controller('th1').upload(TherapistDocumentType.idProof, _upload);

      expect(error, 'Something went wrong');
      expect(h.docs('th1').map((d) => d.id), ['old']);
    });

    test('remove deletes the document from the list', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a'), therapistDocumentJson(id: 'b')]
        };
      final h = _Harness(api);
      await h.load('th1');

      expect(await h.controller('th1').remove('a'), isNull);
      expect(h.docs('th1').map((d) => d.id), ['b']);
      expect(api.documentsByTherapist['th1']!.map((d) => d['id']), ['b']);
    });

    test('remove failure keeps the document', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a')]
        };
      final h = _Harness(api);
      await h.load('th1');
      api.nextError = const ApiException(message: 'Forbidden', statusCode: 403);

      expect(await h.controller('th1').remove('a'), 'Forbidden');
      expect(h.docs('th1').map((d) => d.id), ['a']);
    });

    test('open fetches a fresh signed URL each time and launches it externally', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a')]
        };
      final h = _Harness(api);
      await h.load('th1');

      expect(await h.controller('th1').open('a'), isNull);
      expect(await h.controller('th1').open('a'), isNull);
      expect(api.downloadUrlCalls, 2);
      expect(h.launched, [Uri.parse(api.downloadUrl), Uri.parse(api.downloadUrl)]);
    });

    test('open reports when no app can open the link', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a')]
        };
      final h = _Harness(api, launchResult: false);
      await h.load('th1');
      expect(await h.controller('th1').open('a'), contains('No app'));
    });

    test('open surfaces a backend error without launching anything', () async {
      final api = FakeCentreApi()
        ..documentsByTherapist = {
          'th1': [therapistDocumentJson(id: 'a')]
        };
      final h = _Harness(api);
      await h.load('th1');
      expect(await h.controller('th1').open('missing'), 'Document not found');
      expect(h.launched, isEmpty);
    });

    test('refresh reloads from the API', () async {
      final api = FakeCentreApi()..documentsByTherapist = {'th1': []};
      final h = _Harness(api);
      expect(await h.load('th1'), isEmpty);
      api.documentsByTherapist['th1']!.add(therapistDocumentJson(id: 'new', status: 'VERIFIED'));
      await h.controller('th1').refresh();
      expect(h.docs('th1').single.status, TherapistDocumentStatus.verified);
    });
  });
}
