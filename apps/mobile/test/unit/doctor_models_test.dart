import 'package:abies_mobile/features/doctors/domain/doctor_detail.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_facets.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_review.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_search_result.dart';
import 'package:abies_mobile/features/doctors/domain/doctor_summary.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _publicDoctorJson({String slug = 'dr-asha-rao', bool withAvailability = true}) {
  return {
    'id': 'doc1',
    'slug': slug,
    'name': 'Dr. Asha Rao',
    'firstName': 'Asha',
    'lastName': 'Rao',
    'bio': 'Senior Ayurveda physician.',
    'registrationCouncil': 'CCIM',
    'registrationNumber': 'REG123',
    'primaryQualification': 'BAMS',
    'highestQualification': 'MD (Ayurveda)',
    'yearsExperience': 12,
    'specialties': ['Panchakarma', 'Skin disorders'],
    'languages': ['English', 'Hindi'],
    'consultationModes': ['VIDEO', 'CLINIC'],
    'videoFee': 500,
    'clinicFee': 800,
    'startingFee': 500,
    'rating': 4.5,
    'reviewCount': 12,
    'photoUrl': '/api/v1/public/doctors/$slug/photo',
    'clinics': [
      {
        'id': 'c1',
        'name': 'Wellness Clinic',
        'addressLine1': '12 MG Road',
        'addressLine2': null,
        'city': 'Pune',
        'state': 'Maharashtra',
        'postalCode': '411001',
        'phone': '020123456',
      },
    ],
    'availability': withAvailability
        ? [
            {'id': 'a1', 'dayOfWeek': 1, 'startTime': '09:00', 'endTime': '12:00', 'slotMinutes': 30, 'mode': 'VIDEO', 'clinicId': null},
          ]
        : <dynamic>[],
    'verified': true,
    'acceptingNewPatients': true,
    'languageMatch': true,
  };
}

void main() {
  group('DoctorSummary.fromJson', () {
    test('parses the full publicDoctor() shape', () {
      final doctor = DoctorSummary.fromJson(_publicDoctorJson());

      expect(doctor.name, 'Dr. Asha Rao');
      expect(doctor.specialties, ['Panchakarma', 'Skin disorders']);
      expect(doctor.consultationModes, ['VIDEO', 'CLINIC']);
      expect(doctor.videoFee, 500);
      expect(doctor.clinicFee, 800);
      expect(doctor.rating, 4.5);
      expect(doctor.reviewCount, 12);
      expect(doctor.city, 'Pune');
      expect(doctor.languageMatch, isTrue);
      expect(doctor.acceptingNewPatients, isTrue);
    });

    test('tolerates no clinics (city is null) and a missing languageMatch', () {
      final json = _publicDoctorJson()..['clinics'] = <dynamic>[];
      json.remove('languageMatch');

      final doctor = DoctorSummary.fromJson(json);

      expect(doctor.city, isNull);
      expect(doctor.languageMatch, isNull);
    });
  });

  group('DoctorDetail.fromJson', () {
    test('parses bio, registration detail and availability windows', () {
      final doctor = DoctorDetail.fromJson(_publicDoctorJson());

      expect(doctor.bio, 'Senior Ayurveda physician.');
      expect(doctor.registrationCouncil, 'CCIM');
      expect(doctor.availability, hasLength(1));
      expect(doctor.availability.first.dayOfWeek, 1);
      expect(doctor.clinics, hasLength(1));
      expect(doctor.clinics.first.city, 'Pune');
    });

    test('feeFor returns the right fee per mode and null for an unknown mode', () {
      final doctor = DoctorDetail.fromJson(_publicDoctorJson());

      expect(doctor.feeFor('VIDEO'), 500);
      expect(doctor.feeFor('CLINIC'), 800);
    });

    test('tolerates an empty availability list', () {
      final doctor = DoctorDetail.fromJson(_publicDoctorJson(withAvailability: false));
      expect(doctor.availability, isEmpty);
    });
  });

  group('DoctorFacets.fromJson', () {
    test('parses specialties/languages/cities', () {
      final facets = DoctorFacets.fromJson({
        'specialties': ['Panchakarma'],
        'languages': ['English'],
        'cities': ['Pune'],
      });

      expect(facets.specialties, ['Panchakarma']);
      expect(facets.languages, ['English']);
      expect(facets.cities, ['Pune']);
    });
  });

  group('DoctorSearchResult.fromJson', () {
    test('parses total/offset/limit and the doctors list, and hasMore reflects them', () {
      final result = DoctorSearchResult.fromJson({
        'total': 50,
        'offset': 0,
        'limit': 20,
        'doctors': [_publicDoctorJson()],
      });

      expect(result.total, 50);
      expect(result.doctors, hasLength(1));
      expect(result.hasMore, isTrue);
    });

    test('hasMore is false once every result has been loaded', () {
      final result = DoctorSearchResult.fromJson({
        'total': 1,
        'offset': 0,
        'limit': 20,
        'doctors': [_publicDoctorJson()],
      });

      expect(result.hasMore, isFalse);
    });
  });

  group('DoctorReview.fromJson', () {
    test('joins the author patientProfile name', () {
      final review = DoctorReview.fromJson({
        'id': 'r1',
        'rating': 5,
        'comment': 'Great consultation.',
        'createdAt': DateTime(2026, 1, 1).toIso8601String(),
        'author': {
          'patientProfile': {'firstName': 'Rahul', 'lastName': 'Mehta'},
        },
      });

      expect(review.authorName, 'Rahul Mehta');
      expect(review.rating, 5);
    });

    test('falls back to "ABIES patient" when the author has no name set', () {
      final review = DoctorReview.fromJson({
        'id': 'r2',
        'rating': 3,
        'comment': null,
        'createdAt': DateTime(2026, 1, 1).toIso8601String(),
        'author': {
          'patientProfile': {'firstName': null, 'lastName': null},
        },
      });

      expect(review.authorName, 'ABIES patient');
    });
  });
}
