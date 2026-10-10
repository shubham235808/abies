import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/pharmacy_order.dart';

/// Status pill using the theme's semantic colours (no hardcoded hex).
class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip({super.key, required this.status});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg) = switch (status) {
      OrderStatus.pending => (semantic.warningSubtle, semantic.warningStrong),
      OrderStatus.accepted || OrderStatus.packing => (semantic.infoSubtle, semantic.infoStrong),
      OrderStatus.dispatched => (scheme.primaryContainer, scheme.onPrimaryContainer),
      OrderStatus.delivered => (semantic.successSubtle, semantic.successStrong),
      OrderStatus.cancelled => (semantic.dangerSubtle, semantic.dangerStrong),
      OrderStatus.unknown => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(status.label, style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 12)),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.order, required this.onTap});

  final PharmacyOrder order;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: ListTile(
        onTap: onTap,
        title: Text(order.patientName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '${order.itemsSummary}\nPlaced ${formatDateTime(order.createdAt)} · ₹${order.total}',
          maxLines: 3,
          overflow: TextOverflow.ellipsis,
        ),
        isThreeLine: true,
        trailing: OrderStatusChip(status: order.status),
      ),
    );
  }
}

String formatDateTime(DateTime d) {
  String two(int n) => n.toString().padLeft(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${months[d.month - 1]} ${d.year}, ${two(d.hour)}:${two(d.minute)}';
}

String formatDate(DateTime d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return '${d.day} ${months[d.month - 1]} ${d.year}';
}
