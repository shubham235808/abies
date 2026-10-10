import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../domain/support_ticket.dart';

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.background, required this.foreground});

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(label, style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

/// P1 danger, P2 warning (web: orange = "needs attention"), P3 info, P4 neutral.
class PriorityBadge extends StatelessWidget {
  const PriorityBadge({super.key, required this.priority});

  final String priority;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).extension<AppSemanticColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (priority) {
      'P1' => (s.dangerSubtle, s.dangerStrong),
      'P2' => (s.warningSubtle, s.warningStrong),
      'P3' => (s.infoSubtle, s.infoStrong),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return _Pill(label: priority, background: bg, foreground: fg);
  }
}

class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).extension<AppSemanticColors>()!;
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = switch (status) {
      'OPEN' => (scheme.primaryContainer, scheme.onPrimaryContainer),
      'IN_PROGRESS' => (s.infoSubtle, s.infoStrong),
      'WAITING_CUSTOMER' || 'WAITING_PARTNER' => (s.warningSubtle, s.warningStrong),
      'RESOLVED' => (s.successSubtle, s.successStrong),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return _Pill(label: humanizeEnum(status), background: bg, foreground: fg);
  }
}

/// Response-SLA indicator. Shows nothing for a closed/resolved ticket or one
/// with no SLA snapshot.
class SlaBadge extends StatelessWidget {
  const SlaBadge({super.key, required this.status, required this.sla, required this.now});

  final String status;
  final TicketSla? sla;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final s = Theme.of(context).extension<AppSemanticColors>()!;
    final state = slaStateOf(status: status, sla: sla, now: now);
    switch (state) {
      case SlaState.none:
      case SlaState.closed:
        return const SizedBox.shrink();
      case SlaState.breached:
        return _Pill(label: 'SLA breached ${formatDuration(now.difference(sla!.responseDueAt!))} ago', background: s.dangerSubtle, foreground: s.dangerStrong);
      case SlaState.onTrack:
        return _Pill(label: 'Respond within ${formatDuration(sla!.responseDueAt!.difference(now))}', background: s.successSubtle, foreground: s.successStrong);
    }
  }
}

String formatDuration(Duration d) {
  if (d.inDays >= 1) return '${d.inDays}d ${d.inHours % 24}h';
  if (d.inHours >= 1) return '${d.inHours}h ${d.inMinutes % 60}m';
  return '${d.inMinutes < 1 ? 1 : d.inMinutes}m';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "10 Oct 2026, 14:05" in device-local time (no intl dependency needed).
String formatDateTime(DateTime dt) {
  final l = dt.toLocal();
  final hh = l.hour.toString().padLeft(2, '0');
  final mm = l.minute.toString().padLeft(2, '0');
  return '${l.day} ${_months[l.month - 1]} ${l.year}, $hh:$mm';
}
