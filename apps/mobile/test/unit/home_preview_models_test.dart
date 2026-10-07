import 'package:abies_mobile/features/home/domain/diagnostic_order_summary.dart';
import 'package:abies_mobile/features/home/domain/diagnostic_preview.dart';
import 'package:abies_mobile/features/home/domain/doctor_preview.dart';
import 'package:abies_mobile/features/home/domain/medicine_order_summary.dart';
import 'package:abies_mobile/features/home/domain/medicine_preview.dart';
import 'package:abies_mobile/features/home/domain/panchakarma_booking_summary.dart';
import 'package:abies_mobile/features/home/domain/panchakarma_preview.dart';
import 'package:abies_mobile/features/home/domain/appointment_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('DoctorPreview.fromJson', () {
    test('parses the real GET /public/doctors shape, including the first active clinic city', () {
      final json = {
        'id': 'doc1',
        'slug': 'dr-asha-rao',
        'name': 'Dr. Asha Rao',
        'specialties': ['Panchakarma'],
        'rating': 4.5,
        'startingFee': 500,
        'photoUrl': '/api/v1/public/doctors/dr-asha-rao/photo',
        'clinics': [
          {'id': 'c1', 'name': 'Wellness Clinic', 'city': 'Pune'},
        ],
      };

      final doctor = DoctorPreview.fromJson(json);

      expect(doctor.name, 'Dr. Asha Rao');
      expect(doctor.specialties, ['Panchakarma']);
      expect(doctor.rating, 4.5);
      expect(doctor.startingFee, 500);
      expect(doctor.city, 'Pune');
    });

    test('tolerates no clinics and a null rating/startingFee/photoUrl', () {
      final json = {
        'id': 'doc2',
        'slug': 'dr-new',
        'name': 'Dr. New',
        'specialties': <String>[],
        'rating': null,
        'startingFee': null,
        'photoUrl': null,
        'clinics': <dynamic>[],
      };

      final doctor = DoctorPreview.fromJson(json);

      expect(doctor.rating, isNull);
      expect(doctor.startingFee, isNull);
      expect(doctor.city, isNull);
    });
  });

  group('PanchakarmaPreview.fromJson', () {
    test('parses the real GET /public/panchakarma therapies[] shape', () {
      final json = {
        'id': 't1',
        'name': 'Abhyanga',
        'description': 'Full body massage',
        'durationMinutes': 60,
        'prerequisites': null,
        'contraindications': null,
        'price': 1500,
        'requiredSupervision': false,
        'centre': {'id': 'ctr1', 'name': 'Serenity Centre', 'city': 'Pune', 'state': 'MH'},
      };

      final therapy = PanchakarmaPreview.fromJson(json);

      expect(therapy.name, 'Abhyanga');
      expect(therapy.durationMinutes, 60);
      expect(therapy.price, 1500);
      expect(therapy.centreName, 'Serenity Centre');
      expect(therapy.centreCity, 'Pune');
    });
  });

  group('DiagnosticPreview.fromJson', () {
    test('parses the real GET /public/diagnostics tests[] shape', () {
      final json = {
        'id': 'd1',
        'code': 'CBC',
        'name': 'Complete Blood Count',
        'description': null,
        'sampleType': 'Blood',
        'preparationInstructions': null,
        'price': 300,
        'turnaroundHours': 24,
        'lab': {'id': 'lab1', 'name': 'City Lab', 'serviceCities': ['Pune'], 'homeCollectionSupported': true},
      };

      final test_ = DiagnosticPreview.fromJson(json);

      expect(test_.name, 'Complete Blood Count');
      expect(test_.price, 300);
      expect(test_.turnaroundHours, 24);
      expect(test_.labName, 'City Lab');
    });
  });

  group('MedicinePreview.fromJson', () {
    test('parses the real GET /public/medicines medicines[] grouped-listing shape', () {
      final json = {
        'medicineId': 'm1',
        'name': 'Ashwagandha Tablets',
        'genericName': 'Ashwagandha',
        'form': 'Tablet',
        'strength': '500mg',
        'brandName': 'Himalaya',
        'imageUrl': null,
        'pharmacy': {'id': 'ph1', 'name': 'ABIES Pharmacy', 'serviceAreas': ['Pune']},
        'quantityAvailable': 10,
        'price': 199,
        'rating': 4.2,
        'reviewCount': 5,
        'isFmcg': false,
        'variants': <dynamic>[],
      };

      final medicine = MedicinePreview.fromJson(json);

      expect(medicine.name, 'Ashwagandha Tablets');
      expect(medicine.brandName, 'Himalaya');
      expect(medicine.price, 199);
      expect(medicine.pharmacyName, 'ABIES Pharmacy');
    });
  });

  group('AppointmentSummary.fromJson and isUpcoming', () {
    Map<String, dynamic> baseJson({required String status, required DateTime scheduledAt}) => {
          'id': 'a1',
          'patientUserId': 'u1',
          'careRecipientFamilyMemberId': null,
          'doctorProfileId': 'doc1',
          'slotId': 's1',
          'mode': 'VIDEO',
          'clinicId': null,
          'scheduledAt': scheduledAt.toIso8601String(),
          'durationMinutes': 30,
          'status': status,
          'reasonForVisit': null,
          'paymentId': null,
          'cancelledAt': null,
          'cancelledBy': null,
          'cancellationReason': null,
          'createdAt': DateTime.now().toIso8601String(),
          'updatedAt': DateTime.now().toIso8601String(),
          'doctorProfile': {'slug': 'dr-asha-rao', 'title': 'Dr.', 'firstName': 'Asha', 'lastName': 'Rao'},
          'careRecipientFamilyMember': null,
          'payment': {'status': 'SUCCESS', 'amount': 500},
          'clinic': null,
          'consultation': null,
        };

    test('parses doctorProfile into a display name', () {
      final appt = AppointmentSummary.fromJson(baseJson(status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1))));

      expect(appt.doctorName, 'Dr. Asha Rao');
      expect(appt.mode, 'VIDEO');
    });

    test('a future, non-cancelled appointment is upcoming', () {
      final appt = AppointmentSummary.fromJson(baseJson(status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1))));
      expect(appt.isUpcoming, isTrue);
    });

    test('a future, cancelled appointment is not upcoming', () {
      final appt = AppointmentSummary.fromJson(baseJson(status: 'CANCELLED', scheduledAt: DateTime.now().add(const Duration(days: 1))));
      expect(appt.isUpcoming, isFalse);
    });

    test('a past, non-cancelled appointment is not upcoming', () {
      final appt = AppointmentSummary.fromJson(baseJson(status: 'COMPLETED', scheduledAt: DateTime.now().subtract(const Duration(days: 1))));
      expect(appt.isUpcoming, isFalse);
    });
  });

  group('MedicineOrderSummary.isActive', () {
    Map<String, dynamic> json(String status) => {
          'id': 'o1',
          'status': status,
          'createdAt': DateTime.now().toIso8601String(),
          'pharmacy': {'name': 'ABIES Pharmacy'},
          'items': [
            {'id': 'i1'}
          ],
        };

    test('PENDING/ACCEPTED/PACKING/DISPATCHED are active', () {
      for (final status in ['PENDING', 'ACCEPTED', 'PACKING', 'DISPATCHED']) {
        expect(MedicineOrderSummary.fromJson(json(status)).isActive, isTrue, reason: status);
      }
    });

    test('DELIVERED and CANCELLED are not active', () {
      for (final status in ['DELIVERED', 'CANCELLED']) {
        expect(MedicineOrderSummary.fromJson(json(status)).isActive, isFalse, reason: status);
      }
    });

    test('itemCount comes from the items array length', () {
      expect(MedicineOrderSummary.fromJson(json('PENDING')).itemCount, 1);
    });
  });

  group('DiagnosticOrderSummary.isActive', () {
    Map<String, dynamic> json(String status) => {
          'id': 'o1',
          'status': status,
          'createdAt': DateTime.now().toIso8601String(),
          'lab': {'name': 'City Lab'},
          'items': <dynamic>[],
        };

    test('BOOKED/SCHEDULED/SAMPLE_COLLECTED/PROCESSING are active', () {
      for (final status in ['BOOKED', 'SCHEDULED', 'SAMPLE_COLLECTED', 'PROCESSING']) {
        expect(DiagnosticOrderSummary.fromJson(json(status)).isActive, isTrue, reason: status);
      }
    });

    test('COMPLETED and CANCELLED are not active', () {
      for (final status in ['COMPLETED', 'CANCELLED']) {
        expect(DiagnosticOrderSummary.fromJson(json(status)).isActive, isFalse, reason: status);
      }
    });
  });

  group('PanchakarmaBookingSummary.isActive', () {
    Map<String, dynamic> json(String status) => {
          'id': 'b1',
          'status': status,
          'createdAt': DateTime.now().toIso8601String(),
          'centre': {'name': 'Serenity Centre'},
          'therapy': {'name': 'Abhyanga'},
          'sessionCount': 3,
        };

    test('RECOMMENDED/BOOKED/SCHEDULED/IN_PROGRESS are active', () {
      for (final status in ['RECOMMENDED', 'BOOKED', 'SCHEDULED', 'IN_PROGRESS']) {
        expect(PanchakarmaBookingSummary.fromJson(json(status)).isActive, isTrue, reason: status);
      }
    });

    test('COMPLETED and CANCELLED are not active', () {
      for (final status in ['COMPLETED', 'CANCELLED']) {
        expect(PanchakarmaBookingSummary.fromJson(json(status)).isActive, isFalse, reason: status);
      }
    });
  });
}
