import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/state_views.dart';
import '../../orders/presentation/dashboard_screen.dart' show errorMessage;
import '../domain/lab_profile.dart';
import 'lab_profile_controller.dart';

/// Port of apps/partner-web/src/app/partner/lab/profile/profile-form.tsx +
/// ../submit-button.tsx: editable only in DRAFT/REJECTED, read-only
/// otherwise; submit-for-verification needs the partner declaration.
class LabProfileScreen extends ConsumerWidget {
  const LabProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final labAsync = ref.watch(labProfileControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Lab profile')),
      body: labAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorStateView(message: errorMessage(e), onRetry: () => ref.invalidate(labProfileControllerProvider)),
        data: (lab) => lab.isEditable ? _EditableProfile(lab: lab) : _ReadOnlyProfile(lab: lab),
      ),
    );
  }
}

class _ReadOnlyProfile extends StatelessWidget {
  const _ReadOnlyProfile({required this.lab});

  final LabProfile lab;

  @override
  Widget build(BuildContext context) {
    Widget row(String label, String value) => ListTile(title: Text(label), subtitle: Text(value.isEmpty ? '—' : value));
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        row('Verification status', lab.statusLabel),
        row('Lab name', lab.name ?? ''),
        row('License numbers', lab.licenseNumbers.join(', ')),
        row('Service cities', lab.serviceCities.join(', ')),
        row('Home collection', lab.homeCollectionSupported ? 'Supported' : 'Not offered'),
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Lab details are locked while verification is in progress or approved. Contact ABIES support for regulated changes.'),
        ),
      ],
    );
  }
}

class _EditableProfile extends ConsumerStatefulWidget {
  const _EditableProfile({required this.lab});

  final LabProfile lab;

  @override
  ConsumerState<_EditableProfile> createState() => _EditableProfileState();
}

class _EditableProfileState extends ConsumerState<_EditableProfile> {
  late final _name = TextEditingController(text: widget.lab.name ?? '');
  late final _licenses = TextEditingController(text: widget.lab.licenseNumbers.join('\n'));
  late final _cities = TextEditingController(text: widget.lab.serviceCities.join('\n'));
  late bool _homeCollection = widget.lab.homeCollectionSupported;
  bool _declaration = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _licenses.dispose();
    _cities.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(labProfileControllerProvider.notifier).save(
          name: _name.text,
          licenseNumbersText: _licenses.text,
          serviceCitiesText: _cities.text,
          homeCollectionSupported: _homeCollection,
        );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved')));
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await ref.read(labProfileControllerProvider.notifier).submit(declarationAccepted: _declaration);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
    });
    if (error == null) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application submitted for verification')));
  }

  @override
  Widget build(BuildContext context) {
    final lab = ref.watch(labProfileControllerProvider).valueOrNull ?? widget.lab;
    final missing = lab.missingForSubmission;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (lab.verificationStatus == 'REJECTED' && lab.rejectionReason != null) ...[
          Text('Rejected: ${lab.rejectionReason}', style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 12),
        ],
        TextField(controller: _name, decoration: const InputDecoration(labelText: 'Lab name')),
        const SizedBox(height: 12),
        TextField(controller: _licenses, minLines: 2, maxLines: 5, decoration: const InputDecoration(labelText: 'License numbers (one per line)')),
        const SizedBox(height: 12),
        TextField(controller: _cities, minLines: 2, maxLines: 5, decoration: const InputDecoration(labelText: 'Service cities (one per line)')),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _homeCollection,
          onChanged: _busy ? null : (v) => setState(() => _homeCollection = v),
          title: const Text('We offer home sample collection'),
        ),
        if (_error != null) ...[
          Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          const SizedBox(height: 8),
        ],
        FilledButton(onPressed: _busy ? null : _save, child: const Text('Save profile')),
        const SizedBox(height: 24),
        const Divider(),
        Text('Submit for verification', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (missing.isNotEmpty) Text('Save these first: ${missing.join(', ')}.'),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _declaration,
          onChanged: _busy ? null : (v) => setState(() => _declaration = v ?? false),
          title: const Text(
            'I declare that the information provided is accurate and that this lab is licensed to operate under the stated registrations.',
          ),
        ),
        FilledButton.tonal(
          onPressed: _busy || !_declaration || missing.isNotEmpty ? null : _submit,
          child: const Text('Submit application'),
        ),
      ],
    );
  }
}
