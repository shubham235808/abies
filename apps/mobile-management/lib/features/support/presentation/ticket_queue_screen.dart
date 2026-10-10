import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/domain/session_user.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/support_ticket.dart';
import 'ticket_badges.dart';
import 'ticket_queue_controller.dart';

/// Home: the agent's department ticket queue, with the ops web's own
/// headline numbers (open, SLA breached) and queue tabs.
class TicketQueueScreen extends ConsumerWidget {
  const TicketQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).valueOrNull?.user;
    final queue = ref.watch(ticketQueueControllerProvider);
    final tab = ref.watch(selectedQueueTabProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/images/abies-mark.png', width: 28, height: 28, excludeFromSemantics: true),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Ticket queue'),
                  if (user != null)
                    Text(queueLabelForRole(user.role), style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'sign-out') ref.read(authControllerProvider.notifier).signOut();
            },
            itemBuilder: (context) => [
              if (user != null) PopupMenuItem<String>(enabled: false, child: Text('Signed in as ${user.email ?? user.mobile}')),
              const PopupMenuItem<String>(value: 'sign-out', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: queue.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) {
          void retry() => ref.invalidate(ticketQueueControllerProvider);
          if (error is ApiException && error.isTransportFailure) return OfflineStateView(onRetry: retry);
          return ErrorStateView(message: error is ApiException ? error.message : 'Could not load the queue.', onRetry: retry);
        },
        data: (tickets) => _QueueBody(tickets: tickets, tab: tab, userId: user?.id ?? ''),
      ),
    );
  }
}

class _QueueBody extends ConsumerWidget {
  const _QueueBody({required this.tickets, required this.tab, required this.userId});

  final List<QueueTicket> tickets;
  final QueueTab tab;
  final String userId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = DateTime.now();
    final summary = QueueSummary.of(tickets, userId: userId, now: now);
    final visible = tickets.where((t) => matchesQueueTab(t, tab, userId: userId, now: now)).toList();
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: () => ref.read(ticketQueueControllerProvider.notifier).refresh(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Expanded(child: _MetricTile(label: 'Open', value: summary.open)),
                  const SizedBox(width: 8),
                  Expanded(child: _MetricTile(label: 'SLA breached', value: summary.slaBreached, alert: summary.slaBreached > 0)),
                  const SizedBox(width: 8),
                  Expanded(child: _MetricTile(label: 'Mine (open)', value: summary.mineOpen)),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final t in QueueTab.values)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text('${t.label} (${tickets.where((x) => matchesQueueTab(x, t, userId: userId, now: now)).length})'),
                        selected: t == tab,
                        onSelected: (_) => ref.read(selectedQueueTabProvider.notifier).state = t,
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (visible.isEmpty)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyStateView(message: 'No tickets here right now.'),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
              sliver: SliverList.separated(
                itemCount: visible.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, i) => _TicketCard(ticket: visible[i], now: now),
              ),
            ),
          if (tickets.length >= 200)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text(
                  'Showing the first 200 tickets (server limit).',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value, this.alert = false});

  final String label;
  final int value;
  final bool alert;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = alert ? theme.colorScheme.error : theme.colorScheme.primary;
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$value', style: theme.textTheme.headlineSmall?.copyWith(color: color, fontWeight: FontWeight.w800)),
            Text(label, style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.now});

  final QueueTicket ticket;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/tickets/${ticket.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: Text(ticket.subject, style: theme.textTheme.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis)),
                  const SizedBox(width: 8),
                  PriorityBadge(priority: ticket.priority),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${categoryLabel(ticket.category)}${ticket.requesterMobile != null ? ' · ${ticket.requesterMobile}' : ''}',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 4),
              Text(
                '${formatDateTime(ticket.createdAt)} · ${ticket.assignedAgentMobile != null ? 'Assigned to ${ticket.assignedAgentMobile}' : 'Unassigned'}',
                style: muted,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  StatusBadge(status: ticket.status),
                  SlaBadge(status: ticket.status, sla: ticket.sla, now: now),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
