import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/catalogue.dart';
import 'catalogue_controller.dart';

/// Create (when [test] is null) or edit one test. Validation mirrors
/// `createTestSchema` (catalogue.schemas.ts) so the server rarely has to
/// reject anything.
class TestFormScreen extends ConsumerStatefulWidget {
  const TestFormScreen({super.key, this.test});

  final LabTest? test;

  @override
  ConsumerState<TestFormScreen> createState() => _TestFormScreenState();
}

class _TestFormScreenState extends ConsumerState<TestFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _code = TextEditingController(text: widget.test?.code ?? '');
  late final _name = TextEditingController(text: widget.test?.name ?? '');
  late final _price = TextEditingController(text: widget.test?.price.toString() ?? '');
  late final _tat = TextEditingController(text: widget.test?.turnaroundHours?.toString() ?? '');
  late final _sample = TextEditingController(text: widget.test?.sampleType ?? '');
  late final _desc = TextEditingController(text: widget.test?.description ?? '');
  late final _prep = TextEditingController(text: widget.test?.preparationInstructions ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_code, _name, _price, _tat, _sample, _desc, _prep]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final input = TestInput(
      code: _code.text,
      name: _name.text,
      price: int.parse(_price.text.trim()),
      turnaroundHours: _tat.text.trim().isEmpty ? null : int.parse(_tat.text.trim()),
      sampleType: _sample.text,
      description: _desc.text,
      preparationInstructions: _prep.text,
    );
    final error = await ref.read(catalogueControllerProvider.notifier).saveTest(input, existingId: widget.test?.id);
    if (!mounted) return;
    if (error == null) {
      context.pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final digits = [FilteringTextInputFormatter.digitsOnly];
    return Scaffold(
      appBar: AppBar(title: Text(widget.test == null ? 'Add test' : 'Edit test')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _code,
              decoration: const InputDecoration(labelText: 'Code', hintText: 'e.g. CBC'),
              validator: (v) => requiredMax(v, 50, 'Enter a test code'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name'),
              validator: (v) => requiredMax(v, 200, 'Enter a test name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _price,
              keyboardType: TextInputType.number,
              inputFormatters: digits,
              decoration: const InputDecoration(labelText: 'Price (₹)'),
              validator: (v) => intInRange(v, 0, 1000000, required: true),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _tat,
              keyboardType: TextInputType.number,
              inputFormatters: digits,
              decoration: const InputDecoration(labelText: 'Turnaround (hours, optional)'),
              validator: (v) => intInRange(v, 1, 720),
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _sample, decoration: const InputDecoration(labelText: 'Sample type (optional)', hintText: 'e.g. Blood')),
            const SizedBox(height: 12),
            TextFormField(controller: _desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
            const SizedBox(height: 12),
            TextFormField(controller: _prep, maxLines: 3, decoration: const InputDecoration(labelText: 'Preparation instructions (optional)')),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _save, child: Text(widget.test == null ? 'Add test' : 'Save changes')),
          ],
        ),
      ),
    );
  }
}

/// Create/edit a package from the lab's own tests.
class PackageFormScreen extends ConsumerStatefulWidget {
  const PackageFormScreen({super.key, this.package});

  final LabPackage? package;

  @override
  ConsumerState<PackageFormScreen> createState() => _PackageFormScreenState();
}

class _PackageFormScreenState extends ConsumerState<PackageFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.package?.name ?? '');
  late final _price = TextEditingController(text: widget.package?.price.toString() ?? '');
  late final _desc = TextEditingController(text: widget.package?.description ?? '');
  late final Set<String> _selected = {...?widget.package?.testIds};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final input = PackageInput(
      name: _name.text,
      price: int.parse(_price.text.trim()),
      description: _desc.text,
      testIds: _selected.toList(),
    );
    final error = await ref.read(catalogueControllerProvider.notifier).savePackage(input, existingId: widget.package?.id);
    if (!mounted) return;
    if (error == null) {
      context.pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final tests = ref.watch(catalogueControllerProvider).valueOrNull?.tests ?? const <LabTest>[];
    return Scaffold(
      appBar: AppBar(title: Text(widget.package == null ? 'Add package' : 'Edit package')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name', hintText: 'e.g. Full Body Health Check'),
              validator: (v) => requiredMax(v, 200, 'Enter a package name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _price,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Package price (₹)'),
              validator: (v) => intInRange(v, 0, 1000000, required: true),
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _desc, maxLines: 3, decoration: const InputDecoration(labelText: 'Description (optional)')),
            const SizedBox(height: 16),
            Text('Tests included (${_selected.length}/30)', style: Theme.of(context).textTheme.titleMedium),
            for (final t in tests)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: _selected.contains(t.id),
                title: Text('${t.name} (${t.code})'),
                onChanged: (v) => setState(() {
                  if (v == true && _selected.length < 30) {
                    _selected.add(t.id);
                  } else {
                    _selected.remove(t.id);
                  }
                }),
              ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: _busy ? null : _save, child: Text(widget.package == null ? 'Add package' : 'Save changes')),
          ],
        ),
      ),
    );
  }
}

String? requiredMax(String? v, int max, String emptyMessage) {
  final t = v?.trim() ?? '';
  if (t.isEmpty) return emptyMessage;
  if (t.length > max) return 'At most $max characters';
  return null;
}

String? intInRange(String? v, int min, int max, {bool required = false}) {
  final t = v?.trim() ?? '';
  if (t.isEmpty) return required ? 'Required' : null;
  final n = int.tryParse(t);
  if (n == null) return 'Enter a whole number';
  if (n < min || n > max) return 'Must be between $min and $max';
  return null;
}
