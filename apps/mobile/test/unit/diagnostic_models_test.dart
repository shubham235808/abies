import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_creation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_booking_target.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_facets.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_order_detail.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_package_summary.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_recommendation.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_report_ref.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_search_result.dart';
import 'package:abies_mobile/features/diagnostics/domain/diagnostic_test_summary.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _labJson({String id = 'lab1', String? name = 'City Diagnostics', bool homeCollection = true}) {
  return {'id': id, 'name': name, 'serviceCities': ['Pune'], 'homeCollectionSupported': homeCollection};
}

Map<String, dynamic> _testJson({String id = 't1', String labId = 'lab1', int price = 500}) {
  return {
    'id': id,
    'code': 'CBC',
    'name': 'Complete Blood Count',
    'description': 'Standard blood panel',
    'sampleType': 'Blood',
    'preparationInstructions': 'Fasting not required',
    'price': price,
    'turnaroundHours': 24,
    'lab': _labJson(id: labId),
  };
}

Map<String, dynamic> _packageJson({String id = 'p1', String labId = 'lab1', int price = 1200}) {
  return {
    'id': id,
    'name': 'Full Body Checkup',
    'description': 'Comprehensive panel',
    'price': price,
    'testNames': ['CBC', 'Lipid Profile'],
    'lab': _labJson(id: labId),
  };
}

void main() {
  group('DiagnosticTestSummary.fromJson', () {
    test("parses searchPublic()'s real PublicTest shape", () {
      final test = DiagnosticTestSummary.fromJson(_testJson());
      expect(test.id, 't1');
      expect(test.code, 'CBC');
      expect(test.name, 'Complete Blood Count');
      expect(test.price, 500);
      expect(test.turnaroundHours, 24);
      expect(test.labId, 'lab1');
      expect(test.labName, 'City Diagnostics');
      expect(test.labServiceCities, ['Pune']);
      expect(test.labHomeCollectionSupported, isTrue);
    });

    test('value equality is by id+labId, not identity', () {
      final a = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab1'));
      final b = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab1', price: 999));
      final differentLab = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab2'));
      expect(a, b);
      expect(a == differentLab, isFalse);
    });
  });

  group('DiagnosticPackageSummary.fromJson', () {
    test("parses searchPackagesPublic()'s real PublicPackage shape", () {
      final package = DiagnosticPackageSummary.fromJson(_packageJson());
      expect(package.id, 'p1');
      expect(package.name, 'Full Body Checkup');
      expect(package.price, 1200);
      expect(package.testNames, ['CBC', 'Lipid Profile']);
      expect(package.labId, 'lab1');
      expect(package.labHomeCollectionSupported, isTrue);
    });
  });

  group('DiagnosticTestSearchResult.fromJson', () {
    test('parses { total, tests } with no offset/limit field', () {
      final result = DiagnosticTestSearchResult.fromJson({'total': 2, 'tests': [_testJson()]});
      expect(result.total, 2);
      expect(result.tests, hasLength(1));
    });
  });

  group('DiagnosticPackageSearchResult.fromJson', () {
    test('parses { total, packages }', () {
      final result = DiagnosticPackageSearchResult.fromJson({'total': 1, 'packages': [_packageJson()]});
      expect(result.total, 1);
      expect(result.packages, hasLength(1));
    });
  });

  group('DiagnosticFacets.fromJson', () {
    test('parses { cities } only', () {
      final facets = DiagnosticFacets.fromJson({'cities': ['Pune', 'Mumbai']});
      expect(facets.cities, ['Pune', 'Mumbai']);
    });
  });

  group('DiagnosticBookingTarget', () {
    test('forTests requires a non-empty list from a single lab', () {
      final t1 = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab1'));
      final t2 = DiagnosticTestSummary.fromJson(_testJson(id: 't2', labId: 'lab1'));
      final target = DiagnosticBookingTarget.forTests([t1, t2]);

      expect(target.kind, DiagnosticBookingKind.tests);
      expect(target.testIds, ['t1', 't2']);
      expect(target.packageId, isNull, reason: 'testIds and packageId are mutually exclusive');
      expect(target.totalPrice, t1.price + t2.price);
      expect(target.labId, 'lab1');
    });

    test('forTests throws if the tests are from different labs', () {
      final t1 = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab1'));
      final t2 = DiagnosticTestSummary.fromJson(_testJson(id: 't2', labId: 'lab2'));
      expect(() => DiagnosticBookingTarget.forTests([t1, t2]), throwsArgumentError);
    });

    test('forTests throws on an empty list', () {
      expect(() => DiagnosticBookingTarget.forTests(const []), throwsArgumentError);
    });

    test('forPackage sets packageId and leaves testIds null', () {
      final package = DiagnosticPackageSummary.fromJson(_packageJson());
      final target = DiagnosticBookingTarget.forPackage(package);

      expect(target.kind, DiagnosticBookingKind.package);
      expect(target.packageId, 'p1');
      expect(target.testIds, isNull, reason: 'testIds and packageId are mutually exclusive');
      expect(target.totalPrice, package.price);
    });

    test('value equality for a tests target is order-independent by id set', () {
      final t1 = DiagnosticTestSummary.fromJson(_testJson(id: 't1', labId: 'lab1'));
      final t2 = DiagnosticTestSummary.fromJson(_testJson(id: 't2', labId: 'lab1'));
      final a = DiagnosticBookingTarget.forTests([t1, t2]);
      final b = DiagnosticBookingTarget.forTests([t2, t1]);
      expect(a, b);
    });
  });

  group('DiagnosticBookingCreationResult.fromJson', () {
    test("parses bookOrder()'s real raw { order, payment, razorpayOrder, razorpayKeyId } shape", () {
      final result = DiagnosticBookingCreationResult.fromJson({
        'order': {'id': 'o1', 'status': 'BOOKED'},
        'payment': {'amount': 500, 'currency': 'INR'},
        'razorpayOrder': {'id': 'order_1', 'amount': 50000, 'currency': 'INR'},
        'razorpayKeyId': 'rzp_test_abc',
      });

      expect(result.orderId, 'o1');
      expect(result.orderStatus, 'BOOKED');
      expect(result.amount, 500);
      expect(result.razorpayOrderId, 'order_1');
      expect(result.razorpayKeyId, 'rzp_test_abc');
    });
  });

  group('DiagnosticOrderDetail.fromJson', () {
    test("parses listMineAsPatient()'s shape (lab{name}, items, thin report, no payment)", () {
      final order = DiagnosticOrderDetail.fromJson({
        'id': 'o1',
        'labId': 'lab1',
        'collectionMode': 'LAB_VISIT',
        'scheduledAt': DateTime.now().toIso8601String(),
        'address': null,
        'status': 'SCHEDULED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': null,
        'cancellationReason': null,
        'lab': {'name': 'City Diagnostics'},
        'items': [
          {'test': {'name': 'CBC'}, 'package': null, 'price': 500},
        ],
        'report': {'releasedToPatientAt': null, 'criticalFlag': false},
      });

      expect(order.labId, 'lab1');
      expect(order.labName, 'City Diagnostics');
      expect(order.items.single.testName, 'CBC');
      expect(order.hasReport, isFalse);
      expect(order.paymentStatus, isNull, reason: "mine()'s include has no payment join at all");
      expect(order.paymentAmount, isNull);
    });

    test("parses getOrder()'s full detail shape (full lab, sampleCollection n/a, full report, payment)", () {
      final order = DiagnosticOrderDetail.fromJson({
        'id': 'o1',
        'labId': 'lab1',
        'collectionMode': 'HOME',
        'scheduledAt': DateTime.now().toIso8601String(),
        'address': '221B Baker Street',
        'status': 'COMPLETED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': null,
        'cancellationReason': null,
        'lab': {'id': 'lab1', 'name': 'City Diagnostics', 'serviceCities': ['Pune'], 'homeCollectionSupported': true},
        'items': [
          {'test': {'name': 'CBC', 'code': 'CBC'}, 'package': null, 'price': 500},
        ],
        'report': {
          'id': 'dr1',
          'releasedToPatientAt': DateTime.now().toIso8601String(),
          'criticalFlag': true,
        },
        'payment': {'status': 'SUCCESS', 'amount': 500},
      });

      expect(order.hasReport, isTrue);
      expect(order.reportCriticalFlag, isTrue);
      expect(order.paymentStatus, 'SUCCESS');
      expect(order.paymentAmount, 500);
      expect(order.isActive, isFalse, reason: 'COMPLETED is not active');
      expect(order.canCancel, isFalse, reason: 'COMPLETED cannot be cancelled');
    });

    test("tolerates cancel()'s thin, un-included shape", () {
      final order = DiagnosticOrderDetail.fromJson({
        'id': 'o1',
        'labId': 'lab1',
        'collectionMode': 'LAB_VISIT',
        'scheduledAt': null,
        'address': null,
        'status': 'CANCELLED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': DateTime.now().toIso8601String(),
        'cancellationReason': 'Patient request',
      });

      expect(order.labName, isNull);
      expect(order.items, isEmpty);
      expect(order.hasReport, isFalse);
      expect(order.cancellationReason, 'Patient request');
      expect(order.isActive, isFalse);
      expect(order.canCancel, isFalse);
    });

    test('canCancel is true only for BOOKED/SCHEDULED', () {
      for (final status in ['BOOKED', 'SCHEDULED']) {
        expect(DiagnosticOrderDetail.fromJson(_bareOrder(status: status)).canCancel, isTrue, reason: status);
      }
      for (final status in ['SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED', 'CANCELLED']) {
        expect(DiagnosticOrderDetail.fromJson(_bareOrder(status: status)).canCancel, isFalse, reason: status);
      }
    });
  });

  group('DiagnosticRecommendation.fromJson', () {
    test("parses listMineAsPatient()'s shape for a test recommendation", () {
      final rec = DiagnosticRecommendation.fromJson({
        'id': 'r1',
        'testId': 't1',
        'packageId': null,
        'clinicalReason': 'Routine checkup',
        'targetCompletionDate': null,
        'status': 'RECOMMENDED',
        'createdAt': DateTime.now().toIso8601String(),
        'doctorProfile': {'slug': 'dr-x', 'title': 'Dr.', 'firstName': 'Asha', 'lastName': 'Rao'},
        'test': {'name': 'Complete Blood Count'},
        'package': null,
      });

      expect(rec.itemName, 'Complete Blood Count');
      expect(rec.doctorName, 'Dr. Asha Rao');
      expect(rec.canBookFrom, isTrue);
    });

    test('canBookFrom is false once BOOKED/FULFILLED', () {
      for (final status in ['BOOKED', 'FULFILLED', 'CANCELLED']) {
        final rec = DiagnosticRecommendation.fromJson({
          'id': 'r1',
          'testId': 't1',
          'packageId': null,
          'clinicalReason': null,
          'targetCompletionDate': null,
          'status': status,
          'createdAt': DateTime.now().toIso8601String(),
          'doctorProfile': null,
          'test': {'name': 'CBC'},
          'package': null,
        });
        expect(rec.canBookFrom, isFalse, reason: status);
      }
    });
  });

  group('DiagnosticReportRef.fromJson', () {
    test("parses GET /api/v1/reports/mine's generic Report row shape", () {
      final ref = DiagnosticReportRef.fromJson({
        'id': 'rep1',
        'kind': 'DIAGNOSTIC_REPORT',
        'sourceEntityType': 'DiagnosticOrder',
        'sourceEntityId': 'o1',
        'storageKey': 'diagnostic-reports/o1/report.pdf',
        'createdAt': DateTime.now().toIso8601String(),
      });

      expect(ref.id, 'rep1');
      expect(ref.sourceEntityType, 'DiagnosticOrder');
      expect(ref.sourceEntityId, 'o1');
    });
  });
}

Map<String, dynamic> _bareOrder({required String status}) {
  return {
    'id': 'o1',
    'labId': 'lab1',
    'collectionMode': 'LAB_VISIT',
    'scheduledAt': null,
    'address': null,
    'status': status,
    'createdAt': DateTime.now().toIso8601String(),
    'cancelledAt': null,
    'cancellationReason': null,
  };
}
