import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../profile/presentation/profile_controller.dart';
import '../domain/cart.dart';
import 'checkout_flow_controller.dart';

/// The cart checkout flow (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7):
/// delivery address → checkout → payment-or-unavailable. Reached from
/// `CartScreen`'s "Checkout" button, always via `extra: Cart`, never a bare
/// id (there is no single-cart `GET` to resolve one from cold — this
/// screen's own re-fetch for the availability check goes through
/// `PharmacyApi.myCarts()` instead, see `CheckoutFlowController`).
///
/// **Prescription-gated items were never in this cart to begin with** —
/// `addToCart()` already refuses one server-side (see `MedicineSummary`'s
/// doc comment) — so this screen never shows or enforces any
/// prescription-related copy; the backend's own checkout response is the
/// only authority this flow defers to (brief §10).
class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key, required this.cart});

  final Cart? cart;

  @override
  Widget build(BuildContext context) {
    final cart = this.cart;
    if (cart == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Checkout')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.info_outline, size: 48),
                const SizedBox(height: 12),
                const Text('Nothing to check out yet — please start from your cart.', textAlign: TextAlign.center),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => context.go('/pharmacy/cart'), child: const Text('Go to cart')),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: _CheckoutBody(cart: cart),
    );
  }
}

class _CheckoutBody extends ConsumerWidget {
  const _CheckoutBody({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(checkoutFlowControllerProvider(cart.id));
    final controller = ref.read(checkoutFlowControllerProvider(cart.id).notifier);
    final profileAsync = ref.watch(profileControllerProvider);
    final familyMembers = profileAsync.value?.profile.familyMembers ?? const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(cart.pharmacyName ?? 'Pharmacy', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ...cart.items.map((item) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${item.medicineName}${item.variantLabel != null ? ' (${item.variantLabel})' : ''}'),
              subtitle: Text('Qty ${item.quantity}'),
              trailing: Text('₹${item.lineTotal}'),
            )),
        const Divider(),
        Row(
          children: [
            Text('Subtotal', style: Theme.of(context).textTheme.titleMedium),
            const Spacer(),
            Text('₹${cart.subtotal}', style: Theme.of(context).textTheme.titleMedium),
          ],
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
        _CheckoutOutcomeBanner(outcome: state.outcome),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: state.submitting ? null : controller.confirmCheckout,
          child: state.submitting
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Place order'),
        ),
      ],
    );
  }
}

class _CheckoutOutcomeBanner extends StatelessWidget {
  const _CheckoutOutcomeBanner({required this.outcome});

  final CheckoutOutcome outcome;

  @override
  Widget build(BuildContext context) {
    switch (outcome.kind) {
      case CheckoutOutcomeKind.none:
        return const SizedBox.shrink();
      case CheckoutOutcomeKind.success:
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
      case CheckoutOutcomeKind.serviceUnavailable:
        return Card(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Theme.of(context).colorScheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Expanded(child: Text(outcome.message ?? "Checkout isn't available in this environment yet.")),
              ],
            ),
          ),
        );
      case CheckoutOutcomeKind.conflict:
      case CheckoutOutcomeKind.validationError:
      case CheckoutOutcomeKind.error:
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
