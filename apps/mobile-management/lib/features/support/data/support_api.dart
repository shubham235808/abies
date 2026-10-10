import '../../../core/api/api_client.dart';
import '../domain/support_ticket.dart';

/// Staff-side support ticketing, against the existing routes under
/// apps/platform-api/src/app/api/v1/support/tickets/ only — nothing here
/// invents an endpoint. Behind an interface so the controllers are
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

  /// `POST /support/tickets/{id}/messages` with `{ body }` (1-5000 chars).
  Future<void> reply(String id, String body);

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
  Future<void> reply(String id, String body) {
    return _client.post<void>('${_ticketPath(id)}/messages', body: {'body': body}, decode: (_) {});
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
