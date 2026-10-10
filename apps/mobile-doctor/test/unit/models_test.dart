import 'package:abies_doctor/features/consultations/domain/consultation_detail.dart';
import 'package:abies_doctor/features/consultations/domain/recommendation.dart';
import 'package:abies_doctor/features/practice/domain/doctor_appointment.dart';
import 'package:abies_doctor/features/practice/domain/doctor_profile.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  test('DoctorProfile parses GET /doctors/me', () {
    final p = DoctorProfile.fromMeJson(profileJson());
    expect(p.displayName, 'Dr. Asha Rao');
    expect(p.isApproved, isTrue);
    expect(p.completion, 85);
    expect(p.documentCount, 1);
    expect(p.clinics.single.city, 'Pune');
    expect(p.availability.single.startTime, '10:00');
  });

  test('DoctorProfile with no name yet reads as an application', () {
    final json = profileJson(status: 'DRAFT');
    (json['profile'] as Map<String, dynamic>)
      ..['firstName'] = null
      ..['lastName'] = null;
    final p = DoctorProfile.fromMeJson(json);
    expect(p.displayName, 'Your application');
    expect(p.isEditableApplication, isTrue);
  });

  test('DoctorAppointment falls back to the mobile number when the patient has no name', () {
    final json = appointmentJson(id: 'a', scheduledAt: DateTime.utc(2026, 10, 10, 5, 30))..['patientUser'] = {'mobile': '+91999', 'patientProfile': null};
    final a = DoctorAppointment.fromJson(json);
    expect(a.patientName, '+91999');
    expect(a.consultationId, isNull);
    expect(a.scheduledAt.isUtc, isFalse, reason: 'shown in device-local time');
  });

  test('ConsultationDetail parses the doctor view of GET /consultations/[id]', () {
    final c = ConsultationDetail.fromJson(consultationJson(clinicalNote: {
      'ayurvedaAssessment': {'prakriti': 'Pitta', 'agni': 'Manda'},
      'diagnosis': 'Amlapitta',
      'followUpDate': '2026-10-24T00:00:00.000Z',
      'finalizedAt': null,
    }));
    expect(c.isVideo, isTrue);
    expect(c.reasonForVisit, 'Acidity');
    expect(c.clinicalNote?.ayurvedaAssessment, {'prakriti': 'Pitta', 'agni': 'Manda'});
    expect(c.clinicalNote?.followUpDate, '2026-10-24');
    expect(c.clinicalNote?.isFinalized, isFalse);
  });

  test('canWriteClinicalRecords is false only for CANCELLED', () {
    for (final s in ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']) {
      expect(ConsultationDetail.fromJson(consultationJson(status: s)).canWriteClinicalRecords, isTrue);
    }
    expect(ConsultationDetail.fromJson(consultationJson(status: 'CANCELLED')).canWriteClinicalRecords, isFalse);
  });

  test('PrescriptionItem.toJson omits empty optionals and preserves dates it does not edit', () {
    final item = PrescriptionItem.fromJson({
      'productName': ' Ashwagandha ',
      'dosage': '',
      'frequency': 'Twice daily',
      'durationDays': null,
      'route': null,
      'instructions': '  ',
      'startDate': '2026-10-10T00:00:00.000Z',
      'endDate': null,
    });
    expect(item.toJson(), {'productName': 'Ashwagandha', 'frequency': 'Twice daily', 'startDate': '2026-10-10'});
  });

  test('Recommendation parses both list routes', () {
    final d = Recommendation.diagnosticFromJson({
      'id': 'r1',
      'consultationId': 'cons1',
      'status': 'RECOMMENDED',
      'clinicalReason': 'x',
      'test': null,
      'package': {'name': 'Full body'},
    });
    expect(d.itemName, 'Full body');
    final p = Recommendation.panchakarmaFromJson({
      'id': 'r2',
      'consultationId': 'cons1',
      'status': 'BOOKED',
      'clinicalReason': null,
      'therapy': {'name': 'Shirodhara'},
      'sessionCountRecommended': 5,
    });
    expect(p.itemName, 'Shirodhara');
    expect(p.sessionCountRecommended, 5);
  });
}
