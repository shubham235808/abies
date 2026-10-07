import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/panchakarma_booking_detail.dart';
import 'panchakarma_bookings_controller.dart';

/// "My Panchakarma bookings" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 5).
/// Each card opens the full detail screen (sessions, centre address,
/// payment) — unlike Phase 4's `AppointmentListScreen`, which inlined cancel
/// directly on the card with no separate detail route, this phase's
/// `GET /api/v1/panchakarma-bookings/[id]` returns a materially richer
/// shape (session schedule, therapist names) that's worth its own screen.
class PanchakarmaBookingListScreen extends ConsumerWidget {
  const PanchakarmaBookingListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(panchakarmaBookingsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My Panchakarma bookings')),
      body: async.when(
        loading: () => ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: 3,
          itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 96)),
        ),
        error: (error, _) => ErrorStateView(
          message: error is ApiException ? error.message : 'Could not load your Panchakarma bookings.',
          onRetry: () => ref.read(panchakarmaBookingsControllerProvider.notifier).refresh(),
        ),
        data: (bookings) => bookings.isEmpty
            ? const EmptyStateView(message: 'No Panchakarma bookings yet.', icon: Icons.spa_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(panchakarmaBookingsControllerProvider.notifier).refresh(),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: bookings.length,
                  itemBuilder: (context, i) => _BookingCard(booking: bookings[i]),
                ),
              ),
      ),
    );
  }
}

class _BookingCard extends StatelessWidget {
  const _BookingCard({required this.booking});

  final PanchakarmaBookingDetail booking;

  @override
  Widget build(BuildContext context) {
    final attended = booking.sessions.where((s) => s.isAttended).length;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/panchakarma/bookings/${booking.id}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.spa_outlined),
                  const SizedBox(width: 8),
                  Expanded(child: Text(booking.therapyName ?? 'Panchakarma booking', style: Theme.of(context).textTheme.titleMedium)),
                  Chip(label: Text(_statusLabel(booking.status))),
                ],
              ),
              const SizedBox(height: 4),
              if (booking.centreName != null) Text(booking.centreName!),
              Text('$attended of ${booking.sessionCount} sessions attended'),
              if (booking.cancellationReason != null)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('Cancelled: ${booking.cancellationReason}')),
            ],
          ),
        ),
      ),
    );
  }
}

String _statusLabel(String status) {
  return status.split('_').map((w) => w.isEmpty ? w : '${w[0]}${w.substring(1).toLowerCase()}').join(' ');
}
