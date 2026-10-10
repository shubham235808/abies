import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/pharmacy_order.dart';
import 'order_widgets.dart';
import 'orders_controller.dart';

/// Order detail + fulfilment — the mobile counterpart of
/// apps/partner-web/src/app/partner/pharmacy/orders/[id]/order-actions.tsx.
/// One primary action per state, walking accept -> packing -> dispatch ->
/// delivered, plus reject/cancel while the backend still allows it.
class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  final _carrierController = TextEditingController();
  final _trackingController = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _carrierController.dispose();
    _trackingController.dispose();
    super.dispose();
  }

  OrderDetailController get _controller => ref.read(orderDetailControllerProvider(widget.orderId).notifier);

  Future<void> _perform(Future<String?> Function() action, {String? successMessage}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await action();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null && successMessage != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(successMessage)));
    }
  }

  Future<void> _confirmCancel(OrderStatus status) async {
    final reasonController = TextEditingController(text: 'Cancelled by pharmacy');
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(status == OrderStatus.pending ? 'Reject this order?' : 'Cancel this order?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Stock is returned to your inventory and the patient is notified.'),
            const SizedBox(height: 12),
            TextField(
              controller: reasonController,
              maxLength: 500,
              decoration: const InputDecoration(labelText: 'Reason (shared with the patient)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep order')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(status == OrderStatus.pending ? 'Reject' : 'Cancel order'),
          ),
        ],
      ),
    );
    final reason = reasonController.text;
    reasonController.dispose();
    if (confirmed == true) {
      await _perform(() => _controller.cancel(reason: reason), successMessage: 'Order cancelled');
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailControllerProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Order')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(orderDetailControllerProvider(widget.orderId)))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load this order.',
                onRetry: () => ref.invalidate(orderDetailControllerProvider(widget.orderId)),
              ),
        data: (order) => RefreshIndicator(
          onRefresh: () => ref.refresh(orderDetailControllerProvider(widget.orderId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _header(order),
              const SizedBox(height: 12),
              _itemsCard(order),
              const SizedBox(height: 12),
              _fulfilmentCard(order),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(PharmacyOrder order) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(order.patientName, style: text.titleLarge)),
                OrderStatusChip(status: order.status),
              ],
            ),
            const SizedBox(height: 8),
            _infoRow(Icons.phone_outlined, order.patientMobile),
            if (order.deliveryAddress != null) _infoRow(Icons.location_on_outlined, order.deliveryAddress!),
            _infoRow(Icons.schedule, 'Placed ${formatDateTime(order.createdAt)}'),
            if (order.prescriptionId != null) _infoRow(Icons.description_outlined, 'Prescription order'),
            _infoRow(Icons.payments_outlined, 'Paid ₹${order.total}${order.paymentStatus != null ? ' (${order.paymentStatus})' : ''}'),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(IconData icon, String value) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  Widget _itemsCard(PharmacyOrder order) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Items to pick', style: text.titleMedium),
            const SizedBox(height: 8),
            for (final item in order.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.displayName, style: text.bodyLarge),
                          Text(
                            [
                              if (item.form != null) item.form!,
                              if (item.strength != null) item.strength!,
                              'Batch ${item.batchNumber}',
                            ].join(' · '),
                            style: text.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    Text('×${item.quantity}', style: text.titleSmall),
                    const SizedBox(width: 12),
                    Text('₹${item.lineTotal}'),
                  ],
                ),
              ),
            const Divider(),
            Row(
              children: [
                Expanded(child: Text('Total', style: text.titleSmall)),
                Text('₹${order.total}', style: text.titleSmall),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _fulfilmentCard(PharmacyOrder order) {
    final text = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final shipment = order.shipment;
    final children = <Widget>[Text('Fulfilment', style: text.titleMedium), const SizedBox(height: 12)];

    Widget primary(String label, Future<String?> Function() action, String success, {Key? key}) => FilledButton(
          key: key,
          onPressed: _busy ? null : () => _perform(action, successMessage: success),
          child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(label),
        );

    switch (order.status) {
      case OrderStatus.pending:
        children.add(const Text('Paid and waiting for you. Accept to start fulfilling it.'));
        children.add(const SizedBox(height: 12));
        children.add(primary('Accept order', _controller.accept, 'Order accepted', key: const ValueKey('accept-button')));
      case OrderStatus.accepted:
        children.add(const Text('Pick the items above, then start packing.'));
        children.add(const SizedBox(height: 12));
        children.add(primary('Start packing', _controller.startPacking, 'Marked as packing', key: const ValueKey('packing-button')));
      case OrderStatus.packing:
        children.addAll([
          TextField(controller: _carrierController, maxLength: 100, decoration: const InputDecoration(labelText: 'Carrier (optional)', hintText: 'e.g. BlueDart, own rider')),
          const SizedBox(height: 8),
          TextField(controller: _trackingController, maxLength: 100, decoration: const InputDecoration(labelText: 'Tracking reference (optional)')),
          const SizedBox(height: 8),
          primary(
            'Mark dispatched',
            () => _controller.dispatch(carrier: _carrierController.text, trackingRef: _trackingController.text),
            'Marked as dispatched',
            key: const ValueKey('dispatch-button'),
          ),
        ]);
      case OrderStatus.dispatched:
        if (shipment?.carrier != null || shipment?.trackingRef != null) {
          children.add(Text('Dispatched${shipment?.carrier != null ? ' via ${shipment!.carrier}' : ''}'
              '${shipment?.trackingRef != null ? ' (${shipment!.trackingRef})' : ''}'
              '${shipment?.dispatchedAt != null ? ' on ${formatDateTime(shipment!.dispatchedAt!)}' : ''}'));
          children.add(const SizedBox(height: 12));
        }
        children.add(primary('Mark delivered', _controller.markDelivered, 'Marked as delivered', key: const ValueKey('delivered-button')));
      case OrderStatus.delivered:
        children.add(Text('Delivered'
            '${shipment?.deliveredAt != null ? ' ${formatDateTime(shipment!.deliveredAt!)}' : ''}'
            '${shipment?.carrier != null ? ' via ${shipment!.carrier}' : ''}'
            '${shipment?.trackingRef != null ? ' (${shipment!.trackingRef})' : ''}.'));
      case OrderStatus.cancelled:
        children.add(Text('This order was cancelled${order.cancellationReason != null ? ': ${order.cancellationReason}' : '.'}'));
      case OrderStatus.unknown:
        children.add(const Text('This order is in a state this app version does not recognise. Check the partner portal.'));
    }

    if (order.status.canCancel) {
      children.add(const SizedBox(height: 8));
      children.add(TextButton(
        onPressed: _busy ? null : () => _confirmCancel(order.status),
        style: TextButton.styleFrom(foregroundColor: scheme.error),
        child: Text(order.status == OrderStatus.pending ? 'Reject order' : 'Cancel order'),
      ));
    }
    if (_error != null) {
      children.add(const SizedBox(height: 8));
      children.add(Text(_error!, style: TextStyle(color: scheme.error)));
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      ),
    );
  }
}
