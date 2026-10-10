import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/consultation_detail.dart';
import 'consultation_controller.dart';

/// Create a new DRAFT prescription ([prescriptionId] null) or edit an
/// existing DRAFT. Fields mirror `prescriptionItemSchema`
/// (consultations.schemas.ts); 1–30 items. Saving never finalizes —
/// finalizing is a separate, confirmed action on the consultation screen.
class PrescriptionEditorScreen extends ConsumerStatefulWidget {
  const PrescriptionEditorScreen({super.key, required this.consultationId, this.prescriptionId});

  final String consultationId;
  final String? prescriptionId;

  @override
  ConsumerState<PrescriptionEditorScreen> createState() => _PrescriptionEditorScreenState();
}

class _ItemControllers {
  _ItemControllers([PrescriptionItem? item])
      : startDate = item?.startDate,
        endDate = item?.endDate,
        name = TextEditingController(text: item?.productName ?? ''),
        dosage = TextEditingController(text: item?.dosage ?? ''),
        frequency = TextEditingController(text: item?.frequency ?? ''),
        duration = TextEditingController(text: item?.durationDays?.toString() ?? ''),
        route = TextEditingController(text: item?.route ?? ''),
        instructions = TextEditingController(text: item?.instructions ?? '');

  final TextEditingController name, dosage, frequency, duration, route, instructions;

  /// Preserved, not edited here — see [PrescriptionItem]'s doc comment.
  final String? startDate, endDate;

  PrescriptionItem toItem() => PrescriptionItem(
        productName: name.text.trim(),
        dosage: dosage.text,
        frequency: frequency.text,
        durationDays: int.tryParse(duration.text.trim()),
        route: route.text,
        instructions: instructions.text,
        startDate: startDate,
        endDate: endDate,
      );

  void dispose() {
    for (final c in [name, dosage, frequency, duration, route, instructions]) {
      c.dispose();
    }
  }
}

class _PrescriptionEditorScreenState extends ConsumerState<PrescriptionEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  final _items = <_ItemControllers>[];
  final _notes = TextEditingController();
  bool _initialised = false;
  bool _saving = false;

  @override
  void dispose() {
    for (final i in _items) {
      i.dispose();
    }
    _notes.dispose();
    super.dispose();
  }

  void _initFrom(ConsultationWorkspace ws) {
    if (_initialised) return;
    _initialised = true;
    final existing = widget.prescriptionId == null
        ? null
        : ws.consultation.prescriptions.where((p) => p.id == widget.prescriptionId).firstOrNull;
    _notes.text = existing?.doctorNotes ?? '';
    if (existing != null && existing.items.isNotEmpty) {
      _items.addAll(existing.items.map(_ItemControllers.new));
    } else {
      _items.add(_ItemControllers());
    }
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final ok = await ref.read(consultationControllerProvider(widget.consultationId).notifier).savePrescription(
          prescriptionId: widget.prescriptionId,
          doctorNotes: _notes.text,
          items: _items.map((i) => i.toItem()).toList(),
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) context.pop();
  }

  String? _validateDuration(String? v) {
    final t = v?.trim() ?? '';
    if (t.isEmpty) return null;
    final n = int.tryParse(t);
    return (n == null || n < 1 || n > 365) ? '1–365 days' : null;
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(consultationControllerProvider(widget.consultationId));
    final title = widget.prescriptionId == null ? 'New prescription' : 'Edit draft prescription';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => const Center(child: Text('Could not load this consultation.')),
        data: (ws) {
          _initFrom(ws);
          final existing = widget.prescriptionId == null
              ? null
              : ws.consultation.prescriptions.where((p) => p.id == widget.prescriptionId).firstOrNull;
          if (widget.prescriptionId != null && (existing == null || !existing.isDraft)) {
            return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('Only a draft prescription can be edited.')));
          }
          return Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (var i = 0; i < _items.length; i++) _itemCard(i),
                if (_items.length < 30)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      icon: const Icon(Icons.add),
                      label: const Text('Add medicine'),
                      onPressed: () => setState(() => _items.add(_ItemControllers())),
                    ),
                  ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _notes,
                  maxLength: 2000,
                  maxLines: null,
                  decoration: const InputDecoration(labelText: 'Notes for the patient (optional)'),
                ),
                if (ws.error != null) Text(ws.error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save draft'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _itemCard(int index) {
    final item = _items[index];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Row(
              children: [
                Text('Medicine ${index + 1}', style: Theme.of(context).textTheme.titleSmall),
                const Spacer(),
                if (_items.length > 1)
                  IconButton(
                    tooltip: 'Remove',
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => setState(() => _items.removeAt(index).dispose()),
                  ),
              ],
            ),
            TextFormField(
              controller: item.name,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'Medicine / product name *'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
            Row(
              children: [
                Expanded(child: TextFormField(controller: item.dosage, maxLength: 200, decoration: const InputDecoration(labelText: 'Dosage'))),
                const SizedBox(width: 8),
                Expanded(
                    child: TextFormField(controller: item.frequency, maxLength: 200, decoration: const InputDecoration(labelText: 'Frequency'))),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: item.duration,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Days'),
                    validator: _validateDuration,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(child: TextFormField(controller: item.route, maxLength: 100, decoration: const InputDecoration(labelText: 'Route'))),
              ],
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: item.instructions,
              maxLength: 1000,
              maxLines: null,
              decoration: const InputDecoration(labelText: 'Instructions'),
            ),
          ],
        ),
      ),
    );
  }
}
