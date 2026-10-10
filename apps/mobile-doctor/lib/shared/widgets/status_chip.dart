import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../format.dart';

/// Pill-shaped status badge, coloured with the same semantic mapping the web
/// badges use (success = done, info = scheduled/submitted, warning = needs
/// attention/draft, danger = cancelled/rejected).
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppSemanticColors>()!;
    final (bg, fg) = switch (status) {
      'COMPLETED' || 'APPROVED' || 'FINALIZED' || 'FULFILLED' || 'CONFIRMED' => (c.successSubtle, c.successStrong),
      'CANCELLED' || 'REJECTED' || 'SUSPENDED' || 'NO_SHOW' => (c.dangerSubtle, c.dangerStrong),
      'DRAFT' || 'PENDING_PAYMENT' || 'UNDER_REVIEW' || 'IN_PROGRESS' => (c.warningSubtle, c.warningStrong),
      _ => (c.infoSubtle, c.infoStrong),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(humanizeEnum(status), style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
