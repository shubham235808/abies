import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/state_views.dart';
import '../../orders/presentation/order_widgets.dart' show formatDate;
import '../domain/inventory_item.dart';
import 'inventory_controller.dart';

/// Stock + selling-price self-service over the pharmacy's own
/// `PharmacyInventory` rows. Tap a batch to edit its quantity and price.
class InventoryScreen extends ConsumerStatefulWidget {
  const InventoryScreen({super.key});

  @override
  ConsumerState<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends ConsumerState<InventoryScreen> {
  String _query = '';
  InventoryFilter _filter = InventoryFilter.all;

  Future<void> _edit(InventoryItem item) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _EditSheet(item: item),
    );
    if (saved == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${item.displayName} updated')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(inventoryControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Inventory')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/inventory/add'),
        icon: const Icon(Icons.add),
        label: const Text('Add batch'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search medicine or batch'),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                ChoiceChip(label: const Text('All'), selected: _filter == InventoryFilter.all, onSelected: (_) => setState(() => _filter = InventoryFilter.all)),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Low stock'),
                  selected: _filter == InventoryFilter.lowStock,
                  onSelected: (_) => setState(() => _filter = InventoryFilter.lowStock),
                ),
                const SizedBox(width: 8),
                ChoiceChip(
                  label: const Text('Expiring ≤30 days'),
                  selected: _filter == InventoryFilter.expiringSoon,
                  onSelected: (_) => setState(() => _filter = InventoryFilter.expiringSoon),
                ),
              ],
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => e is ApiException && e.isTransportFailure
                  ? OfflineStateView(onRetry: () => ref.read(inventoryControllerProvider.notifier).refresh())
                  : ErrorStateView(
                      message: e is ApiException ? e.message : 'Could not load inventory.',
                      onRetry: () => ref.read(inventoryControllerProvider.notifier).refresh(),
                    ),
              data: (items) {
                final shown = filterInventory(items, query: _query, filter: _filter);
                return RefreshIndicator(
                  onRefresh: () => ref.read(inventoryControllerProvider.notifier).refresh(),
                  child: shown.isEmpty
                      ? ListView(children: [
                          const SizedBox(height: 120),
                          EmptyStateView(
                            message: items.isEmpty
                                ? 'No inventory yet. Tap "Add batch" to add your first stock batch.'
                                : 'No batches match.',
                          ),
                        ])
                      : ListView.builder(
                          // Bottom padding keeps the last row clear of the FAB.
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 88),
                          itemCount: shown.length,
                          itemBuilder: (context, i) => _InventoryTile(item: shown[i], onTap: () => _edit(shown[i])),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryTile extends StatelessWidget {
  const _InventoryTile({required this.item, required this.onTap});

  final InventoryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    final text = Theme.of(context).textTheme;
    final details = [
      if (item.form != null) item.form!,
      if (item.strength != null) item.strength!,
      'Batch ${item.batchNumber}',
      'Exp ${formatDate(item.expiryDate)}',
    ].join(' · ');
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 5),
      child: ListTile(
        onTap: onTap,
        title: Text(item.displayName),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(details),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                _Tag(item.requiresPrescription ? 'Rx' : 'OTC', semantic.infoSubtle, semantic.infoStrong),
                if (item.isFmcg) _Tag('FMCG', semantic.infoSubtle, semantic.infoStrong),
                if (item.isExpired)
                  _Tag('Expired', semantic.dangerSubtle, semantic.dangerStrong)
                else if (item.isExpiringSoon)
                  _Tag('Expiring soon', semantic.warningSubtle, semantic.warningStrong),
                if (item.isLowStock) _Tag('Low stock', semantic.warningSubtle, semantic.warningStrong),
                if (item.hsnCode == null) _Tag('No HSN', semantic.dangerSubtle, semantic.dangerStrong),
              ],
            ),
          ],
        ),
        isThreeLine: true,
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text('₹${item.price}', style: text.titleMedium),
            Text('${item.quantityAvailable} in stock', style: text.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.label, this.bg, this.fg);

  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

class _EditSheet extends ConsumerStatefulWidget {
  const _EditSheet({required this.item});

  final InventoryItem item;

  @override
  ConsumerState<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends ConsumerState<_EditSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _qtyController = TextEditingController(text: '${widget.item.quantityAvailable}');
  late final _priceController = TextEditingController(text: '${widget.item.price}');
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _qtyController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  String? _validateInt(String? v, String what) {
    final n = int.tryParse(v?.trim() ?? '');
    if (n == null) return 'Enter a whole number';
    if (n < 0 || n > inventoryMaxValue) return '$what must be between 0 and $inventoryMaxValue';
    return null;
  }

  void _bumpQty(int delta) {
    final current = int.tryParse(_qtyController.text.trim()) ?? 0;
    final next = (current + delta).clamp(0, inventoryMaxValue);
    _qtyController.text = '$next';
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final error = await ref.read(inventoryControllerProvider.notifier).updateItem(
          widget.item.id,
          quantityAvailable: int.parse(_qtyController.text.trim()),
          price: int.parse(_priceController.text.trim()),
        );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
    } else {
      setState(() {
        _saving = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    return Padding(
      padding: EdgeInsets.fromLTRB(24, 0, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(item.displayName, style: Theme.of(context).textTheme.titleLarge),
            Text('Batch ${item.batchNumber} · Exp ${formatDate(item.expiryDate)}'),
            if (item.mrp != null) Text('MRP ₹${item.mrp}', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 20),
            Row(
              children: [
                IconButton.outlined(onPressed: () => _bumpQty(-1), icon: const Icon(Icons.remove), tooltip: 'Decrease'),
                const SizedBox(width: 8),
                Expanded(
                  child: TextFormField(
                    key: const ValueKey('qty-field'),
                    controller: _qtyController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    textAlign: TextAlign.center,
                    decoration: const InputDecoration(labelText: 'Quantity in stock'),
                    validator: (v) => _validateInt(v, 'Quantity'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.outlined(onPressed: () => _bumpQty(1), icon: const Icon(Icons.add), tooltip: 'Increase'),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              key: const ValueKey('price-field'),
              controller: _priceController,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Selling price (₹, whole rupees)', prefixText: '₹ '),
              validator: (v) => _validateInt(v, 'Price'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }
}
