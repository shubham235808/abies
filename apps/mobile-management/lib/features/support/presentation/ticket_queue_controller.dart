import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/app_providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/support_api.dart';
import '../domain/support_ticket.dart';

final supportApiProvider = Provider<SupportApi>((ref) => SupportApiImpl(ref.watch(apiClientProvider)));

/// Queue segments. `open` is this app's default ("what still needs me");
/// the rest are the web's own tabs from
/// packages/design-system/src/support/support-queue-view.tsx, with the same
/// matching rules.
enum QueueTab { open, unassigned, mine, p1, p2, awaitingCustomer, resolvedToday }

extension QueueTabLabel on QueueTab {
  String get label {
    switch (this) {
      case QueueTab.open:
        return 'Open';
      case QueueTab.unassigned:
        return 'Unassigned';
      case QueueTab.mine:
        return 'My tickets';
      case QueueTab.p1:
        return 'P1';
      case QueueTab.p2:
        return 'P2';
      case QueueTab.awaitingCustomer:
        return 'Awaiting customer';
      case QueueTab.resolvedToday:
        return 'Resolved today';
    }
  }
}

bool _sameDay(DateTime a, DateTime b) => a.year == b.year && a.month == b.month && a.day == b.day;

/// Pure, so it's unit-tested directly. Mirrors `matchesTab` in
/// support-queue-view.tsx exactly for the six web tabs.
bool matchesQueueTab(QueueTicket t, QueueTab tab, {required String userId, required DateTime now}) {
  switch (tab) {
    case QueueTab.open:
      return t.isOpen;
    case QueueTab.unassigned:
      return t.assignedAgentUserId == null;
    case QueueTab.mine:
      return t.assignedAgentUserId == userId;
    case QueueTab.p1:
      return t.priority == 'P1';
    case QueueTab.p2:
      return t.priority == 'P2';
    case QueueTab.awaitingCustomer:
      return t.status == 'WAITING_CUSTOMER';
    case QueueTab.resolvedToday:
      final resolvedAt = t.resolvedAt;
      return t.status == 'RESOLVED' && resolvedAt != null && _sameDay(resolvedAt.toLocal(), now);
  }
}

/// Header numbers — same definitions as the ops web's
/// `supportVolumeBreakdown` (open = not RESOLVED/CLOSED; breached = open and
/// past `sla.responseDueAt`), computed over the department queue the
/// server already returned rather than a second endpoint (there is no
/// staff-facing breakdown API route; the web calls the service directly
/// from a server component).
class QueueSummary {
  const QueueSummary({required this.open, required this.slaBreached, required this.mineOpen});

  final int open;
  final int slaBreached;
  final int mineOpen;

  factory QueueSummary.of(List<QueueTicket> tickets, {required String userId, required DateTime now}) {
    var open = 0;
    var breached = 0;
    var mine = 0;
    for (final t in tickets) {
      if (!t.isOpen) continue;
      open += 1;
      if (t.assignedAgentUserId == userId) mine += 1;
      if (slaStateOf(status: t.status, sla: t.sla, now: now) == SlaState.breached) breached += 1;
    }
    return QueueSummary(open: open, slaBreached: breached, mineOpen: mine);
  }
}

/// The signed-in agent's department queue (`GET /support/tickets/queue`,
/// unfiltered — same call the web queue page makes, ordered by priority then
/// age server-side). Tabs filter client-side, as on the web.
class TicketQueueController extends AsyncNotifier<List<QueueTicket>> {
  @override
  Future<List<QueueTicket>> build() async {
    final auth = await ref.watch(authControllerProvider.future);
    if (!auth.isSignedIn) {
      throw StateError('TicketQueueController read before sign-in');
    }
    return ref.read(supportApiProvider).queue();
  }

  Future<void> refresh() async {
    // Keep showing the current list during a pull-to-refresh rather than
    // blanking to a spinner.
    state = await AsyncValue.guard(() => ref.read(supportApiProvider).queue());
  }
}

final ticketQueueControllerProvider = AsyncNotifierProvider<TicketQueueController, List<QueueTicket>>(TicketQueueController.new);

final selectedQueueTabProvider = StateProvider<QueueTab>((ref) => QueueTab.open);
