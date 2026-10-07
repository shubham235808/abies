import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../profile/presentation/profile_controller.dart';
import '../domain/prescription_match_item.dart';
import '../domain/prescription_summary.dart';
import 'prescription_purchase_controller.dart';

/// "Purchase from a finalized prescription" (docs/mobile/
/// IMPLEMENTATION-PLAN.md Phase 7): pick a pharmacy →
/// `matchPrescriptionAtPharmacy` resolves which items that pharmacy
/// actually stocks → pick quantities for the available ones → place the
/// order directly (`POST /api/v1/medicine-orders`, **not** the cart —
/// see `PrescriptionMatchItem`'s doc comment for why).
class PrescriptionPurchaseScreen extends ConsumerWidget {
  const PrescriptionPurchaseScreen({super.key, required this.prescription});

  final PrescriptionSummary? prescription;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prescription = this.prescription;
    if (prescription == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Order medicines')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline, size: 48),
                const SizedBox(height: 12),
                const Text('Nothing to order yet — please start from My prescriptions.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => context.go('/prescriptions'), child: const Text('Go to prescriptions')),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Order medicines')),
      body: _PurchaseBody(prescription: prescription),
    );
  }
}

class _PurchaseBody extends ConsumerWidget {
  const _PurchaseBody({required this.prescription});

  final PrescriptionSummary prescription;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(prescriptionPurchaseControllerProvider(prescription.id));
    final controller = ref.read(prescriptionPurchaseControllerProvider(prescription.id).notifier);
    final pharmaciesAsync = ref.watch(pharmaciesProvider);
    final profileAsync = ref.watch(profileControllerProvider);
    final familyMembers = profileAsync.value?.profile.familyMembers ?? const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Choose a pharmacy', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        pharmaciesAsync.when(
          loading: () => const LinearProgressIndicator(),
          error: (error, _) => ErrorStateView(
            message: error is ApiException ? error.message : 'Could not load pharmacies.',
            onRetry: () => ref.invalidate(pharmaciesProvider),
          ),
          data: (pharmacies) => pharmacies.isEmpty
              ? const Text('No approved pharmacies are available right now.')
              : DropdownButtonFormField<String>(
                  initialValue: state.pharmacyId,
                  decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Pharmacy'),
                  items: pharmacies.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name ?? p.id))).toList(),
                  onChanged: (id) {
                    if (id != null) controller.selectPharmacy(id);
                  },
                ),
        ),
        const SizedBox(height: 16),
        if (state.matchItems != null) ...[
          Text('What this pharmacy can fulfil', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          state.matchItems!.when(
            loading: () => const LinearProgressIndicator(),
            error: (error, _) => ErrorStateView(
              message: error is ApiException ? error.message : 'Could not check this pharmacy.',
              onRetry: () => state.pharmacyId != null ? controller.selectPharmacy(state.pharmacyId!) : null,
            ),
            data: (items) => items.isEmpty
                ? const Text('This prescription has no items to match.')
                : Column(children: items.map((item) => _MatchItemRow(item: item, state: state, controller: controller)).toList()),
          ),
          const SizedBox(height: 16),
          TextField(
            onChanged: controller.setDeliveryAddress,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Delivery address', border: OutlineInputBorder()),
          ),
          if (familyMembers.isNotEmpty) ...[
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: state.careRecipientFamilyMemberId,
              decoration: const InputDecoration(labelText: 'For (optional)', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Myself')),
                ...familyMembers.map((m) => DropdownMenuItem<String?>(value: m.id, child: Text(m.name))),
              ],
              onChanged: controller.setCareRecipientFamilyMemberId,
            ),
          ],
          const SizedBox(height: 16),
          _PurchaseOutcomeBanner(outcome: state.outcome),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: state.submitting ? null : controller.confirmPurchase,
            child: state.submitting
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Place order'),
          ),
        ],
      ],
    );
  }
}

class _MatchItemRow extends StatelessWidget {
  const _MatchItemRow({required this.item, required this.state, required this.controller});

  final PrescriptionMatchItem item;
  final PrescriptionPurchaseState state;
  final PrescriptionPurchaseController controller;

  @override
  Widget build(BuildContext context) {
    final quantity = state.quantities[item.prescriptionItemId] ?? 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.productName),
                  if (!item.available)
                    Text('Not stocked at this pharmacy', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12))
                  else
                    Text('₹${item.price} · ${item.quantityAvailable} in stock', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            if (item.available) ...[
              IconButton(
                icon: const Icon(Icons.remove_circle_outline),
                onPressed: quantity > 0 ? () => controller.setQuantity(item.prescriptionItemId, quantity - 1) : null,
              ),
              Text('$quantity'),
              IconButton(
                icon: const Icon(Icons.add_circle_outline),
                onPressed: quantity < item.quantityAvailable ? () => controller.setQuantity(item.prescriptionItemId, quantity + 1) : null,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PurchaseOutcomeBanner extends StatelessWidget {
  const _PurchaseOutcomeBanner({required this.outcome});

  final PurchaseOutcome outcome;

  @override
  Widget build(BuildContext context) {
    switch (outcome.kind) {
      case PurchaseOutcomeKind.none:
        return const SizedBox.shrink();
      case PurchaseOutcomeKind.success:
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
                const Text(
                  'Real payment capture is a Phase 8 dependency, not implemented in this build. '
                  'This order is created but will not be confirmed from this screen.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ],
            ),
          ),
        );
      case PurchaseOutcomeKind.serviceUnavailable:
        return Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(child: Text(outcome.message ?? "Ordering isn't available in this environment yet.")),
              ],
            ),
          ),
        );
      case PurchaseOutcomeKind.conflict:
      case PurchaseOutcomeKind.validationError:
      case PurchaseOutcomeKind.error:
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
