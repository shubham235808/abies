import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/api_exception.dart';
import '../domain/support_ticket.dart';

/// Staff-side support ticketing, against the existing routes under
/// apps/platform-api/src/app/api/v1/support/tickets/ (plus the one refund
/// request route a ticket's payments card uses) only — nothing here invents
/// an endpoint. None of these routes call `assertSameOrigin`, so all of them
/// work from a native client with no `Origin` header. Behind an interface so the controllers are
/// unit-testable with a fake.
///
/// Mutation responses (`claim`/`triage`/`status` return a bare Prisma row
/// without `requester`/`messages` includes; `messages` returns just the new
/// message) are intentionally not decoded into a [TicketDetail]: callers
/// re-fetch [ticket] afterwards so the screen always shows the server's
/// real post-mutation state (e.g. `addMessage` silently moving an OPEN
/// ticket to IN_PROGRESS, which the web thread view doesn't reflect).
abstract class SupportApi {
  /// `GET /support/tickets/queue[?status=]` → `{ tickets }`. Department
  /// scoping is server-side (`listQueue`); capped at 200 rows server-side.
  Future<List<QueueTicket>> queue({String? status});

  /// `GET /support/tickets/{id}` → `{ ticket }`.
  Future<TicketDetail> ticket(String id);

  /// `POST /support/tickets/{id}/messages` with `{ body }` (1-5000 chars) →
  /// `{ message }`. Returns the new message's id so an attachment can be
  /// bound to it.
  Future<String> reply(String id, String body);

  /// `POST /support/tickets/{id}/attachments`, multipart: `file` and an
  /// optional `messageId` → 201 `{ attachment }`. No role check beyond
  /// `canView` on the ticket.
  Future<void> attach(String id, AttachmentUpload file, {String? messageId});

  /// `POST /api/v1/refunds` with `{ paymentId, amount, reason? }`
  /// (`requestRefundSchema`; CUSTOMER_SUPPORT or ADMIN only) → 201
  /// `{ refund }` at status REQUESTED. Raising the request moves no money —
  /// a FINANCE/ADMIN approver decides it on the web refunds queue.
  Future<void> requestRefund({required String paymentId, required int amount, String? reason});

  /// `POST /support/tickets/{id}/claim` (no body).
  Future<void> claim(String id);

  /// `POST /support/tickets/{id}/status` with `{ status }`.
  Future<void> updateStatus(String id, String status);

  /// `POST /support/tickets/{id}/triage` with `{ department?, priority? }`
  /// (at least one required by the schema's refine).
  Future<void> triage(String id, {String? department, String? priority});
}

class SupportApiImpl implements SupportApi {
  SupportApiImpl(this._client);

  final ApiClient _client;

  static String _ticketPath(String id) => '/api/v1/support/tickets/${Uri.encodeComponent(id)}';

  @override
  Future<List<QueueTicket>> queue({String? status}) {
    return _client.get<List<QueueTicket>>(
      '/api/v1/support/tickets/queue',
      query: status == null ? null : {'status': status},
      decode: (json) => ((json as Map<String, dynamic>)['tickets'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(QueueTicket.fromJson)
          .toList(),
    );
  }

  @override
  Future<TicketDetail> ticket(String id) {
    return _client.get<TicketDetail>(
      _ticketPath(id),
      decode: (json) => TicketDetail.fromJson((json as Map<String, dynamic>)['ticket'] as Map<String, dynamic>),
    );
  }

  @override
  Future<String> reply(String id, String body) {
    return _client.post<String>(
      '${_ticketPath(id)}/messages',
      body: {'body': body},
      decode: (json) => ((json as Map<String, dynamic>)['message'] as Map<String, dynamic>)['id'] as String,
    );
  }

  @override
  Future<void> attach(String id, AttachmentUpload file, {String? messageId}) async {
    // Read the file before building the form so a missing/unreadable file
    // fails here, not mid-request — and as an ApiException, the one error
    // type controllers handle, not a raw FileSystemException.
    final MultipartFile upload;
    try {
      upload = await MultipartFile.fromFile(file.path, filename: file.filename, contentType: DioMediaType.parse(file.mimeType));
    } on FileSystemException {
      throw const ApiException(message: "Couldn't read that file. Pick it again and retry.", statusCode: 0);
    }
    return _client.postMultipart<void>(
      '${_ticketPath(id)}/attachments',
      buildForm: () => FormData.fromMap({
        'file': upload,
        if (messageId != null) 'messageId': messageId,
      }),
      decode: (_) {},
    );
  }

  @override
  Future<void> requestRefund({required String paymentId, required int amount, String? reason}) {
    return _client.post<void>(
      '/api/v1/refunds',
      body: {'paymentId': paymentId, 'amount': amount, if (reason != null) 'reason': reason},
      decode: (_) {},
    );
  }

  @override
  Future<void> claim(String id) {
    return _client.post<void>('${_ticketPath(id)}/claim', body: const <String, dynamic>{}, decode: (_) {});
  }

  @override
  Future<void> updateStatus(String id, String status) {
    return _client.post<void>('${_ticketPath(id)}/status', body: {'status': status}, decode: (_) {});
  }

  @override
  Future<void> triage(String id, {String? department, String? priority}) {
    assert(department != null || priority != null, 'provide a department and/or priority');
    return _client.post<void>(
      '${_ticketPath(id)}/triage',
      body: {if (department != null) 'department': department, if (priority != null) 'priority': priority},
      decode: (_) {},
    );
  }
}
