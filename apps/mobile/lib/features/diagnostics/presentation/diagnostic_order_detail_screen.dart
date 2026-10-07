import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/diagnostic_order_detail.dart';
import 'diagnostic_orders_controller.dart';
import 'diagnostic_report_controller.dart';

/// A single diagnostic order's full detail — `GET /api/v1/diagnostic-orders/
/// [id]` (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6): lab, items,
/// collection, payment, cancel, and — once released — the report.
///
/// **Report access** (docs/mobile/SECURITY-DESIGN.md §8): "View report" and
/// "Download report" are two separate, explicit actions, neither automatic.
/// Both go through the real authorized `GET /api/v1/reports/[id]/download`
/// endpoint (not `/diagnostic-orders/[id]/report-download`, which is
/// doctor-only — see `DiagnosticReportController`'s doc comment). View hands
/// the signed URL to the system browser/viewer; download saves the bytes to
/// this app's own private storage. Neither screen embeds the document in an
/// in-app WebView or auto-shares it anywhere.
class DiagnosticOrderDetailScreen extends ConsumerWidget {
  const DiagnosticOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(diagnosticOrderDetailProvider(orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Diagnostic order')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load this order.',
          onRetry: () => ref.invalidate(diagnosticOrderDetailProvider(orderId)),
        ),
        data: (order) => _OrderDetailBody(order: order),
      ),
    );
  }
}

class _OrderDetailBody extends ConsumerWidget {
  const _OrderDetailBody({required this.order});

  final DiagnosticOrderDetail order;

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
    final error = await ref.read(diagnosticOrdersControllerProvider.notifier).cancel(order.id, reason: reasonController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Order cancelled.')));
    if (error == null) {
      ref.invalidate(diagnosticOrderDetailProvider(order.id));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final itemLabel = order.items.isEmpty
        ? 'Diagnostic order'
        : order.items.map((i) => i.testName ?? i.packageName ?? '').where((s) => s.isNotEmpty).join(', ');

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
        if (order.labName != null) Text(order.labName!),
        const SizedBox(height: 8),
        Text('Collection: ${order.collectionMode == 'HOME' ? 'Home sample collection' : 'Visit the lab'}'),
        if (order.address != null && order.address!.isNotEmpty) Text(order.address!),
        if (order.scheduledAt != null) Text('Scheduled: ${_formatDateTime(order.scheduledAt!)}'),
        if (order.paymentAmount != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Payment: ₹${order.paymentAmount} · ${order.paymentStatus ?? ''}'),
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
              child: ListTile(title: Text(item.testName ?? item.packageName ?? 'Item'), trailing: Text('₹${item.price}')),
            ),
          ),
        if (order.hasReport) ...[
          const Divider(height: 24),
          _ReportSection(order: order),
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

class _ReportSection extends ConsumerWidget {
  const _ReportSection({required this.order});

  final DiagnosticOrderDetail order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final actionState = ref.watch(diagnosticReportControllerProvider(order.id));
    final controller = ref.read(diagnosticReportControllerProvider(order.id).notifier);
    final working = actionState.status == DiagnosticReportActionStatus.working;

    ref.listen(diagnosticReportControllerProvider(order.id), (previous, next) {
      if (next.status == DiagnosticReportActionStatus.error && next.message != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(next.message!)));
      } else if (next.status == DiagnosticReportActionStatus.success && next.message != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(next.message!)));
      }
    });

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Report', style: Theme.of(context).textTheme.titleMedium),
            if (order.reportCriticalFlag) ...[
              const SizedBox(width: 8),
              Chip(label: const Text('Critical'), backgroundColor: Theme.of(context).colorScheme.errorContainer),
            ],
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            OutlinedButton.icon(
              onPressed: working ? null : controller.view,
              icon: const Icon(Icons.open_in_new),
              label: const Text('View'),
            ),
            const SizedBox(width: 12),
            OutlinedButton.icon(
              onPressed: working ? null : controller.download,
              icon: const Icon(Icons.download_outlined),
              label: const Text('Download'),
            ),
            if (working) const Padding(padding: EdgeInsets.only(left: 12), child: SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2))),
          ],
        ),
      ],
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}

String _formatDateTime(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final period = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${dt.day} ${months[dt.month - 1]}, $hour12:$minute $period';
}
