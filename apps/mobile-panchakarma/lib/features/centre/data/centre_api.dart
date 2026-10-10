import '../../../core/api/api_client.dart';
import '../domain/centre_models.dart';

/// Every centre-side endpoint this app uses — all already exist and are
/// what the partner web portal (apps/partner-web/src/app/partner/
/// panchakarma-centre/) calls. Each route checks `requireSession` +
/// `requireRole(ctx, 'PANCHAKARMA_CENTRE')`; nothing here invents one.
///
/// | Method                | Route                                                         |
/// |-----------------------|---------------------------------------------------------------|
/// | [myCentre]            | GET    /api/v1/panchakarma-centres/me                         |
/// | [updateMyCentre]      | PATCH  /api/v1/panchakarma-centres/me                         |
/// | [submitApplication]   | POST   /api/v1/panchakarma-centres/me/submit                  |
/// | [bookings]            | GET    /api/v1/panchakarma-centres/me/bookings                |
/// | [booking]             | GET    /api/v1/panchakarma-bookings/[id]                      |
/// | [scheduleSession]     | POST   /api/v1/panchakarma-centres/me/bookings/[id]/schedule-session |
/// | [markSessionAttended] | POST   /api/v1/panchakarma-centres/me/sessions/[id]/attended  |
/// | [cancelBooking]       | POST   /api/v1/panchakarma-bookings/[id]/cancel               |
/// | [therapies] etc.      | GET/POST /api/v1/panchakarma-centres/me/therapies, PATCH/DELETE .../[id]  |
/// | [therapists] etc.     | GET/POST /api/v1/panchakarma-centres/me/therapists, PATCH/DELETE .../[id] |
///
/// There is no separate "complete course" endpoint: bookings.service.ts
/// `markSessionAttended` moves the booking to COMPLETED itself once the
/// attended count reaches `sessionCount`.
abstract class CentreApi {
  Future<CentreProfile> myCentre();
  Future<CentreProfile> updateMyCentre(CentreProfileInput input);
  Future<CentreProfile> submitApplication({required bool declarationAccepted});

  Future<List<CentreBooking>> bookings();
  Future<CentreBooking> booking(String bookingId);

  /// [scheduledAt] is sent as UTC ISO-8601 (`scheduleSessionSchema`'s
  /// `z.string().datetime()` accepts only the `Z` form by default).
  Future<void> scheduleSession(String bookingId, {required DateTime scheduledAt, String? therapistId});
  Future<void> markSessionAttended(String sessionId, {String? notes, String? exceptionFlag});
  Future<void> cancelBooking(String bookingId, {String? reason});

  Future<List<Therapy>> therapies();
  Future<Therapy> createTherapy(TherapyInput input);
  Future<Therapy> updateTherapy(String therapyId, Map<String, dynamic> patch);
  Future<void> deleteTherapy(String therapyId);

  Future<List<Therapist>> therapists();
  Future<Therapist> createTherapist(TherapistInput input);
  Future<Therapist> updateTherapist(String therapistId, Map<String, dynamic> patch);
  Future<void> deleteTherapist(String therapistId);
}

class CentreApiImpl implements CentreApi {
  CentreApiImpl(this._client);

  final ApiClient _client;

  static const _me = '/api/v1/panchakarma-centres/me';

  static CentreProfile _centre(dynamic json) => CentreProfile.fromJson((json as Map<String, dynamic>)['centre'] as Map<String, dynamic>);

  @override
  Future<CentreProfile> myCentre() => _client.get(_me, decode: _centre);

  @override
  Future<CentreProfile> updateMyCentre(CentreProfileInput input) => _client.patch(_me, body: input.toJson(), decode: _centre);

  @override
  Future<CentreProfile> submitApplication({required bool declarationAccepted}) =>
      _client.post('$_me/submit', body: {'declarationAccepted': declarationAccepted}, decode: _centre);

  @override
  Future<List<CentreBooking>> bookings() {
    return _client.get(
      '$_me/bookings',
      decode: (json) => ((json as Map<String, dynamic>)['bookings'] as List<dynamic>)
          .map((e) => CentreBooking.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<CentreBooking> booking(String bookingId) {
    return _client.get(
      '/api/v1/panchakarma-bookings/$bookingId',
      decode: (json) => CentreBooking.fromJson((json as Map<String, dynamic>)['booking'] as Map<String, dynamic>),
    );
  }

  @override
  Future<void> scheduleSession(String bookingId, {required DateTime scheduledAt, String? therapistId}) {
    return _client.post<void>(
      '$_me/bookings/$bookingId/schedule-session',
      body: {
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (therapistId != null) 'therapistId': therapistId,
      },
      decode: (_) {},
    );
  }

  @override
  Future<void> markSessionAttended(String sessionId, {String? notes, String? exceptionFlag}) {
    return _client.post<void>(
      '$_me/sessions/$sessionId/attended',
      body: {
        if (notes != null && notes.isNotEmpty) 'notes': notes,
        if (exceptionFlag != null && exceptionFlag.isNotEmpty) 'exceptionFlag': exceptionFlag,
      },
      decode: (_) {},
    );
  }

  @override
  Future<void> cancelBooking(String bookingId, {String? reason}) {
    return _client.post<void>(
      '/api/v1/panchakarma-bookings/$bookingId/cancel',
      body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
      decode: (_) {},
    );
  }

  static Therapy _therapy(dynamic json) => Therapy.fromJson((json as Map<String, dynamic>)['therapy'] as Map<String, dynamic>);
  static Therapist _therapist(dynamic json) => Therapist.fromJson((json as Map<String, dynamic>)['therapist'] as Map<String, dynamic>);

  @override
  Future<List<Therapy>> therapies() {
    return _client.get(
      '$_me/therapies',
      decode: (json) =>
          ((json as Map<String, dynamic>)['therapies'] as List<dynamic>).map((e) => Therapy.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }

  @override
  Future<Therapy> createTherapy(TherapyInput input) => _client.post('$_me/therapies', body: input.toJson(), decode: _therapy);

  @override
  Future<Therapy> updateTherapy(String therapyId, Map<String, dynamic> patch) =>
      _client.patch('$_me/therapies/$therapyId', body: patch, decode: _therapy);

  @override
  Future<void> deleteTherapy(String therapyId) => _client.delete<void>('$_me/therapies/$therapyId', decode: (_) {});

  @override
  Future<List<Therapist>> therapists() {
    return _client.get(
      '$_me/therapists',
      decode: (json) => ((json as Map<String, dynamic>)['therapists'] as List<dynamic>)
          .map((e) => Therapist.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  @override
  Future<Therapist> createTherapist(TherapistInput input) => _client.post('$_me/therapists', body: input.toJson(), decode: _therapist);

  @override
  Future<Therapist> updateTherapist(String therapistId, Map<String, dynamic> patch) =>
      _client.patch('$_me/therapists/$therapistId', body: patch, decode: _therapist);

  @override
  Future<void> deleteTherapist(String therapistId) => _client.delete<void>('$_me/therapists/$therapistId', decode: (_) {});
}
