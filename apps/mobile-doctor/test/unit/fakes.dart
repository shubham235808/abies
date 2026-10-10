import 'dart:async';

import 'package:abies_doctor/core/api/api_exception.dart';
import 'package:abies_doctor/features/auth/data/auth_api.dart';
import 'package:abies_doctor/features/auth/domain/auth_result.dart';
import 'package:abies_doctor/features/auth/domain/session_user.dart';
import 'package:abies_doctor/features/consultations/data/consultations_api.dart';
import 'package:abies_doctor/features/consultations/domain/consultation_detail.dart';
import 'package:abies_doctor/features/consultations/domain/recommendation.dart';
import 'package:abies_doctor/features/consultations/domain/video_join_info.dart';
import 'package:abies_doctor/features/practice/data/doctor_api.dart';
import 'package:abies_doctor/features/practice/domain/doctor_appointment.dart';
import 'package:abies_doctor/features/practice/domain/doctor_profile.dart';

const doctorUser = SessionUser(id: 'd1', mobile: '+919800000001', email: 'vaidya@example.test', role: 'DOCTOR');
const patientUser = SessionUser(id: 'p1', mobile: '+919800000002', email: null, role: 'PATIENT');

class FakeAuthApi implements AuthApi {
  SessionUser? meResult;
  LoginResult? loginResult;
  RequestOtpResult? requestOtpResult;
  VerifyOtpResult? verifyOtpResult;
  ApiException? throwOnLogin;
  ApiException? throwOnRequestOtp;
  ApiException? throwOnVerify;
  int logoutCalls = 0;
  final calls = <String>[];
  Map<String, Object?> lastArgs = {};
  final _unauthorized = StreamController<void>.broadcast();

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
  Future<LoginResult> login({String? mobile, String? email, required String password}) async {
    calls.add('login');
    lastArgs = {'mobile': mobile, 'email': email, 'password': password};
    if (throwOnLogin != null) throw throwOnLogin!;
    return loginResult!;
  }

  @override
  Future<RequestOtpResult> requestOtp({String? mobile, String? email}) async {
    calls.add('requestOtp');
    lastArgs = {'mobile': mobile, 'email': email};
    if (throwOnRequestOtp != null) throw throwOnRequestOtp!;
    return requestOtpResult!;
  }

  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) async {
    calls.add('verifyOtp');
    lastArgs = {'requestId': requestId, 'otp': otp, 'acceptedTerms': acceptedTerms, 'name': name};
    if (throwOnVerify != null) throw throwOnVerify!;
    return verifyOtpResult!;
  }

  @override
  Future<RequestPasswordResetResult> requestPasswordReset({String? mobile, String? email}) async {
    calls.add('requestPasswordReset:${mobile ?? email}');
    return const RequestPasswordResetResult(requestId: 'reset-1', expiresInSeconds: 300);
  }

  @override
  Future<SetPasswordResult> completePasswordSetup({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();

  @override
  Future<SetPasswordResult> resetPassword({required String requestId, required String otp, required String newPassword}) =>
      throw UnimplementedError();
}

Map<String, dynamic> profileJson({String status = 'APPROVED', List<String> modes = const ['VIDEO', 'CLINIC'], List<Map<String, dynamic>>? availability}) => {
      'profile': {
        'id': 'dp1',
        'title': 'Dr.',
        'firstName': 'Asha',
        'lastName': 'Rao',
        'verificationStatus': status,
        'rejectionReason': null,
        'specialties': ['Panchakarma'],
        'languages': ['English', 'Hindi'],
        'consultationModes': modes,
        'videoFee': 500,
        'clinicFee': 800,
        'isAcceptingNewPatients': true,
        'documents': [
          {'id': 'doc1'}
        ],
        'clinics': [
          {'id': 'c1', 'name': 'Rao Ayurveda', 'addressLine1': '1 MG Road', 'city': 'Pune', 'state': 'MH', 'active': true},
        ],
        'availability': availability ??
            [
              {'id': 'av1', 'dayOfWeek': 1, 'startTime': '10:00', 'endTime': '13:00', 'slotMinutes': 30, 'mode': 'VIDEO', 'clinicId': null, 'active': true},
            ],
      },
      'completion': 85,
    };

Map<String, dynamic> appointmentJson({
  required String id,
  required DateTime scheduledAt,
  String status = 'CONFIRMED',
  String mode = 'VIDEO',
  String? consultationId,
  String? consultationStatus = 'SCHEDULED',
}) =>
    {
      'id': id,
      'mode': mode,
      'scheduledAt': scheduledAt.toUtc().toIso8601String(),
      'durationMinutes': 30,
      'status': status,
      'reasonForVisit': null,
      'patientUser': {
        'mobile': '+919811111111',
        'patientProfile': {'firstName': 'Ravi', 'lastName': 'K'},
      },
      'careRecipientFamilyMember': null,
      'clinic': null,
      'consultation': consultationId == null ? null : {'id': consultationId, 'status': consultationStatus},
    };

class FakeDoctorApi implements DoctorApi {
  FakeDoctorApi({Map<String, dynamic>? profile}) : profile = profile ?? profileJson();

  Map<String, dynamic> profile;
  List<Map<String, dynamic>> appointmentRows = [];
  int meCalls = 0;
  int appointmentsCalls = 0;
  final calls = <String>[];
  ApiException? throwOnWrite;

  @override
  Future<DoctorProfile> me() async {
    meCalls += 1;
    return DoctorProfile.fromMeJson(profile);
  }

  @override
  Future<List<DoctorAppointment>> appointments() async {
    appointmentsCalls += 1;
    return appointmentRows.map(DoctorAppointment.fromJson).toList();
  }

  @override
  Future<AvailabilityWindow> addAvailability({
    required int dayOfWeek,
    required String startTime,
    required String endTime,
    required int slotMinutes,
    required String mode,
    String? clinicId,
  }) async {
    calls.add('add:$dayOfWeek:$startTime-$endTime:$mode:$clinicId');
    if (throwOnWrite != null) throw throwOnWrite!;
    final row = {'id': 'av-new', 'dayOfWeek': dayOfWeek, 'startTime': startTime, 'endTime': endTime, 'slotMinutes': slotMinutes, 'mode': mode, 'clinicId': clinicId, 'active': true};
    ((profile['profile'] as Map<String, dynamic>)['availability'] as List).add(row);
    return AvailabilityWindow.fromJson(row);
  }

  @override
  Future<AvailabilityWindow> setAvailabilityActive(String id, bool active) async {
    calls.add('active:$id:$active');
    if (throwOnWrite != null) throw throwOnWrite!;
    final list = (profile['profile'] as Map<String, dynamic>)['availability'] as List;
    final row = list.cast<Map<String, dynamic>>().firstWhere((r) => r['id'] == id);
    row['active'] = active;
    return AvailabilityWindow.fromJson(row);
  }

  @override
  Future<void> removeAvailability(String id) async {
    calls.add('remove:$id');
    if (throwOnWrite != null) throw throwOnWrite!;
    ((profile['profile'] as Map<String, dynamic>)['availability'] as List).removeWhere((r) => (r as Map)['id'] == id);
  }
}

Map<String, dynamic> consultationJson({
  String id = 'cons1',
  String status = 'SCHEDULED',
  String mode = 'VIDEO',
  Map<String, dynamic>? clinicalNote,
  List<Map<String, dynamic>> prescriptions = const [],
}) =>
    {
      'id': id,
      'status': status,
      'chiefComplaint': null,
      'historyOfPresentIllness': null,
      'notes': null,
      'appointment': {'scheduledAt': '2026-10-10T05:30:00.000Z', 'durationMinutes': 30, 'mode': mode, 'reasonForVisit': 'Acidity'},
      'patientUser': {'id': 'p1', 'mobile': '+919811111111', 'patientProfile': {'firstName': 'Ravi', 'lastName': 'K'}},
      'videoSession': mode == 'VIDEO' ? {'doctorJoinedAt': null, 'patientJoinedAt': null} : null,
      'clinicalNote': clinicalNote,
      'prescriptions': [...prescriptions],
    };

/// In-memory backend for one consultation that applies the same rules the
/// real services enforce, so controller tests exercise realistic transitions.
class FakeConsultationsApi implements ConsultationsApi {
  FakeConsultationsApi(this.row);

  Map<String, dynamic> row;
  final calls = <String>[];
  List<Recommendation> diagnostics = [];
  List<Recommendation> panchakarma = [];
  ApiException? throwNext;
  int _seq = 0;

  void _maybeThrow() {
    final e = throwNext;
    if (e != null) {
      throwNext = null;
      throw e;
    }
  }

  List<Map<String, dynamic>> get _prescriptions => (row['prescriptions'] as List).cast<Map<String, dynamic>>();

  Map<String, dynamic> _prescriptionRow(String id, List<PrescriptionItem> items, String? notes, {String status = 'DRAFT', String? supersedesId}) => {
        'id': id,
        'status': status,
        'doctorNotes': notes,
        'finalizedAt': null,
        'supersedesId': supersedesId,
        'items': items.map((i) => i.toJson()).toList(),
      };

  @override
  Future<ConsultationDetail> get(String id) async {
    calls.add('get');
    return ConsultationDetail.fromJson(row);
  }

  @override
  Future<VideoJoinInfo> join(String id) async {
    calls.add('join');
    return const VideoJoinInfo(available: false, message: 'Video calling is not connected yet.');
  }

  @override
  Future<void> start(String id) async {
    calls.add('start');
    _maybeThrow();
    row['status'] = 'IN_PROGRESS';
  }

  @override
  Future<void> complete(String id) async {
    calls.add('complete');
    _maybeThrow();
    row['status'] = 'COMPLETED';
  }

  @override
  Future<void> updateDetails(String id, {String? chiefComplaint, String? historyOfPresentIllness, String? notes}) async {
    calls.add('updateDetails');
    _maybeThrow();
    row['chiefComplaint'] = chiefComplaint;
  }

  Map<String, String>? lastAssessment;

  @override
  Future<void> saveClinicalNote(String id,
      {required Map<String, String> ayurvedaAssessment, String? diagnosis, String? treatmentPlan, String? recommendations, String? followUpDate}) async {
    calls.add('saveClinicalNote');
    _maybeThrow();
    lastAssessment = ayurvedaAssessment;
    row['clinicalNote'] = {
      'ayurvedaAssessment': ayurvedaAssessment,
      'diagnosis': diagnosis,
      'treatmentPlan': treatmentPlan,
      'recommendations': recommendations,
      'followUpDate': followUpDate,
      'finalizedAt': null,
    };
  }

  @override
  Future<void> finalizeClinicalNote(String id) async {
    calls.add('finalizeClinicalNote');
    _maybeThrow();
    (row['clinicalNote'] as Map<String, dynamic>)['finalizedAt'] = '2026-10-10T06:00:00.000Z';
  }

  @override
  Future<Prescription> createPrescription(String consultationId, {String? doctorNotes, required List<PrescriptionItem> items}) async {
    calls.add('createPrescription');
    _maybeThrow();
    final r = _prescriptionRow('rx${++_seq}', items, doctorNotes);
    _prescriptions.insert(0, r);
    return Prescription.fromJson(r);
  }

  @override
  Future<Prescription> updatePrescription(String prescriptionId, {String? doctorNotes, required List<PrescriptionItem> items}) async {
    calls.add('updatePrescription:$prescriptionId');
    _maybeThrow();
    final i = _prescriptions.indexWhere((p) => p['id'] == prescriptionId);
    _prescriptions[i] = _prescriptionRow(prescriptionId, items, doctorNotes);
    return Prescription.fromJson(_prescriptions[i]);
  }

  @override
  Future<Prescription> finalizePrescription(String prescriptionId) async {
    calls.add('finalizePrescription:$prescriptionId');
    _maybeThrow();
    final p = _prescriptions.firstWhere((p) => p['id'] == prescriptionId);
    p['status'] = 'FINALIZED';
    p['finalizedAt'] = '2026-10-10T06:00:00.000Z';
    return Prescription.fromJson(p);
  }

  @override
  Future<Prescription> correctPrescription(String prescriptionId) async {
    calls.add('correctPrescription:$prescriptionId');
    _maybeThrow();
    final original = _prescriptions.firstWhere((p) => p['id'] == prescriptionId);
    final items = (original['items'] as List).map((e) => PrescriptionItem.fromJson(e as Map<String, dynamic>)).toList();
    final draft = _prescriptionRow('rx${++_seq}', items, original['doctorNotes'] as String?, supersedesId: prescriptionId);
    original['status'] = 'SUPERSEDED';
    _prescriptions.insert(0, draft);
    return Prescription.fromJson(draft);
  }

  @override
  Future<List<Recommendation>> myDiagnosticRecommendations() async {
    calls.add('myDiagnostic');
    return diagnostics;
  }

  @override
  Future<List<Recommendation>> myPanchakarmaRecommendations() async {
    calls.add('myPanchakarma');
    return panchakarma;
  }

  @override
  Future<void> recommendDiagnostic(String consultationId, {required String clinicalReason, String? testId, String? packageId}) async {
    calls.add('recommendDiagnostic:$testId:$packageId');
    _maybeThrow();
    diagnostics = [
      Recommendation(id: 'dr${++_seq}', consultationId: consultationId, status: 'RECOMMENDED', clinicalReason: clinicalReason, itemName: 'CBC'),
      ...diagnostics,
    ];
  }

  @override
  Future<void> recommendPanchakarma(String consultationId, {required String clinicalReason, String? therapyId, int? sessionCountRecommended}) async {
    calls.add('recommendPanchakarma:$therapyId:$sessionCountRecommended');
    _maybeThrow();
    panchakarma = [
      Recommendation(
        id: 'pr${++_seq}',
        consultationId: consultationId,
        status: 'RECOMMENDED',
        clinicalReason: clinicalReason,
        itemName: 'Abhyanga',
        sessionCountRecommended: sessionCountRecommended,
      ),
      ...panchakarma,
    ];
  }
}
