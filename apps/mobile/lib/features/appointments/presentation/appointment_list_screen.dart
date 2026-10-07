import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/appointment_detail.dart';
import 'appointments_controller.dart';

/// "My appointments" — full list + detail + cancel + review
/// (docs/mobile/IMPLEMENTATION-PLAN.md Phase 4). Each card already shows
/// every field `AppointmentDetail` carries, so there's no separate
/// single-appointment detail route in this phase — opening a card's actions
/// is the detail view.
class AppointmentListScreen extends ConsumerWidget {
  const AppointmentListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(appointmentsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My appointments')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your appointments.',
          onRetry: () => ref.read(appointmentsControllerProvider.notifier).refresh(),
        ),
        data: (appointments) => appointments.isEmpty
            ? const EmptyStateView(message: 'No appointments yet.', icon: Icons.event_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(appointmentsControllerProvider.notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: appointments.length,
                  itemBuilder: (context, i) => _AppointmentCard(appointment: appointments[i]),
                ),
              ),
      ),
    );
  }
}

class _AppointmentCard extends ConsumerWidget {
  const _AppointmentCard({required this.appointment});

  final AppointmentDetail appointment;

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this appointment?'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(labelText: 'Reason (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel appointment')),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await ref.read(appointmentsControllerProvider.notifier).cancel(appointment.id, reason: reasonController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Appointment cancelled.')),
    );
  }

  Future<void> _openReview(BuildContext context, WidgetRef ref) async {
    int rating = 5;
    final commentController = TextEditingController();
    final submit = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Rate your appointment'),
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
              TextField(
                controller: commentController,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Comment (optional)'),
              ),
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
        .read(appointmentsControllerProvider.notifier)
        .review(appointment.id, rating: rating, comment: commentController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? 'Thanks for your review!')),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(appointment.mode == 'VIDEO' ? Icons.videocam_outlined : Icons.local_hospital_outlined),
                const SizedBox(width: 8),
                Expanded(child: Text(appointment.doctorName ?? 'Doctor', style: Theme.of(context).textTheme.titleMedium)),
                Chip(label: Text(_statusLabel(appointment.status))),
              ],
            ),
            const SizedBox(height: 4),
            Text(_formatDateTime(appointment.scheduledAt)),
            if (appointment.clinicName != null) Text('${appointment.clinicName} · ${appointment.clinicCity ?? ''}'),
            if (appointment.familyMemberName != null) Text('For ${appointment.familyMemberName}'),
            if (appointment.reasonForVisit != null && appointment.reasonForVisit!.isNotEmpty)
              Padding(padding: const EdgeInsets.only(top: 4), child: Text('Reason: ${appointment.reasonForVisit}')),
            if (appointment.paymentAmount != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Payment: ₹${appointment.paymentAmount} · ${appointment.paymentStatus ?? ''}'),
              ),
            if (appointment.cancellationReason != null)
              Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cancelled: ${appointment.cancellationReason}')),
            if (appointment.canCancel || appointment.canReview) ...[
              const Divider(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (appointment.canCancel)
                    TextButton(onPressed: () => _confirmCancel(context, ref), child: const Text('Cancel')),
                  if (appointment.canReview)
                    TextButton(onPressed: () => _openReview(context, ref), child: const Text('Leave a review')),
                ],
              ),
            ],
          ],
        ),
      ),
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
