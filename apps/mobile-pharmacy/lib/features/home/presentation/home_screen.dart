import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../shared/widgets/state_views.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../inventory/presentation/inventory_controller.dart';
import '../../orders/domain/pharmacy_order.dart';
import '../../orders/presentation/order_widgets.dart';
import '../../orders/presentation/orders_controller.dart';
import '../domain/pharmacy_profile.dart';
import 'home_controller.dart';

/// Dashboard: verification banner, the four order buckets from the web
/// pharmacy overview, a low-stock/expiry nudge, and the active (paid,
/// unfulfilled) order queue — oldest first, the backend's own order.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  Future<void> _refresh(WidgetRef ref) async {
    ref.invalidate(pharmacyProfileProvider);
    ref.invalidate(inventoryControllerProvider);
    await ref.read(ordersControllerProvider.notifier).refresh();
  }

  Future<void> _signOut(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(authControllerProvider.notifier).signOut();
    } on ApiException catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (!(auth.valueOrNull?.isSignedIn ?? false)) {
      // Router redirect hasn't resolved the session yet.
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final profile = ref.watch(pharmacyProfileProvider);
    final orders = ref.watch(ordersControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Image.asset('assets/images/abies-mark.png', width: 28, height: 28, excludeFromSemantics: true),
            const SizedBox(width: 10),
            Flexible(
              child: Text(profile.valueOrNull?.name ?? 'ABIES Pharmacy', overflow: TextOverflow.ellipsis),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'signout') _signOut(context, ref);
            },
            itemBuilder: (_) => [const PopupMenuItem(value: 'signout', child: Text('Sign out'))],
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (i) {
          if (i == 1) context.push('/orders');
          if (i == 2) context.push('/inventory');
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Today'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'All orders'),
          NavigationDestination(icon: Icon(Icons.inventory_2_outlined), label: 'Inventory'),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _refresh(ref),
        child: orders.when(
          loading: () => ListView(children: [
            if (profile.valueOrNull != null) _VerificationBanner(profile: profile.value!),
            const SizedBox(height: 160),
            const Center(child: CircularProgressIndicator()),
          ]),
          error: (e, _) => ListView(children: [
            const SizedBox(height: 120),
            e is ApiException && e.isTransportFailure
                ? OfflineStateView(onRetry: () => _refresh(ref))
                : ErrorStateView(message: e is ApiException ? e.message : 'Could not load orders.', onRetry: () => _refresh(ref)),
          ]),
          data: (list) => _Dashboard(orders: list, profile: profile.valueOrNull),
        ),
      ),
    );
  }
}

class _Dashboard extends ConsumerWidget {
  const _Dashboard({required this.orders, required this.profile});

  final List<PharmacyOrder> orders;
  final PharmacyProfile? profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final buckets = OrderBuckets(orders);
    final text = Theme.of(context).textTheme;
    final attention = ref.watch(inventoryControllerProvider).valueOrNull;
    final lowStock = attention?.where((i) => i.isLowStock).length ?? 0;
    final expiring = attention?.where((i) => i.isExpiringSoon).length ?? 0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (profile != null) _VerificationBanner(profile: profile!),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 2.2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: [
            _MetricCard(label: 'New orders', value: buckets.newOrders.length, highlight: buckets.newOrders.isNotEmpty),
            _MetricCard(label: 'To pack', value: buckets.toPack.length),
            _MetricCard(label: 'Ready to dispatch', value: buckets.readyToDispatch.length),
            _MetricCard(label: 'In transit', value: buckets.inTransit.length),
          ],
        ),
        if (lowStock > 0 || expiring > 0) ...[
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: Icon(Icons.warning_amber_rounded, color: Theme.of(context).colorScheme.secondary),
              title: const Text('Inventory needs attention'),
              subtitle: Text([
                if (lowStock > 0) '$lowStock low on stock',
                if (expiring > 0) '$expiring expiring within 30 days',
              ].join(' · ')),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/inventory'),
            ),
          ),
        ],
        const SizedBox(height: 16),
        Text('Active orders', style: text.titleMedium),
        const SizedBox(height: 4),
        if (buckets.active.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 32),
            child: EmptyStateView(message: 'No active orders right now. New paid orders will appear here.'),
          )
        else
          for (final order in buckets.active) OrderTile(order: order, onTap: () => context.push('/orders/${order.id}')),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value, this.highlight = false});

  final String label;
  final int value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      color: highlight ? scheme.primaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('$value', style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: scheme.primary, fontWeight: FontWeight.w700)),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

/// Same copy as the web overview's status notes
/// (apps/partner-web/src/app/partner/pharmacy/page.tsx).
class _VerificationBanner extends StatelessWidget {
  const _VerificationBanner({required this.profile});

  final PharmacyProfile profile;

  @override
  Widget build(BuildContext context) {
    if (profile.isApproved) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    final String message = switch (profile.verificationStatus) {
      'DRAFT' =>
        'Your pharmacy application is still a draft. Complete your profile (name, license numbers, service areas) and submit it for verification on the ABIES partner portal — you will start receiving orders once approved.',
      'SUBMITTED' || 'UNDER_REVIEW' => "Your application is with the ABIES verification team. You'll be notified once it's reviewed.",
      'REJECTED' =>
        'Your last application was rejected${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : ''}. Update your details on the partner portal and resubmit.',
      'SUSPENDED' => 'Your account has been suspended${profile.rejectionReason != null ? ': ${profile.rejectionReason}' : '.'} Contact ABIES support.',
      _ => 'Verification status: ${profile.verificationStatus}',
    };
    final bad = profile.verificationStatus == 'REJECTED' || profile.verificationStatus == 'SUSPENDED';
    return Card(
      color: bad ? scheme.errorContainer : scheme.tertiaryContainer,
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(message, style: TextStyle(color: bad ? scheme.onErrorContainer : scheme.onTertiaryContainer)),
      ),
    );
  }
}
