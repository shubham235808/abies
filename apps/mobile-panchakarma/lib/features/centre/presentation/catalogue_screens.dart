import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/formatting.dart';
import '../../../shared/widgets/loading_skeleton.dart';
import '../../../shared/widgets/state_views.dart';
import '../domain/centre_models.dart';
import 'catalogue_controllers.dart';
import 'widgets.dart';

enum _RowAction { edit, toggle, remove }

enum _TherapistAction { edit, documents, toggle, remove }

Future<bool> _confirmRemove(BuildContext context, String name) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text('Remove $name?'),
      content: const Text('This can’t be undone.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove')),
      ],
    ),
  );
  return ok == true;
}

void _report(BuildContext context, String? error, String success) {
  if (!context.mounted) return;
  showMessage(context, error ?? success, isError: error != null);
}

class TherapiesTab extends ConsumerWidget {
  const TherapiesTab({super.key});

  Future<void> _openForm(BuildContext context, WidgetRef ref, {Therapy? existing}) async {
    final input = await showModalBottomSheet<TherapyInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TherapyForm(existing: existing),
    );
    if (input == null) return;
    final controller = ref.read(therapiesControllerProvider.notifier);
    final error = existing == null ? await controller.create(input) : await controller.edit(existing.id, input);
    if (context.mounted) _report(context, error, existing == null ? 'Therapy added' : 'Therapy updated');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(therapiesControllerProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-therapy',
        onPressed: () => _openForm(context, ref),
        icon: const Icon(Icons.add),
        label: const Text('Add therapy'),
      ),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(16), child: LoadingSkeleton(height: 64)),
        error: (e, _) => errorView(e, () => ref.invalidate(therapiesControllerProvider)),
        data: (therapies) => therapies.isEmpty
            ? const EmptyStateView(message: 'No therapies yet. Add the therapies your centre offers.', icon: Icons.spa_outlined)
            : RefreshIndicator(
                onRefresh: () => ref.read(therapiesControllerProvider.notifier).refresh(),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    for (final t in therapies)
                      Card(
                        child: ListTile(
                          title: Text(t.name),
                          subtitle: Text([
                            '${formatRupees(t.price)}/session',
                            if (t.durationMinutes != null) '${t.durationMinutes} min',
                            if (t.requiredSupervision) 'Supervised',
                            t.active ? 'Active' : 'Inactive',
                          ].join(' · ')),
                          onTap: () => _openForm(context, ref, existing: t),
                          trailing: PopupMenuButton<_RowAction>(
                            onSelected: (action) async {
                              final controller = ref.read(therapiesControllerProvider.notifier);
                              switch (action) {
                                case _RowAction.edit:
                                  await _openForm(context, ref, existing: t);
                                case _RowAction.toggle:
                                  final error = await controller.setActive(t, !t.active);
                                  if (context.mounted) _report(context, error, t.active ? 'Therapy deactivated' : 'Therapy activated');
                                case _RowAction.remove:
                                  if (!await _confirmRemove(context, t.name)) return;
                                  final error = await controller.remove(t.id);
                                  if (context.mounted) _report(context, error, 'Therapy removed');
                              }
                            },
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: _RowAction.edit, child: Text('Edit')),
                              PopupMenuItem(value: _RowAction.toggle, child: Text(t.active ? 'Deactivate' : 'Activate')),
                              const PopupMenuItem(value: _RowAction.remove, child: Text('Remove')),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Fields and bounds from `createTherapySchema` (catalogue.schemas.ts).
class TherapyForm extends StatefulWidget {
  const TherapyForm({super.key, this.existing});

  final Therapy? existing;

  @override
  State<TherapyForm> createState() => _TherapyFormState();
}

class _TherapyFormState extends State<TherapyForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name);
  late final _price = TextEditingController(text: widget.existing?.price.toString());
  late final _duration = TextEditingController(text: widget.existing?.durationMinutes?.toString());
  late final _description = TextEditingController(text: widget.existing?.description);
  late final _prerequisites = TextEditingController(text: widget.existing?.prerequisites);
  late final _contraindications = TextEditingController(text: widget.existing?.contraindications);
  late bool _supervised = widget.existing?.requiredSupervision ?? false;

  @override
  void dispose() {
    for (final c in [_name, _price, _duration, _description, _prerequisites, _contraindications]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.pop(
      context,
      TherapyInput(
        name: _name.text.trim(),
        price: int.parse(_price.text.trim()),
        durationMinutes: _duration.text.trim().isEmpty ? null : int.parse(_duration.text.trim()),
        description: _description.text.trim(),
        prerequisites: _prerequisites.text.trim(),
        contraindications: _contraindications.text.trim(),
        requiredSupervision: _supervised,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.existing == null ? 'Add therapy' : 'Edit therapy', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                maxLength: 200,
                decoration: const InputDecoration(labelText: 'Name', hintText: 'e.g. Abhyanga'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a name' : null,
              ),
              TextFormField(
                controller: _price,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Price per session (₹)'),
                validator: (v) => validateIntInRange(v, min: 0, max: 1000000, required: true),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _duration,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Duration (minutes, optional)'),
                validator: (v) => validateIntInRange(v, min: 1, max: 1440, required: false),
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _description, maxLength: 2000, maxLines: 3, minLines: 1, decoration: const InputDecoration(labelText: 'Description')),
              TextFormField(controller: _prerequisites, maxLength: 2000, maxLines: 2, minLines: 1, decoration: const InputDecoration(labelText: 'Prerequisites')),
              TextFormField(
                controller: _contraindications,
                maxLength: 2000,
                maxLines: 2,
                minLines: 1,
                decoration: const InputDecoration(labelText: 'Contraindications'),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _supervised,
                onChanged: (v) => setState(() => _supervised = v),
                title: const Text('Requires practitioner supervision'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _save, child: const Text('Save')),
            ],
          ),
        ),
      ),
    );
  }
}

String? validateIntInRange(String? v, {required int min, required int max, required bool required}) {
  final value = v?.trim() ?? '';
  if (value.isEmpty) return required ? 'Required' : null;
  final n = int.tryParse(value);
  if (n == null) return 'Enter a whole number';
  if (n < min || n > max) return 'Must be between $min and $max';
  return null;
}

class TherapistsTab extends ConsumerWidget {
  const TherapistsTab({super.key});

  Future<void> _openForm(BuildContext context, WidgetRef ref, {Therapist? existing}) async {
    final input = await showModalBottomSheet<TherapistInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TherapistForm(existing: existing),
    );
    if (input == null) return;
    final controller = ref.read(therapistsControllerProvider.notifier);
    final error = existing == null ? await controller.create(input) : await controller.edit(existing.id, input);
    if (context.mounted) _report(context, error, existing == null ? 'Therapist added' : 'Therapist updated');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(therapistsControllerProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'add-therapist',
        onPressed: () => _openForm(context, ref),
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Add therapist'),
      ),
      body: async.when(
        loading: () => const Padding(padding: EdgeInsets.all(16), child: LoadingSkeleton(height: 64)),
        error: (e, _) => errorView(e, () => ref.invalidate(therapistsControllerProvider)),
        data: (therapists) => therapists.isEmpty
            ? const EmptyStateView(message: 'No therapists yet. Add your practitioner roster.', icon: Icons.people_outline)
            : RefreshIndicator(
                onRefresh: () => ref.read(therapistsControllerProvider.notifier).refresh(),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    for (final t in therapists)
                      Card(
                        child: ListTile(
                          title: Text(t.name),
                          subtitle: Text([
                            if (t.qualifications != null && t.qualifications!.isNotEmpty) t.qualifications!,
                            if (t.languages.isNotEmpty) t.languages.join(', '),
                            t.active ? 'Active' : 'Inactive',
                          ].join(' · ')),
                          onTap: () => _openForm(context, ref, existing: t),
                          trailing: PopupMenuButton<_TherapistAction>(
                            onSelected: (action) async {
                              final controller = ref.read(therapistsControllerProvider.notifier);
                              switch (action) {
                                case _TherapistAction.edit:
                                  await _openForm(context, ref, existing: t);
                                case _TherapistAction.documents:
                                  await context.push('/therapists/${t.id}/documents', extra: t.name);
                                case _TherapistAction.toggle:
                                  final error = await controller.setActive(t, !t.active);
                                  if (context.mounted) _report(context, error, t.active ? 'Therapist deactivated' : 'Therapist activated');
                                case _TherapistAction.remove:
                                  if (!await _confirmRemove(context, t.name)) return;
                                  final error = await controller.remove(t.id);
                                  if (context.mounted) _report(context, error, 'Therapist removed');
                              }
                            },
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: _TherapistAction.edit, child: Text('Edit')),
                              const PopupMenuItem(value: _TherapistAction.documents, child: Text('Documents')),
                              PopupMenuItem(value: _TherapistAction.toggle, child: Text(t.active ? 'Deactivate' : 'Activate')),
                              const PopupMenuItem(value: _TherapistAction.remove, child: Text('Remove')),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Fields and bounds from `createTherapistSchema` (catalogue.schemas.ts):
/// languages are entered comma-separated, each 1-40 chars.
class TherapistForm extends StatefulWidget {
  const TherapistForm({super.key, this.existing});

  final Therapist? existing;

  @override
  State<TherapistForm> createState() => _TherapistFormState();
}

class _TherapistFormState extends State<TherapistForm> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name);
  late final _qualifications = TextEditingController(text: widget.existing?.qualifications);
  late final _languages = TextEditingController(text: widget.existing?.languages.join(', '));

  @override
  void dispose() {
    _name.dispose();
    _qualifications.dispose();
    _languages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(widget.existing == null ? 'Add therapist' : 'Edit therapist', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                maxLength: 200,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter a name' : null,
              ),
              TextFormField(controller: _qualifications, maxLength: 500, decoration: const InputDecoration(labelText: 'Qualifications')),
              TextFormField(
                controller: _languages,
                decoration: const InputDecoration(labelText: 'Languages', hintText: 'Hindi, English, Malayalam'),
                validator: (v) => splitLanguages(v ?? '').any((l) => l.length > 40) ? 'Each language must be 40 characters or fewer' : null,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  if (!(_formKey.currentState?.validate() ?? false)) return;
                  Navigator.pop(
                    context,
                    TherapistInput(
                      name: _name.text.trim(),
                      qualifications: _qualifications.text.trim(),
                      languages: splitLanguages(_languages.text),
                    ),
                  );
                },
                child: const Text('Save'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<String> splitLanguages(String raw) => raw.split(',').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
