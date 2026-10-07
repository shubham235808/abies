import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/panchakarma_booking_detail.dart';
import '../domain/panchakarma_session.dart';
import 'panchakarma_bookings_controller.dart';

/// A single Panchakarma booking's full detail — `GET /api/v1/panchakarma-
/// bookings/[id]` (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5): centre,
/// therapy, session schedule (with therapist name once the centre assigns
/// one), payment, and cancel.
class PanchakarmaBookingDetailScreen extends ConsumerWidget {
  const PanchakarmaBookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(panchakarmaBookingDetailProvider(bookingId));
    return Scaffold(
      appBar: AppBar(title: const Text('Booking')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load this booking.',
          onRetry: () => ref.invalidate(panchakarmaBookingDetailProvider(bookingId)),
        ),
        data: (booking) => _BookingDetailBody(booking: booking),
      ),
    );
  }
}

class _BookingDetailBody extends ConsumerWidget {
  const _BookingDetailBody({required this.booking});

  final PanchakarmaBookingDetail booking;

  Future<void> _confirmCancel(BuildContext context, WidgetRef ref) async {
    final reasonController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content: TextField(controller: reasonController, decoration: const InputDecoration(labelText: 'Reason (optional)')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Cancel booking')),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await ref.read(panchakarmaBookingsControllerProvider.notifier).cancel(booking.id, reason: reasonController.text.trim());
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error ?? 'Booking cancelled.')));
    if (error == null) {
      ref.invalidate(panchakarmaBookingDetailProvider(booking.id));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: Text(booking.therapyName ?? 'Panchakarma booking', style: Theme.of(context).textTheme.headlineSmall)),
            Chip(label: Text(_statusLabel(booking.status))),
          ],
        ),
        const SizedBox(height: 8),
        if (booking.centreName != null)
          Text([booking.centreName, booking.centreCity, booking.centreState].whereType<String>().join(', ')),
        const SizedBox(height: 8),
        Text('Sessions: ${booking.sessionCount}'),
        if (booking.paymentAmount != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Payment: ₹${booking.paymentAmount} · ${booking.paymentStatus ?? ''}'),
          ),
        if (booking.cancellationReason != null)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cancelled: ${booking.cancellationReason}')),
        const SizedBox(height: 16),
        Text('Session schedule', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (booking.sessions.isEmpty)
          const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('No sessions scheduled yet.'))
        else
          ...booking.sessions.map((s) => _SessionTile(session: s)),
        if (booking.canCancel) ...[
          const Divider(height: 24),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.tonal(onPressed: () => _confirmCancel(context, ref), child: const Text('Cancel booking')),
          ),
        ],
      ],
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({required this.session});

  final PanchakarmaSession session;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(session.isAttended ? Icons.check_circle_outline : Icons.schedule_outlined),
        title: Text('Session ${session.sessionNumber}'),
        subtitle: Text([
          _formatDateTime(session.scheduledAt),
          if (session.therapistName != null) 'with ${session.therapistName}',
          if (session.isAttended) 'Attended',
        ].join(' · ')),
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
