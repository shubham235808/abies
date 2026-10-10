import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../catalogue/data/catalogue_api.dart';
import '../../practice/presentation/practice_providers.dart';
import 'consultation_controller.dart';

Future<void> showRecommendDiagnosticSheet(BuildContext context, String consultationId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _RecommendSheet(consultationId: consultationId, panchakarma: false),
  );
}

Future<void> showRecommendPanchakarmaSheet(BuildContext context, String consultationId) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _RecommendSheet(consultationId: consultationId, panchakarma: true),
  );
}

/// Recommend a diagnostic test/package or a Panchakarma therapy to the
/// patient. Picking a specific item is optional, same as on the web
/// ("Any lab / unspecified"); the clinical reason is required
/// (createRecommendationSchema: `clinicalReason: z.string().min(1)`).
class _RecommendSheet extends ConsumerStatefulWidget {
  const _RecommendSheet({required this.consultationId, required this.panchakarma});

  final String consultationId;
  final bool panchakarma;

  @override
  ConsumerState<_RecommendSheet> createState() => _RecommendSheetState();
}

class _RecommendSheetState extends ConsumerState<_RecommendSheet> {
  final _reason = TextEditingController();
  final _sessions = TextEditingController();
  final _query = TextEditingController();
  Timer? _debounce;
  List<CatalogueOption> _results = const [];
  bool _searching = false;
  String? _searchError;
  CatalogueOption? _selected;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _search('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _reason.dispose();
    _sessions.dispose();
    _query.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    setState(() {
      _searching = true;
      _searchError = null;
    });
    final api = ref.read(catalogueApiProvider);
    try {
      final results = widget.panchakarma
          ? await api.searchTherapies(q)
          : [...await api.searchTests(q), ...await api.searchPackages(q)];
      if (mounted) setState(() => _results = results);
    } on ApiException catch (e) {
      if (mounted) setState(() => _searchError = e.message);
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _submit() async {
    final notifier = ref.read(consultationControllerProvider(widget.consultationId).notifier);
    setState(() => _submitting = true);
    final bool ok;
    if (widget.panchakarma) {
      final sessions = int.tryParse(_sessions.text.trim());
      ok = await notifier.recommendPanchakarma(
        clinicalReason: _reason.text,
        therapyId: _selected?.id,
        sessionCountRecommended: sessions,
      );
    } else {
      ok = await notifier.recommendDiagnostic(
        clinicalReason: _reason.text,
        testId: _selected?.kind == CatalogueKind.test ? _selected!.id : null,
        packageId: _selected?.kind == CatalogueKind.package ? _selected!.id : null,
      );
    }
    if (!mounted) return;
    setState(() => _submitting = false);
    if (ok) Navigator.of(context).pop();
  }

  String _optionLabel(CatalogueOption o) {
    final kind = switch (o.kind) {
      CatalogueKind.test => 'Test',
      CatalogueKind.package => 'Package',
      CatalogueKind.therapy => 'Therapy',
    };
    return o.providerName != null ? '$kind · ${o.providerName}' : kind;
  }

  @override
  Widget build(BuildContext context) {
    final error = ref.watch(consultationControllerProvider(widget.consultationId).select((s) => s.valueOrNull?.error));
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        maxChildSize: 0.95,
        builder: (context, scroll) => ListView(
          controller: scroll,
          padding: const EdgeInsets.all(16),
          children: [
            Text(widget.panchakarma ? 'Recommend a Panchakarma therapy' : 'Recommend a diagnostic test',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: _reason,
              maxLength: 1000,
              maxLines: 3,
              minLines: 2,
              decoration: const InputDecoration(labelText: 'Clinical reason *'),
            ),
            if (widget.panchakarma) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _sessions,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Sessions recommended (optional, 1–60)'),
              ),
            ],
            const SizedBox(height: 16),
            Text(widget.panchakarma ? 'Suggested therapy (optional)' : 'Suggested test or package (optional)',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            if (_selected != null)
              InputChip(
                label: Text(_selected!.name),
                onDeleted: () => setState(() => _selected = null),
              )
            else
              Text(widget.panchakarma ? 'Any centre / unspecified' : 'Any lab / unspecified'),
            const SizedBox(height: 8),
            TextField(
              controller: _query,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), labelText: 'Search the catalogue'),
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 350), () => _search(v));
              },
            ),
            if (_searching) const LinearProgressIndicator(),
            if (_searchError != null) Text(_searchError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            for (final o in _results)
              ListTile(
                dense: true,
                title: Text(o.name),
                subtitle: Text(_optionLabel(o)),
                selected: _selected?.id == o.id && _selected?.kind == o.kind,
                onTap: () => setState(() => _selected = o),
              ),
            if (!_searching && _results.isEmpty && _searchError == null) const Text('No matches.'),
            if (error != null) ...[
              const SizedBox(height: 8),
              Text(error, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Recommend'),
            ),
          ],
        ),
      ),
    );
  }
}
