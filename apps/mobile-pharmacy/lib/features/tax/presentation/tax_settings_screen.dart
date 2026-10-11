import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/state_views.dart';
import '../../home/presentation/home_controller.dart';
import '../domain/tax_settings.dart';
import 'tax_settings_controller.dart';

/// GST registration profile — the app port of
/// apps/partner-web/src/app/partner/pharmacy/tax-settings/. Required before
/// any POS sale; every invoice is numbered from the prefix set here.
class TaxSettingsScreen extends ConsumerWidget {
  const TaxSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(taxSettingsControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Tax settings')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException && e.isTransportFailure
            ? OfflineStateView(onRetry: () => ref.invalidate(taxSettingsControllerProvider))
            : ErrorStateView(
                message: e is ApiException ? e.message : 'Could not load tax settings.',
                onRetry: () => ref.invalidate(taxSettingsControllerProvider),
              ),
        data: (settings) => _TaxSettingsForm(initial: settings),
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

class _TaxSettingsForm extends ConsumerStatefulWidget {
  const _TaxSettingsForm({required this.initial});

  final TaxSettings? initial;

  @override
  ConsumerState<_TaxSettingsForm> createState() => _TaxSettingsFormState();
}

class _TaxSettingsFormState extends ConsumerState<_TaxSettingsForm> {
  late final _legalName = TextEditingController(text: widget.initial?.legalBusinessName ?? '');
  late final _gstin = TextEditingController(text: widget.initial?.gstin ?? '');
  late final _state = TextEditingController(text: widget.initial?.registeredState ?? '');
  late final _stateCode = TextEditingController(text: widget.initial?.stateCode ?? '');
  late final _prefix = TextEditingController(text: widget.initial?.invoicePrefix ?? '');
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _prefix.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    for (final c in [_legalName, _gstin, _state, _stateCode, _prefix]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(taxSettingsControllerProvider.notifier).save(
          legalBusinessName: _legalName.text,
          gstin: _gstin.text,
          registeredState: _state.text,
          stateCode: _stateCode.text,
          invoicePrefix: _prefix.text,
        );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tax settings saved')));
  }

  @override
  Widget build(BuildContext context) {
    final semantic = Theme.of(context).extension<AppSemanticColors>()!;
    final approved = ref.watch(pharmacyProfileProvider).valueOrNull?.isApproved;
    final prefix = _prefix.text.isEmpty ? 'PREFIX' : _prefix.text;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Your GST registration profile. Required before you can record a sale at the POS counter — every invoice this pharmacy issues is numbered from here.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: 8),
        Text(
          "GST rates per HSN code are set by ABIES. Each item's HSN code is entered when you add a stock batch.",
          style: Theme.of(context).textTheme.bodySmall,
        ),
        if (approved == false) ...[
          const SizedBox(height: 12),
          Card(
            color: semantic.warningSubtle,
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                'Tax settings can be saved once your pharmacy is approved by ABIES.',
                style: TextStyle(color: semantic.warningStrong),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ),
        TextField(
          controller: _legalName,
          maxLength: 200,
          decoration: const InputDecoration(labelText: 'Legal business name'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _gstin,
          maxLength: 15,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [_UpperCaseFormatter()],
          decoration: const InputDecoration(labelText: 'GSTIN', hintText: '27AAAAA0000A1Z5'),
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: TextField(
                controller: _state,
                maxLength: 80,
                decoration: const InputDecoration(labelText: 'Registered state', hintText: 'Maharashtra'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: TextField(
                controller: _stateCode,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'State code', hintText: '27'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _prefix,
          maxLength: 12,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [_UpperCaseFormatter(), FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]'))],
          decoration: InputDecoration(
            labelText: 'Invoice prefix',
            hintText: 'INV',
            helperText: 'Invoices are numbered $prefix-000001, $prefix-000002, …',
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
        ),
      ],
    );
  }
}
