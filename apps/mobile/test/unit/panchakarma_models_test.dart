import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_creation.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_booking_detail.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_centre.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_facets.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_search_result.dart';
import 'package:abies_mobile/features/panchakarma/domain/panchakarma_therapy.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PanchakarmaTherapy.fromJson', () {
    test("parses searchPublic()'s real PublicTherapy shape", () {
      final therapy = PanchakarmaTherapy.fromJson({
        'id': 't1',
        'name': 'Abhyanga',
        'description': 'Full body oil massage',
        'durationMinutes': 60,
        'prerequisites': 'Empty stomach',
        'contraindications': 'Pregnancy',
        'price': 1500,
        'requiredSupervision': true,
        'centre': {'id': 'c1', 'name': 'Wellness Centre', 'city': 'Pune', 'state': 'MH'},
      });

      expect(therapy.id, 't1');
      expect(therapy.name, 'Abhyanga');
      expect(therapy.durationMinutes, 60);
      expect(therapy.price, 1500);
      expect(therapy.requiredSupervision, isTrue);
      expect(therapy.centreId, 'c1');
      expect(therapy.centreName, 'Wellness Centre');
      expect(therapy.centreCity, 'Pune');
      expect(therapy.centreState, 'MH');
    });

    test('value equality is by id+centreId, not identity', () {
      final a = PanchakarmaTherapy.fromJson({
        'id': 't1',
        'name': 'Abhyanga',
        'description': null,
        'durationMinutes': 60,
        'prerequisites': null,
        'contraindications': null,
        'price': 1500,
        'requiredSupervision': false,
        'centre': {'id': 'c1', 'name': 'A', 'city': 'Pune', 'state': 'MH'},
      });
      final b = PanchakarmaTherapy.fromJson({
        'id': 't1',
        'name': 'Abhyanga (different name read later)',
        'description': null,
        'durationMinutes': 90,
        'prerequisites': null,
        'contraindications': null,
        'price': 2000,
        'requiredSupervision': true,
        'centre': {'id': 'c1', 'name': 'A', 'city': 'Pune', 'state': 'MH'},
      });
      final differentCentre = PanchakarmaTherapy.fromJson({
        'id': 't1',
        'name': 'Abhyanga',
        'description': null,
        'durationMinutes': 60,
        'prerequisites': null,
        'contraindications': null,
        'price': 1500,
        'requiredSupervision': false,
        'centre': {'id': 'c2', 'name': 'B', 'city': 'Pune', 'state': 'MH'},
      });

      expect(a, b);
      expect(a == differentCentre, isFalse);
    });
  });

  group('PanchakarmaSearchResult.fromJson', () {
    test('parses { total, therapies } with no offset/limit field', () {
      final result = PanchakarmaSearchResult.fromJson({
        'total': 2,
        'therapies': [
          {
            'id': 't1',
            'name': 'Abhyanga',
            'description': null,
            'durationMinutes': 60,
            'prerequisites': null,
            'contraindications': null,
            'price': 1500,
            'requiredSupervision': false,
            'centre': {'id': 'c1', 'name': 'A', 'city': 'Pune', 'state': 'MH'},
          },
        ],
      });

      expect(result.total, 2);
      expect(result.therapies, hasLength(1));
    });
  });

  group('PanchakarmaFacets.fromJson', () {
    test('parses { cities } only', () {
      final facets = PanchakarmaFacets.fromJson({'cities': ['Pune', 'Mumbai']});
      expect(facets.cities, ['Pune', 'Mumbai']);
    });
  });

  group('PanchakarmaCentre.fromJson', () {
    test("parses listApprovedCentres()'s thin { id, name, city, state } shape", () {
      final centre = PanchakarmaCentre.fromJson({'id': 'c1', 'name': 'Wellness Centre', 'city': 'Pune', 'state': 'MH'});
      expect(centre.id, 'c1');
      expect(centre.name, 'Wellness Centre');
      expect(centre.city, 'Pune');
      expect(centre.state, 'MH');
    });
  });

  group('PanchakarmaBookingCreationResult.fromJson', () {
    test("parses bookTherapy()'s real { booking, payment, razorpayOrder, razorpayKeyId } shape", () {
      final result = PanchakarmaBookingCreationResult.fromJson({
        'booking': {'id': 'b1', 'status': 'BOOKED'},
        'payment': {'amount': 4500, 'currency': 'INR'},
        'razorpayOrder': {'id': 'order_1', 'amount': 450000, 'currency': 'INR'},
        'razorpayKeyId': 'rzp_test_abc',
      });

      expect(result.bookingId, 'b1');
      expect(result.bookingStatus, 'BOOKED');
      expect(result.amount, 4500);
      expect(result.razorpayOrderId, 'order_1');
      expect(result.razorpayKeyId, 'rzp_test_abc');
    });
  });

  group('PanchakarmaBookingDetail.fromJson', () {
    test("parses listMineAsPatient()'s shape (centre{name}, therapy{name}, bare sessions)", () {
      final booking = PanchakarmaBookingDetail.fromJson({
        'id': 'b1',
        'centreId': 'c1',
        'therapyId': 't1',
        'sessionCount': 3,
        'status': 'SCHEDULED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': null,
        'cancellationReason': null,
        'centre': {'name': 'Wellness Centre'},
        'therapy': {'name': 'Abhyanga'},
        'sessions': [
          {
            'id': 's1',
            'sessionNumber': 1,
            'therapistId': null,
            'scheduledAt': DateTime.now().toIso8601String(),
            'attendedAt': null,
            'notes': null,
            'exceptionFlag': null,
          },
        ],
      });

      expect(booking.centreName, 'Wellness Centre');
      expect(booking.centreCity, isNull, reason: "mine()'s centre select only reads { name: true }");
      expect(booking.therapyName, 'Abhyanga');
      expect(booking.therapyDurationMinutes, isNull);
      expect(booking.paymentStatus, isNull, reason: "mine()'s include has no payment join at all");
      expect(booking.sessions.single.sessionNumber, 1);
      expect(booking.sessions.single.therapistName, isNull, reason: "mine()'s sessions include has no therapist join");
    });

    test("parses getBooking()'s full detail shape (full centre, therapy+duration, session.therapist, payment)", () {
      final booking = PanchakarmaBookingDetail.fromJson({
        'id': 'b1',
        'centreId': 'c1',
        'therapyId': 't1',
        'sessionCount': 2,
        'status': 'SCHEDULED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': null,
        'cancellationReason': null,
        'centre': {'id': 'c1', 'name': 'Wellness Centre', 'city': 'Pune', 'state': 'MH', 'userId': 'u-centre'},
        'therapy': {'name': 'Abhyanga', 'durationMinutes': 60},
        'sessions': [
          {
            'id': 's1',
            'sessionNumber': 1,
            'therapistId': 'th1',
            'scheduledAt': DateTime.now().toIso8601String(),
            'attendedAt': DateTime.now().toIso8601String(),
            'notes': 'Went well',
            'exceptionFlag': null,
            'therapist': {'name': 'Ravi Kumar'},
          },
        ],
        'payment': {'status': 'PENDING', 'amount': 3000},
      });

      expect(booking.centreCity, 'Pune');
      expect(booking.therapyDurationMinutes, 60);
      expect(booking.paymentStatus, 'PENDING');
      expect(booking.paymentAmount, 3000);
      expect(booking.sessions.single.therapistName, 'Ravi Kumar');
      expect(booking.sessions.single.isAttended, isTrue);
    });

    test('tolerates the thin, un-included shape /cancel actually returns', () {
      final booking = PanchakarmaBookingDetail.fromJson({
        'id': 'b1',
        'centreId': 'c1',
        'therapyId': 't1',
        'sessionCount': 2,
        'status': 'CANCELLED',
        'createdAt': DateTime.now().toIso8601String(),
        'cancelledAt': DateTime.now().toIso8601String(),
        'cancellationReason': 'Patient request',
        'sessions': [],
      });

      expect(booking.centreName, isNull);
      expect(booking.therapyName, isNull);
      expect(booking.paymentStatus, isNull);
      expect(booking.cancellationReason, 'Patient request');
      expect(booking.sessions, isEmpty);
    });

    test('canCancel is true only for BOOKED/SCHEDULED', () {
      for (final status in ['BOOKED', 'SCHEDULED']) {
        final booking = PanchakarmaBookingDetail.fromJson(_bareBooking(status: status));
        expect(booking.canCancel, isTrue, reason: status);
      }
      for (final status in ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RECOMMENDED']) {
        final booking = PanchakarmaBookingDetail.fromJson(_bareBooking(status: status));
        expect(booking.canCancel, isFalse, reason: status);
      }
    });

    test('isActive is false only for COMPLETED/CANCELLED', () {
      for (final status in ['BOOKED', 'SCHEDULED', 'IN_PROGRESS', 'RECOMMENDED']) {
        expect(PanchakarmaBookingDetail.fromJson(_bareBooking(status: status)).isActive, isTrue, reason: status);
      }
      for (final status in ['COMPLETED', 'CANCELLED']) {
        expect(PanchakarmaBookingDetail.fromJson(_bareBooking(status: status)).isActive, isFalse, reason: status);
      }
    });
  });
}

Map<String, dynamic> _bareBooking({required String status}) {
  return {
    'id': 'b1',
    'centreId': 'c1',
    'therapyId': 't1',
    'sessionCount': 1,
    'status': status,
    'createdAt': DateTime.now().toIso8601String(),
    'cancelledAt': null,
    'cancellationReason': null,
    'sessions': [],
  };
}
