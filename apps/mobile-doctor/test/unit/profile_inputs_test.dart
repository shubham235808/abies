import 'package:abies_doctor/features/practice/domain/doctor_profile.dart';
import 'package:abies_doctor/features/practice/domain/profile_inputs.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('ProfileFormInput mirrors updateDoctorProfileSchema', () {
    test('round-trips a loaded profile and builds the same cleaned body as the web form', () {
      final p = DoctorProfile.fromMeJson(profileJson(status: 'DRAFT'));
      final input = ProfileFormInput.fromProfile(p);
      expect(input.validate(), isEmpty);
      final body = input.toPatchBody();
      expect(body['firstName'], 'Asha');
      expect(body['specialties'], ['Panchakarma']);
      expect(body['languages'], ['English', 'Hindi']);
      expect(body['consultationModes'], ['VIDEO', 'CLINIC']);
      expect(body['videoFee'], 500);
      // Empty strings are omitted, never sent (min(1) would reject them).
      expect(body.containsKey('registrationCouncil'), isFalse);
      expect(body.containsKey('gender'), isFalse);
    });

    test('a fee is only sent for an enabled mode; lists are trimmed', () {
      const input = ProfileFormInput(video: false, videoFee: '500', clinic: true, clinicFee: '800', specialties: ' A , ,B ');
      final body = input.toPatchBody();
      expect(body.containsKey('videoFee'), isFalse);
      expect(body['clinicFee'], 800);
      expect(body['consultationModes'], ['CLINIC']);
      expect(body['specialties'], ['A', 'B']);
    });

    test('rejects out-of-range numbers and over-long text with per-field keys', () {
      final errors = ProfileFormInput(
        title: 'x' * 21,
        registrationYear: '1949',
        graduationYear: '2101',
        yearsExperience: '81',
        video: true,
        videoFee: '1000001',
        languages: List.generate(21, (i) => 'L$i').join(','),
      ).validate();
      expect(errors.keys, containsAll(['title', 'registrationYear', 'graduationYear', 'yearsExperience', 'videoFee', 'languages']));
    });
  });

  group('ClinicInput mirrors createClinicSchema', () {
    test('requires name, address, city, state and postal code', () {
      const empty = ClinicInput(name: '', addressLine1: '', city: '', state: '', postalCode: '');
      expect(empty.validate().keys.toSet(), {'name', 'addressLine1', 'city', 'state', 'postalCode'});
    });

    test('postal code max 12, phone max 20; blank optionals omitted from the body', () {
      final input = ClinicInput(name: 'A', addressLine1: 'B', city: 'C', state: 'D', postalCode: '1234567890123', phone: '1' * 21);
      expect(input.validate().keys.toSet(), {'postalCode', 'phone'});
      const ok = ClinicInput(name: ' A ', addressLine1: 'B', city: 'C', state: 'D', postalCode: '411001');
      expect(ok.toJson(), {'name': 'A', 'addressLine1': 'B', 'city': 'C', 'state': 'D', 'postalCode': '411001', 'active': true});
    });
  });

  group('DocumentUpload mirrors storage.ts assertUploadAllowed', () {
    DocumentUpload file(String name, {int size = 1000}) =>
        DocumentUpload(path: '/tmp/$name', filename: name, mimeType: DocumentUpload.mimeTypeFor(name) ?? '', sizeBytes: size);

    test('accepts PDF/JPEG/PNG only — no WebP', () {
      expect(DocumentUpload.mimeTypeFor('a.PDF'), 'application/pdf');
      expect(DocumentUpload.mimeTypeFor('a.jpeg'), 'image/jpeg');
      expect(DocumentUpload.mimeTypeFor('a.png'), 'image/png');
      expect(DocumentUpload.mimeTypeFor('a.webp'), isNull);
      expect(file('a.webp').validate(type: 'OTHER'), isNotNull);
      expect(file('a.pdf').validate(type: 'DEGREE_CERTIFICATE'), isNull);
    });

    test('caps size at the 10 MiB UPLOAD_MAX_BYTES default and rejects unknown types', () {
      expect(file('a.pdf', size: 10 * 1024 * 1024).validate(type: 'OTHER'), isNull);
      expect(file('a.pdf', size: 10 * 1024 * 1024 + 1).validate(type: 'OTHER'), 'Files must be 10 MB or smaller.');
      expect(file('a.pdf').validate(type: 'PASSPORT'), isNotNull);
    });
  });

  group('DoctorProfile document lock rules mirror doctors.service.ts', () {
    test('DRAFT/REJECTED: every type is changeable', () {
      for (final s in ['DRAFT', 'REJECTED']) {
        final p = DoctorProfile.fromMeJson(profileJson(status: s));
        expect(p.credentialDocumentsEditable, isTrue);
        expect(p.canChangeDocumentOfType('REGISTRATION_CERTIFICATE'), isTrue);
      }
    });

    test('SUBMITTED/APPROVED: only PROFILE_PHOTO, unless a document is flagged for resubmission', () {
      final locked = DoctorProfile.fromMeJson(profileJson(status: 'SUBMITTED'));
      expect(locked.canChangeDocumentOfType('DEGREE_CERTIFICATE'), isFalse);
      expect(locked.canChangeDocumentOfType('PROFILE_PHOTO'), isTrue);

      final flagged = DoctorProfile.fromMeJson(profileJson(
        status: 'UNDER_REVIEW',
        documents: [documentJson(id: 'd1', type: 'DEGREE_CERTIFICATE', status: 'RESUBMISSION_REQUIRED', reviewNote: 'Blurry')],
      ));
      expect(flagged.canChangeDocumentOfType('DEGREE_CERTIFICATE'), isTrue);
      expect(flagged.documents.single.reviewNote, 'Blurry');
      expect(flagged.documents.single.needsResubmission, isTrue);
    });
  });
}
