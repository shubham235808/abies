import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../features/orders/domain/lab_order.dart';

/// Pill-shaped order status badge, colored from [AppSemanticColors] the way
/// the web's Badge tones are (info = in-flight, warning = needs action,
/// success = done, danger = cancelled).
class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip({super.key, required this.status});

  final LabOrderStatus status;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppSemanticColors>()!;
    final (bg, fg) = switch (status) {
      LabOrderStatus.scheduled => (c.warningSubtle, c.warningStrong),
      LabOrderStatus.sampleCollected || LabOrderStatus.processing => (c.infoSubtle, c.infoStrong),
      LabOrderStatus.completed => (c.successSubtle, c.successStrong),
      LabOrderStatus.cancelled => (c.dangerSubtle, c.dangerStrong),
      _ => (Theme.of(context).colorScheme.surfaceContainerHighest, Theme.of(context).colorScheme.onSurfaceVariant),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(status.label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
