import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/medicine_order_detail.dart';
import '../domain/medicine_order_item.dart';
import 'medicine_orders_controller.dart';

/// A single medicine order's full detail — `GET /api/v1/medicine-orders/
/// [id]` (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7): pharmacy, items,
/// delivery, payment, cancel, and — once delivered — a per-item review
/// action.
///
/// **No document to view/download here** — unlike Phase 6's diagnostic
/// report, a `MedicineOrder` has no attached file of any kind; this screen
/// shows only its own structured fields.
class MedicineOrderDetailScreen extends ConsumerWidget {
  const MedicineOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(medicineOrderDetailProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Medicine order')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load this order.',
          onRetry: () => ref.invalidate(medicineOrderDetailProvider(orderId)),
        ),
        data: (order) => _OrderDetailBody(order: order),
      ),
    );
  }
}

class _OrderDetailBody extends ConsumerWidget {
  const _OrderDetailBody({required this.order});

  final MedicineOrderDetail order;

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: TextField(controller: reasonController, decoration: const InputDecoration(labelText: 'Reason (optional)')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel order')),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await ref.read(medicineOrdersControllerProvider.notifier).cancel(order.id, reason: reasonController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Order cancelled.')));
    if (error == null) {
      ref.invalidate(medicineOrderDetailProvider(order.id));
    }
  }

  Future<void> _openReview(BuildContext context, WidgetRef ref, MedicineOrderItem item) async {
    int rating = 5;
    final commentController = TextEditingController();
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Rate ${item.medicineName ?? 'this item'}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final starValue = i + 1;
                  return IconButton(
                    icon: Icon(starValue <= rating ? Icons.star : Icons.star_border),
                    onPressed: () => setState(() => rating = starValue),
                  );
                }),
              ),
              TextField(controller: commentController, maxLines: 3, decoration: const InputDecoration(labelText: 'Comment (optional)')),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Submit review')),
          ],
        ),
      ),
    );
    if (submit != true) return;
    final error = await ref
        .read(medicineOrdersControllerProvider.notifier)
        .review(order.id, medicineId: item.medicineId, rating: rating, comment: commentController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Thanks for your review!')));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemLabel = order.items.isEmpty ? 'Medicine order' : order.items.map((i) => i.medicineName ?? '').where((s) => s.isNotEmpty).join(', ');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(itemLabel, style: Theme.of(context).textTheme.headlineSmall)),
            Chip(label: Text(_statusLabel(order.status))),
          ],
        ),
        const SizedBox(height: 8),
        if (order.pharmacyName != null) Text(order.pharmacyName!),
        const SizedBox(height: 8),
        if (order.deliveryAddress != null && order.deliveryAddress!.isNotEmpty) Text('Deliver to: ${order.deliveryAddress}'),
        if (order.paymentAmount != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Payment: ₹${order.paymentAmount} · ${order.paymentStatus ?? ''}'),
          ),
        if (order.carrier != null || order.trackingRef != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Shipped via ${order.carrier ?? 'courier'}${order.trackingRef != null ? ' · ${order.trackingRef}' : ''}'),
          ),
        if (order.cancellationReason != null)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cancelled: ${order.cancellationReason}')),
        const SizedBox(height: 16),
        Text('Items', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (order.items.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No item detail available.'))
        else
          ...order.items.map(
            (item) => Card(
              child: ListTile(
                title: Text(item.medicineName ?? 'Item'),
                subtitle: Text('Qty ${item.quantity}'),
                trailing: Text('₹${item.lineTotal}'),
              ),
            ),
          ),
        if (order.canReview) ...[
          const Divider(height: 24),
          Text('Leave a review', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ...order.items.map(
            (item) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(item.medicineName ?? 'Item'),
              trailing: TextButton(onPressed: () => _openReview(context, ref, item), child: const Text('Review')),
            ),
          ),
        ],
        if (order.canCancel) ...[
          const Divider(height: 24),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonal(onPressed: () => _confirmCancel(context, ref), child: const Text('Cancel order')),
          ),
        ],
      ],
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}
