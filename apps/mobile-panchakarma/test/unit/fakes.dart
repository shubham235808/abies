import 'dart:async';

import 'package:abies_panchakarma/core/api/api_exception.dart';
import 'package:abies_panchakarma/features/auth/data/auth_api.dart';
import 'package:abies_panchakarma/features/auth/domain/auth_result.dart';
import 'package:abies_panchakarma/features/auth/domain/session_user.dart';
import 'package:abies_panchakarma/features/centre/data/centre_api.dart';
import 'package:abies_panchakarma/features/centre/domain/centre_models.dart';

const centreUser = SessionUser(id: 'u1', mobile: '+919876543210', email: 'centre@example.test', role: 'PANCHAKARMA_CENTRE');
const patientUser = SessionUser(id: 'p1', mobile: '+919800000000', email: null, role: 'PATIENT');

/// Fake [AuthApi] — same pattern as apps/mobile/test/unit/auth_controller_test.dart.
class FakeAuthApi implements AuthApi {
  SessionUser? meResult = centreUser;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  int logoutCalls = 0;

  RequestOtpResult? requestOtpResult;
  Object? requestOtpError;
  Map<String, String?>? lastRequestOtp;

  VerifyOtpResult? verifyOtpResult;
  Object? verifyOtpError;
  Map<String, Object?>? lastVerifyOtp;

  void triggerUnauthorized() => _unauthorized.add(null);

  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;

  @override
  Future<SessionUser?> me() async => meResult;

  @override
  Future<void> logout() async {
    logoutCalls += 1;
    meResult = null;
  }

  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) async {
    lastRequestOtp = {'mobile': mobile, 'email': email};
    if (requestOtpError != null) throw requestOtpError!;
    return requestOtpResult!;
  }

  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) async {
    lastVerifyOtp = {'requestId': requestId, 'otp': otp, 'acceptedTerms': acceptedTerms, 'name': name};
    if (verifyOtpError != null) throw verifyOtpError!;
    return verifyOtpResult!;
  }

  @override
  Future<LoginResult> login({String? mobile, String? email, required String password}) => throw UnimplementedError();
  @override
  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email}) => throw UnimplementedError();
  @override
  Future<SetPasswordResult> completePasswordSetup({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
  @override
  Future<SetPasswordResult> resetPassword({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
}

Map<String, dynamic> centreJson({String status = 'APPROVED', String? rejectionReason}) => {
      'id': 'c1',
      'userId': 'u1',
      'name': 'Kerala Wellness',
      'addressLine1': '1 MG Road',
      'city': 'Kochi',
      'state': 'Kerala',
      'postalCode': '682001',
      'supervisingPractitioner': 'Dr. Nair',
      'licenseNumbers': ['LIC-1'],
      'active': true,
      'verificationStatus': status,
      'rejectionReason': rejectionReason,
    };

Map<String, dynamic> sessionJson({required String id, required int n, required DateTime at, DateTime? attendedAt, String? therapist}) => {
      'id': id,
      'bookingId': 'b1',
      'sessionNumber': n,
      'therapistId': therapist == null ? null : 'th1',
      'scheduledAt': at.toUtc().toIso8601String(),
      'attendedAt': attendedAt?.toUtc().toIso8601String(),
      'notes': null,
      'exceptionFlag': null,
      if (therapist != null) 'therapist': {'name': therapist},
    };

Map<String, dynamic> bookingJson({
  String id = 'b1',
  String status = 'BOOKED',
  int sessionCount = 2,
  List<Map<String, dynamic>> sessions = const [],
  bool withProfile = true,
}) =>
    {
      'id': id,
      'centreId': 'c1',
      'patientUserId': 'p1',
      'therapyId': 't1',
      'sessionCount': sessionCount,
      'status': status,
      'cancellationReason': null,
      'createdAt': '2026-10-01T10:00:00.000Z',
      'patientUser': {
        'mobile': '+919800000000',
        'patientProfile': withProfile ? {'firstName': 'Asha', 'lastName': 'Rao'} : null,
      },
      'therapy': {'name': 'Abhyanga', 'durationMinutes': 60},
      'sessions': sessions,
      'payment': {'status': 'SUCCESS', 'amount': 3000},
    };

/// Stateful fake [CentreApi] that applies the backend's real
/// bookings.service.ts transitions (schedule/attend/cancel and their
/// refusals) so controller tests exercise the same state machine.
class FakeCentreApi implements CentreApi {
  FakeCentreApi({Map<String, dynamic>? centre, List<Map<String, dynamic>>? bookings})
      : centre = centre ?? centreJson(),
        bookingsJson = bookings ?? [bookingJson()];

  Map<String, dynamic> centre;
  List<Map<String, dynamic>> bookingsJson;
  List<Therapist> therapistList = const [
    Therapist(id: 'th1', name: 'Meera', qualifications: null, languages: [], active: true),
    Therapist(id: 'th2', name: 'Old', qualifications: null, languages: [], active: false),
  ];
  List<Therapy> therapyList = [];
  int bookingsCalls = 0;
  int bookingCalls = 0;
  Map<String, dynamic>? lastSchedule;
  Object? nextError;
  int _sessionSeq = 0;

  void _maybeThrow() {
    final e = nextError;
    if (e != null) {
      nextError = null;
      throw e;
    }
  }

  Map<String, dynamic> _find(String id) => bookingsJson.firstWhere((b) => b['id'] == id, orElse: () {
        throw const ApiException(message: 'Booking not found', statusCode: 404);
      });

  @override
  Future<CentreProfile> myCentre() async => CentreProfile.fromJson(centre);

  @override
  Future<CentreProfile> updateMyCentre(CentreProfileInput input) async {
    _maybeThrow();
    centre = {...centre, ...input.toJson()};
    return CentreProfile.fromJson(centre);
  }

  @override
  Future<CentreProfile> submitApplication({required bool declarationAccepted}) async {
    _maybeThrow();
    centre = {...centre, 'verificationStatus': 'SUBMITTED'};
    return CentreProfile.fromJson(centre);
  }

  @override
  Future<List<CentreBooking>> bookings() async {
    bookingsCalls += 1;
    return bookingsJson.map(CentreBooking.fromJson).toList();
  }

  @override
  Future<CentreBooking> booking(String bookingId) async {
    bookingCalls += 1;
    return CentreBooking.fromJson(_find(bookingId));
  }

  @override
  Future<void> scheduleSession(String bookingId, {required DateTime scheduledAt, String? therapistId}) async {
    lastSchedule = {'bookingId': bookingId, 'scheduledAt': scheduledAt, 'therapistId': therapistId};
    _maybeThrow();
    final b = _find(bookingId);
    if (!['BOOKED', 'SCHEDULED', 'IN_PROGRESS'].contains(b['status'])) {
      throw const ApiException(message: 'This booking cannot be scheduled further', statusCode: 400);
    }
    final sessions = List<Map<String, dynamic>>.from(b['sessions'] as List);
    if (sessions.length >= (b['sessionCount'] as int)) {
      throw const ApiException(message: 'All sessions for this booking have already been scheduled', statusCode: 409);
    }
    sessions.add(sessionJson(id: 's${++_sessionSeq}', n: sessions.length + 1, at: scheduledAt, therapist: therapistId == null ? null : 'Meera'));
    b['sessions'] = sessions;
    if (b['status'] == 'BOOKED') b['status'] = 'SCHEDULED';
  }

  @override
  Future<void> markSessionAttended(String sessionId, {String? notes, String? exceptionFlag}) async {
    _maybeThrow();
    for (final b in bookingsJson) {
      final sessions = List<Map<String, dynamic>>.from(b['sessions'] as List);
      final i = sessions.indexWhere((s) => s['id'] == sessionId);
      if (i < 0) continue;
      if (sessions[i]['attendedAt'] != null) throw const ApiException(message: 'This session is already marked attended', statusCode: 400);
      sessions[i] = {...sessions[i], 'attendedAt': DateTime.now().toUtc().toIso8601String(), 'notes': notes, 'exceptionFlag': exceptionFlag};
      b['sessions'] = sessions;
      final attended = sessions.where((s) => s['attendedAt'] != null).length;
      b['status'] = attended >= (b['sessionCount'] as int) ? 'COMPLETED' : 'IN_PROGRESS';
      return;
    }
    throw const ApiException(message: 'Session not found', statusCode: 404);
  }

  @override
  Future<void> cancelBooking(String bookingId, {String? reason}) async {
    _maybeThrow();
    final b = _find(bookingId);
    if (b['status'] != 'BOOKED' && b['status'] != 'SCHEDULED') {
      throw const ApiException(message: 'This booking can no longer be cancelled', statusCode: 409);
    }
    b['status'] = 'CANCELLED';
    b['cancellationReason'] = reason;
  }

  @override
  Future<List<Therapy>> therapies() async => therapyList;

  @override
  Future<Therapy> createTherapy(TherapyInput input) async {
    _maybeThrow();
    final json = {'id': 'tn${therapyList.length + 1}', 'active': true, ...input.toJson()};
    return Therapy.fromJson(json);
  }

  @override
  Future<Therapy> updateTherapy(String therapyId, Map<String, dynamic> patch) async {
    _maybeThrow();
    final t = therapyList.firstWhere((t) => t.id == therapyId);
    return Therapy.fromJson({
      'id': t.id,
      'name': patch['name'] ?? t.name,
      'price': patch['price'] ?? t.price,
      'active': patch['active'] ?? t.active,
      'requiredSupervision': patch['requiredSupervision'] ?? t.requiredSupervision,
    });
  }

  @override
  Future<void> deleteTherapy(String therapyId) async => _maybeThrow();

  @override
  Future<List<Therapist>> therapists() async => therapistList;

  @override
  Future<Therapist> createTherapist(TherapistInput input) async {
    _maybeThrow();
    return Therapist.fromJson({'id': 'thn', 'active': true, ...input.toJson()});
  }

  @override
  Future<Therapist> updateTherapist(String therapistId, Map<String, dynamic> patch) async {
    _maybeThrow();
    final t = therapistList.firstWhere((t) => t.id == therapistId);
    return Therapist.fromJson({'id': t.id, 'name': patch['name'] ?? t.name, 'languages': patch['languages'] ?? t.languages, 'active': patch['active'] ?? t.active});
  }

  @override
  Future<void> deleteTherapist(String therapistId) async => _maybeThrow();
}
