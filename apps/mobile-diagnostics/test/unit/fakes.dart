import 'dart:async';

import 'package:abies_diagnostics/core/api/api_exception.dart';
import 'package:abies_diagnostics/features/auth/data/auth_api.dart';
import 'package:abies_diagnostics/features/auth/domain/auth_result.dart';
import 'package:abies_diagnostics/features/auth/domain/session_user.dart';
import 'package:abies_diagnostics/features/catalogue/data/catalogue_api.dart';
import 'package:abies_diagnostics/features/catalogue/domain/catalogue.dart';
import 'package:abies_diagnostics/features/lab_profile/data/lab_profile_api.dart';
import 'package:abies_diagnostics/features/lab_profile/domain/lab_profile.dart';
import 'package:abies_diagnostics/features/orders/data/lab_orders_api.dart';
import 'package:abies_diagnostics/features/orders/domain/lab_order.dart';

const labUser = SessionUser(id: 'lab-u1', mobile: '+919876543212', email: 'lab@example.test', role: 'LAB');
const patientUser = SessionUser(id: 'p1', mobile: '+919876543210', email: null, role: 'PATIENT');

/// Fake-API double in the style of apps/mobile/test/unit/auth_controller_test.dart.
class FakeAuthApi implements AuthApi {
  SessionUser? meResult;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();
  int logoutCalls = 0;

  RequestOtpResult? otpResult;
  ApiException? otpError;
  VerifyOtpResult? verifyResult;
  ApiException? verifyError;
  final List<Map<String, Object?>> otpRequests = [];
  final List<Map<String, Object?>> verifyRequests = [];

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
  Future<RequestOtpResult> requestOtp({String? mobile, String? email, String role = kLabRole}) async {
    otpRequests.add({'mobile': mobile, 'email': email, 'role': role});
    if (otpError != null) throw otpError!;
    return otpResult!;
  }

  @override
  Future<VerifyOtpResult> verifyOtp({required String requestId, required String otp, required bool acceptedTerms, String? name}) async {
    verifyRequests.add({'requestId': requestId, 'otp': otp, 'acceptedTerms': acceptedTerms, 'name': name});
    if (verifyError != null) throw verifyError!;
    return verifyResult!;
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

Map<String, dynamic> orderJson({required String id, required String status, String? scheduledAt, Map<String, dynamic>? report}) => {
      'id': id,
      'status': status,
      'collectionMode': 'HOME',
      'address': '12 MG Road, Pune',
      'scheduledAt': scheduledAt ?? '2026-10-11T04:30:00.000Z',
      'updatedAt': '2026-10-10T04:30:00.000Z',
      'patientUser': {
        'mobile': '+919876543210',
        'patientProfile': {'firstName': 'Asha', 'lastName': 'Rao'},
      },
      'items': [
        {'id': 'i1', 'price': 500, 'test': {'name': 'CBC', 'code': 'CBC'}, 'package': null},
      ],
      'report': report,
    };

/// In-memory lab backend enforcing the same linear state machine as
/// orders.service.ts (and its exact error messages).
class FakeLabOrdersApi implements LabOrdersApi {
  final Map<String, String> statuses = {};
  final Map<String, Map<String, dynamic>> sample = {};
  final Map<String, Map<String, dynamic>> reports = {};
  int listCalls = 0;
  int getCalls = 0;
  final List<String> calls = [];
  ReportUpload? lastUpload;

  List<LabOrderSummary> summaries = [];

  @override
  Future<List<LabOrderSummary>> listOrders() async {
    listCalls += 1;
    return summaries;
  }

  @override
  Future<LabOrderDetail> getOrder(String orderId) async {
    getCalls += 1;
    final status = statuses[orderId];
    if (status == null) throw const ApiException(message: 'Order not found', statusCode: 404);
    final json = orderJson(id: orderId, status: status, report: reports[orderId]);
    json['sampleCollection'] = sample[orderId];
    json['payment'] = {'status': 'SUCCESS', 'amount': 500};
    return LabOrderDetail.fromJson(json);
  }

  @override
  Future<void> markSampleCollected(String orderId, {String? collectorName, String? sampleBarcode, String? qualityException}) async {
    calls.add('sample-collected');
    if (statuses[orderId] != 'SCHEDULED') {
      throw const ApiException(message: 'Only a scheduled order can have its sample collected', statusCode: 400);
    }
    sample[orderId] = {
      'collectorName': collectorName,
      'sampleBarcode': sampleBarcode,
      'qualityException': qualityException,
      'collectedAt': '2026-10-10T05:00:00.000Z',
    };
    statuses[orderId] = 'SAMPLE_COLLECTED';
  }

  @override
  Future<void> markProcessing(String orderId) async {
    calls.add('processing');
    if (statuses[orderId] != 'SAMPLE_COLLECTED') {
      throw const ApiException(message: 'Only a collected sample can move to processing', statusCode: 400);
    }
    statuses[orderId] = 'PROCESSING';
  }

  @override
  Future<void> releaseReport(String orderId, {required bool criticalFlag, ReportUpload? file}) async {
    calls.add('report');
    lastUpload = file;
    if (statuses[orderId] != 'PROCESSING') {
      throw const ApiException(message: 'Only a processing order can have its report released', statusCode: 400);
    }
    reports[orderId] = {
      'criticalFlag': criticalFlag,
      'releasedToPatientAt': '2026-10-10T08:00:00.000Z',
      'documentStorageKey': file == null ? null : 'diagnostic-reports/$orderId/x.pdf',
      'doctorAcknowledgedAt': null,
    };
    statuses[orderId] = 'COMPLETED';
  }
}

class FakeLabProfileApi implements LabProfileApi {
  FakeLabProfileApi(this.lab);

  LabProfile lab;
  Map<String, Object?>? lastUpdate;
  ApiException? submitError;

  @override
  Future<LabProfile> getMyLab() async => lab;

  @override
  Future<LabProfile> updateMyLab({String? name, List<String>? licenseNumbers, List<String>? serviceCities, bool? homeCollectionSupported}) async {
    lastUpdate = {'name': name, 'licenseNumbers': licenseNumbers, 'serviceCities': serviceCities, 'home': homeCollectionSupported};
    lab = LabProfile(
      id: lab.id,
      verificationStatus: lab.verificationStatus,
      name: name,
      licenseNumbers: licenseNumbers ?? lab.licenseNumbers,
      serviceCities: serviceCities ?? lab.serviceCities,
      homeCollectionSupported: homeCollectionSupported ?? lab.homeCollectionSupported,
    );
    return lab;
  }

  @override
  Future<LabProfile> submit({required bool declarationAccepted}) async {
    if (submitError != null) throw submitError!;
    lab = LabProfile(
      id: lab.id,
      verificationStatus: 'SUBMITTED',
      name: lab.name,
      licenseNumbers: lab.licenseNumbers,
      serviceCities: lab.serviceCities,
    );
    return lab;
  }
}

class FakeCatalogueApi implements CatalogueApi {
  final List<LabTest> tests = [];
  final List<LabPackage> packages = [];
  final List<Map<String, dynamic>> patches = [];
  int _seq = 0;
  ApiException? createError;

  @override
  Future<List<LabTest>> listTests() async => List.of(tests);

  @override
  Future<List<LabPackage>> listPackages() async => List.of(packages);

  @override
  Future<void> createTest(TestInput input) async {
    if (createError != null) throw createError!;
    final json = input.toJson()..['id'] = 't${++_seq}';
    tests.add(LabTest.fromJson(json));
  }

  @override
  Future<void> updateTest(String id, Map<String, dynamic> patch) async {
    patches.add(patch);
    final i = tests.indexWhere((t) => t.id == id);
    final t = tests[i];
    tests[i] = LabTest.fromJson({
      'id': t.id,
      'code': patch['code'] ?? t.code,
      'name': patch['name'] ?? t.name,
      'price': patch['price'] ?? t.price,
      'active': patch['active'] ?? t.active,
    });
  }

  @override
  Future<void> deleteTest(String id) async {
    tests.removeWhere((t) => t.id == id);
    // Mirrors DiagnosticPackageTest onDelete: Cascade.
    for (var i = 0; i < packages.length; i++) {
      final p = packages[i];
      packages[i] = LabPackage(
        id: p.id,
        name: p.name,
        price: p.price,
        active: p.active,
        testIds: p.testIds.where((x) => x != id).toList(),
        testNames: p.testNames,
      );
    }
  }

  @override
  Future<void> createPackage(PackageInput input) async {
    packages.add(LabPackage(id: 'p${++_seq}', name: input.name, price: input.price, active: true, testIds: input.testIds, testNames: const []));
  }

  @override
  Future<void> updatePackage(String id, Map<String, dynamic> patch) async {
    patches.add(patch);
  }

  @override
  Future<void> deletePackage(String id) async {
    packages.removeWhere((p) => p.id == id);
  }
}
