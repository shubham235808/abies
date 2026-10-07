import 'package:abies_mobile/features/prescriptions/domain/prescription_match_item.dart';
import 'package:abies_mobile/features/prescriptions/domain/prescription_summary.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PrescriptionSummary.fromJson', () {
    test('parses listFinalizedPrescriptionsForPatient() shape, including doctor name and items', () {
      final prescription = PrescriptionSummary.fromJson({
        'id': 'p1',
        'status': 'FINALIZED',
        'finalizedAt': '2026-01-01T00:00:00.000Z',
        'doctorNotes': 'Take with food',
        'doctorProfile': {'title': 'Dr.', 'firstName': 'Asha', 'lastName': 'Rao'},
        'items': [
          {
            'id': 'pi1',
            'medicineId': 'm1',
            'productName': 'Paracetamol',
            'dosage': '500mg',
            'frequency': 'Twice daily',
            'durationDays': 5,
            'route': 'Oral',
            'instructions': 'After meals',
            'startDate': null,
            'endDate': null,
          },
        ],
      });

      expect(prescription.doctorName, 'Dr. Asha Rao');
      expect(prescription.items.single.productName, 'Paracetamol');
      expect(prescription.items.single.medicineId, 'm1');
    });

    test('a free-text/compounded item has a null medicineId', () {
      final prescription = PrescriptionSummary.fromJson({
        'id': 'p1',
        'status': 'FINALIZED',
        'finalizedAt': null,
        'doctorNotes': null,
        'doctorProfile': null,
        'items': [
          {
            'id': 'pi1',
            'medicineId': null,
            'productName': 'Custom compound',
            'dosage': null,
            'frequency': null,
            'durationDays': null,
            'route': null,
            'instructions': null,
            'startDate': null,
            'endDate': null,
          },
        ],
      });

      expect(prescription.doctorName, isNull);
      expect(prescription.items.single.medicineId, isNull);
    });
  });

  group('PrescriptionMatchItem.fromJson', () {
    test('parses matchPrescriptionAtPharmacy() shape for an available item', () {
      final item = PrescriptionMatchItem.fromJson({
        'prescriptionItemId': 'pi1',
        'productName': 'Paracetamol',
        'medicineId': 'm1',
        'available': true,
        'quantityAvailable': 30,
        'price': 20,
      });
      expect(item.available, isTrue);
      expect(item.price, 20);
    });

    test('an unresolved/unstocked item is unavailable with no price', () {
      final item = PrescriptionMatchItem.fromJson({
        'prescriptionItemId': 'pi2',
        'productName': 'Custom compound',
        'medicineId': null,
        'available': false,
        'quantityAvailable': 0,
        'price': null,
      });
      expect(item.medicineId, isNull);
      expect(item.available, isFalse);
      expect(item.price, isNull);
    });
  });
}
