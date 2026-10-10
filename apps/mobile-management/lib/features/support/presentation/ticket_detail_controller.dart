import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../domain/support_ticket.dart';
import 'ticket_queue_controller.dart';

/// One ticket's thread + staff actions. Every action follows apps/mobile's
/// `AppointmentsController` convention: returns null on success or the
/// backend's user-facing message on failure (e.g. "This ticket is already
/// claimed by another agent", "Cannot move a OPEN ticket to RESOLVED"),
/// without replacing the loaded ticket with an error state. On success the
/// ticket is re-fetched (mutation responses are thin — see [SupportApi]) and
/// the queue is invalidated so its rows reflect the change on return.
class TicketDetailController extends FamilyAsyncNotifier<TicketDetail, String> {
  @override
  Future<TicketDetail> build(String ticketId) {
    return ref.read(supportApiProvider).ticket(ticketId);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(supportApiProvider).ticket(arg));
  }

  Future<String?> reply(String body) {
    final trimmed = body.trim();
    if (trimmed.isEmpty) return Future.value('Write a reply first.');
    if (trimmed.length > 5000) return Future.value('Replies are limited to 5000 characters.');
    return _run(() => ref.read(supportApiProvider).reply(arg, trimmed));
  }

  Future<String?> claim() => _run(() => ref.read(supportApiProvider).claim(arg));

  Future<String?> updateStatus(String status) => _run(() => ref.read(supportApiProvider).updateStatus(arg, status));

  Future<String?> triage({String? department, String? priority}) {
    if (department == null && priority == null) {
      return Future.value('Choose a department and/or priority to update.');
    }
    return _run(() => ref.read(supportApiProvider).triage(arg, department: department, priority: priority));
  }

  Future<String?> _run(Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (e) {
      return e.message;
    }
    ref.invalidate(ticketQueueControllerProvider);
    try {
      // Triage can move a ticket to another department; the backend then
      // 404s this viewer (canView) — that's a real outcome, surfaced as the
      // screen's error state rather than a stale "success" view.
      state = AsyncValue.data(await ref.read(supportApiProvider).ticket(arg));
    } on ApiException catch (e, st) {
      state = AsyncValue.error(e, st);
    }
    return null;
  }
}

final ticketDetailControllerProvider =
    AsyncNotifierProvider.family<TicketDetailController, TicketDetail, String>(TicketDetailController.new);
