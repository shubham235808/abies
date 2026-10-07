import 'package:abies_mobile/features/appointments/domain/appointment_detail.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_hold.dart';
import 'package:abies_mobile/features/appointments/domain/appointment_slot.dart';
import 'package:abies_mobile/features/appointments/domain/review_submission.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> _fullAppointmentJson({required String status, required DateTime scheduledAt}) {
  return {
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
    'reasonForVisit': 'Follow-up',
    'paymentId': 'p1',
    'cancelledAt': null,
    'cancelledBy': null,
    'cancellationReason': null,
    'createdAt': DateTime.now().toIso8601String(),
    'updatedAt': DateTime.now().toIso8601String(),
    'doctorProfile': {'slug': 'dr-asha-rao', 'title': 'Dr.', 'firstName': 'Asha', 'lastName': 'Rao'},
    'careRecipientFamilyMember': null,
    'payment': {'status': 'SUCCESS', 'amount': 500},
    'clinic': {'name': 'Wellness Clinic', 'city': 'Pune'},
    'consultation': {'id': 'con1', 'status': 'SCHEDULED'},
  };
}

void main() {
  group('AppointmentSlot.fromJson', () {
    test('parses startsAt/endsAt/mode/clinicId', () {
      final slot = AppointmentSlot.fromJson({
        'startsAt': '2026-10-10T09:00:00.000Z',
        'endsAt': '2026-10-10T09:30:00.000Z',
        'mode': 'VIDEO',
        'clinicId': null,
      });

      expect(slot.mode, 'VIDEO');
      expect(slot.clinicId, isNull);
    });

    test('two slots with the same startsAt and mode are equal', () {
      final a = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 9), endsAt: DateTime(2026, 10, 10, 9, 30), mode: 'VIDEO');
      final b = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 9), endsAt: DateTime(2026, 10, 10, 9, 30), mode: 'VIDEO');

      expect(a, b);
      expect([b], contains(a));
    });

    test('a different mode at the same time is not equal', () {
      final a = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 9), endsAt: DateTime(2026, 10, 10, 9, 30), mode: 'VIDEO');
      final b = AppointmentSlot(startsAt: DateTime(2026, 10, 10, 9), endsAt: DateTime(2026, 10, 10, 9, 30), mode: 'CLINIC');

      expect(a == b, isFalse);
    });
  });

  group('AppointmentHold.fromJson', () {
    test("parses holdSlot()'s real { appointment, payment, razorpayOrder, razorpayKeyId } shape", () {
      final hold = AppointmentHold.fromJson({
        'appointment': {'id': 'appt1', 'status': 'PENDING_PAYMENT'},
        'payment': {'amount': 500, 'currency': 'INR'},
        'razorpayOrder': {'id': 'order_123', 'amount': 50000, 'currency': 'INR'},
        'razorpayKeyId': 'rzp_test_abc',
      });

      expect(hold.appointmentId, 'appt1');
      expect(hold.appointmentStatus, 'PENDING_PAYMENT');
      expect(hold.amount, 500);
      expect(hold.razorpayOrderId, 'order_123');
      expect(hold.razorpayKeyId, 'rzp_test_abc');
    });
  });

  group('AppointmentDetail.fromJson', () {
    test('parses the full listMineAsPatient() include shape', () {
      final appt = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1))));

      expect(appt.doctorName, 'Dr. Asha Rao');
      expect(appt.clinicName, 'Wellness Clinic');
      expect(appt.clinicCity, 'Pune');
      expect(appt.paymentStatus, 'SUCCESS');
      expect(appt.paymentAmount, 500);
      expect(appt.consultationStatus, 'SCHEDULED');
      expect(appt.reasonForVisit, 'Follow-up');
    });

    test('tolerates the thin, un-included shape /cancel actually returns', () {
      final json = {
        'id': 'a1',
        'scheduledAt': DateTime.now().add(const Duration(days: 1)).toIso8601String(),
        'durationMinutes': 30,
        'status': 'CANCELLED',
        'mode': 'VIDEO',
        'reasonForVisit': null,
        'cancelledAt': DateTime.now().toIso8601String(),
        'cancellationReason': 'Patient request',
      };

      final appt = AppointmentDetail.fromJson(json);

      expect(appt.doctorName, isNull);
      expect(appt.clinicName, isNull);
      expect(appt.paymentStatus, isNull);
      expect(appt.cancellationReason, 'Patient request');
    });

    test('isUpcoming matches AppointmentSummary\'s rule (future and not cancelled)', () {
      final future = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1))));
      final cancelled = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'CANCELLED', scheduledAt: DateTime.now().add(const Duration(days: 1))));
      final past = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'COMPLETED', scheduledAt: DateTime.now().subtract(const Duration(days: 1))));

      expect(future.isUpcoming, isTrue);
      expect(cancelled.isUpcoming, isFalse);
      expect(past.isUpcoming, isFalse);
    });

    test('canCancel is true only for PENDING_PAYMENT/CONFIRMED', () {
      for (final status in ['PENDING_PAYMENT', 'CONFIRMED']) {
        final appt = AppointmentDetail.fromJson(_fullAppointmentJson(status: status, scheduledAt: DateTime.now().add(const Duration(days: 1))));
        expect(appt.canCancel, isTrue, reason: status);
      }
      for (final status in ['CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED']) {
        final appt = AppointmentDetail.fromJson(_fullAppointmentJson(status: status, scheduledAt: DateTime.now().add(const Duration(days: 1))));
        expect(appt.canCancel, isFalse, reason: status);
      }
    });

    test('canReview is true only for COMPLETED', () {
      final completed = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'COMPLETED', scheduledAt: DateTime.now().subtract(const Duration(days: 1))));
      final confirmed = AppointmentDetail.fromJson(_fullAppointmentJson(status: 'CONFIRMED', scheduledAt: DateTime.now().add(const Duration(days: 1))));

      expect(completed.canReview, isTrue);
      expect(confirmed.canReview, isFalse);
    });
  });

  group('ReviewSubmission.fromJson', () {
    test('parses the created review row', () {
      final review = ReviewSubmission.fromJson({'id': 'r1', 'rating': 5, 'comment': 'Great doctor'});
      expect(review.id, 'r1');
      expect(review.rating, 5);
      expect(review.comment, 'Great doctor');
    });
  });
}
