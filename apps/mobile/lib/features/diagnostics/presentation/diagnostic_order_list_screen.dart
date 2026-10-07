import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/diagnostic_order_detail.dart';
import 'diagnostic_orders_controller.dart';

/// "My diagnostic orders" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6).
/// Each card opens the full detail screen (items, collection, payment,
/// report) — same "card → detail route, not inline actions" shape as
/// Phase 5's `PanchakarmaBookingListScreen`.
class DiagnosticOrderListScreen extends ConsumerWidget {
  const DiagnosticOrderListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diagnosticOrdersControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My diagnostic orders')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your diagnostic orders.',
          onRetry: () => ref.read(diagnosticOrdersControllerProvider.notifier).refresh(),
        ),
        data: (orders) => orders.isEmpty
            ? const EmptyStateView(message: 'No diagnostic orders yet.', icon: Icons.biotech_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(diagnosticOrdersControllerProvider.notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: orders.length,
                  itemBuilder: (context, i) => _OrderCard(order: orders[i]),
                ),
              ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final DiagnosticOrderDetail order;

  @override
  Widget build(BuildContext context) {
    final itemLabel = order.items.isEmpty
        ? 'Diagnostic order'
        : order.items.map((i) => i.testName ?? i.packageName ?? '').where((s) => s.isNotEmpty).join(', ');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/diagnostics/orders/${order.id}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.biotech_outlined),
                  const SizedBox(width: 8),
                  Expanded(child: Text(itemLabel, style: Theme.of(context).textTheme.titleMedium, overflow: TextOverflow.ellipsis)),
                  Chip(label: Text(_statusLabel(order.status))),
                ],
              ),
              const SizedBox(height: 4),
              if (order.labName != null) Text(order.labName!),
              if (order.hasReport)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Row(
                    children: [
                      Icon(Icons.description_outlined, size: 16, color: order.reportCriticalFlag ? Theme.of(context).colorScheme.error : null),
                      const SizedBox(width: 4),
                      Text(order.reportCriticalFlag ? 'Report ready — critical' : 'Report ready'),
                    ],
                  ),
                ),
              if (order.cancellationReason != null)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cancelled: ${order.cancellationReason}')),
            ],
          ),
        ),
      ),
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}
