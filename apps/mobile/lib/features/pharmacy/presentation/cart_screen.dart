import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/pending_redirect.dart';
import '../domain/cart.dart';
import '../domain/cart_item.dart';
import '../domain/local_cart_item.dart';
import 'cart_controller.dart';
import 'local_cart_controller.dart';

/// "My cart" (docs/mobile/IMPLEMENTATION-PLAN.md Phase 7) — **multi-cart
/// aware**: a patient can have one active cart per pharmacy (EXPANSION-1b),
/// so this screen is a list of cart sections, each with its own items,
/// subtotal and "Checkout" action, never one merged cross-pharmacy list.
///
/// **Browsable signed out** (brief: "Allow adding products to the cart
/// without login") — a guest sees their on-device-only
/// [LocalCartController] cart instead of the real backend one; see
/// `app_router.dart`'s redirect doc comment for why there's no guest
/// backend cart to show instead.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn = ref.watch(authControllerProvider).value?.isSignedIn ?? false;
    return Scaffold(
      appBar: AppBar(title: const Text('My cart')),
      body: signedIn ? const _SignedInCartBody() : const _GuestCartBody(),
    );
  }
}

class _SignedInCartBody extends ConsumerWidget {
  const _SignedInCartBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(cartControllerProvider);
    return async.when(
      loading: () => ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: 2,
        itemBuilder: (_, __) => const Padding(padding: EdgeInsets.only(bottom: 12), child: LoadingSkeleton(height: 160)),
      ),
      error: (error, _) => ErrorStateView(
        message: error is ApiException ? error.message : 'Could not load your cart.',
        onRetry: () => ref.read(cartControllerProvider.notifier).refresh(),
      ),
      data: (carts) => carts.isEmpty
          ? const EmptyStateView(message: 'Your cart is empty.', icon: Icons.shopping_cart_outlined)
          : RefreshIndicator(
              onRefresh: () => ref.read(cartControllerProvider.notifier).refresh(),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: carts.length,
                itemBuilder: (context, i) => _CartSection(cart: carts[i]),
              ),
            ),
    );
  }
}

/// A signed-out visitor's local cart, grouped by pharmacy the same way the
/// real [_SignedInCartBody] groups real carts — but every "Checkout" here
/// sends the visitor to sign in first (checkout always needs a real backend
/// cart; see `app_router.dart`'s redirect doc comment), landing them right
/// back on this same cart screen once signed in, by which point
/// `OtpScreen`'s flush has already turned these local items into a real
/// cart.
class _GuestCartBody extends ConsumerWidget {
  const _GuestCartBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref.watch(localCartControllerProvider);
    if (items.isEmpty) {
      return const EmptyStateView(message: 'Your cart is empty.', icon: Icons.shopping_cart_outlined);
    }
    final byPharmacy = <String, List<LocalCartItem>>{};
    for (final item in items) {
      byPharmacy.putIfAbsent(item.pharmacyId, () => []).add(item);
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: byPharmacy.values.map((group) => _GuestCartSection(items: group)).toList(),
    );
  }
}

class _GuestCartSection extends ConsumerWidget {
  const _GuestCartSection({required this.items});

  final List<LocalCartItem> items;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subtotal = items.fold<int>(0, (sum, item) => sum + item.lineTotal);
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.storefront_outlined),
                const SizedBox(width: 8),
                Expanded(child: Text(items.first.pharmacyName ?? 'Pharmacy', style: Theme.of(context).textTheme.titleMedium)),
              ],
            ),
            const Divider(),
            ...items.map((item) => _GuestCartItemRow(item: item)),
            const Divider(),
            Row(
              children: [
                Text('Subtotal', style: Theme.of(context).textTheme.titleSmall),
                const Spacer(),
                Text('₹$subtotal', style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () {
                  ref.read(pendingRedirectProvider.notifier).state = const PendingRedirect(location: '/pharmacy/cart');
                  context.push('/sign-in');
                },
                child: const Text('Checkout'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GuestCartItemRow extends ConsumerWidget {
  const _GuestCartItemRow({required this.item});

  final LocalCartItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(localCartControllerProvider.notifier);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.medicineName, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (item.variantLabel != null) Text(item.variantLabel!, style: Theme.of(context).textTheme.bodySmall),
                Text('₹${item.unitPrice} each', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: () => notifier.updateQuantity(item.key, item.quantity - 1),
          ),
          Text('${item.quantity}'),
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () => notifier.updateQuantity(item.key, item.quantity + 1),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Remove',
            onPressed: () => notifier.removeItem(item.key),
          ),
        ],
      ),
    );
  }
}

class _CartSection extends ConsumerWidget {
  const _CartSection({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.storefront_outlined),
                const SizedBox(width: 8),
                Expanded(child: Text(cart.pharmacyName ?? 'Pharmacy', style: Theme.of(context).textTheme.titleMedium)),
              ],
            ),
            const Divider(),
            ...cart.items.map((item) => _CartItemRow(item: item)),
            const Divider(),
            Row(
              children: [
                Text('Subtotal', style: Theme.of(context).textTheme.titleSmall),
                const Spacer(),
                Text('₹${cart.subtotal}', style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            if (cart.hasUnavailableItems)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Some items in this cart are no longer available — remove or adjust them before checking out.',
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
              ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () => context.push('/pharmacy/checkout', extra: cart),
                child: const Text('Checkout'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartItemRow extends ConsumerWidget {
  const _CartItemRow({required this.item});

  final CartItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(cartControllerProvider.notifier);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.medicineName, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (item.variantLabel != null) Text(item.variantLabel!, style: Theme.of(context).textTheme.bodySmall),
                if (!item.available)
                  Text('No longer available in this quantity', style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
                Text(item.unitPrice != null ? '₹${item.unitPrice} each' : 'Price unavailable', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: () => notifier.updateQuantity(item.id, item.quantity - 1),
          ),
          Text('${item.quantity}'),
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: () => notifier.updateQuantity(item.id, item.quantity + 1),
          ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Remove',
            onPressed: () => notifier.removeItem(item.id),
          ),
        ],
      ),
    );
  }
}
