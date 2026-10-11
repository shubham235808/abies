import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/state_views.dart';
import '../../home/presentation/home_controller.dart';
import '../../inventory/domain/inventory_item.dart';
import '../../inventory/presentation/inventory_controller.dart';
import '../../tax/presentation/tax_settings_controller.dart';
import '../domain/pos_sale.dart';
import 'pos_controller.dart';

/// Walk-in counter sale — the app port of
/// apps/partner-web/src/app/partner/pharmacy/pos/. Gated the same way the
/// web page is: no active Tax Settings, no terminal.
class PosScreen extends ConsumerWidget {
  const PosScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(pharmacyProfileProvider).valueOrNull;
    final tax = ref.watch(taxSettingsControllerProvider);

    Widget body;
    if (profile != null && !profile.isApproved) {
      body = _GateMessage(
        message: 'The POS counter opens once ABIES approves your pharmacy.',
        actionLabel: 'View profile',
        onAction: () => context.push('/profile'),
      );
    } else {
      body = tax.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(taxSettingsControllerProvider))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load tax settings.',
                onRetry: () => ref.invalidate(taxSettingsControllerProvider),
              ),
        data: (settings) => settings == null || !settings.active
            ? _GateMessage(
                message: 'Set up Tax Settings (your GST registration) before recording a sale.',
                actionLabel: 'Set up tax settings',
                onAction: () => context.push('/tax-settings'),
              )
            : const _Terminal(),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('POS'),
        actions: [
          TextButton.icon(onPressed: () => context.push('/pos/sales'), icon: const Icon(Icons.history), label: const Text('Sales')),
        ],
      ),
      body: body,
    );
  }
}

class _GateMessage extends StatelessWidget {
  const _GateMessage({required this.message, required this.actionLabel, required this.onAction});

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: semantic.warningSubtle,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(message, style: TextStyle(color: semantic.warningStrong)),
                const SizedBox(height: 12),
                FilledButton(onPressed: onAction, child: Text(actionLabel)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Terminal extends ConsumerStatefulWidget {
  const _Terminal();

  @override
  ConsumerState<_Terminal> createState() => _TerminalState();
}

class _TerminalState extends ConsumerState<_Terminal> {
  final _search = TextEditingController();
  final _customerName = TextEditingController();
  final _customerPhone = TextEditingController();
  final _upiRef = TextEditingController();
  final _discount = TextEditingController(text: '0');
  String _paymentMethod = 'CASH';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_search, _customerName, _customerPhone, _upiRef, _discount]) {
      c.dispose();
    }
    super.dispose();
  }

  void _add(InventoryItem item) {
    final error = ref.read(posCartProvider.notifier).add(item);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error)));
    } else {
      _search.clear();
      setState(() {});
    }
  }

  Future<void> _checkout() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final result = await ref.read(posCartProvider.notifier).checkout(
          paymentMethod: _paymentMethod,
          customerName: _customerName.text,
          customerPhone: _customerPhone.text,
          upiReference: _upiRef.text,
          discountAmount: int.tryParse(_discount.text.trim()) ?? 0,
        );
    if (!mounted) return;
    if (result.ok) {
      _customerName.clear();
      _customerPhone.clear();
      _upiRef.clear();
      _discount.text = '0';
      setState(() {
        _busy = false;
        _paymentMethod = 'CASH';
      });
      context.push('/pos/sales/${result.sale!.id}', extra: result);
    } else {
      setState(() {
        _busy = false;
        _error = result.error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cart = ref.watch(posCartProvider);
    final subtotal = ref.read(posCartProvider.notifier).subtotal;
    final inventory = ref.watch(inventoryControllerProvider);
    final query = _search.text;
    final matches = query.trim().isEmpty ? const <InventoryItem>[] : sellableInventory(inventory.valueOrNull ?? const [], query: query).take(8).toList();

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text("Record a walk-in counter sale. GST is computed by ABIES from each item's HSN code.", style: text.bodySmall),
        const SizedBox(height: 12),
        TextField(
          controller: _search,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Medicine name, batch or HSN code'),
        ),
        if (inventory.isLoading && inventory.valueOrNull == null) const LinearProgressIndicator(),
        if (query.trim().isNotEmpty && matches.isEmpty && inventory.hasValue)
          const Padding(padding: EdgeInsets.all(12), child: Text('No in-stock, unexpired batch matches.')),
        for (final item in matches) _SearchResult(item: item, onTap: () => _add(item)),
        const SizedBox(height: 16),
        Text('Cart', style: text.titleMedium),
        const SizedBox(height: 4),
        if (cart.isEmpty) const Text('Search above to add items.'),
        for (final line in cart) _CartLineTile(line: line),
        const Divider(height: 32),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        TextField(controller: _customerName, maxLength: 200, decoration: const InputDecoration(labelText: 'Customer name (optional)')),
        const SizedBox(height: 8),
        TextField(
          controller: _customerPhone,
          maxLength: 20,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(labelText: 'Customer phone (optional)'),
        ),
        const SizedBox(height: 8),
        Text('Payment method', style: text.labelLarge),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: [
            for (final m in posPaymentMethods)
              ChoiceChip(label: Text(m), selected: _paymentMethod == m, onSelected: _busy ? null : (_) => setState(() => _paymentMethod = m)),
          ],
        ),
        if (_paymentMethod == 'UPI') ...[
          const SizedBox(height: 12),
          TextField(controller: _upiRef, maxLength: 100, decoration: const InputDecoration(labelText: 'UPI reference')),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _discount,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'Discount (₹)', prefixText: '₹ '),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [Text('Subtotal', style: text.titleMedium), Text('₹$subtotal', style: text.titleMedium)],
        ),
        Text('CGST and SGST are added on the invoice after checkout.', style: text.bodySmall),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy || cart.isEmpty ? null : _checkout,
          child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Complete sale'),
        ),
      ],
    );
  }
}

class _SearchResult extends StatelessWidget {
  const _SearchResult({required this.item, required this.onTap});

  final InventoryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      onTap: onTap,
      title: Text(item.displayName),
      subtitle: Text(
        'Batch ${item.batchNumber} · ${item.quantityAvailable} in stock · ${item.hsnCode == null ? 'No HSN — cannot sell' : 'HSN ${item.hsnCode}'}',
        style: item.hsnCode == null ? TextStyle(color: semantic.dangerStrong) : null,
      ),
      trailing: Text('₹${item.price}'),
    );
  }
}

class _CartLineTile extends ConsumerWidget {
  const _CartLineTile({required this.line});

  final PosCartLine line;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.read(posCartProvider.notifier);
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(line.medicineName, style: Theme.of(context).textTheme.titleSmall),
                  Text('Batch ${line.batchNumber} · ₹${line.unitPrice} each', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            IconButton(
              tooltip: 'Decrease',
              onPressed: line.quantity <= 1 ? null : () => cart.setQuantity(line.inventoryId, line.quantity - 1),
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('${line.quantity}'),
            IconButton(
              tooltip: 'Increase',
              onPressed: line.quantity >= line.maxQuantity ? null : () => cart.setQuantity(line.inventoryId, line.quantity + 1),
              icon: const Icon(Icons.add_circle_outline),
            ),
            SizedBox(width: 56, child: Text('₹${line.lineAmount}', textAlign: TextAlign.right)),
            IconButton(tooltip: 'Remove', onPressed: () => cart.remove(line.inventoryId), icon: const Icon(Icons.close)),
          ],
        ),
      ),
    );
  }
}
