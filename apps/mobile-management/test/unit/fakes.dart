import 'dart:async';

import 'package:abies_mobile_management/core/api/api_exception.dart';
import 'package:abies_mobile_management/features/auth/data/auth_api.dart';
import 'package:abies_mobile_management/features/auth/domain/auth_result.dart';
import 'package:abies_mobile_management/features/auth/domain/session_user.dart';
import 'package:abies_mobile_management/features/support/data/support_api.dart';
import 'package:abies_mobile_management/features/support/domain/support_ticket.dart';

const SessionUser agentUser = SessionUser(id: 'agent-1', mobile: '+919000000001', email: 'cs@abies.test', role: 'CUSTOMER_SUPPORT');
const SessionUser adminUser = SessionUser(id: 'admin-1', mobile: '+919000000002', email: 'admin@abies.test', role: 'ADMIN');
const SessionUser patientUser = SessionUser(id: 'pat-1', mobile: '+919000000003', email: null, role: 'PATIENT');

/// Fake-API double, same pattern as apps/mobile/test/unit/auth_controller_test.dart.
class FakeAuthApi implements AuthApi {
  MeResult? meResult;
  Object? verifyMfaError;
  final List<String> verifiedCodes = [];
  int logoutCalls = 0;
  final StreamController<void> _unauthorized = StreamController<void>.broadcast();

  void triggerUnauthorized() => _unauthorized.add(null);

  @override
  Stream<void> get onUnauthorized => _unauthorized.stream;

  @override
  Future<MeResult?> me() async => meResult;

  @override
  Future<void> logout() async {
    logoutCalls += 1;
    meResult = null;
  }

  @override
  Future<void> verifyMfa(String code) async {
    verifiedCodes.add(code);
    if (verifyMfaError != null) throw verifyMfaError!;
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

Map<String, dynamic> queueJson({
  required String id,
  String priority = 'P3',
  String status = 'OPEN',
  String? assignedAgentUserId,
  DateTime? createdAt,
  DateTime? responseDueAt,
  DateTime? resolvedAt,
}) {
  final created = createdAt ?? DateTime.utc(2026, 10, 10, 8);
  return {
    'id': id,
    'requesterUserId': 'pat-1',
    'subject': 'Subject $id',
    'description': 'Description for $id',
    'category': 'BOOKING',
    'department': 'CUSTOMER_SUPPORT',
    'priority': priority,
    'channel': 'IN_APP',
    'status': status,
    'assignedAgentUserId': assignedAgentUserId,
    'sla': responseDueAt == null
        ? null
        : {'priority': priority, 'responseTargetMinutes': 240, 'responseDueAt': responseDueAt.toIso8601String(), 'resolutionTarget': '1-2 business days'},
    'createdAt': created.toIso8601String(),
    'resolvedAt': resolvedAt?.toIso8601String(),
    'lastResponseAt': null,
    'updatedAt': created.toIso8601String(),
    'requester': {'mobile': '+919000000003'},
    'assignedAgent': assignedAgentUserId == null ? null : {'mobile': '+919000000001'},
  };
}

/// One `refundablePayments` entry, shaped like `listRefundablePayments`.
Map<String, dynamic> paymentJson({String id = 'pay-1', int amount = 1500, String status = 'SUCCESS', List<Map<String, dynamic>> refunds = const []}) {
  return {
    'id': id,
    'purpose': 'CONSULTATION',
    'amount': amount,
    'status': status,
    'createdAt': DateTime.utc(2026, 10, 1, 10).toIso8601String(),
    'refunds': refunds,
  };
}

const AttachmentUpload pdfUpload = AttachmentUpload(path: '/tmp/receipt.pdf', filename: 'receipt.pdf', mimeType: 'application/pdf', sizeBytes: 2048);

Map<String, dynamic> detailJson({
  String id = 't1',
  String status = 'OPEN',
  String? assignedAgentUserId,
  List<Map<String, dynamic>> messages = const [],
  List<Map<String, dynamic>> refundablePayments = const [],
}) {
  return {
    ...queueJson(id: id, status: status, assignedAgentUserId: assignedAgentUserId),
    'requester': {'id': 'pat-1', 'mobile': '+919000000003', 'role': 'PATIENT'},
    'linkedPatient': {
      'id': 'pat-1',
      'mobile': '+919000000003',
      'patientProfile': {'firstName': 'Asha', 'lastName': 'Rao'},
    },
    'assignedAgent': assignedAgentUserId == null ? null : {'id': assignedAgentUserId, 'mobile': '+919000000001'},
    'messages': messages,
    'attachments': <dynamic>[],
    'technicalIncidentDetail': null,
    'refundablePayments': refundablePayments,
  };
}

/// In-memory support backend that applies the same state rules as
/// tickets.service.ts for the calls the controllers make.
class FakeSupportApi implements SupportApi {
  List<QueueTicket> queueResult = [];
  int queueCalls = 0;
  Object? queueError;

  Map<String, dynamic> detail = detailJson();
  int ticketCalls = 0;
  Object? ticketError;
  Object? mutationError;
  Object? attachError;

  final List<String> calls = [];

  @override
  Future<List<QueueTicket>> queue({String? status}) async {
    queueCalls += 1;
    if (queueError != null) throw queueError!;
    return queueResult;
  }

  @override
  Future<TicketDetail> ticket(String id) async {
    ticketCalls += 1;
    if (ticketError != null) throw ticketError!;
    return TicketDetail.fromJson(detail);
  }

  @override
  Future<String> reply(String id, String body) async {
    calls.add('reply:$id:$body');
    if (mutationError != null) throw mutationError!;
    final messages = [...(detail['messages'] as List<Map<String, dynamic>>)];
    final messageId = 'm${messages.length + 1}';
    messages.add({
      'id': messageId,
      'body': body,
      'createdAt': DateTime.utc(2026, 10, 10, 9).toIso8601String(),
      'authorUserId': agentUser.id,
      'author': {'id': agentUser.id, 'mobile': agentUser.mobile, 'role': agentUser.role},
    });
    detail = {...detail, 'messages': messages, if (detail['status'] == 'OPEN') 'status': 'IN_PROGRESS'};
    return messageId;
  }

  /// Mirrors addAttachment + detailInclude: the row shows up both on the
  /// ticket and on its message.
  @override
  Future<void> attach(String id, AttachmentUpload file, {String? messageId}) async {
    calls.add('attach:$id:${file.filename}:$messageId');
    if (attachError != null) throw attachError!;
    final row = {
      'id': 'a${(detail['attachments'] as List).length + 1}',
      'ticketId': id,
      'messageId': messageId,
      'originalName': file.filename,
      'mimeType': file.mimeType,
      'sizeBytes': file.sizeBytes,
    };
    final messages = [
      for (final m in detail['messages'] as List<Map<String, dynamic>>)
        m['id'] == messageId ? {...m, 'attachments': [...?(m['attachments'] as List?), row]} : m,
    ];
    detail = {...detail, 'messages': messages, 'attachments': [...(detail['attachments'] as List), row]};
  }

  /// Mirrors requestRefund: a new REQUESTED refund on that payment.
  @override
  Future<void> requestRefund({required String paymentId, required int amount, String? reason}) async {
    calls.add('refund:$paymentId:$amount:$reason');
    if (mutationError != null) throw mutationError!;
    final payments = [
      for (final p in detail['refundablePayments'] as List<Map<String, dynamic>>)
        p['id'] == paymentId
            ? {
                ...p,
                'refunds': [
                  ...(p['refunds'] as List),
                  {'id': 'r${(p['refunds'] as List).length + 1}', 'amount': amount, 'status': 'REQUESTED'},
                ],
              }
            : p,
    ];
    detail = {...detail, 'refundablePayments': payments};
  }

  @override
  Future<void> claim(String id) async {
    calls.add('claim:$id');
    if (mutationError != null) throw mutationError!;
    detail = {
      ...detail,
      'assignedAgentUserId': agentUser.id,
      'assignedAgent': {'id': agentUser.id, 'mobile': agentUser.mobile},
      if (detail['status'] == 'OPEN') 'status': 'IN_PROGRESS',
    };
  }

  @override
  Future<void> updateStatus(String id, String status) async {
    calls.add('status:$id:$status');
    if (mutationError != null) throw mutationError!;
    detail = {...detail, 'status': status};
  }

  @override
  Future<void> triage(String id, {String? department, String? priority}) async {
    calls.add('triage:$id:$department:$priority');
    if (mutationError != null) throw mutationError!;
    detail = {...detail, if (department != null) 'department': department, if (priority != null) 'priority': priority};
  }
}

const notFound = ApiException(message: 'Ticket not found', statusCode: 404);
