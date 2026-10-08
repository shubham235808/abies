import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/presentation/pending_redirect.dart';
import '../domain/diagnostic_booking_args.dart';
import 'diagnostic_booking_flow_controller.dart';

/// The diagnostics booking flow (docs/mobile/IMPLEMENTATION-PLAN.md Phase
/// 6): collection mode → schedule → book → payment-or-unavailable →
/// confirmation. Reached from `DiagnosticTestDetailScreen`/
/// `DiagnosticPackageDetailScreen`'s "Book this…" buttons, the tests search
/// screen's multi-select "Book N tests" action, or
/// `DiagnosticRecommendationsScreen`'s "book from this recommendation"
/// action — always via `extra: DiagnosticBookingArgs(...)`, never a bare id.
class DiagnosticBookingScreen extends StatelessWidget {
  const DiagnosticBookingScreen({super.key, required this.args});

  final DiagnosticBookingArgs? args;

  @override
  Widget build(BuildContext context) {
    final args = this.args;
    if (args == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Book diagnostics')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline, size: 48),
                const SizedBox(height: 12),
                const Text('Nothing to book yet — please start from diagnostics search.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => context.go('/diagnostics'), child: const Text('Go to search')),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Book diagnostics')),
      body: _BookingBody(args: args),
    );
  }
}

class _BookingBody extends ConsumerWidget {
  const _BookingBody({required this.args});

  final DiagnosticBookingArgs args;

  Future<void> _pickDateTime(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 90)),
    );
    if (date == null || !context.mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(now.add(const Duration(hours: 2))));
    if (time == null) return;
    final combined = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    ref.read(diagnosticBookingFlowControllerProvider(args).notifier).setScheduledAt(combined);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Collection-mode/schedule selection is public browsing — only "Confirm
    // booking" needs a session (see
    // `DiagnosticBookingFlowController.confirmBooking` and
    // `app_router.dart`'s redirect doc comment). Signed out, that button
    // sets this `requiresAuth` outcome instead of calling the backend;
    // react here by sending the visitor to sign in and recording this
    // exact screen (args + whatever they'd already picked, preserved via
    // Riverpod's own provider state) as where to land back once they do.
    ref.listen(diagnosticBookingFlowControllerProvider(args), (previous, next) {
      if (next.outcome.kind == DiagnosticBookOutcomeKind.requiresAuth) {
        ref.read(pendingRedirectProvider.notifier).state = PendingRedirect(location: '/diagnostics/book', extra: args);
        context.push('/sign-in');
      }
    });
    final target = args.target;
    final state = ref.watch(diagnosticBookingFlowControllerProvider(args));
    final controller = ref.read(diagnosticBookingFlowControllerProvider(args).notifier);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(target.displayName, style: Theme.of(context).textTheme.titleLarge),
        if (target.labName != null) Text(target.labName!),
        if (args.recommendationId != null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text("Booking from your doctor's recommendation", style: TextStyle(fontStyle: FontStyle.italic)),
          ),
        const SizedBox(height: 16),
        Text('Collection', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: [
            const ButtonSegment(value: 'LAB_VISIT', label: Text('Visit the lab')),
            ButtonSegment(value: 'HOME', label: const Text('Home collection'), enabled: target.homeCollectionSupported),
          ],
          selected: {state.collectionMode},
          onSelectionChanged: (s) => controller.setCollectionMode(s.first),
        ),
        if (state.collectionMode == 'HOME') ...[
          const SizedBox(height: 12),
          TextField(
            onChanged: controller.setAddress,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Collection address', border: OutlineInputBorder()),
          ),
        ],
        const SizedBox(height: 16),
        Text('When', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => _pickDateTime(context, ref),
          icon: const Icon(Icons.schedule),
          label: Text(state.scheduledAt == null ? 'Choose date & time' : _formatDateTime(state.scheduledAt!)),
        ),
        const SizedBox(height: 16),
        Text(
          // Client-side estimate only — the backend computes the
          // authoritative amount (`bookOrder()`'s own `totalPrice`).
          'Estimated total: ₹${target.totalPrice}',
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

  final DiagnosticBookOutcome outcome;

  @override
  Widget build(BuildContext context) {
    switch (outcome.kind) {
      case DiagnosticBookOutcomeKind.none:
        return const SizedBox.shrink();
      case DiagnosticBookOutcomeKind.requiresAuth:
        // Nothing to show — `_BookingBody`'s `ref.listen` above already
        // navigates away to `/sign-in` the instant this outcome appears.
        return const SizedBox.shrink();
      case DiagnosticBookOutcomeKind.success:
        final result = outcome.result!;
        return Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Order created — complete payment to confirm'),
                Text('Amount: ₹${result.amount}'),
                Text('Order: ${result.razorpayOrderId}'),
                const SizedBox(height: 8),
                // Deliberately no real Razorpay SDK call here — same Phase
                // 8 deferral as every prior phase's booking screen.
                const Text(
                  'Real payment capture is a Phase 8 dependency, not implemented in this build. '
                  'This order is created but will not be confirmed from this screen.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ],
            ),
          ),
        );
      case DiagnosticBookOutcomeKind.serviceUnavailable:
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
      case DiagnosticBookOutcomeKind.conflict:
      case DiagnosticBookOutcomeKind.validationError:
      case DiagnosticBookOutcomeKind.error:
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

String _formatDateTime(DateTime dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final period = dt.hour >= 12 ? 'PM' : 'AM';
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${dt.day} ${months[dt.month - 1]}, $hour12:$minute $period';
}
