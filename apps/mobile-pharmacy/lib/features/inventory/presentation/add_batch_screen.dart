import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../orders/presentation/order_widgets.dart' show formatDate;
import '../domain/new_batch.dart';
import 'inventory_controller.dart';

/// Add a stock batch — the app port of the web inventory manager's
/// NewBatchForm (apps/partner-web/src/app/partner/pharmacy/inventory/
/// inventory-manager.tsx). Either pick a medicine this pharmacy already
/// stocks, or type a name: an existing ABIES catalogue entry with that name
/// is reused, otherwise a new one is created.
class AddBatchScreen extends ConsumerStatefulWidget {
  const AddBatchScreen({super.key});

  @override
  ConsumerState<AddBatchScreen> createState() => _AddBatchScreenState();
}

class _AddBatchScreenState extends ConsumerState<AddBatchScreen> {
  final _formKey = GlobalKey<FormState>();
  final _generic = TextEditingController();
  final _form = TextEditingController();
  final _strength = TextEditingController();
  final _category = TextEditingController();
  final _hsn = TextEditingController();
  final _variant = TextEditingController();
  final _batch = TextEditingController();
  final _qty = TextEditingController();
  final _price = TextEditingController();
  TextEditingController? _nameController;
  KnownMedicine? _selected;
  DateTime? _expiry;
  bool _requiresPrescription = false;
  bool _isFmcg = false;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_generic, _form, _strength, _category, _hsn, _variant, _batch, _qty, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickExpiry() async {
    final now = DateTime.now();
    final tomorrow = DateTime(now.year, now.month, now.day + 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: _expiry ?? DateTime(now.year + 1, now.month, 1),
      firstDate: tomorrow,
      lastDate: DateTime(now.year + 15),
      helpText: 'Expiry date',
    );
    if (picked != null) setState(() => _expiry = picked);
  }

  String? _requiredInt(String? v, String what) {
    final n = int.tryParse(v?.trim() ?? '');
    if (n == null) return 'Enter a whole number';
    if (n < 0 || n > inventoryMaxValue) return '$what must be between 0 and $inventoryMaxValue';
    return null;
  }

  Future<void> _save() async {
    final fieldsOk = _formKey.currentState?.validate() ?? false;
    if (_expiry == null) {
      setState(() => _error = 'Choose an expiry date');
      return;
    }
    if (!fieldsOk) return;
    final draft = NewBatch(
      name: _nameController?.text,
      genericName: _generic.text,
      form: _form.text,
      strength: _strength.text,
      category: _category.text,
      hsnCode: _hsn.text,
      variantLabel: _variant.text,
      requiresPrescription: _requiresPrescription,
      isFmcg: _isFmcg,
      batchNumber: _batch.text,
      expiryDate: _expiry!,
      quantityAvailable: int.parse(_qty.text.trim()),
      price: int.parse(_price.text.trim()),
    );
    final batch = _selected == null ? draft : attachExistingMedicine(draft, _selected!);
    setState(() {
      _saving = true;
      _error = null;
    });
    final error = await ref.read(inventoryControllerProvider.notifier).addBatch(batch);
    if (!mounted) return;
    if (error == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Batch ${batch.batchNumber.trim()} added')));
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
    final text = Theme.of(context).textTheme;
    final known = knownMedicines(ref.watch(inventoryControllerProvider).valueOrNull ?? const []);
    final selected = _selected;

    return Scaffold(
      appBar: AppBar(title: const Text('Add stock batch')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Pick a medicine you already stock, or type a name — if it already exists in the ABIES catalogue your batch is added to it; otherwise a new catalogue entry is created.',
              style: text.bodySmall,
            ),
            const SizedBox(height: 12),
            Autocomplete<KnownMedicine>(
              displayStringForOption: (m) => m.name,
              optionsBuilder: (value) {
                final q = value.text.trim().toLowerCase();
                if (q.isEmpty) return const Iterable<KnownMedicine>.empty();
                return known.where((m) => m.name.toLowerCase().contains(q)).take(8);
              },
              onSelected: (m) => setState(() => _selected = m),
              fieldViewBuilder: (context, controller, focusNode, onSubmit) {
                _nameController = controller;
                return TextFormField(
                  key: const ValueKey('batch-name'),
                  controller: controller,
                  focusNode: focusNode,
                  maxLength: 200,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Medicine name', hintText: 'e.g. Ashwagandha Churna'),
                  onChanged: (v) {
                    // Editing the text away from a picked medicine un-picks it.
                    if (_selected != null && v.trim() != _selected!.name) setState(() => _selected = null);
                  },
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the medicine name' : null,
                );
              },
            ),
            if (selected != null) ...[
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  leading: const Icon(Icons.link),
                  title: Text('Adding to ${selected.name}'),
                  subtitle: Text([
                    if (selected.form != null) selected.form!,
                    if (selected.strength != null) selected.strength!,
                    selected.hsnCode != null ? 'HSN ${selected.hsnCode}' : 'No HSN code yet',
                  ].join(' · ')),
                ),
              ),
              if (selected.hsnCode == null) _hsnField(),
            ] else ...[
              TextFormField(controller: _generic, maxLength: 200, decoration: const InputDecoration(labelText: 'Generic name (optional)')),
              Row(
                children: [
                  Expanded(child: TextFormField(controller: _form, maxLength: 100, decoration: const InputDecoration(labelText: 'Form', hintText: 'e.g. Tablet'))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(controller: _strength, maxLength: 100, decoration: const InputDecoration(labelText: 'Strength', hintText: 'e.g. 500mg')),
                  ),
                ],
              ),
              TextFormField(controller: _category, maxLength: 100, decoration: const InputDecoration(labelText: 'Category', hintText: 'e.g. Ayurvedic OTC')),
              _hsnField(),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _requiresPrescription,
                onChanged: (v) => setState(() => _requiresPrescription = v ?? false),
                title: const Text('Requires a prescription'),
                subtitle: const Text('Leave unchecked for an over-the-counter item'),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _isFmcg,
                onChanged: (v) => setState(() => _isFmcg = v ?? false),
                title: const Text('FMCG item'),
                subtitle: const Text('Wellness/personal-care product, listed separately from the Ayurveda catalogue'),
              ),
            ],
            const SizedBox(height: 8),
            TextFormField(
              controller: _variant,
              maxLength: 60,
              decoration: const InputDecoration(
                labelText: 'Pack size (optional)',
                hintText: 'e.g. 250gm',
                helperText: 'Leave blank for a single-size product. Reuse the same text to group batches as one pack size.',
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 8),
            TextFormField(
              key: const ValueKey('batch-number'),
              controller: _batch,
              maxLength: 100,
              decoration: const InputDecoration(labelText: 'Batch number'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter the batch number' : null,
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _pickExpiry,
              icon: const Icon(Icons.event),
              label: Text(_expiry == null ? 'Choose expiry date' : 'Expires ${formatDate(_expiry!)}'),
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _qty,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Quantity'),
                    validator: (v) => _requiredInt(v, 'Quantity'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _price,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Selling price', prefixText: '₹ '),
                    validator: (v) => _requiredInt(v, 'Price'),
                  ),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Add batch'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _hsnField() => TextFormField(
        controller: _hsn,
        maxLength: 20,
        decoration: const InputDecoration(
          labelText: 'HSN code',
          hintText: 'e.g. 3004',
          helperText: 'Needed to sell this item at the POS counter — only filled if not already set.',
          helperMaxLines: 2,
        ),
      );
}
