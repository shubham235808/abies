import '../../../core/api/api_client.dart';
import '../domain/appointment_detail.dart';
import '../domain/appointment_hold.dart';
import '../domain/appointment_slot.dart';
import '../domain/review_submission.dart';

/// Talks to the existing `/api/v1/appointments/*` routes only — nothing here
/// invents an endpoint (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4). Behind
/// one interface, mirroring `HomeApi`/`DoctorsApi`'s shape, so the
/// presentation layer is unit-testable with a fake.
abstract class AppointmentsApi {
  /// `GET /api/v1/appointments/slots?doctorProfileId=&mode=&from=&days=`.
  /// Always a fresh server round-trip — never cache this list across a
  /// booking attempt as authoritative (see `AppointmentSlot`'s doc comment).
  Future<List<AppointmentSlot>> slots({required String doctorProfileId, String? mode, String? from, int days = 14});

  /// `POST /api/v1/appointments/hold`. Throws [ApiException] with
  /// `statusCode == 503` when online payments aren't configured in this
  /// environment (`holdSlot()`'s `ServiceUnavailableError` —
  /// `packages/domain/src/modules/appointments/appointments.service.ts`) —
  /// this is the expected outcome in dev today, not a bug; callers must
  /// treat it as a normal, displayable state (see `BookingController`).
  /// Throws `statusCode == 409` if the slot was booked by someone else
  /// between the last slot list and this call.
  Future<AppointmentHold> hold({
    required String doctorProfileId,
    required String mode,
    required DateTime startsAt,
    String? careRecipientFamilyMemberId,
    String? reasonForVisit,
  });

  /// `POST /api/v1/appointments/verify-payment`. Not reachable from this
  /// phase's UI (no hold ever succeeds without real Razorpay keys — see
  /// `AppointmentHold`'s doc comment) but implemented against the real
  /// contract so the plumbing is correct and tested ahead of Phase 8. The
  /// backend's response here, never a client-side payment-provider
  /// callback, is what the booking flow would treat as confirmation.
  Future<AppointmentDetail> verifyPayment({
    required String appointmentId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  });

  /// `POST /api/v1/appointments/[id]/cancel`. Returns the bare, un-included
  /// appointment row (see `AppointmentDetail`'s doc comment) — callers
  /// should reload `mine()` for the full joined shape afterwards.
  Future<AppointmentDetail> cancel(String appointmentId, {String? reason});

  /// `POST /api/v1/appointments/[id]/review`.
  Future<ReviewSubmission> review(String appointmentId, {required int rating, String? comment});

  /// `GET /api/v1/appointments/mine`.
  Future<List<AppointmentDetail>> mine();
}

class AppointmentsApiImpl implements AppointmentsApi {
  AppointmentsApiImpl(this._client);

  final ApiClient _client;

  @override
  Future<List<AppointmentSlot>> slots({required String doctorProfileId, String? mode, String? from, int days = 14}) {
    return _client.get<List<AppointmentSlot>>(
      '/api/v1/appointments/slots',
      query: {
        'doctorProfileId': doctorProfileId,
        if (mode != null) 'mode': mode,
        if (from != null) 'from': from,
        'days': days.toString(),
      },
      decode: (json) => ((json as Map<String, dynamic>)['slots'] as List<dynamic>)
          .map((e) => AppointmentSlot.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<AppointmentHold> hold({
    required String doctorProfileId,
    required String mode,
    required DateTime startsAt,
    String? careRecipientFamilyMemberId,
    String? reasonForVisit,
  }) {
    return _client.post<AppointmentHold>(
      '/api/v1/appointments/hold',
      body: {
        'doctorProfileId': doctorProfileId,
        'mode': mode,
        'startsAt': startsAt.toUtc().toIso8601String(),
        if (careRecipientFamilyMemberId != null) 'careRecipientFamilyMemberId': careRecipientFamilyMemberId,
        if (reasonForVisit != null && reasonForVisit.isNotEmpty) 'reasonForVisit': reasonForVisit,
      },
      decode: (json) => AppointmentHold.fromJson(json as Map<String, dynamic>),
    );
  }

  @override
  Future<AppointmentDetail> verifyPayment({
    required String appointmentId,
    required String razorpayOrderId,
    required String razorpayPaymentId,
    required String razorpaySignature,
  }) {
    return _client.post<AppointmentDetail>(
      '/api/v1/appointments/verify-payment',
      body: {
        'appointmentId': appointmentId,
        'razorpayOrderId': razorpayOrderId,
        'razorpayPaymentId': razorpayPaymentId,
        'razorpaySignature': razorpaySignature,
      },
      decode: (json) => AppointmentDetail.fromJson((json as Map<String, dynamic>)['appointment'] as Map<String, dynamic>),
    );
  }

  @override
  Future<AppointmentDetail> cancel(String appointmentId, {String? reason}) {
    return _client.post<AppointmentDetail>(
      '/api/v1/appointments/$appointmentId/cancel',
      body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      decode: (json) => AppointmentDetail.fromJson((json as Map<String, dynamic>)['appointment'] as Map<String, dynamic>),
    );
  }

  @override
  Future<ReviewSubmission> review(String appointmentId, {required int rating, String? comment}) {
    return _client.post<ReviewSubmission>(
      '/api/v1/appointments/$appointmentId/review',
      body: {
        'rating': rating,
        if (comment != null && comment.isNotEmpty) 'comment': comment,
      },
      decode: (json) => ReviewSubmission.fromJson((json as Map<String, dynamic>)['review'] as Map<String, dynamic>),
    );
  }

  @override
  Future<List<AppointmentDetail>> mine() {
    return _client.get<List<AppointmentDetail>>(
      '/api/v1/appointments/mine',
      decode: (json) => ((json as Map<String, dynamic>)['appointments'] as List<dynamic>)
          .map((e) => AppointmentDetail.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
