import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/pharmacy_order.dart';
import 'order_widgets.dart';
import 'orders_controller.dart';

/// Every paid order, filterable by status — the mobile version of
/// apps/partner-web/src/app/partner/pharmacy/orders/page.tsx.
class OrderListScreen extends ConsumerStatefulWidget {
  const OrderListScreen({super.key});

  @override
  ConsumerState<OrderListScreen> createState() => _OrderListScreenState();
}

class _OrderListScreenState extends ConsumerState<OrderListScreen> {
  /// null = all.
  OrderStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(ordersControllerProvider);
    const filters = [
      OrderStatus.pending,
      OrderStatus.accepted,
      OrderStatus.packing,
      OrderStatus.dispatched,
      OrderStatus.delivered,
      OrderStatus.cancelled,
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('All orders')),
      body: Column(
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                ChoiceChip(label: const Text('All'), selected: _filter == null, onSelected: (_) => setState(() => _filter = null)),
                for (final f in filters)
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: ChoiceChip(label: Text(f.label), selected: _filter == f, onSelected: (_) => setState(() => _filter = f)),
                  ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => e is ApiException && e.isTransportFailure
                  ? OfflineStateView(onRetry: () => ref.read(ordersControllerProvider.notifier).refresh())
                  : ErrorStateView(
                      message: e is ApiException ? e.message : 'Could not load orders.',
                      onRetry: () => ref.read(ordersControllerProvider.notifier).refresh(),
                    ),
              data: (orders) {
                // Newest first for browsing history; the dashboard keeps the
                // backend's FIFO order for the work queue.
                final shown = orders.where((o) => _filter == null || o.status == _filter).toList().reversed.toList();
                return RefreshIndicator(
                  onRefresh: () => ref.read(ordersControllerProvider.notifier).refresh(),
                  child: shown.isEmpty
                      ? ListView(children: const [SizedBox(height: 120), EmptyStateView(message: 'No orders here.')])
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: shown.length,
                          itemBuilder: (context, i) => OrderTile(order: shown[i], onTap: () => context.push('/orders/${shown[i].id}')),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
