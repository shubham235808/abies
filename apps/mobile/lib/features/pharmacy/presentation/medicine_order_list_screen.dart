import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/medicine_order_detail.dart';
import 'medicine_orders_controller.dart';

/// "My medicine orders" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7). Each
/// card opens the full detail screen — same "card → detail route" shape as
/// Phase 6's `DiagnosticOrderListScreen`.
class MedicineOrderListScreen extends ConsumerWidget {
  const MedicineOrderListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(medicineOrdersControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My medicine orders')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your medicine orders.',
          onRetry: () => ref.read(medicineOrdersControllerProvider.notifier).refresh(),
        ),
        data: (orders) => orders.isEmpty
            ? const EmptyStateView(message: 'No medicine orders yet.', icon: Icons.medication_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(medicineOrdersControllerProvider.notifier).refresh(),
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

  final MedicineOrderDetail order;

  @override
  Widget build(BuildContext context) {
    final itemLabel = order.items.isEmpty ? 'Medicine order' : order.items.map((i) => i.medicineName ?? '').where((s) => s.isNotEmpty).join(', ');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/pharmacy/orders/${order.id}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.medication_outlined),
                  const SizedBox(width: 8),
                  Expanded(child: Text(itemLabel, style: Theme.of(context).textTheme.titleMedium, overflow: TextOverflow.ellipsis)),
                  Chip(label: Text(_statusLabel(order.status))),
                ],
              ),
              const SizedBox(height: 4),
              if (order.pharmacyName != null) Text(order.pharmacyName!),
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
