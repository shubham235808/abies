import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/presentation/pending_redirect.dart';
import '../domain/panchakarma_therapy.dart';
import 'panchakarma_booking_flow_controller.dart';

/// The Panchakarma booking flow (docs/mobile/IMPLEMENTATION-PLAN.md Phase
/// 5): session-count selection → book → payment-or-unavailable →
/// confirmation. Reached from `PanchakarmaTherapyDetailScreen`'s "Book this
/// therapy" button, `extra: therapy` — same navigation shape as Phase 4's
/// `BookingScreen`, except there is no slot/time step here at all
/// (`bookTherapySchema` takes `centreId`/`therapyId`/`sessionCount`, no
/// date — confirmed by reading `bookings.schemas.ts`).
class PanchakarmaBookingScreen extends StatelessWidget {
  const PanchakarmaBookingScreen({super.key, required this.therapy});

  final PanchakarmaTherapy? therapy;

  @override
  Widget build(BuildContext context) {
    final therapy = this.therapy;
    if (therapy == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Book therapy')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline, size: 48),
                const SizedBox(height: 12),
                const Text('Nothing to book yet — please start from Panchakarma search.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => context.go('/panchakarma'), child: const Text('Go to search')),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Book therapy')),
      body: _BookingBody(therapy: therapy),
    );
  }
}

class _BookingBody extends ConsumerWidget {
  const _BookingBody({required this.therapy});

  final PanchakarmaTherapy therapy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Session-count selection is public browsing — only "Confirm booking"
    // needs a session (see `PanchakarmaBookingFlowController.confirmBooking`
    // and `app_router.dart`'s redirect doc comment). Signed out, that
    // button sets this `requiresAuth` outcome instead of calling the
    // backend; react here by sending the visitor to sign in and recording
    // this exact screen (therapy + whatever session count they'd already
    // picked, preserved via Riverpod's own provider state) as where to
    // land back once they do.
    ref.listen(panchakarmaBookingFlowControllerProvider(therapy), (previous, next) {
      if (next.outcome.kind == PanchakarmaBookOutcomeKind.requiresAuth) {
        ref.read(pendingRedirectProvider.notifier).state = PendingRedirect(location: '/panchakarma/book', extra: therapy);
        context.push('/sign-in');
      }
    });
    final state = ref.watch(panchakarmaBookingFlowControllerProvider(therapy));
    final controller = ref.read(panchakarmaBookingFlowControllerProvider(therapy).notifier);
    final estimatedTotal = therapy.price * state.sessionCount;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(therapy.name, style: Theme.of(context).textTheme.titleLarge),
        if (therapy.centreName != null) Text(therapy.centreName!),
        const SizedBox(height: 4),
        Text('₹${therapy.price} per session'),
        const SizedBox(height: 16),
        Text('How many sessions?', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Row(
          children: [
            IconButton(
              icon: const Icon(Icons.remove_circle_outline),
              onPressed: state.sessionCount > 1 ? () => controller.setSessionCount(state.sessionCount - 1) : null,
            ),
            Text('${state.sessionCount}', style: Theme.of(context).textTheme.titleLarge),
            IconButton(
              icon: const Icon(Icons.add_circle_outline),
              onPressed: state.sessionCount < 60 ? () => controller.setSessionCount(state.sessionCount + 1) : null,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          // Client-side estimate only — the backend computes the
          // authoritative amount (`bookTherapy()`'s `totalPrice`), never
          // trusted as final from here.
          'Estimated total: ₹$estimatedTotal',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 16),
        _BookOutcomeBanner(outcome: state.outcome),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: state.submitting ? null : controller.confirmBooking,
          child: state.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Confirm booking'),
        ),
      ],
    );
  }
}

class _BookOutcomeBanner extends StatelessWidget {
  const _BookOutcomeBanner({required this.outcome});

  final PanchakarmaBookOutcome outcome;

  @override
  Widget build(BuildContext context) {
    switch (outcome.kind) {
      case PanchakarmaBookOutcomeKind.none:
        return const SizedBox.shrink();
      case PanchakarmaBookOutcomeKind.requiresAuth:
        // Nothing to show — `_BookingBody`'s `ref.listen` above already
        // navigates away to `/sign-in` the instant this outcome appears.
        return const SizedBox.shrink();
      case PanchakarmaBookOutcomeKind.success:
        final result = outcome.result!;
        return Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Booking created — complete payment to confirm'),
                Text('Amount: ₹${result.amount}'),
                Text('Order: ${result.razorpayOrderId}'),
                const SizedBox(height: 8),
                // Deliberately no real Razorpay SDK call here — same Phase
                // 8 deferral as Phase 4's `BookingScreen`. The backend's own
                // `/verify-payment` response, not a client-side provider
                // callback, is what would confirm this booking.
                const Text(
                  'Real payment capture is a Phase 8 dependency, not implemented in this build. '
                  'This booking is created but will not be confirmed from this screen.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ],
            ),
          ),
        );
      case PanchakarmaBookOutcomeKind.serviceUnavailable:
        return Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(child: Text(outcome.message ?? "Booking isn't available in this environment yet.")),
              ],
            ),
          ),
        );
      case PanchakarmaBookOutcomeKind.conflict:
        return Card(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(outcome.message ?? 'This therapy is no longer available — please go back and search again.'),
          ),
        );
      case PanchakarmaBookOutcomeKind.error:
        return Card(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(outcome.message ?? 'Something went wrong. Please try again.'),
          ),
        );
    }
  }
}
