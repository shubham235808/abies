import 'package:abies_panchakarma/core/router/app_router.dart';
import 'package:abies_panchakarma/features/centre/domain/centre_models.dart';
import 'package:abies_panchakarma/features/centre/presentation/catalogue_screens.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

void main() {
  group('CentreBooking.fromJson', () {
    test('parses the detail shape including therapist and payment', () {
      final b = CentreBooking.fromJson(bookingJson(
        status: 'IN_PROGRESS',
        sessions: [
          sessionJson(id: 's2', n: 2, at: DateTime.utc(2026, 10, 12)),
          sessionJson(id: 's1', n: 1, at: DateTime.utc(2026, 10, 11), attendedAt: DateTime.utc(2026, 10, 11), therapist: 'Meera'),
        ],
      ));
      expect(b.status, BookingStatus.inProgress);
      expect(b.sessions.map((s) => s.sessionNumber), [1, 2]);
      expect(b.sessions.first.therapistName, 'Meera');
      expect(b.attendedCount, 1);
      expect(b.paymentAmount, 3000);
      expect(b.therapyDurationMinutes, 60);
    });

    test('falls back to the patient mobile when there is no profile name', () {
      expect(CentreBooking.fromJson(bookingJson(withProfile: false)).patientName, '+919800000000');
    });
  });

  test('CentreProfile editability follows centres.service.ts editableStatus', () {
    expect(CentreProfile.fromJson(centreJson(status: 'DRAFT')).isEditable, isTrue);
    expect(CentreProfile.fromJson(centreJson(status: 'REJECTED')).isEditable, isTrue);
    expect(CentreProfile.fromJson(centreJson(status: 'SUBMITTED')).isEditable, isFalse);
    expect(CentreProfile.fromJson(centreJson(status: 'APPROVED')).isEditable, isFalse);
  });

  test('CentreProfileInput drops empty strings and blank license numbers', () {
    const input = CentreProfileInput(
      name: ' Kerala Wellness ',
      addressLine1: '',
      city: 'Kochi',
      state: ' ',
      postalCode: '682001',
      supervisingPractitioner: 'Dr. Nair',
      licenseNumbers: ['LIC-1', ' ', ' LIC-2 '],
    );
    expect(input.toJson(), {
      'name': 'Kerala Wellness',
      'city': 'Kochi',
      'postalCode': '682001',
      'supervisingPractitioner': 'Dr. Nair',
      'licenseNumbers': ['LIC-1', 'LIC-2'],
    });
  });

  test('form helpers', () {
    expect(validateIntInRange('', min: 0, max: 10, required: true), 'Required');
    expect(validateIntInRange('', min: 0, max: 10, required: false), isNull);
    expect(validateIntInRange('11', min: 0, max: 10, required: true), isNotNull);
    expect(splitLanguages('Hindi, , English '), ['Hindi', 'English']);
  });

  group('decideAuthRedirect', () {
    test('signed out: auth screens allowed, everything else to sign-in', () {
      expect(decideAuthRedirect(isSignedIn: false, location: '/sign-in'), AuthRedirectDecision.allow);
      expect(decideAuthRedirect(isSignedIn: false, location: '/apply'), AuthRedirectDecision.allow);
      expect(decideAuthRedirect(isSignedIn: false, location: '/'), AuthRedirectDecision.goSignIn);
      expect(decideAuthRedirect(isSignedIn: false, location: '/bookings/b1'), AuthRedirectDecision.goSignIn);
    });

    test('signed in: auth screens go home, everything else allowed', () {
      expect(decideAuthRedirect(isSignedIn: true, location: '/sign-in'), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, location: '/password-setup'), AuthRedirectDecision.goHome);
      expect(decideAuthRedirect(isSignedIn: true, location: '/bookings/b1'), AuthRedirectDecision.allow);
    });
  });
}
