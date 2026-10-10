import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/util/formatting.dart';
import '../../../shared/widgets/state_views.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../lab_profile/domain/lab_profile.dart';
import '../../lab_profile/presentation/lab_profile_controller.dart';
import '../domain/lab_order.dart';
import 'lab_orders_controller.dart';

String errorMessage(Object error) => error is ApiException ? error.message : 'Something went wrong. Please try again.';

/// Home. Mirrors the web lab overview
/// (apps/partner-web/src/app/partner/lab/page.tsx): a not-yet-approved lab
/// sees its verification status and the profile/catalogue/submit steps; an
/// APPROVED lab sees its order pipeline, active orders first.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final labAsync = ref.watch(labProfileControllerProvider);
    final lab = labAsync.valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(lab?.name?.isNotEmpty == true ? lab!.name! : 'ABIES Diagnostics'),
        actions: [
          IconButton(
            tooltip: 'Test catalogue',
            icon: const Icon(Icons.science_outlined),
            onPressed: () => context.push('/catalogue'),
          ),
          PopupMenuButton<String>(
            onSelected: (value) async {
              if (value == 'profile') {
                context.push('/profile');
              } else if (value == 'signout') {
                try {
                  await ref.read(authControllerProvider.notifier).signOut();
                } on ApiException catch (e) {
                  if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
                }
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'profile', child: Text('Lab profile')),
              PopupMenuItem(value: 'signout', child: Text('Sign out')),
            ],
          ),
        ],
      ),
      body: labAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(message: errorMessage(e), onRetry: () => ref.invalidate(labProfileControllerProvider)),
        data: (lab) => lab.isApproved ? const _ApprovedDashboard() : _OnboardingView(lab: lab),
      ),
    );
  }
}

class _OnboardingView extends ConsumerWidget {
  const _OnboardingView({required this.lab});

  final LabProfile lab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final String message;
    if (lab.verificationStatus == 'REJECTED') {
      message = 'Your last application was rejected${lab.rejectionReason != null ? ': ${lab.rejectionReason}' : ''}. Update your details and resubmit.';
    } else if (lab.isUnderReview) {
      message = "Your application is with the ABIES verification team. You'll be notified once it's reviewed.";
    } else if (lab.verificationStatus == 'SUSPENDED') {
      message = 'Your account has been suspended${lab.rejectionReason != null ? ': ${lab.rejectionReason}' : '.'} Contact ABIES support.';
    } else {
      message = 'Complete your lab profile and test catalogue, then submit for ABIES verification. Orders appear here once approved.';
    }
    return RefreshIndicator(
      onRefresh: () => ref.refresh(labProfileControllerProvider.future),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Text('Verification: ', style: Theme.of(context).textTheme.titleMedium),
            Chip(label: Text(lab.statusLabel)),
          ]),
          const SizedBox(height: 8),
          Text(message, style: TextStyle(color: lab.verificationStatus == 'REJECTED' || lab.verificationStatus == 'SUSPENDED' ? scheme.error : null)),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: const Icon(Icons.badge_outlined),
              title: const Text('Lab profile'),
              subtitle: Text(lab.isEditable ? 'Name, license numbers, service cities' : 'View your submitted details'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/profile'),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.science_outlined),
              title: const Text('Test catalogue'),
              subtitle: const Text('Tests and packages you offer, with pricing'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/catalogue'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ApprovedDashboard extends ConsumerWidget {
  const _ApprovedDashboard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(labOrdersControllerProvider);
    final filter = ref.watch(orderFilterProvider);
    return ordersAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorStateView(message: errorMessage(e), onRetry: () => ref.invalidate(labOrdersControllerProvider)),
      data: (orders) {
        final buckets = LabOrderBuckets(orders);
        final visible = filterOrders(orders, filter);
        return RefreshIndicator(
          onRefresh: () => ref.read(labOrdersControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (buckets.criticalUnacknowledged > 0) ...[
                _CriticalBanner(count: buckets.criticalUnacknowledged),
                const SizedBox(height: 12),
              ],
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _Metric(label: "Today's collections", value: buckets.todaysCollections),
                  _Metric(label: 'To collect', value: buckets.toCollect),
                  _Metric(label: 'Overdue', value: buckets.overdueCollections),
                  _Metric(label: 'Awaiting processing', value: buckets.awaitingProcessing),
                  _Metric(label: 'Reports pending', value: buckets.processing),
                ],
              ),
              const SizedBox(height: 16),
              SegmentedButton<OrderFilter>(
                segments: const [
                  ButtonSegment(value: OrderFilter.active, label: Text('Active')),
                  ButtonSegment(value: OrderFilter.completed, label: Text('Completed')),
                  ButtonSegment(value: OrderFilter.all, label: Text('All')),
                ],
                selected: {filter},
                onSelectionChanged: (s) => ref.read(orderFilterProvider.notifier).state = s.first,
              ),
              const SizedBox(height: 12),
              if (visible.isEmpty)
                EmptyStateView(
                  message: filter == OrderFilter.active ? 'No active orders right now. Pull down to refresh.' : 'No orders here yet.',
                )
              else
                ...visible.map((o) => _OrderCard(order: o)),
            ],
          ),
        );
      },
    );
  }
}

class _CriticalBanner extends StatelessWidget {
  const _CriticalBanner({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppSemanticColors>()!;
    return Card(
      color: c.dangerSubtle,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          Icon(Icons.priority_high, color: c.dangerStrong),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$count critical result${count == 1 ? '' : 's'} awaiting doctor acknowledgement',
              style: TextStyle(color: c.dangerStrong, fontWeight: FontWeight.w600),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 104,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.control),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$value', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: scheme.onPrimaryContainer, fontWeight: FontWeight.bold)),
          Text(label, style: TextStyle(fontSize: 12, color: scheme.onPrimaryContainer)),
        ],
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final LabOrderSummary order;

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final next = order.status.nextAction;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: () => context.push('/orders/${order.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(child: Text(order.patientName, style: Theme.of(context).textTheme.titleMedium)),
                OrderStatusChip(status: order.status),
              ]),
              const SizedBox(height: 4),
              Text(order.itemNames.join(', ')),
              const SizedBox(height: 4),
              Row(children: [
                Icon(order.isHomeCollection ? Icons.home_outlined : Icons.apartment_outlined, size: 16, color: muted),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${order.scheduledAt != null ? formatDateTime(order.scheduledAt!) : 'Not scheduled'} · ${order.collectionLabel}',
                    style: TextStyle(fontSize: 12, color: muted),
                  ),
                ),
              ]),
              if (next != null) ...[
                const SizedBox(height: 6),
                Text('Next: ${next.label}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w600)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
